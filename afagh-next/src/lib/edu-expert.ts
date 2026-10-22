/**
 * تخصیص کارشناس آموزش به کلاس.
 *
 * دو سطح تخصیص وجود دارد و اولویت با سطحِ ریزتر (کلاس) است:
 *
 *   ۱) سطحِ کلاس   → جدولِ `course_offering_edu_experts` (چند‌به‌چند، مهاجرت ۰۱۱۱)
 *                     ستونِ `course_offerings.eduExpertUserId` فقط «کارشناسِ اصلی»
 *                     (اولین نفر) را نگه می‌دارد تا مصرف‌کننده‌های تک‌مقداری نشکنند.
 *   ۲) سطحِ نقش    → `expert_scopes` (تخصیص دانشگاه/دانشکده/گروه/رشته)
 *
 * اگر برای کلاس تخصیص صریح نشده باشد، کارشناس از روی دامنهٔ نقشیِ
 * او پایین می‌آید: رشتهٔ درس → گروهِ سازنده → دانشکده → دانشگاه. این باعث
 * می‌شود صفحهٔ کارشناس آموزش همیشه مقداری داشته باشد، حتی پیش از اینکه
 * مدیر برای هر کلاس دستی تخصیص بدهد.
 *
 * «چند کارشناس برای یک کلاس» مجاز است: هر تعداد ردیف در جدولِ واسط. در آن
 * حالت `source` همچنان 'offering' است و `userIds` همهٔ آن‌ها را برمی‌گرداند.
 *
 * این ماژول عمداً بدون 'use server' است تا هم در Server Action و هم در
 * Server Component قابل استفاده باشد.
 */

import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db';
import {
  classrooms,
  course_offering_edu_experts,
  course_offerings,
  courses,
  departments,
  expert_scopes,
  faculties,
  majors,
  roles,
  schedules,
  universities,
  user_roles,
  users,
} from '@/db/schema';
import { getCurrentUniversity } from '@/lib/university-scope';

export interface EduExpertCandidate {
  userId: number;
  name: string;
}

