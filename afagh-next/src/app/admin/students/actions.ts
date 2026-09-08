'use server';

import { db } from '@/db';
import { academic_terms, course_offerings, courses, enrollments, legacy_grades, students } from '@/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';

export type TranscriptRow = {
  termCode: string;
  termTitle: string | null;
  courseCode: string;
  courseTitle: string;
  units: string | null;
  gradeValue: string | null;
  gradeStatus: string;
  offeringType: string | null;
};

export async function getTranscript(studentId: number): Promise<TranscriptRow[]> {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'ARCHIVE_EXPERT', 'MILITARY_OFFICER']);
  const [stu] = await db.select({ id: students.id, code: students.studentCode }).from(students).where(eq(students.id, studentId)).limit(1);
  if (!stu) return [];
  // enrollments (سامانه جدید — از سما)
  const ens = await db
    .select({
      termCode: academic_terms.termCode,
      termTitle: academic_terms.title,
      courseCode: courses.code,
      courseTitle: courses.title,
      units: courses.units,
      gradeValue: enrollments.gradeValue,
      gradeStatus: enrollments.gradeStatus,
      offeringType: course_offerings.offeringType,
    })
    .from(enrollments)
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .innerJoin(academic_terms, eq(academic_terms.id, course_offerings.termId))
    .where(eq(enrollments.studentId, studentId))
    .orderBy(desc(academic_terms.termCode), courses.code);
  if (ens.length) return ens;
  // fallback: legacy_grades (اگر هنوز promote نشده)
  const legs = await db
    .select({
      termCode: legacy_grades.termCode,
      courseCode: legacy_grades.courseCode,
      courseTitle: legacy_grades.courseTitle,
      units: legacy_grades.units,
      gradeValue: legacy_grades.gradeValue,
      gradeStatus: legacy_grades.gradeStatus,
    })
    .from(legacy_grades)
    .where(eq(legacy_grades.studentCode, stu.code))
    .orderBy(desc(legacy_grades.termCode), legacy_grades.courseCode)
    .limit(500);
  return legs.map(r => ({
    termCode: r.termCode,
    termTitle: null,
    courseCode: r.courseCode,
    courseTitle: r.courseTitle || `درس ${r.courseCode}`,
    units: r.units ? String(r.units) : null,
    gradeValue: r.gradeValue ? String(r.gradeValue) : null,
    gradeStatus: r.gradeStatus,
    offeringType: null,
  }));
}
