import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, departments, faculties, majors, students } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import ManualEnrollClient, { EnrollFilters } from './ManualEnrollClient';

export const dynamic = 'force-dynamic';

/** ثبت‌نام و حذف دستی/دسته‌جمعی توسط کارشناس آموزش — با ردگیری کامل (کی/چرا) */
export default async function ManualEnrollPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  const uni = await getCurrentUniversity().catch(() => null);
  const u = uni?.id ?? null;

  const terms = (await db.select({ id: academic_terms.id, title: academic_terms.title, isCurrent: academic_terms.isCurrent })
    .from(academic_terms)
    .where(u ? eq(academic_terms.universityId, u) : undefined)
    .orderBy(desc(academic_terms.id))).map(t => ({ id: t.id, title: t.title, isCurrent: (t.isCurrent ?? 0) === 1 }));
  const majorsRows = await db.select({ id: majors.id, name: majors.name, departmentId: majors.departmentId }).from(majors)
    .where(u ? eq(majors.universityId, u) : undefined).orderBy(majors.name);
  const depts = await db.select({ id: departments.id, name: departments.name, facultyId: departments.facultyId }).from(departments)
    .where(u ? eq(departments.universityId, u) : undefined).orderBy(departments.name);
  const facs = await db.select({ id: faculties.id, name: faculties.name }).from(faculties)
    .where(u ? eq(faculties.universityId, u) : undefined).orderBy(faculties.name);
  const years = (await db.selectDistinct({ y: students.entryYear }).from(students)
    .where(and(eq(students.status, 'ACTIVE'), u ? eq(students.universityId, u) : undefined))
    .orderBy(students.entryYear)).map(r => r.y).filter((y): y is number => typeof y === 'number');

  const filters: EnrollFilters = {
    terms,
    majors: majorsRows.map(m => ({ id: m.id, name: m.name, departmentId: m.departmentId ?? null })),
    departments: depts.map(d => ({ id: d.id, name: d.name, facultyId: d.facultyId })),
    faculties: facs.map(f => ({ id: f.id, name: f.name })),
    entryYears: years,
  };
  return <ManualEnrollClient filters={filters} />;
}