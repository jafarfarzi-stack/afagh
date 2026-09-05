import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { short_term_certificates, short_term_courses, short_term_discounts, short_term_learners, short_term_registrations } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import AdminShortCoursesClient, { AdminCourseItem } from './AdminShortCoursesClient';

export const dynamic = 'force-dynamic';

/**
 * مدیریت دوره‌های آزاد.
 *
 * پیش‌تر این صفحه دو دورهٔ ساختگی («بوت‌کمپ جامع برنامه‌نویسی پایتون…» با
 * پنج شرکت‌کنندهٔ خیالی) را هاردکد کرده بود و دکمهٔ «صدور گواهینامه» فقط یک
 * setState بود؛ یعنی شماره‌ای که در پورتال عمومی استعلام می‌شد هرگز در پایگاه
 * داده ثبت نمی‌شد. حالا همه از `short_term_*` خوانده می‌شود.
 */
export default async function AdminShortCoursesPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT']);

  const courses = await db.select().from(short_term_courses).orderBy(desc(short_term_courses.id));
  const discounts = await db.select().from(short_term_discounts).orderBy(short_term_discounts.id);

  // یک کوئری برای همهٔ ثبت‌نام‌ها + شرکت‌کننده + گواهینامه (بدون N+1)
  const registrations = await db
    .select({
      id: short_term_registrations.id,
      learnerId: short_term_registrations.learnerId,
      courseId: short_term_registrations.courseId,
      amountPaid: short_term_registrations.amountPaid,
      discountCode: short_term_registrations.discountCode,
      paymentStatus: short_term_registrations.paymentStatus,
      attendanceCount: short_term_registrations.attendanceCount,
      totalSessions: short_term_registrations.totalSessions,
      finalGrade: short_term_registrations.finalGrade,
      isPassed: short_term_registrations.isPassed,
      certificateIssued: short_term_registrations.certificateIssued,
      createdAt: short_term_registrations.createdAt,
      fullName: short_term_learners.fullName,
      fullNameEn: short_term_learners.fullNameEn,
      nationalId: short_term_learners.nationalId,
      mobile: short_term_learners.mobile,
      certificateNumber: short_term_certificates.certificateNumber,
    })
    .from(short_term_registrations)
    .innerJoin(short_term_learners, eq(short_term_learners.id, short_term_registrations.learnerId))
    .leftJoin(short_term_certificates, eq(short_term_certificates.registrationId, short_term_registrations.id))
    .orderBy(short_term_registrations.id);

  const byCourse = new Map<number, AdminCourseItem['learners']>();
  for (const r of registrations) {
    const list = byCourse.get(r.courseId) ?? [];
    list.push({
      registrationId: r.id,
      id: r.learnerId,
      fullName: r.fullName,
      fullNameEn: r.fullNameEn ?? '',
      nationalId: r.nationalId ?? '',
      mobile: r.mobile,
      courseId: r.courseId,
      amountPaid: r.amountPaid ?? 0,
      discountCode: r.discountCode ?? undefined,
      paymentStatus: r.paymentStatus,
      attendanceCount: r.attendanceCount ?? 0,
      totalSessions: r.totalSessions ?? 0,
      finalGrade: r.finalGrade != null ? Number(r.finalGrade) : undefined,
      isPassed: r.isPassed === 1,
      certificateNumber: r.certificateNumber ?? undefined,
      certificateIssued: r.certificateIssued === 1 || !!r.certificateNumber,
      registeredAt: r.createdAt ? new Date(r.createdAt).toLocaleDateString('fa-IR') : '—',
    });
    byCourse.set(r.courseId, list);
  }

  const initialCourses: AdminCourseItem[] = courses.map(c => ({
    id: c.id,
    code: c.code,
    title: c.title,
    titleEn: c.titleEn ?? '',
    category: c.category,
    hours: c.hours,
    tuitionPrice: c.tuitionPrice,
    capacity: c.capacity,
    enrolledCount: c.enrolledCount ?? 0,
    instructorName: c.instructorName,
    passingGrade: Number(c.passingGrade ?? 12),
    maxAbsences: c.maxAbsences ?? 3,
    status: (c.status as AdminCourseItem['status']) ?? 'OPEN',
    learners: byCourse.get(c.id) ?? [],
  }));

  return (
    <AdminShortCoursesClient
      initialCourses={initialCourses}
      initialDiscounts={discounts.map(d => ({
        id: d.id, code: d.code, courseId: d.courseId, discountPercent: d.discountPercent,
        maxDiscountAmount: d.maxDiscountAmount, maxUsage: d.maxUsage ?? 100,
        usedCount: d.usedCount ?? 0, isActive: (d.isActive ?? 1) === 1,
      }))}
    />
  );
}
