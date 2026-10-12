'use server';

import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { departments, expert_scopes, faculties, majors, roles, universities, user_roles, users } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';

export async function listExpertCandidates(): Promise<{
  ok: boolean; items?: { userId: number; name: string; canEditGrades: boolean; scopes: { type: string; id: number | null; uni: number | null }[] }[]; error?: string;
}> {
  try { await requireRole(['ADMIN']); } catch { return { ok: false, error: 'فقط مدیر.' }; }
  const [edu] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, 'EDU_EXPERT')).limit(1).catch(() => []);
  let userIds: number[] = [];
  if (edu) {
    const r = await db.select({ userId: user_roles.userId }).from(user_roles).where(eq(user_roles.roleId, edu.id));
    userIds = r.map(x => x.userId);
  }
  if (!userIds.length) return { ok: true, items: [] };
  const us = await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users).where(inArray(users.id, userIds));
  const sc = await db.select().from(expert_scopes).where(inArray(expert_scopes.userId, userIds));
  return {
    ok: true,
    items: us.map(uu => {
      const rows = sc.filter(s => s.userId === uu.id);
      return {
        userId: uu.id,
        name: `${uu.firstName || ''} ${uu.lastName || ''}`.trim(),
        canEditGrades: rows.some(r => (r.canEditGrades ?? 0) === 1),
        scopes: rows.map(s => ({ type: s.scopeType, id: s.scopeId, uni: s.universityId })),
      };
    }),
  };
}

export interface ScopeSelect {
  universities: { id: number; code: string; title: string }[];
  faculties: { id: number; name: string }[];
  departments: { id: number; name: string; facultyId: number }[];
  majors: { id: number; name: string; departmentId: number | null }[];
}

export async function getScopeSelect(): Promise<ScopeSelect> {
  await requireRole(['ADMIN']);
  const u = await getCurrentUniversity().catch(() => null);
  const uid = u?.id ?? null;
  const [unis, facs, deps, majs] = await Promise.all([
    db.select({ id: universities.id, code: universities.code, title: universities.title }).from(universities).orderBy(universities.id),
    db.select({ id: faculties.id, name: faculties.name, universityId: faculties.universityId }).from(faculties).orderBy(asc(faculties.name)),
    db.select({ id: departments.id, name: departments.name, facultyId: departments.facultyId, universityId: departments.universityId }).from(departments).orderBy(asc(departments.name)),
    db.select({ id: majors.id, name: majors.name, departmentId: majors.departmentId, facultyId: majors.facultyId, universityId: majors.universityId }).from(majors).orderBy(asc(majors.name)),
  ]);
  const inUni = (x: { universityId: number | null }) => !uid || x.universityId == null || x.universityId === uid;
  const facKept = facs.filter(inUni);
  const facIdSet = new Set(facKept.map(f => f.id));
  const depKept = deps.filter(d => inUni(d) && (!uid || facIdSet.size === 0 || facIdSet.has(d.facultyId)));
  const depIdSet = new Set(depKept.map(d => d.id));
  const majKept = majs.filter(m => inUni(m) && (!uid || m.departmentId == null || depIdSet.has(m.departmentId)));
  return {
    universities: unis,
    faculties: facKept.map(f => ({ id: f.id, name: f.name })),
    departments: depKept.map(d => ({ id: d.id, name: d.name, facultyId: d.facultyId })),
    majors: majKept.map(m => ({ id: m.id, name: m.name, departmentId: m.departmentId ?? null })),
  };
}

/** حذف/جایگزینی کامل دامنهٔ یک کارشناس + پرچم «ویرایش نمره» */
export async function saveExpertScopes(
  userId: number,
  scopes: { type: string; id: number | null; uni: number | null }[],
  canEditGrades: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try { await requireRole(['ADMIN']); } catch { return { ok: false, error: 'فقط مدیر.' }; }
  if (!Number.isInteger(userId)) return { ok: false, error: 'کاربر نامعتبر.' };
  await db.delete(expert_scopes).where(eq(expert_scopes.userId, userId));
  const vals = scopes.filter(s => s.id != null || (s.type === 'UNIVERSITY' && s.uni != null))
    .map(s => ({
      userId, scopeType: s.type, scopeId: s.type === 'UNIVERSITY' ? null : s.id,
      universityId: s.type === 'UNIVERSITY' ? s.id : (s.uni ?? null),
      canEditGrades: canEditGrades ? 1 : 0,
    }));
  // اگر فقط پرچم نمره باشد ولی محدودیتی نباشد → یک ردیف CONFIG برای نگهداری پرچم
  if (!vals.length && canEditGrades) {
    await db.insert(expert_scopes).values({ userId, scopeType: 'CONFIG', scopeId: null, universityId: null, canEditGrades: 1 }).onConflictDoNothing();
  } else if (vals.length) {
    await db.insert(expert_scopes).values(vals).onConflictDoNothing();
  }
  return { ok: true };
}

void and; void eq;