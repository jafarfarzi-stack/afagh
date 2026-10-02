import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { course_offerings, courses, enrollments, students, tuition_rules } from '@/db/schema';
import { bucketCourseUnits, pickFormula, totalBuckets, tuitionFromFormula } from '../finance-rules';

// ══════════════════════════════════════════════════════════════════════
//  فرمول تخصیص
// ══════════════════════════════════════════════════════════════════════

export interface FormulaTuition {
  formula: (typeof tuition_rules.$inferSelect) | null;
  buckets: { theory: number; practical: number; general: number };
  fixed: number;
  variable: number;
  total: number;
}

/**
 * محاسبهٔ شهریهٔ یک ترم از فرمول تخصیص (قواعد یکپارچهٔ tuition_rules).
 *
 * اگر هیچ قاعده‌ای با مقطع/رشته/ورودی دانشجو نخواند، null برمی‌گردد —
 * کارشناس مالی باید قاعده بسازد، نه اینکه سامانه عددی از خود بسازد.
 * انتخاب قاعده از resolver یکتا می‌آید (مقطع بر رشته مقدم است).
 */
export async function computeFormulaTuition(
  studentId: number,
  termId: number
): Promise<FormulaTuition> {
  const [student] = await db.select({
    degreeLevelId: students.degreeLevelId,
    majorId: students.majorId,
    entryYear: students.entryYear,
  }).from(students).where(eq(students.id, studentId)).limit(1);

  const empty: FormulaTuition = {
    formula: null,
    buckets: { theory: 0, practical: 0, general: 0 },
    fixed: 0, variable: 0, total: 0,
  };
  if (!student) return empty;

  const formulas = await db.select().from(tuition_rules)
    .where(eq(tuition_rules.isActive, 1));

  const formula = pickFormula(formulas, {
    degreeLevelId: student.degreeLevelId,
    majorId: student.majorId,
    entryYear: student.entryYear,
  });
  if (!formula) return empty;

  const offerings = await db.select({
    units: courses.units,
    theoreticalUnits: courses.theoreticalUnits,
    practicalUnits: courses.practicalUnits,
    courseType: courses.courseType,
  }).from(enrollments)
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(and(eq(enrollments.studentId, studentId), eq(course_offerings.termId, termId)));

  const buckets = totalBuckets(offerings.map((o) => bucketCourseUnits(o)));
  const { fixed, variable, total } = tuitionFromFormula(formula, buckets);

  return { formula, buckets, fixed, variable, total };
}

export async function listFormulas() {
  return db.select().from(tuition_rules).orderBy(asc(tuition_rules.priority), asc(tuition_rules.id));
}
