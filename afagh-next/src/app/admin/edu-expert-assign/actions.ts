'use server';

import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms,
  classroom_edu_experts,
  course_offering_edu_experts,
  course_offerings,
  users,
} from '@/db/schema';
import { requireRoleOrPermission } from '@/lib/permissions-enforcer';
import {
  addClassroomEduExperts,
  addOfferingEduExperts,
  listClassroomExpertAssignments,
  listEduExpertCandidates,
  listOfferingExpertAssignments,
  setClassroomEduExperts,
  setOfferingEduExperts,
  type ClassroomAssignRow,
} from '@/lib/edu-expert';

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
  /** کارشناسِ اصلی (اولین نفر) — سازگاری با UI تک‌مقداری */
  assignedUserId: number | null;
  /** همهٔ کارشناسانِ این کلاس — یک کلاس می‌تواند چند کارشناس داشته باشد */
  assignedUserIds: number[];
  resolvedUserId: number | null;
  source: 'offering' | 'classroom' | 'scope' | null;
}

export interface EduExpertAssignInit {
  terms: { id: number; title: string; isCurrent: boolean }[];
  candidates: { userId: number; name: string }[];
  /** اتاق‌های دارای سانس در این ترم — سطحِ اصلیِ تخصیص */
  rooms: ClassroomAssignRow[];
  /** استثناهای سطحِ درس — همان جدولِ قبلی، حالا تبِ دوم */
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

  const [candidates, rooms, rows] = await Promise.all([
    listEduExpertCandidates(),
    tid ? listClassroomExpertAssignments(tid) : Promise.resolve([]),
    tid ? listOfferingExpertAssignments(tid) : Promise.resolve([]),
  ]);

