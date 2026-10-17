import 'server-only';

import { and, eq, exists, inArray, or, sql } from 'drizzle-orm';
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
  const pick = (t: string) => rows.filter(r => r.scopeType === t).map(r => r.scopeId ?? (t === 'UNIVERSITY' ? r.universityId : null)).filter((n): n is number => typeof n === 'number');
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
 * معنای اجتماع (OR): هر رشته‌ای که با «هر یک» از قیدها بخورد مجاز است.
 * null = هیچ دامنه‌ای تعریف نشده (نامحدود)؛ [] = دامنه تعریف شده ولی تهی (deny-all).
 */
export async function scopedMajorIds(f: ExpertScopeFilters | null, uniId: number | null): Promise<number[] | null> {
  if (!f) return null;
  const out = new Set<number>();
  if (f.majorIds) f.majorIds.forEach(m => out.add(m));
  const mConds = [];
  if (f.departmentIds) mConds.push(inArray(majors.departmentId, f.departmentIds));
  if (f.facultyIds) mConds.push(inArray(majors.facultyId, f.facultyIds));
  if (mConds.length) {
    const rows = await db.select({ id: majors.id }).from(majors).where(mConds.length > 1 ? or(...mConds) : mConds[0]).limit(5000);
    rows.forEach(r => out.add(r.id));
  }
  if (f.universityIds) {
    // دانشگاه: اگر دانشگاه جاری خارج از دامنه است → deny (fail-closed)
    if (!uniId || !f.universityIds.includes(uniId)) return [];
    const rows = await db.select({ id: majors.id }).from(majors).where(eq(majors.universityId, uniId)).limit(5000);
    rows.forEach(r => out.add(r.id));
  }
  return out.size ? [...out] : [];
}

/** آیا یک استاد/کارمند در محدودهٔ این کارشناس است؟ (fail-closed روی همهٔ ابعاد دامنه) */
export async function staffInScope(f: ExpertScopeFilters | null, staffId: number | null): Promise<boolean> {
  if (staffId == null) return true;
  if (!f) return true;
  if (!f.departmentIds && !f.facultyIds && !f.majorIds && !f.universityIds) return true;
  const [s] = await db.select().from(staff).where(eq(staff.id, staffId)).limit(1);
  if (!s) return false;
  if (f.universityIds) {
    if (s.universityId == null || !f.universityIds.includes(s.universityId)) return false;
  }
  if (s.departmentId && f.departmentIds && !f.departmentIds.includes(s.departmentId)) return false;
  if (s.facultyId && f.facultyIds && !f.facultyIds.includes(s.facultyId)) return false;
  if (f.departmentIds && !s.departmentId && f.facultyIds && !s.facultyId) return false;
  if (f.majorIds) {
    // staff رشتهٔ مستقیم ندارد → رشته‌های مجاز به گروه نگاشت می‌شوند
    const mrows = await db.select({ departmentId: majors.departmentId }).from(majors).where(inArray(majors.id, f.majorIds)).limit(5000);
    const ds = new Set(mrows.map(r => r.departmentId).filter((n): n is number => typeof n === 'number'));
    if (!s.departmentId || !ds.has(s.departmentId)) return false;
  }
  return true;
}

/** آیا کارشناس اجازهٔ ویرایش نمره دارد (expert_scopes.canEditGrades)؟ */
export async function expertCanEditGrades(userId: number): Promise<boolean> {
  const [r] = await db.select({
    hit: exists(db.select({ one: sql`1` }).from(expert_scopes)
      .where(and(eq(expert_scopes.userId, userId), eq(expert_scopes.canEditGrades, 1)))),
  }).from(expert_scopes).limit(1);
  return r?.hit === true;
}

void users;