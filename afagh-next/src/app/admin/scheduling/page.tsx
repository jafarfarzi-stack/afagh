import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, classrooms, departments, faculties, staff, term_scheduling_states, users } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import DepartmentPlanningClient, { type SchedulingInitialData } from './DepartmentPlanningClient';

export const dynamic = 'force-dynamic';

/**
 * فاز ۶ — اتصال صفحهٔ زمان‌بندی به دادهٔ واقعی (الگوی A/D3):
 * صفحه در سرور، دادهٔ پایه (ترم‌ها، سالن‌ها، اساتید، وضعیت فاز) را از DB
 * می‌گیرد و به کلاینت می‌دهد؛ Mock های Client فقط به‌عنوان fallback می‌مانند
 * تا فاز ۷ (Thin Client) به‌طور کامل برچیده شوند.
 */
export default async function DepartmentPlanningPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT']);

  const [terms, rooms, profs, phases] = await Promise.all([
    db.select({ id: academic_terms.id, termCode: academic_terms.termCode, title: academic_terms.title, isCurrent: academic_terms.isCurrent })
      .from(academic_terms).orderBy(desc(academic_terms.id)),
    db.select().from(classrooms).orderBy(asc(classrooms.name)),
    db.select({
      id: staff.id, staffCode: staff.staffCode, title: staff.title,
      departmentId: staff.departmentId, name: users.firstName, lastname: users.lastName,
      departmentName: departments.name, facultyName: faculties.name,
    })
      .from(staff)
      .innerJoin(users, eq(users.id, staff.userId))
      .leftJoin(departments, eq(departments.id, staff.departmentId))
      .leftJoin(faculties, eq(faculties.id, departments.facultyId))
      .orderBy(asc(staff.staffCode)),
    db.select().from(term_scheduling_states),
  ]);

  const initial: SchedulingInitialData = {
    terms: terms.map((t) => ({ id: t.id, code: t.termCode, title: t.title, isCurrent: t.isCurrent === 1 })),
    classrooms: rooms.map((r) => ({
      id: r.id, name: r.name, buildingName: r.buildingName ?? '—',
      capacity: r.capacity, roomType: (r.roomType as 'THEORY' | 'LAB' | 'GYM' | 'EXAM') ?? 'THEORY',
      equipment: [], isActive: true, isAllocatedToDept: false,
    })),
    professors: profs.map((p) => ({
      id: p.id, name: `${p.title ? p.title + ' ' : ''}${p.name} ${p.lastname}`.trim(),
      staffCode: p.staffCode, academicRank: '', contractType: 'تمام‌وقت' as const,
      departmentName: p.departmentName ?? 'گروه آموزشی', maxWeeklyUnits: 0, maxDailyHours: 0,
      hasSubmittedAvailability: false,
    })),
    phases: phases.map((ph) => ({ termId: ph.termId, phase: ph.phase as 'SUPPLY' | 'ALLOCATION' | 'REVIEW' | 'PUBLISHED' })),
  };

  return <DepartmentPlanningClient initial={initial} />;
}
