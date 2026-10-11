'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { expert_scopes, majors, staff, users } from '@/db/schema';
import { getSessionUser } from '@/lib/auth';

export interface ExpertScopeFilters {
  /** null = بدون محدودیت (کل دانشگاه) */
  universityIds: number[] | null;
  facultyIds: number[] | null;
  departmentIds: number[] | null;
  majorIds: number[] | null;
}

export async function expertScopesOf(userId: number): Promise<ExpertScopeFilters> {
  const rows = await db.select().from(expert_scopes).where(eq(expert_scopes.userId, userId));
  const pick = (t: string) => rows.filter(r => r.scopeType === t).map(r => r.scopeId).filter((n): n is number => typeof n === 'number');
  return {
    universityIds: pick('UNIVERSITY').length ? pick('UNIVERSITY') : null,
    facultyIds: pick('FACULTY').length ? pick('FACULTY') : null,
    departmentIds: pick('DEPARTMENT').length ? pick('DEPARTMENT') : null,
    majorIds: pick('MAJOR').length ? pick('MAJOR') : null,
  };
}

/** فیلترهای کاربر جاری اگر EDU_EXPERT دارای scope باشد */
export async function currentExpertFilters(): Promise<ExpertScopeFilters | null> {
  const me = await getSessionUser();
  if (!me) return null;
  if (!me.roles.includes('EDU_EXPERT')) return null;
  const f = await expertScopesOf(me.id);
  const hasAny = [f.universityIds, f.facultyIds, f.departmentIds, f.majorIds].some(a => a && a.length > 0);
  return hasAny ? f : null;
}

/**
 * برای دانشکده/گروه/رشتهٔ محدود، شناسهٔ رشته‌های مجاز را برمی‌گرداند:
 * major → خودش؛ department → رشته‌های آن گروه؛ faculty → رشته‌های آن دانشکده.
 */
export async function scopedMajorIds(f: ExpertScopeFilters | null, uniId: number | null): Promise<number[] | null> {
  if (!f) return null;
  const out = new Set<number>();
  if (f.majorIds) f.majorIds.forEach(m => out.add(m));
  const mConds = [];
  if (f.departmentIds) mConds.push(inArray(majors.departmentId, f.departmentIds));
  if (f.facultyIds) mConds.push(inArray(majors.facultyId, f.facultyIds));
  if (mConds.length) {
    const rows = await db.select({ id: majors.id }).from(majors).where(mConds.length > 1 ? and(...mConds) : mConds[0]).limit(5000);
    rows.forEach(r => out.add(r.id));
  }
  if (f.universityIds) {
    // دانشگاه: اگر scope دانشگاهی وجود دارد، محدود به همان دانشگاه است
    const rows = uniId && !f.universityIds.includes(uniId) ? [] : await db.select({ id: majors.id }).from(majors).where(eq(majors.universityId, uniId!)).limit(5000);
    rows.forEach(r => out.add(r.id));
  }
  return out.size ? [...out] : null;
}

/** آیا یک استاد/کارمند در محدودهٔ این کارشناس است؟ */
export async function staffInScope(f: ExpertScopeFilters | null, staffId: number | null): Promise<boolean> {
  if (staffId == null) return true;
  if (!f) return true;
  if (f.departmentIds || f.facultyIds) {
    const [s] = await db.select().from(staff).where(eq(staff.id, staffId)).limit(1);
    if (!s) return false;
    if (s.departmentId && f.departmentIds && !f.departmentIds.includes(s.departmentId)) return false;
    if (s.facultyId && f.facultyIds && !f.facultyIds.includes(s.facultyId)) return false;
    if (f.departmentIds && !s.departmentId && f.facultyIds && !s.facultyId) return false;
  }
  return true;
}

void users;