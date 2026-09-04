'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import {
  advanceWorkflowStep,
  checkAndTriggerSlaTimeouts,
  clearParallelCheckpoint,
  ensureDefaultProcesses,
} from '@/lib/workflow-engine';
import { eventsForRequest, retryPendingWorkflowEvents } from '@/lib/workflow-events';
import { db } from '@/db';
import { process_definitions, process_steps } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function adminApproveWorkflowStepAction(requestId: number, note?: string) {
  const user = await requireRole(['ADMIN', 'EDU_EXPERT']);

  const res = await advanceWorkflowStep({
    requestId,
    actorStaffId: undefined,
    actorRole: user.roles[0] || 'ADMIN',
    action: 'APPROVE',
    note: note || 'تأیید شد.',
  });

  revalidatePath('/admin');
  revalidatePath('/admin/workflows');
  revalidatePath('/student/requests');
  return { ok: true, res };
}

export async function adminRejectWorkflowStepAction(requestId: number, reason: string) {
  const user = await requireRole(['ADMIN', 'EDU_EXPERT']);

  const res = await advanceWorkflowStep({
    requestId,
    actorStaffId: undefined,
    actorRole: user.roles[0] || 'ADMIN',
    action: 'REJECT',
    note: reason,
  });

  revalidatePath('/admin');
  revalidatePath('/admin/workflows');
  revalidatePath('/student/requests');
  return { ok: true, res };
}

export async function adminReturnWorkflowStepAction(requestId: number, note: string) {
  const user = await requireRole(['ADMIN', 'EDU_EXPERT']);

  const res = await advanceWorkflowStep({
    requestId,
    actorStaffId: undefined,
    actorRole: user.roles[0] || 'ADMIN',
    action: 'RETURN_FOR_REVISION',
    note,
  });

  revalidatePath('/admin');
  revalidatePath('/admin/workflows');
  revalidatePath('/student/requests');
  return { ok: true, res };
}

export async function adminEscalateWorkflowStepAction(requestId: number, note?: string) {
  const user = await requireRole(['ADMIN', 'EDU_EXPERT']);

  const res = await advanceWorkflowStep({
    requestId,
    actorStaffId: undefined,
    actorRole: user.roles[0] || 'ADMIN',
    action: 'ESCALATE',
    note: note || 'ارجاع مدیریتی به مقام بالاتر',
  });

  revalidatePath('/admin');
  revalidatePath('/admin/workflows');
  revalidatePath('/student/requests');
  return { ok: true, res };
}

export async function adminClearParallelCheckpointAction(checkpointId: number, notes?: string) {
  const user = await requireRole(['ADMIN', 'EDU_EXPERT']);

  const res = await clearParallelCheckpoint({
    checkpointId,
    notes,
  });

  revalidatePath('/admin');
  revalidatePath('/admin/workflows');
  revalidatePath('/student/requests');
  return { ok: true, res };
}

export async function adminRunSlaTimeoutCheckerAction() {
  const user = await requireRole(['ADMIN']);

  const timeoutResults = await checkAndTriggerSlaTimeouts();

  revalidatePath('/admin');
  revalidatePath('/admin/workflows');
  revalidatePath('/student/requests');
  return { ok: true, count: timeoutResults.length, items: timeoutResults };
}

export async function adminSaveProcessDefinitionAction(data: {
  id?: number;
  code: string;
  title: string;
  category: string;
  description: string;
  feeAmount: number;
  formSchema: any[];
  steps: {
    id?: number;
    stepOrder: number;
    title: string;
    stepType: 'USER' | 'AUTO_INTEGRATION' | 'PARALLEL_GATEWAY';
    roleCode: string;
    slaHours: number;
    timeoutAction: 'ESCALATE' | 'AUTO_APPROVE' | 'AUTO_REJECT' | 'NOTIFY';
    timeoutEscalateToRole?: string;
  }[];
}) {
  const user = await requireRole(['ADMIN']);

  let processId = data.id;

  if (processId) {
    await db
      .update(process_definitions)
      .set({
        title: data.title,
        category: data.category,
        description: data.description,
        feeAmount: data.feeAmount,
        formSchema: JSON.stringify(data.formSchema),
      })
      .where(eq(process_definitions.id, processId));
  } else {
    const [inserted] = await db
      .insert(process_definitions)
      .values({
        code: data.code,
        title: data.title,
        category: data.category,
        description: data.description,
        feeAmount: data.feeAmount,
        formSchema: JSON.stringify(data.formSchema),
      })
      .returning();
    processId = inserted.id;
  }

  // به‌روزرسانی گام‌ها — حذف و درج دسته‌جمعی، همه در یک تراکنش
  if (processId && data.steps) {
    await db.transaction(async tx => {
      await tx.delete(process_steps).where(eq(process_steps.processId, processId as number));
      if (data.steps.length) {
        await tx.insert(process_steps).values(
          data.steps.map(s => ({
            processId: processId as number,
            stepOrder: s.stepOrder,
            title: s.title,
            stepType: s.stepType,
            roleCode: s.roleCode,
            slaHours: s.slaHours,
            timeoutAction: s.timeoutAction,
            timeoutEscalateToRole: s.timeoutEscalateToRole,
          })),
        );
      }
    });
  }

  // (بازبینی ۵) کش محلی فرآیندها حذف شد — موتور در هر فراخوانی وضعیت واقعی DB را می‌خواند؛
  // تغییر این‌جا در همهٔ نمونه‌ها بلافاصله اثر می‌کند.
  revalidatePath('/admin/workflows');
  revalidatePath('/student/requests');
  return { ok: true, processId };
}

/** رویدادهای شلیک‌شدهٔ یک پرونده (اثر تجاری هندلرها) — برای شفافیت کارتابل */
export async function adminRequestEventsAction(requestId: number) {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  const rows = await eventsForRequest(requestId);
  return {
    ok: true,
    events: rows.map(e => ({
      id: e.id,
      eventCode: e.eventCode,
      handler: e.handler,
      status: e.status,
      error: e.error,
      attempts: e.attempts,
      firedAt: e.firedAt,
      processedAt: e.processedAt,
    })),
  };
}

/** اجرای دوبارهٔ رویدادهای ناموفق (اثر تجاری که وسط کار خطا داد) */
export async function adminRetryWorkflowEventsAction(limit = 50) {
  await requireRole(['ADMIN']);
  const res = await retryPendingWorkflowEvents(limit);
  revalidatePath('/admin/workflows');
  return { ...res, ok: true };
}
