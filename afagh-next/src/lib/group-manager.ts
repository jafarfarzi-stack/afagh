import { and, eq, inArray, or } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { courses, departments, staff as staffTable } from '@/db/schema';
import { getStaffByUser, requireRole, type SessionUser } from '@/lib/auth';
import type { staff } from '@/db/schema';

/** یک گروه در دامنهٔ اختیار مدیر */
export type HeadedDept = {
  id: number;
  name: string;
  kind: 'ACADEMIC' | 'GENERAL';
  /** چرا این گروه در دامنهٔ اوست: مدیر رسمیِ گروه است یا فقط عضو آن */
  via: 'HEAD' | 'MEMBER';
};

/**
 * مدیر گروه = نقش DEP_HEAD + پروندهٔ کارمندی.
 * دامنهٔ اختیار = گروه‌هایی که *مدیرشان* است (departments.headStaffId)، و اگر
 * هیچ گروهی به نامش ثبت نشده باشد، گروهی که عضو آن است.
 */
export type DepHeadCtx = {
  user: SessionUser;
  staff: typeof staff.$inferSelect;
  /** گروه فعال (همانی که صفحه‌ها روی آن کار می‌کنند) */
  deptId: number;
  dept: HeadedDept;
  /** همهٔ گروه‌های زیر نظر او — برای جعبهٔ تعویض گروه در سربرگ */
  depts: HeadedDept[];
};

const asKind = (k: string | null): 'ACADEMIC' | 'GENERAL' => (k === 'GENERAL' ? 'GENERAL' : 'ACADEMIC');

/**
 * گروه‌های زیر نظر یک پروندهٔ کارمندی.
 *
 * چرا «مدیرِ گروه» بر «عضوِ گروه» مقدم است: مدیر گروهِ دروس عمومی و مشترک
 * معمولاً استادی از یک گروه تخصصی دیگر است. اگر دامنه را از عضویتش حساب
 * می‌کردیم، او دروس گروه خودش را می‌دید نه دروس عمومی را — درست برعکسِ
 * چیزی که باید. یک نفر می‌تواند هم‌زمان مدیر چند گروه باشد (مثلاً گروه
 * تخصصی خودش + گروه دروس عمومی) و در سربرگ بین آن‌ها جابه‌جا می‌شود.
 */
export async function headedDepartments(staffId: number, ownDeptId: number | null): Promise<HeadedDept[]> {
  const led = await db
    .select({ id: departments.id, name: departments.name, kind: departments.kind })
    .from(departments)
    .where(and(eq(departments.headStaffId, staffId), or(eq(departments.isActive, 1), eq(departments.isActive, 1))))
    .orderBy(departments.name);

  const out: HeadedDept[] = led.map(d => ({ id: d.id, name: d.name, kind: asKind(d.kind), via: 'HEAD' as const }));
  if (out.length > 0) return out;

  if (ownDeptId != null) {
    const [own] = await db
      .select({ id: departments.id, name: departments.name, kind: departments.kind })
      .from(departments)
      .where(eq(departments.id, ownDeptId))
      .limit(1);
    if (own) return [{ id: own.id, name: own.name, kind: asKind(own.kind), via: 'MEMBER' }];
  }
  return [];
}

/**
 * گارد صفحه‌های پنل مدیر گروه.
 *
 * @param wantedDeptId گروه دلخواه. اگر ندهید، گروه انتخاب‌شده در سربرگ (کوکی
 *   `gm_dept`) خوانده می‌شود؛ به این ترتیب همهٔ صفحه‌ها و اکشن‌های پنل بدون
 *   تغییر، جعبهٔ تعویض گروه را رعایت می‌کنند. اگر گروه خواسته‌شده در دامنهٔ
 *   اختیار او نباشد، بی‌سروصدا نادیده گرفته می‌شود (جلوگیری از دست‌کاری کوکی).
 */
export async function requireDepHead(wantedDeptId?: number): Promise<DepHeadCtx> {
  const user = await requireRole(['DEP_HEAD']);
  const st = await getStaffByUser(user.id);
  // کاربری که نقش مدیر گروه دارد ولی پروندهٔ کارمندی‌اش ساخته نشده، نباید به
  // صفحهٔ ورود پرت شود؛ او *وارد شده* است و این کار به‌نظرش یعنی «سامانه
  // مرا بیرون انداخت / صفحه بالا نمی‌آید». به‌جایش پیام روشن می‌بیند.
  if (!st) redirect('/group-manager/no-dept?reason=no-staff');

  const depts = await headedDepartments(st.id, st.departmentId ?? null);
  if (depts.length === 0) redirect('/group-manager/no-dept');

  let wanted = wantedDeptId;
  if (wanted == null) {
    const c = (await cookies()).get('gm_dept')?.value;
    if (c) wanted = Number(c) || undefined;
  }
  const dept = (wanted != null && depts.find(d => d.id === wanted)) || depts[0];
  return { user, staff: st, deptId: dept.id, dept, depts };
}

/** درسِ خارج از گروه؟ false */
export async function courseInDept(courseId: number, deptId: number): Promise<boolean> {
  const [c] = await db.select({ d: courses.departmentId }).from(courses).where(eq(courses.id, courseId)).limit(1);
  return c?.d === deptId;
}

/** آیا این پروندهٔ کارمندی مدیر هیچ گروهی هست؟ (برای نگه‌داشتن/برداشتن نقش) */
export async function isHeadOfAny(staffId: number): Promise<boolean> {
  const rows = await db.select({ id: departments.id }).from(departments).where(eq(departments.headStaffId, staffId)).limit(1);
  return rows.length > 0;
}

/** پروندهٔ کارمندی چند کاربر (برای صفحه‌های مدیریتی) */
export async function staffOfUsers(userIds: number[]) {
  if (!userIds.length) return [];
  return db.select().from(staffTable).where(inArray(staffTable.userId, userIds));
}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
export const num = (fd: FormData, k: string) => Number(fd.get(k) || 0);
export const optNum = (fd: FormData, k: string) => (fd.get(k) === null || String(fd.get(k)).trim() === '' ? null : Number(fd.get(k)));
export const back = (path: string, key: 'msg' | 'err', text: string): never => {
  redirect(path + '?' + key + '=' + encodeURIComponent(text));
};
