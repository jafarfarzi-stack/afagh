/**
 * خودترمیمی داده‌های پایهٔ نمرات در حالت دمو (Demo Self-Healing)
 *
 * الگوی مشابه ensureDemoStudentRecord: وقتی نصب تازه (مثل Docker) بدون seed
 * است، Server Actionهای نمرات نباید با خطای FK کرش کنند. این ماژول به‌صورت
 * idempotent ردیف‌های لازم (ترم جاری، درس، ارائه، کاربر/دانشجوی نمره‌ای،
 * ثبت‌نام) را می‌سازد — فقط در isDemoMode()؛ در production داده‌ها از قبل
 * seed شده‌اند و این مسیر هرگز اجرا نمی‌شود.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms,
  course_offerings,
  courses,
  degree_level_configs,
  educational_regulations,
  enrollments,
  roles,
  students,
  user_roles,
  users,
} from '@/db/schema';
import { isDemoMode } from '@/lib/auth';
import { ensureBaseReferenceData } from '@/lib/base-data';

export interface GradeSeedStudent {
  studentId: number;      // شناسهٔ دانشجو در دادهٔ پیش‌نمایش (mock)
  studentCode: string;
  fullName: string;
  entryYear: number;
}

export interface GradePersistenceMeta {
  offeringId: number;
  offeringCode: string;
  offeringTitle: string;
  offeringUnits: number;
  termTitle: string;
  professorStaffId: number;
  students: GradeSeedStudent[];
  /** وقتی ردیف‌های واقعی (غیردمو) وجود دارند چیزی نساز — فقط upsert */
  existingOfferingId?: number;
}

const DEMO_TERM_CODE = 'DEMO-1405'; // ≤10 کاراکتر (محدودیت varchar(10) در اسکیما)

/**
 * تضمین وجود ردیف‌های پایه برای ذخیرهٔ نمرات.
 * در حالت production هیچ ردیفی نمی‌سازد (مسیر دمو هرگز فعال نیست).
 */
export async function ensureGradePersistence(meta: GradePersistenceMeta): Promise<void> {
  if (!isDemoMode()) return; // 🔒 در production داده‌ها seed شده‌اند

  await ensureBaseReferenceData();

  // ۱) ترم جاری
  let [term] = await db.select().from(academic_terms).where(eq(academic_terms.termCode, DEMO_TERM_CODE)).limit(1);
  if (!term) {
    [term] = await db
      .insert(academic_terms)
      .values({ termCode: DEMO_TERM_CODE, title: meta.termTitle, isCurrent: 1, termType: 'NORMAL' })
      .onConflictDoNothing({ target: academic_terms.termCode })
      .returning();
    if (!term) [term] = await db.select().from(academic_terms).where(eq(academic_terms.termCode, DEMO_TERM_CODE)).limit(1);
  }

  // ۲) درس
  let [course] = await db.select().from(courses).where(eq(courses.code, meta.offeringCode)).limit(1);
  if (!course) {
    [course] = await db
      .insert(courses)
      .values({ code: meta.offeringCode, title: meta.offeringTitle, units: String(meta.offeringUnits), gradingType: 'NUMERIC' })
      .onConflictDoNothing({ target: courses.code })
      .returning();
    if (!course) [course] = await db.select().from(courses).where(eq(courses.code, meta.offeringCode)).limit(1);
  }

  // ۳) ارائهٔ درس (با همان id پیش‌نمایش)
  let [offering] = await db
    .select()
    .from(course_offerings)
    .where(eq(course_offerings.id, meta.offeringId))
    .limit(1);
  if (!offering && course && term) {
    [offering] = await db
      .insert(course_offerings)
      .values({
        id: meta.offeringId,
        termId: term.id,
        courseId: course.id,
        professorId: meta.professorStaffId,
        groupNumber: 1,
        capacity: Math.max(50, meta.students.length),
        isActive: 1,
        offeringType: 'NORMAL',
      })
      .onConflictDoNothing({ target: course_offerings.id })
      .returning();
  }

  // ۴) مقطع/آیین‌نامه پایه (برای ردیف دانشجو)
  const [degree] = await db.select({ id: degree_level_configs.id }).from(degree_level_configs).limit(1);
  const [regulation] = await db.select({ id: educational_regulations.id }).from(educational_regulations).limit(1);

  // ۵) کاربر + دانشجو + ثبت‌نام برای هر دانشجوی پیش‌نمایش
  for (const st of meta.students) {
    // کد ملی مصنوعی ۱۰ رقمی یکتا برای حساب دموی این دانشجو
    const syntheticNc = ('9' + st.studentCode).slice(0, 10).padEnd(10, '0');

    let [u] = await db.select().from(users).where(eq(users.nationalCode, syntheticNc)).limit(1);
    if (!u) {
      [u] = await db
        .insert(users)
        .values({
          nationalCode: syntheticNc,
          firstName: st.fullName.split(' ')[0] || 'دانشجو',
          lastName: st.fullName.split(' ').slice(1).join(' ') || st.studentCode,
          passwordHash: '!demo-nologin', // این حساب هرگز مستقیم وارد نمی‌شود
          isActive: 0,
        })
        .onConflictDoNothing({ target: users.nationalCode })
        .returning();
      if (!u) [u] = await db.select().from(users).where(eq(users.nationalCode, syntheticNc)).limit(1);
    }
    if (u) {
      // نقش دانشجو را تضمین کن (roles از قبل seed شده‌اند — فقط در دمو)
      let [roleRow] = await db.select().from(roles).where(eq(roles.code, 'STUDENT')).limit(1);
      if (!roleRow) {
        [roleRow] = await db.insert(roles).values({ code: 'STUDENT', title: 'دانشجو' }).onConflictDoNothing({ target: roles.code }).returning();
        if (!roleRow) [roleRow] = await db.select().from(roles).where(eq(roles.code, 'STUDENT')).limit(1);
      }
      if (roleRow) await db.insert(user_roles).values({ userId: u.id, roleId: roleRow.id }).onConflictDoNothing();
    }

    let [student] = await db
      .select()
      .from(students)
      .where(eq(students.studentCode, st.studentCode))
      .limit(1);
    if (!student && u && degree && regulation) {
      [student] = await db
        .insert(students)
        .values({
          userId: u.id,
          studentCode: st.studentCode,
          degreeLevelId: degree.id,
          regulationId: regulation.id,
          entryYear: st.entryYear,
        })
        .onConflictDoNothing({ target: students.studentCode })
        .returning();
    }

    if (student && offering) {
      await db
        .insert(enrollments)
        .values({ studentId: student.id, offeringId: offering.id, status: 'REGISTERED' })
        .onConflictDoNothing({ target: [enrollments.studentId, enrollments.offeringId] });
    }
  }
}

/** یافتن ردیف دانشجوی واقعی (دمو: نگاشت mockId → students.id) */
export async function resolveStudentRow(offeringId: number, studentCode: string) {
  const [student] = await db.select().from(students).where(eq(students.studentCode, studentCode)).limit(1);
  if (!student) return null;
  const [enr] = await db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.studentId, student.id), eq(enrollments.offeringId, offeringId)))
    .limit(1)
    .catch(() => null as any);
  return { student, enrollment: enr ?? null };
}

