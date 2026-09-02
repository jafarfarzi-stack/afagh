import { desc, eq } from 'drizzle-orm';
import {
  degree_level_configs,
  majors,
  process_definitions,
  process_steps,
  request_parallel_checkpoints,
  request_step_logs,
  student_requests,
} from '@/db/schema';
import { db, withUserRls } from '@/db';
import { getStudentByUser, requireRole } from '@/lib/auth';
import { ensureDefaultProcesses } from '@/lib/workflow-engine';
import StudentRequestsClient from './StudentRequestsClient';

export const dynamic = 'force-dynamic';

export default async function StudentRequestsPage() {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  if (!me) return <p className="card p-6 text-center text-slate-500">پروندهٔ دانشجویی یافت نشد.</p>;

  await ensureDefaultProcesses();

  const [major] = me.majorId ? await db.select().from(majors).where(eq(majors.id, me.majorId)).limit(1) : [null];
  const [level] = me.degreeLevelId ? await db.select().from(degree_level_configs).where(eq(degree_level_configs.id, me.degreeLevelId)).limit(1) : [null];

  // دریافت فرآیندهای فعال سیستم
  const rawProcesses = await db
    .select()
    .from(process_definitions)
    .where(eq(process_definitions.isActive, 1))
    .orderBy(process_definitions.id);

  const rawSteps = await db.select().from(process_steps).orderBy(process_steps.stepOrder);

  // درخواست «عدم رعایت پیش‌نیاز/هم‌نیاز» به‌صورت هوشمند از انتخاب واحد ثبت می‌شود؛
  // بنابراین نیازی به ثبت دستی آن در میز خدمات نیست و از فهرست حذف می‌شود.
  const processesList = rawProcesses
    .filter(p => p.code !== 'PREREQ_WAIVER')
    .map(p => {
    let schema: any[] = [];
    try {
      if (p.formSchema) schema = JSON.parse(p.formSchema);
    } catch (_) {}

    const steps = rawSteps.filter(s => s.processId === p.id).map(s => ({
      stepOrder: s.stepOrder,
      title: s.title,
      stepType: s.stepType || 'USER',
      roleCode: s.roleCode || 'USER',
      slaHours: s.slaHours || 48,
    }));

    return {
      id: p.id,
      code: p.code,
      title: p.title,
      category: p.category || 'عمومی',
      description: p.description || '',
      feeAmount: p.feeAmount || 0,
      formSchema: schema,
      steps,
    };
  });

  // دریافت درخواست‌های دانشجو با لاگ‌ها و چک‌پوینت‌ها
  const rawRequests = await withUserRls(user.id, tx =>
    tx
      .select({
        id: student_requests.id,
        trackingCode: student_requests.trackingCode,
        status: student_requests.status,
        created: student_requests.createdAt,
        updated: student_requests.updatedAt,
        formData: student_requests.formData,
        processId: student_requests.processId,
        currentStepId: student_requests.currentStepId,
        digitalStampHash: student_requests.digitalStampHash,
        certificateNumber: student_requests.certificateNumber,
        satisfactionScore: student_requests.satisfactionScore,
        feedbackText: student_requests.feedbackText,
        procCode: process_definitions.code,
        procTitle: process_definitions.title,
        procCategory: process_definitions.category,
      })
      .from(student_requests)
      .innerJoin(process_definitions, eq(process_definitions.id, student_requests.processId))
      .where(eq(student_requests.studentId, me.id))
      .orderBy(desc(student_requests.id))
  );

  const allLogs = await db.select().from(request_step_logs);
  const allCheckpoints = await db.select().from(request_parallel_checkpoints);

  const myRequestsFormatted = rawRequests.map(r => {
    let parsedForm: any = {};
    try {
      if (r.formData) parsedForm = JSON.parse(r.formData);
    } catch (_) {}

    const reqLogs = allLogs.filter(l => l.requestId === r.id).map(l => ({
      id: l.id,
      actorRole: l.actorRole || undefined,
      action: l.action || undefined,
      note: l.note || undefined,
      assignedAt: l.assignedAt ? l.assignedAt.toISOString() : null,
      completedAt: l.completedAt ? l.completedAt.toISOString() : null,
      durationMinutes: l.durationMinutes,
      slaStatus: l.slaStatus || undefined,
    }));

    const reqCheckpoints = allCheckpoints.filter(c => c.requestId === r.id).map(c => ({
      id: c.id,
      departmentCode: c.departmentCode,
      departmentTitle: c.departmentTitle,
      isCleared: c.isCleared || 0,
      notes: c.notes,
    }));

    return {
      id: r.id,
      trackingCode: r.trackingCode,
      status: r.status,
      created: r.created ? r.created.toISOString() : null,
      updated: r.updated ? r.updated.toISOString() : null,
      formData: parsedForm,
      processCode: r.procCode,
      processTitle: r.procTitle,
      category: r.procCategory || 'عمومی',
      certificateNumber: r.certificateNumber,
      digitalStampHash: r.digitalStampHash,
      satisfactionScore: r.satisfactionScore,
      feedbackText: r.feedbackText,
      logs: reqLogs,
      checkpoints: reqCheckpoints,
    };
  });

  return (
    <StudentRequestsClient
      student={{
        id: me.id,
        name: user.name,
        studentCode: me.studentCode,
        majorName: major?.name || 'مهندسی کامپیوتر',
        degreeTitle: level?.title || 'کارشناسی پیوسته',
      }}
      processes={processesList}
      myRequests={myRequestsFormatted}
    />
  );
}
