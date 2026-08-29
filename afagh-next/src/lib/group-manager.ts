import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { courses } from '@/db/schema';
import { getStaffByUser, requireRole, type SessionUser } from '@/lib/auth';
import type { staff } from '@/db/schema';

/** مدیر گروه = نقش DEP_HEAD + پروندهٔ استاف؛ محدوده = departmentId استاف */
export type DepHeadCtx = { user: SessionUser; staff: typeof staff.$inferSelect; deptId: number };

export async function requireDepHead(): Promise<DepHeadCtx> {
  const user = await requireRole(['DEP_HEAD']);
  const st = await getStaffByUser(user.id);
  if (!st) redirect('/login');
  if (st.departmentId == null) redirect('/group-manager/no-dept');
  return { user, staff: st, deptId: st.departmentId };
}

/** درسِ خارج از گروه؟ false */
export async function courseInDept(courseId: number, deptId: number): Promise<boolean> {
  const [c] = await db.select({ d: courses.departmentId }).from(courses).where(eq(courses.id, courseId)).limit(1);
  return c?.d === deptId;
}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
export const num = (fd: FormData, k: string) => Number(fd.get(k) || 0);
export const optNum = (fd: FormData, k: string) => (fd.get(k) === null || String(fd.get(k)).trim() === '' ? null : Number(fd.get(k)));
export const back = (path: string, key: 'msg' | 'err', text: string): never => {
  redirect(path + '?' + key + '=' + encodeURIComponent(text));
};