  return {
    terms: terms.map((t) => ({ id: t.id, title: t.title, isCurrent: (t.isCurrent ?? 0) === 1 })),
    candidates,
    rooms,
    rows: rows.map((r) => ({
      offeringId: r.offeringId,
      courseTitle: r.courseTitle,
      groupNumber: r.groupNumber,
      departmentName: r.departmentName,
      rooms: r.rooms,
      hasSchedule: r.hasSchedule,
      assignedUserId: r.assignedUserId,
      assignedUserIds: r.assignedUserIds,
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

/** تخصیص یک کلاس به یک کارشناس (یا آزاد کردن با userId = null).
 *  ⚠ جایگزینِ کاملِ فهرست است: اگر کلاس چند کارشناس داشت، بقیه حذف می‌شوند.
 *  برای افزودنِ بدون حذف از `addOfferingEduExpertAction` استفاده کنید. */
export async function setOfferingEduExpertAction(
  offeringId: number,
  userId: number | null,
): Promise<{ ok: boolean; error?: string }> {
  await requireRoleOrPermission(EDU, EDU_PERM);

  const chk = await assertExpert(userId);
  if (!chk.ok) return { ok: false, error: chk.error };

  await setOfferingEduExperts(offeringId, chk.userId == null ? [] : [chk.userId]);
  return { ok: true };
}

/** جایگزینیِ کاملِ فهرستِ کارشناسانِ یک کلاس — برای ذخیرهٔ چند‌کارشناسه. */
export async function setOfferingEduExpertsAction(
  offeringId: number,
  userIds: number[],
): Promise<{ ok: boolean; userIds?: number[]; error?: string }> {
  await requireRoleOrPermission(EDU, EDU_PERM);

  for (const id of userIds) {
    const chk = await assertExpert(id);
    if (!chk.ok) return { ok: false, error: chk.error };
  }

  const saved = await setOfferingEduExperts(offeringId, userIds);
  return { ok: true, userIds: saved };
}

/** افزودنِ یک کارشناس به یک کلاس، بدون دست‌زدن به کارشناسانِ فعلی. */
export async function addOfferingEduExpertAction(
  offeringId: number,
  userId: number,
): Promise<{ ok: boolean; error?: string }> {
  await requireRoleOrPermission(EDU, EDU_PERM);

  const chk = await assertExpert(userId);
  if (!chk.ok) return { ok: false, error: chk.error };
  if (chk.userId == null) return { ok: false, error: 'کارشناس انتخاب نشده.' };

  await addOfferingEduExperts([offeringId], chk.userId);
  return { ok: true };
}

/** حذفِ یک کارشناس از یک کلاس (بقیه می‌مانند). */
export async function removeOfferingEduExpertAction(
  offeringId: number,
  userId: number,
): Promise<{ ok: boolean; userIds?: number[]; error?: string }> {
  await requireRoleOrPermission(EDU, EDU_PERM);

  const current = await db
    .select({ userId: course_offering_edu_experts.userId })
    .from(course_offering_edu_experts)
    .where(eq(course_offering_edu_experts.offeringId, offeringId))
    .orderBy(asc(course_offering_edu_experts.id));
  const next = current.map((r) => r.userId).filter((id) => id !== userId);

  const saved = await setOfferingEduExperts(offeringId, next);
  return { ok: true, userIds: saved };
}

/** تخصیص گروهی — جایگزینیِ کامل: همهٔ کلاس‌های انتخابی دقیقاً همین یک کارشناس را می‌گیرند. */
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

  for (const e of existing) {
    await setOfferingEduExperts(e.id, chk.userId == null ? [] : [chk.userId]);
  }
  return { ok: true, updated: existing.length };
}

/**
 * تخصیص گروهی — افزودنی: کارشناس به فهرستِ هر کلاس اضافه می‌شود و کارشناسانِ
 * قبلی دست‌نخورده می‌مانند. این همان چیزی است که «یک کلاس، چند کارشناس» را
 * برای تخصیصِ انبوه ممکن می‌کند.
 */
export async function bulkAddOfferingEduExpertAction(
  offeringIds: number[],
  userId: number,
): Promise<{ ok: boolean; updated?: number; error?: string }> {
  await requireRoleOrPermission(EDU, EDU_PERM);

  const chk = await assertExpert(userId);
  if (!chk.ok) return { ok: false, error: chk.error };
  if (chk.userId == null) return { ok: false, error: 'کارشناس انتخاب نشده.' };

  const ids = [...new Set(offeringIds.filter((n) => Number.isFinite(n)))];
  if (!ids.length) return { ok: true, updated: 0 };

  const existing = await db
    .select({ id: course_offerings.id })
    .from(course_offerings)
    .where(inArray(course_offerings.id, ids));
  if (!existing.length) return { ok: true, updated: 0 };

  const updated = await addOfferingEduExperts(existing.map((e) => e.id), chk.userId);
  return { ok: true, updated };
}

/** آزاد کردن همهٔ تخصیص‌های یک ترم (بازگشت به «از نقش‌ها»). */
export async function clearTermEduExpertAction(termId: number): Promise<{ ok: boolean; updated?: number; error?: string }> {
  await requireRoleOrPermission(EDU, EDU_PERM);

  const rows = await db
    .select({ id: course_offerings.id })
    .from(course_offerings)
    .where(and(eq(course_offerings.termId, termId), eq(course_offerings.isActive, 1)));

  if (!rows.length) return { ok: true, updated: 0 };

  const ids = rows.map((r) => r.id);

  // هر دو لایه پاک می‌شوند: جدولِ واسط و ستونِ «کارشناسِ اصلی».
  // اگر فقط ستون پاک شود، فهرستِ چند‌کارشناسه باقی می‌ماند و کلاس همچنان
  // «تخصیص صریح» شمرده می‌شود — یعنی دکمه بی‌اثر به نظر می‌رسد.
  await db
    .delete(course_offering_edu_experts)
    .where(inArray(course_offering_edu_experts.offeringId, ids));
  await db
    .update(course_offerings)
    .set({ eduExpertUserId: null })
    .where(inArray(course_offerings.id, ids));

  return { ok: true, updated: rows.length };
}

/* ────────────────────────────────────────────────────────────────────────
 *  سطحِ اتاق (۰۱۱۲) — واحدِ اصلیِ تخصیص
 *  ──────────────────────────────────────────────────────────────────────── */

/** افزودنِ یک کارشناس به یک یا چند اتاق (کارشناسانِ قبلی حفظ می‌شوند). */
export async function addClassroomExpertAction(
  classroomIds: number[],
  userId: number,
): Promise<{ ok: boolean; updated?: number; error?: string }> {
  await requireRoleOrPermission(EDU, EDU_PERM);

  const chk = await assertExpert(userId);
  if (!chk.ok) return { ok: false, error: chk.error };
  if (chk.userId == null) return { ok: false, error: 'کارشناس انتخاب نشده.' };

  const updated = await addClassroomEduExperts(classroomIds, chk.userId);
  return { ok: true, updated };
}

/** حذفِ یک کارشناس از یک اتاق (بقیه می‌مانند). */
export async function removeClassroomExpertAction(
  classroomId: number,
  userId: number,
): Promise<{ ok: boolean; userIds?: number[]; error?: string }> {
  await requireRoleOrPermission(EDU, EDU_PERM);

  const current = await db
    .select({ userId: classroom_edu_experts.userId })
    .from(classroom_edu_experts)
    .where(eq(classroom_edu_experts.classroomId, classroomId))
    .orderBy(asc(classroom_edu_experts.id));
  const next = current.map((r) => r.userId).filter((id) => id !== userId);
  const saved = await setClassroomEduExperts(classroomId, next);
  return { ok: true, userIds: saved };
}

/** جایگزینیِ کاملِ فهرستِ کارشناسانِ یک اتاق. */
export async function setClassroomExpertsAction(
  classroomId: number,
  userIds: number[],
): Promise<{ ok: boolean; userIds?: number[]; error?: string }> {
  await requireRoleOrPermission(EDU, EDU_PERM);

  for (const id of userIds) {
    const chk = await assertExpert(id);
    if (!chk.ok) return { ok: false, error: chk.error };
  }
  const saved = await setClassroomEduExperts(classroomId, userIds);
  return { ok: true, userIds: saved };
}

/** آزاد کردنِ همهٔ تخصیص‌های سطحِ اتاق (کل دانشگاه، نه یک ترم). */
export async function clearAllClassroomExpertsAction(): Promise<{ ok: boolean; updated?: number; error?: string }> {
  await requireRoleOrPermission(EDU, EDU_PERM);

  const rows = await db.select({ id: classroom_edu_experts.id }).from(classroom_edu_experts);
  if (!rows.length) return { ok: true, updated: 0 };
  await db.delete(classroom_edu_experts);
  return { ok: true, updated: rows.length };
}
