import Link from 'next/link';
import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { departments, roles, staff, user_roles, users } from '@/db/schema';
import { getSessionUser, hashPassword, requireRole } from '@/lib/auth';
import StaffTable from './StaffTable';

export const dynamic = 'force-dynamic';

async function toggleHeadAction(fd: FormData) {
  'use server';
  await requireRole(['ADMIN']);
  const userId = Number(fd.get('userId'));
  const assign = fd.get('assign') === '1';
  const [head] = await db.select().from(roles).where(eq(roles.code, 'DEP_HEAD')).limit(1);
  if (!head) return;
  if (assign) {
    const has = await db.select().from(user_roles).where(eq(user_roles.userId, userId));
    if (!has.some(h => h.roleId === head.id)) await db.insert(user_roles).values({ userId, roleId: head.id });
  } else {
    // ⚠️ اینجا حتماً باید هر دو شرط باشد. نسخهٔ قبلی فقط `userId` را شرط
    //    می‌گذاشت و با یک کلیک «گرفتن نقش»، *همهٔ* نقش‌های آن شخص — از جمله
    //    «استاد» — پاک می‌شد و کاربر از سامانه بیرون می‌افتاد.
    await db.delete(user_roles).where(and(eq(user_roles.userId, userId), eq(user_roles.roleId, head.id)));
    // گروه‌هایی که این شخص مدیرشان بود بی‌مدیر می‌مانند، وگرنه نقش دوباره
    // برمی‌گردد و وضعیت ناسازگار می‌شود.
    const [st] = await db.select({ id: staff.id }).from(staff).where(eq(staff.userId, userId)).limit(1);
    if (st) await db.update(departments).set({ headStaffId: null }).where(eq(departments.headStaffId, st.id));
  }
  revalidatePath('/admin/staff');
  revalidatePath('/admin/departments');
}

/** تنظیم نقش‌های یک کاربر (کارشناس/استاد) — فقط ADMIN؛ پنل → استاد و کارکنان → «نقش‌ها» */
async function saveUserRolesAction(userId: number, roleIds: number[]): Promise<{ ok: boolean; error?: string; added?: number; removed?: number }> {
  'use server';
  try {
    await requireRole(['ADMIN']);
  } catch {
    return { ok: false, error: 'فقط مدیر سیستم (ADMIN) می‌تواند نقش‌ها را تغییر دهد.' };
  }
  if (!userId || !Number.isInteger(userId)) return { ok: false, error: 'کاربر نامعتبر است.' };
  const me = await getSessionUser();
  const want = new Set(roleIds.map(Number).filter(Number.isInteger));
  const have = new Set((await db.select({ roleId: user_roles.roleId }).from(user_roles).where(eq(user_roles.userId, userId))).map(x => x.roleId));
  // 🔒 گارد قفل‌شدن: مدیر ارشد نباید نقش ADMIN خودش را بردارد
  if (want.size < have.size) {
    const [adm] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, 'ADMIN')).limit(1);
    if (adm && me?.id === userId && have.has(adm.id) && !want.has(adm.id)) {
      return { ok: false, error: 'نقش «مدیر ارشد» را نمی‌توان از خودتان برداشت (خطر قفل‌شدن سامانه).' };
    }
  }
  let added = 0;
  let removed = 0;
  for (const rid of [...want]) {
    if (!have.has(rid)) {
      await db.insert(user_roles).values({ userId, roleId: rid }).onConflictDoNothing().catch(() => {});
      added++;
    }
  }
  for (const rid of [...have]) {
    if (!want.has(rid)) {
      await db.delete(user_roles).where(and(eq(user_roles.userId, userId), eq(user_roles.roleId, rid)));
      removed++;
    }
  }
  revalidatePath('/admin/staff');
  return { ok: true, added, removed };
}

/** ثبت حساب کاربری جدید «کارشناس/کارمند» (نه استاد و نه دانشجو) — فقط ADMIN */
async function createStaffExpertAction(input: {
  nationalCode: string; firstName: string; lastName: string;
  fatherName?: string; birthCertNo?: string; gender?: string; mobile?: string;
  email?: string; staffCode?: string; departmentId?: number | null; staffType?: string;
}): Promise<{ ok: boolean; error?: string; userId?: number }> {
  'use server';
  try {
    await requireRole(['ADMIN']);
  } catch {
    return { ok: false, error: 'فقط مدیر سیستم (ADMIN) می‌تواند حساب ایجاد کند.' };
  }
  const nc = String(input.nationalCode || '').trim();
  const fn = String(input.firstName || '').trim();
  const ln = String(input.lastName || '').trim();
  const sc = String(input.staffCode || '').trim() || nc;
  if (!nc || !fn || !ln) return { ok: false, error: 'کد ملی، نام و نام خانوادگی الزامی است.' };
  if (!/^\d{10}$/.test(nc)) return { ok: false, error: 'کد ملی باید ۱۰ رقم باشد.' };
  try {
    const dupNc = await db.select({ id: users.id }).from(users).where(eq(users.nationalCode, nc)).limit(1);
    if (dupNc.length) return { ok: false, error: 'کاربری با این کد ملی از قبل وجود دارد.' };
    const dupSc = await db.select({ id: staff.id }).from(staff).where(eq(staff.staffCode, sc)).limit(1);
    if (dupSc.length) return { ok: false, error: 'کد پرسنلی تکراری است.' };
    const passwordHash = await hashPassword(nc); // ورود اولیه با کد ملی؛ اجباری به تغییر
    const [u] = await db.insert(users).values({
      nationalCode: nc, firstName: fn, lastName: ln,
      fatherName: String(input.fatherName || '').trim() || null,
      birthCertNo: String(input.birthCertNo || '').trim() || null,
      gender: String(input.gender || '').trim() || null,
      mobile: String(input.mobile || '').trim() || null,
      email: String(input.email || '').trim() || null,
      passwordHash, isActive: 1, mustChangePassword: 1,
    }).returning({ id: users.id });
    await db.insert(staff).values({
      userId: u.id, staffCode: sc,
      staffType: String(input.staffType || '').trim() || 'اداری',
      departmentId: input.departmentId || null,
    }).onConflictDoNothing();
    revalidatePath('/admin/staff');
    return { ok: true, userId: u.id };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'ثبت نشد.' };
  }
}

