import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { departments, roles, staff, user_roles, users } from '@/db/schema';
import { requireRole } from '@/lib/auth';
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
        کلید زیر فقط نقش را دستی می‌دهد یا می‌گیرد.
      </p>
      <StaffTable
        rows={rows}
        headUserIds={[...heads]}
        ledBy={Object.fromEntries(ledBy)}
        toggleAction={toggleHeadAction}
      />
    </div>
  );
}
