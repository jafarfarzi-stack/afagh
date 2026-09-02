import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import {
  courses,
  process_definitions,
  process_steps,
  students,
  student_requests,
  users,
} from '@/db/schema';
import { requireRole } from '@/lib/auth';
import EquivalenceMapperClient from './EquivalenceMapperClient';

export const dynamic = 'force-dynamic';

export default async function GroupManagerEquivalencePage() {
  await requireRole(['DEP_HEAD', 'ADMIN']);

  // درخواست‌های معادل‌سازی که در گام «بررسی مدیر گروه» هستند
  const pending = await db
    .select({
      id: student_requests.id,
      trackingCode: student_requests.trackingCode,
      formData: student_requests.formData,
      createdAt: student_requests.createdAt,
      studentName: users.firstName,
      studentFamily: users.lastName,
      studentCode: students.studentCode,
    })
    .from(student_requests)
    .innerJoin(students, eq(students.id, student_requests.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .innerJoin(process_definitions, eq(process_definitions.id, student_requests.processId))
    .leftJoin(process_steps, eq(process_steps.id, student_requests.currentStepId))
    .where(and(eq(process_definitions.code, 'COURSE_TRANSFER'), eq(process_steps.roleCode, 'DEPARTMENT_HEAD')));

  // دروس چارت دانشگاه آفاق برای جستجو و نگاشت
  const ourCourses = await db
    .select({ code: courses.code, title: courses.title, units: courses.units })
    .from(courses)
    .orderBy(courses.code);

  const formatted = pending.map(r => {
    let fd: any = {};
    try {
      if (r.formData) fd = JSON.parse(r.formData);
    } catch (_) {}
    return {
      id: r.id,
      trackingCode: r.trackingCode,
      createdAt: r.createdAt ? new Date(r.createdAt).toLocaleDateString('fa-IR') : '—',
      studentName: `${r.studentName || ''} ${r.studentFamily || ''}`.trim(),
      studentCode: r.studentCode,
      previousUniversity: fd.previousUniversity || '',
      transcriptAttachment: fd.transcriptAttachment ?? null,
      sourceCourseTitle: fd.sourceCourseTitle || '',
      sourceGrade: fd.sourceGrade != null ? Number(fd.sourceGrade) : null,
      sourceUnits: fd.sourceUnits != null ? Number(fd.sourceUnits) : null,
      syllabusNote: fd.syllabusNote || '',
    };
  });

  return (
    <EquivalenceMapperClient
      requests={formatted}
      ourCourses={ourCourses.map(c => ({ code: c.code, title: c.title, units: Number(c.units || 0) }))}
    />
  );
}
