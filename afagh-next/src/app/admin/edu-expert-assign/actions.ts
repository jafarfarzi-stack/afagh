'use server';

import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, course_offerings, users } from '@/db/schema';
import { requireRoleOrPermission } from '@/lib/permissions-enforcer';
import { listEduExpertCandidates, listOfferingExpertAssignments } from '@/lib/edu-expert';

const EDU = ['ADMIN', 'EDU_EXPERT'];
const EDU_PERM = ['scheduling:manage_chart'];

export interface EduExpertAssignRow {
  offeringId: number;
  courseTitle: string;
  groupNumber: number;
  departmentName: string | null;
  /** نامِ اتاق‌های درس از برنامهٔ هفتگی (مثل «كلاس 5 انساني») — ممکن است چندتا باشد */
  rooms: string[];
  /** آیا درس اصلاً سانس/اتاق دارد؟ (فیلترِ «فقط کلاس‌های دارای برنامه») */
  hasSchedule: boolean;
  assignedUserId: number | null;
  resolvedUserId: number | null;
  source: 'offering' | 'scope' | null;
}

export interface EduExpertAssignInit {
  terms: { id: number; title: string; isCurrent: boolean }[];
  candidates: { userId: number; name: string }[];
  rows: EduExpertAssignRow[];
}

/**
 * دادهٔ اولیهٔ صفحهٔ «تخصیص کارشناس به کلاس‌ها».
 * ترم جاری به‌صورت پیش‌فرض انتخاب می‌شود تا کاربر نخواهد هر بار ترم را عوض کند.
 */
export async function getEduExpertAssignInit(termId?: number): Promise<EduExpertAssignInit> {
  await requireRoleOrPermission(EDU, EDU_PERM);

  const terms = await db
    .select({ id: academic_terms.id, title: academic_terms.title, isCurrent: academic_terms.isCurrent })
    .from(academic_terms)
    .orderBy(asc(academic_terms.id))
    .catch(() => []);

  const tid =
    termId ??
    (terms.find((t) => (t.isCurrent ?? 0) === 1)?.id ?? terms[terms.length - 1]?.id ?? 0);

  const [candidates, rows] = await Promise.all([
    listEduExpertCandidates(),
    tid ? listOfferingExpertAssignments(tid) : Promise.resolve([]),
  ]);

  return {
    terms: terms.map((t) => ({ id: t.id, title: t.title, isCurrent: (t.isCurrent ?? 0) === 1 })),
    candidates,
    rows: rows.map((r) => ({
      offeringId: r.offeringId,
      courseTitle: r.courseTitle,
      groupNumber: r.groupNumber,
      departmentName: r.departmentName,
      rooms: r.rooms,
      hasSchedule: r.hasSchedule,
      assignedUserId: r.assignedUserId,
      resolvedUserId: r.resolvedUserId,
      source: r.source,
    })),
  };
}

/** اعتبارسنجی کاربر: واقعاً حساب است و (اگر داده بود) فعال است. */
async function assertExpert(userId: number | null): Promise<{ ok: true; userId: number | null } | { ok: false; error: string }> {
  if (userId == null) return { ok: true, userId: null };
  const [u] = await db
    .select({ id: users.id, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) return { ok: false, error: 'کاربر یافت نشد.' };
  if ((u.isActive ?? 0) !== 1) return { ok: false, error: 'حساب انتخاب‌شده غیرفعال است.' };
  return { ok: true, userId };
}

/** تخصیص یک کلاس به یک کارشناس (یا آزاد کردن با userId = null). */
export async function setOfferingEduExpertAction(
  offeringId: number,
  userId: number | null,
): Promise<{ ok: boolean; error?: string }> {
  await requireRoleOrPermission(EDU, EDU_PERM);

  const chk = await assertExpert(userId);
  if (!chk.ok) return { ok: false, error: chk.error };

  await db
    .update(course_offerings)
    .set({ eduExpertUserId: chk.userId })
    .where(eq(course_offerings.id, offeringId));

  return { ok: true };
}

/** تخصیص گروهی — برای وقتی که چند کلاس به یک کارشناس سپرده می‌شوند. */
export async function bulkSetOfferingEduExpertAction(
  offeringIds: number[],
  userId: number | null,
): Promise<{ ok: boolean; updated?: number; error?: string }> {
  await requireRoleOrPermission(EDU, EDU_PERM);

  const chk = await assertExpert(userId);
  if (!chk.ok) return { ok: false, error: chk.error };

  const ids = [...new Set(offeringIds.filter((n) => Number.isFinite(n)))];
  if (!ids.length) return { ok: true, updated: 0 };

  // فقط ارائه‌های موجود را به‌روز کن تا عددِ «updated» دروغ نگوید
  const existing = await db
    .select({ id: course_offerings.id })
    .from(course_offerings)
    .where(inArray(course_offerings.id, ids));
  if (!existing.length) return { ok: true, updated: 0 };

  await db
    .update(course_offerings)
    .set({ eduExpertUserId: chk.userId })
    .where(inArray(course_offerings.id, existing.map((e) => e.id)));

  return { ok: true, updated: existing.length };
}

/** آزاد کردن همهٔ تخصیص‌های یک ترم (بازگشت به «از نقش‌ها»). */
export async function clearTermEduExpertAction(termId: number): Promise<{ ok: boolean; updated?: number; error?: string }> {
  await requireRoleOrPermission(EDU, EDU_PERM);

  const rows = await db
    .select({ id: course_offerings.id })
    .from(course_offerings)
    .where(and(eq(course_offerings.termId, termId), eq(course_offerings.isActive, 1)));

  if (!rows.length) return { ok: true, updated: 0 };

  await db
    .update(course_offerings)
    .set({ eduExpertUserId: null })
    .where(inArray(course_offerings.id, rows.map((r) => r.id)));

  return { ok: true, updated: rows.length };
}