export default async function StaffPage() {
  await requireRole(['ADMIN']);
  const [head] = await db.select().from(roles).where(eq(roles.code, 'DEP_HEAD')).limit(1);
  const rows = await db
    .select({ userId: users.id, code: users.nationalCode, name: users.firstName, family: users.lastName, staffCode: staff.staffCode, dept: departments.name, rank: staff.academicRank, type: staff.staffType })
    .from(staff)
    .innerJoin(users, eq(users.id, staff.userId))
    .leftJoin(departments, eq(departments.id, staff.departmentId))
    .orderBy(staff.id);
  const headRoles = head ? await db.select().from(user_roles).where(eq(user_roles.roleId, head.id)) : [];
  const heads = new Set(headRoles.map(h => h.userId));

  // کدام گروه‌ها را هر نفر اداره می‌کند (یک نفر می‌تواند مدیر چند گروه باشد،
  // مثلاً گروه تخصصی خودش + گروه دروس عمومی)
  const led = await db
    .select({ userId: staff.userId, deptName: departments.name })
    .from(departments)
    .innerJoin(staff, eq(staff.id, departments.headStaffId));
  const ledBy = new Map<number, string[]>();
  for (const l of led) {
    if (l.userId == null) continue;
    ledBy.set(l.userId, [...(ledBy.get(l.userId) ?? []), l.deptName]);
  }

  // نقش‌های قابل تخصیص + نقشِ فعلی هر یک از کارکنان (برای ستون «نقش‌ها»)
  const roleRows = await db.select({ id: roles.id, code: roles.code, title: roles.title, isSystem: roles.isSystem }).from(roles).orderBy(roles.id);
  const userIds = rows.map(r => r.userId).filter(Number.isInteger);
  const urRows = userIds.length ? await db.select().from(user_roles).where(inArray(user_roles.userId, userIds)) : [];
  const userRoleIds: Record<number, number[]> = {};
  for (const r of rows) userRoleIds[r.userId] = [];
  for (const ur of urRows) (userRoleIds[ur.userId] ??= []).push(ur.roleId);
  const depts = await db.select({ id: departments.id, name: departments.name }).from(departments).orderBy(departments.name);

  return (
    <div className="card">
      <h2 className="mb-1 font-bold">استاد و کارکنان</h2>
      <p className="mb-2 text-xs leading-6 text-slate-500">
        مدیر گروه به پنل مدیر گروه می‌رسد و دروس و ارائه‌های گروه‌های زیر نظر خودش را مدیریت می‌کند. اگر استاد باشد،
        هر دو کارتابل برایش یکی می‌شود و از سربرگ بین‌شان جابه‌جا می‌شود.
      </p>
      <p className="mb-3 rounded-lg bg-indigo-50 p-2.5 text-xs leading-6 text-indigo-900">
        💡 برای <b>تعریف گروه آموزشی</b> و <b>انتخاب مدیر برای هر گروه</b> (از جمله گروه دروس عمومی و مشترک) به{' '}
        <Link href="/admin/departments" className="font-bold underline">گروه‌های آموزشی و مدیران گروه</Link> بروید.
        کلید زیر فقط نقش را دستی می‌دهد یا می‌گیرد. برای تعریف نقش (کد/عنوان/مجوزها) به{' '}
        <Link href="/admin/permissions" className="font-bold underline">مدیریت سطوح دسترسی و نقش‌ها</Link> بروید.
      </p>
      <StaffTable
        rows={rows}
        headUserIds={[...heads]}
        ledBy={Object.fromEntries(ledBy)}
        toggleAction={toggleHeadAction}
        rolesAll={roleRows}
        userRoleIds={userRoleIds}
        saveRolesAction={saveUserRolesAction}
        createAction={createStaffExpertAction}
        departments={depts}
      />
    </div>
  );
}
