import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { short_term_courses } from '@/db/schema';
import OpenCoursesClient, { type PublicShortCourse } from './OpenCoursesClient';

export const dynamic = 'force-dynamic';

/** کاتالوگ زندهٔ دوره‌های آزاد — فقط از پایگاه داده (بدون هیچ دادهٔ ثابت) */
export default async function OpenCoursesPage() {
  const rows = await db.select().from(short_term_courses)
    .where(eq(short_term_courses.status, 'OPEN'))
    .orderBy(desc(short_term_courses.createdAt));

  const initialCourses: PublicShortCourse[] = rows.map(c => ({
    id: c.id,
    code: c.code,
    title: c.title,
    titleEn: c.titleEn ?? '',
    category: (c.category as PublicShortCourse['category']) || 'مهندسی و فناوری',
    description: c.description ?? '',
    hours: c.hours,
    tuitionPrice: c.tuitionPrice,
    capacity: c.capacity,
    enrolledCount: c.enrolledCount ?? 0,
    instructorName: c.instructorName,
    instructorBio: c.instructorBio ?? '',
    syllabus: (() => {
      try {
        const parsed = JSON.parse(c.syllabusJson || '[]');
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    })(),
    scheduleText: c.scheduleText ?? '',
    startDate: c.startDate ?? '',
    endDate: c.endDate ?? '',
    passingGrade: Number(c.passingGrade ?? 12),
  }));

  return <OpenCoursesClient initialCourses={initialCourses} />;
}
