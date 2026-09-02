import 'server-only';
import { registerWorkflowHandler } from '@/lib/workflow-events';
import { applyCourseTransfer, applyEquivalenceBatch } from '@/lib/enroll-engine';
import { createLogger } from '@/lib/logger';

// ══════════════════════════════════════════════════════════════════════
//  هندلرهای رویداد گردش کار — سمت «صاحبان اثر»
//
//  اینجا جایی است که منطق تجاریِ اختصاصی هر فرایند زندگی می‌کند. موتور BPM
//  (workflow-engine) هیچ چیز از این فایل نمی‌داند؛ فقط رویداد شلیک می‌کند.
//  افزودن فرایند جدید = افزودن یک registerWorkflowHandler، بدون دست‌زدن به
//  قلب موتور.
// ══════════════════════════════════════════════════════════════════════

const log = createLogger({ mod: 'workflow.handlers' });

/** تطبیق واحد و معادل‌سازی دروس → ثبت درس در کارنامه توسط موتور آموزش */
registerWorkflowHandler({
  name: 'COURSE_TRANSFER_ENROLL',
  processCode: 'COURSE_TRANSFER',
  events: ['WORKFLOW_FINAL_APPROVED'],
  async run(ev) {
    // حالت دسته‌ای (فرم هوشمند مدیر گروه): فهرست نگاشت‌ها در formData.items
    const items = Array.isArray(ev.formData?.items) ? ev.formData.items : null;
    if (items && items.length > 0) {
      const res = await applyEquivalenceBatch({
        studentId: ev.studentId,
        items,
        previousUniversity: ev.formData?.previousUniversity,
        workflowRequestId: ev.requestId,
      });
      if (!res.ok) throw new Error(res.message);
      log.info('equivalence_batch_applied', {
        requestId: ev.requestId,
        studentId: ev.studentId,
        termsCreated: res.termsCreated,
        registered: res.registered.length,
        rejected: res.rejected.length,
      });
      return;
    }

    const res = await applyCourseTransfer({
      studentId: ev.studentId,
      targetCourseCode: ev.formData?.targetCourseCode,
      sourceCourseTitle: ev.formData?.sourceCourseTitle,
      sourceGrade: ev.formData?.sourceGrade ?? null,
      sourceUnits: ev.formData?.sourceUnits ?? null,
      previousUniversity: ev.formData?.previousUniversity,
      workflowRequestId: ev.requestId,
    });
    if (!res.ok) throw new Error(res.message);
    log.info('course_transfer_applied', {
      requestId: ev.requestId,
      studentId: ev.studentId,
      enrollmentId: res.enrollmentId ?? null,
      createdOffering: res.createdOffering,
    });
  },
});
