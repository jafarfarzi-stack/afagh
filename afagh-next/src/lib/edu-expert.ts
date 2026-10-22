/**
 * تخصیص کارشناس آموزش به کلاس.
 *
 * دو سطح تخصیص وجود دارد و اولویت با سطحِ ریزتر (کلاس) است:
 *
 *   ۱) سطحِ کلاس   → `course_offerings.eduExpertUserId`  (تخصیص در «تعریف کلاس»)
 *   ۲) سطحِ نقش    → `expert_scopes` (تخصیص دانشگاه/دانشکده/گروه/رشته)
 *
 * اگر برای کلاس تخصیص صریح نشده باشد (NULL)، کارشناس از روی دامنهٔ نقشیِ
 * او پایین می‌آید: رشتهٔ درس → گروهِ سازنده → دانشکده → دانشگاه. این باعث
 * می‌شود صفحهٔ کارشناس آموزش همیشه مقداری داشته باشد، حتی پیش از اینکه
 * مدیر برای هر کلاس دستی تخصیص بدهد.
 *
 * این ماژول عمداً بدون 'use server' است تا هم در Server Action و هم در
 * Server Component قابل استفاده باشد.
 */

import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  classrooms,
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
  /** کارشناس مسئول — از تخصیص سطح کلاس یا (اگر نبود) از دامنهٔ نقش */
  userId: number | null;
  /** منبع تصمیم: 'offering' = تخصیص صریح کلاس · 'scope' = از نقش‌ها · null = هیچ‌کدام */
  source: 'offering' | 'scope' | null;
}

/**
 * کارشناس مسئولِ یک کلاس را برمی‌گرداند.
 *
 * `offering` باید دست‌کم `id`، `ownerDepartmentId` و `universityId` را داشته باشد.
 * برای هر سه سطح (کلاس، گروه، دانشگاه) نگاه می‌شود و دقیق‌ترین برنده است.
 */
export async function resolveEduExpertForOffering(offering: {
  id: number;
  ownerDepartmentId?: number | null;
  universityId?: number | null;
  targetMajorId?: number | null;
  eduExpertUserId?: number | null;
}): Promise<OfferingExpertResolution> {
  if (offering.eduExpertUserId) {
    return { userId: offering.eduExpertUserId, source: 'offering' };
  }

  const scopes = await db.select().from(expert_scopes).catch(() => []);
  if (!scopes.length) return { userId: null, source: null };

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

  if (!candidates.length) return { userId: null, source: null };
  candidates.sort((a, b) => b.precision - a.precision);
  return { userId: candidates[0].userId, source: 'scope' };
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
    assignedUserId: number | null;
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

  return rows.map((r) => {
    if (r.eduExpertUserId) {
      return {
        offeringId: r.offeringId,
        courseTitle: r.courseTitle,
        groupNumber: r.groupNumber,
        departmentName: deptName(r.ownerDepartmentId),
        rooms: roomsByOffering.get(r.offeringId) ?? [],
        hasSchedule: scheduledOfferings.has(r.offeringId),
        assignedUserId: r.eduExpertUserId,
        resolvedUserId: r.eduExpertUserId,
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
      resolvedUserId: fromScope,
      source: fromScope ? ('scope' as const) : null,
      isActive: r.isActive ?? 0,
    };
  });
}