/** فهرست کارشناسان آموزشِ دانشگاه جاری — برای dropdown در «تعریف کلاس». */
export async function listEduExpertCandidates(): Promise<EduExpertCandidate[]> {
  const [edu] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.code, 'EDU_EXPERT'))
    .limit(1)
    .catch(() => []);
  if (!edu) return [];

  const rows = await db
    .select({ userId: user_roles.userId })
    .from(user_roles)
    .where(eq(user_roles.roleId, edu.id));

  const userIds = [...new Set(rows.map((r) => r.userId))];
  if (!userIds.length) return [];

  const uni = await getCurrentUniversity().catch(() => null);

  const us = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      isActive: users.isActive,
      universityId: users.universityId,
    })
    .from(users)
    .where(inArray(users.id, userIds));

  return us
    .filter((u) => (u.isActive ?? 0) === 1)
    // اگر دانشگاه جاری مشخص است، همان دانشگاه را ترجیح بده ولی متخصصان
    // بدون دانشگاه (سراسری) را هم حذف نکن.
    .filter((u) => !uni || u.universityId == null || u.universityId === uni.id)
    .map((u) => ({ userId: u.id, name: `${u.firstName || ''} ${u.lastName || ''}`.trim() }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
}

/** نقش‌های (دامنه‌های) تخصیص‌یافته به یک کارشناس — برای نمایش در UI. */
export async function getExpertScopeLabels(userId: number): Promise<string[]> {
  const rows = await db
    .select()
    .from(expert_scopes)
    .where(eq(expert_scopes.userId, userId))
    .catch(() => []);
  if (!rows.length) return [];

  const labels: string[] = [];
  for (const r of rows) {
    if (r.scopeType === 'UNIVERSITY') {
      const u = await db.select({ title: universities.title }).from(universities).where(eq(universities.id, r.scopeId ?? 0)).limit(1).catch(() => []);
      if (u[0]) labels.push(`دانشگاه ${u[0].title}`);
    } else if (r.scopeType === 'FACULTY') {
      const f = await db.select({ name: faculties.name }).from(faculties).where(eq(faculties.id, r.scopeId ?? 0)).limit(1).catch(() => []);
      if (f[0]) labels.push(`دانشکده ${f[0].name}`);
    } else if (r.scopeType === 'DEPARTMENT') {
      const d = await db.select({ name: departments.name }).from(departments).where(eq(departments.id, r.scopeId ?? 0)).limit(1).catch(() => []);
      if (d[0]) labels.push(`گروه ${d[0].name}`);
    } else if (r.scopeType === 'MAJOR') {
      const m = await db.select({ name: majors.name }).from(majors).where(eq(majors.id, r.scopeId ?? 0)).limit(1).catch(() => []);
      if (m[0]) labels.push(`رشته ${m[0].name}`);
    }
  }
  return labels;
}

export interface OfferingExpertResolution {
  /** کارشناس مسئول (اصلی) — از تخصیص سطح کلاس یا (اگر نبود) از دامنهٔ نقش */
  userId: number | null;
  /** همهٔ کارشناسانِ تخصیص‌یافته به این کلاس (۱ یا بیشتر). اگر از نقش‌ها آمده باشد، تک‌عضوی. */
  userIds: number[];
  /** منبع تصمیم: 'offering' = تخصیص صریح کلاس · 'scope' = از نقش‌ها · null = هیچ‌کدام */
  source: 'offering' | 'scope' | null;
}

/**
 * فهرستِ کاملِ کارشناسانِ یک کلاس از جدولِ واسط (بدون fallback نقش‌ها).
 * برای ویرایشگرِ تک‌کلاس لازم است تا بداند دقیقاً چه چیزی ذخیره شده.
 */
export async function getOfferingEduExpertIds(offeringId: number): Promise<number[]> {
  const rows = await db
    .select({ userId: course_offering_edu_experts.userId })
    .from(course_offering_edu_experts)
    .where(eq(course_offering_edu_experts.offeringId, offeringId))
    .orderBy(asc(course_offering_edu_experts.id))
    .catch(() => []);
  return rows.map((r) => r.userId);
}

/**
 * جایگزینیِ کاملِ فهرستِ کارشناسانِ یک کلاس.
 *
 * همهٔ نوشتن‌ها از این‌جا رد می‌شوند تا ستونِ «کارشناسِ اصلی» هرگز از جدولِ
 * واسط جدا نیفتد. `userIds` خالی = آزاد کردن کلاس (بازگشت به نقش‌ها).
 * خروجی، فهرستِ نهاییِ ذخیره‌شده است (تکراری‌ها حذف می‌شوند).
 */
export async function setOfferingEduExperts(
  offeringId: number,
  userIds: number[],
): Promise<number[]> {
  const ids = [...new Set(userIds.filter((n) => Number.isInteger(n) && n > 0))];

  await db.delete(course_offering_edu_experts).where(eq(course_offering_edu_experts.offeringId, offeringId));
  if (ids.length) {
    await db
      .insert(course_offering_edu_experts)
      .values(ids.map((userId) => ({ offeringId, userId })))
      .onConflictDoNothing();
  }

  // ستونِ تک‌مقداری = اولین نفر؛ خالی اگر کسی نمانده باشد.
  await db
    .update(course_offerings)
    .set({ eduExpertUserId: ids[0] ?? null })
    .where(eq(course_offerings.id, offeringId));

  return ids;
}

/**
 * افزودنِ یک کارشناس به کلاس بدون دست‌زدن به بقیه.
 * برای تخصیصِ گروهی («این ۵ کلاس را هم به آقای X بده») لازم است، وگرنه
 * تخصیصِ دوم کارشناسِ اول را پاک می‌کرد.
 */
export async function addOfferingEduExperts(
  offeringIds: number[],
  userId: number,
): Promise<number> {
  const ids = [...new Set(offeringIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length || !Number.isInteger(userId) || userId <= 0) return 0;

  await db
    .insert(course_offering_edu_experts)
    .values(ids.map((offeringId) => ({ offeringId, userId })))
    .onConflictDoNothing();

  // برای ارائه‌هایی که هنوز «کارشناسِ اصلی» ندارند، همین نفر اصلی می‌شود.
  // (اگر از قبل اصلی دارند، دست نمی‌زنیم — افزودن نفر دوم نباید اولی را جابه‌جا کند.)
  await db
    .update(course_offerings)
    .set({ eduExpertUserId: userId })
    .where(and(inArray(course_offerings.id, ids), isNull(course_offerings.eduExpertUserId)));

  return ids.length;
}

/**
 * کارشناس مسئولِ یک کلاس را برمی‌گرداند.
 *
 * `offering` باید دست‌کم `id`، `ownerDepartmentId` و `universityId` را داشته باشد.
 * برای هر سه سطح (کلاس، گروه، دانشگاه) نگاه می‌شود و دقیق‌ترین برنده است.
 * اگر کلاس چند کارشناس داشته باشد، همه در `userIds` برمی‌گردند و `userId`
 * اولین نفر (کارشناسِ اصلی) است.
 */
export async function resolveEduExpertForOffering(offering: {
  id: number;
  ownerDepartmentId?: number | null;
  universityId?: number | null;
  targetMajorId?: number | null;
  eduExpertUserId?: number | null;
}): Promise<OfferingExpertResolution> {
  // ۱) تخصیص صریحِ سطح کلاس (چند‌به‌چند) — برندهٔ قطعی
  const assigned = await getOfferingEduExpertIds(offering.id);
  if (assigned.length) {
    return { userId: assigned[0], userIds: assigned, source: 'offering' };
  }
  // سازگاری با فراخوانی‌هایی که خودشان رکورد را خوانده‌اند و ستون را پاس می‌دهند
  if (offering.eduExpertUserId) {
    return { userId: offering.eduExpertUserId, userIds: [offering.eduExpertUserId], source: 'offering' };
  }

  const scopes = await db.select().from(expert_scopes).catch(() => []);
  if (!scopes.length) return { userId: null, userIds: [], source: null };

  // دقتِ هر سطح: MAJOR (۴) > DEPARTMENT (۳) > FACULTY (۲) > UNIVERSITY (۱)
  const byPrecision = (type: string, id: number | null | undefined) => {
    const match = scopes.find((s) => s.scopeType === type && (s.scopeId ?? null) === (id ?? null));
    return match ? match.userId : null;
  };

  const candidates: { precision: number; userId: number }[] = [];

  // ۱) رشتهٔ هدفِ کلاس (اگر کلاس به رشتهٔ خاصی هدف گرفته شده)
  if (offering.targetMajorId) {
    const hit = byPrecision('MAJOR', offering.targetMajorId);
    if (hit) candidates.push({ precision: 4, userId: hit });
  }

  // ۲) گروه سازندهٔ کلاس
  if (offering.ownerDepartmentId) {
    const hit = byPrecision('DEPARTMENT', offering.ownerDepartmentId);
    if (hit) candidates.push({ precision: 3, userId: hit });
  }

  // ۳) دانشگاه
  if (offering.universityId) {
    const hit = byPrecision('UNIVERSITY', offering.universityId);
    if (hit) candidates.push({ precision: 1, userId: hit });
  }

  if (!candidates.length) return { userId: null, userIds: [], source: null };
  candidates.sort((a, b) => b.precision - a.precision);
  return { userId: candidates[0].userId, userIds: [candidates[0].userId], source: 'scope' };
}

/**
 * همهٔ کلاس‌های یک ترم را با کارشناس مسئولشان برمی‌گرداند — برای صفحهٔ
 * «تخصیص کارشناس به کلاس‌ها» (جدول انبوه، بدون رفتن به تک‌تک کلاس‌ها).
 */
export async function listOfferingExpertAssignments(termId: number): Promise<
  {
    offeringId: number;
    courseTitle: string;
    groupNumber: number;
    departmentName: string | null;
    /** نامِ اتاق‌های همان درس از برنامهٔ هفتگی — مثل «كلاس 5 انساني» */
    rooms: string[];
    /** آیا برای این درس اصلاً سانس/اتاق تعریف شده؟ (برای فیلترِ جدول) */
    hasSchedule: boolean;
    /** کارشناسِ اصلی (اولین نفر) — برای سازگاری با UIهای تک‌مقداری */
    assignedUserId: number | null;
    /** همهٔ کارشناسانِ تخصیص‌یافته به این کلاس (۰ یا بیشتر) */
    assignedUserIds: number[];
    resolvedUserId: number | null;
    source: 'offering' | 'scope' | null;
    isActive: number;
  }[]
> {
  const rows = await db
    .select({
      offeringId: course_offerings.id,
      courseTitle: courses.title,
      groupNumber: course_offerings.groupNumber,
      ownerDepartmentId: course_offerings.ownerDepartmentId,
      universityId: course_offerings.universityId,
      eduExpertUserId: course_offerings.eduExpertUserId,
      isActive: course_offerings.isActive,
    })
    .from(course_offerings)
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(and(eq(course_offerings.termId, termId), eq(course_offerings.isActive, 1)))
    .orderBy(asc(courses.title))
    .catch(() => []);

  const deptIds = [...new Set(rows.map((r) => r.ownerDepartmentId).filter((v): v is number => typeof v === 'number'))];
  const depts = deptIds.length
    ? await db.select({ id: departments.id, name: departments.name }).from(departments).where(inArray(departments.id, deptIds))
    : [];
  const deptName = (id: number | null) => (id == null ? null : depts.find((d) => d.id === id)?.name ?? null);

  /* اتاق‌های هر درس — از `schedules`.
     چرا لازم است: این صفحه «تخصیص کارشناس به کلاس» است، ولی تا امروز هر سطر
     فقط «درس + گروه» را نشان می‌داد و مدیر نمی‌دانست این درس در کدام اتاق
     برگزار می‌شود (در دادهٔ واقعی، ۱۷۸ درس از ۲۱۶ درسِ یک ترم هنوز هیچ سانس/
     اتاقی ندارند). یک درس می‌تواند چند سانس در چند اتاق داشته باشد، پس فهرستِ
     یکتا از نام‌ها برمی‌گردانیم. */
  const offeringIds = rows.map((r) => r.offeringId);
  const schedRows = offeringIds.length
    ? await db
        .select({ offeringId: schedules.offeringId, roomId: schedules.roomId, scheduleType: schedules.scheduleType })
        .from(schedules)
        .where(inArray(schedules.offeringId, offeringIds))
        // سانسِ «امتحان» اتاقش سالنِ امتحان است، نه کلاسِ درس — بیرونش می‌گذاریم
        .then((rs) => rs.filter((s) => String(s.scheduleType ?? '').toUpperCase() !== 'EXAM'))
        .catch(() => [])
    : [];
  const roomIds = [...new Set(schedRows.map((s) => s.roomId).filter((v): v is number => typeof v === 'number'))];
  const roomRows = roomIds.length
    ? await db
        .select({ id: classrooms.id, name: classrooms.name })
        .from(classrooms)
        .where(inArray(classrooms.id, roomIds))
        .catch(() => [])
    : [];
  const roomNameOf = (id: number | null) => (id == null ? null : roomRows.find((r) => r.id === id)?.name ?? null);
  const roomsByOffering = new Map<number, string[]>();
  const scheduledOfferings = new Set<number>();
  for (const s of schedRows) {
    scheduledOfferings.add(s.offeringId);
    const name = roomNameOf(s.roomId);
    if (!name) continue;
    const list = roomsByOffering.get(s.offeringId) ?? [];
    if (!list.includes(name)) list.push(name);
    roomsByOffering.set(s.offeringId, list);
  }

  // برای عملکرد: نقش‌ها را یک بار می‌خوانیم و در حافظه جستجو می‌کنیم
  const scopes = await db.select().from(expert_scopes).catch(() => []);
  const scopeHit = (type: string, id: number | null | undefined) => {
    const m = scopes.find((s) => s.scopeType === type && (s.scopeId ?? null) === (id ?? null));
    return m ? m.userId : null;
  };

  /* کارشناسانِ سطحِ کلاس — یک کوئری برای همهٔ ارائه‌های ترم (چند‌به‌چند، ۰۱۱۱).
     ستونِ قدیمی `eduExpertUserId` هم به‌عنوان تورِ ایمنی خوانده می‌شود تا اگر
     جایی خارج از این ماژول نوشته شده باشد، در جدول دیده شود. */
  const expertRows = offeringIds.length
    ? await db
        .select({ offeringId: course_offering_edu_experts.offeringId, userId: course_offering_edu_experts.userId })
        .from(course_offering_edu_experts)
        .where(inArray(course_offering_edu_experts.offeringId, offeringIds))
        .orderBy(asc(course_offering_edu_experts.id))
        .catch(() => [])
    : [];
  const expertsByOffering = new Map<number, number[]>();
  for (const e of expertRows) {
    const list = expertsByOffering.get(e.offeringId) ?? [];
    if (!list.includes(e.userId)) list.push(e.userId);
    expertsByOffering.set(e.offeringId, list);
  }

  return rows.map((r) => {
    const explicit = expertsByOffering.get(r.offeringId) ?? (r.eduExpertUserId ? [r.eduExpertUserId] : []);
    if (explicit.length) {
      return {
        offeringId: r.offeringId,
        courseTitle: r.courseTitle,
        groupNumber: r.groupNumber,
        departmentName: deptName(r.ownerDepartmentId),
        rooms: roomsByOffering.get(r.offeringId) ?? [],
        hasSchedule: scheduledOfferings.has(r.offeringId),
        assignedUserId: explicit[0],
        assignedUserIds: explicit,
        resolvedUserId: explicit[0],
        source: 'offering' as const,
        isActive: r.isActive ?? 0,
      };
    }
    // از نقش‌ها: گروه سازنده → دانشگاه (سطح MAJOR در اینجا قیمت ندارد چون
    // هدفِ رشته به سطح کلاس مربوط است و در جدول انبوه دقتِ کمتری می‌خواهیم)
    const fromScope = scopeHit('DEPARTMENT', r.ownerDepartmentId) ?? scopeHit('UNIVERSITY', r.universityId) ?? null;
    return {
      offeringId: r.offeringId,
      courseTitle: r.courseTitle,
      groupNumber: r.groupNumber,
      departmentName: deptName(r.ownerDepartmentId),
      rooms: roomsByOffering.get(r.offeringId) ?? [],
      hasSchedule: scheduledOfferings.has(r.offeringId),
      assignedUserId: null,
      assignedUserIds: [],
      resolvedUserId: fromScope,
      source: fromScope ? ('scope' as const) : null,
      isActive: r.isActive ?? 0,
    };
  });
}
