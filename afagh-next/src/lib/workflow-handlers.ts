import 'server-only';
import { registerWorkflowHandler } from '@/lib/workflow-events';
import { applyCourseTransfer, applyEquivalenceBatch } from '@/lib/enroll-engine';
import { issueEquivalenceForm } from '@/lib/equivalence-form';
import { createLogger } from '@/lib/logger';
import { db } from '@/db';
import { students, majors, staff, classrooms, graduation_audits, thesis_progress, defense_jury_pools, defense_sessions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

// ═══════════════════════════════════════════════════════════════════════
//  هندلرهای رویداد گردش کار — سمت «صاحبان اثر»
//
//  اینجا جایی است که منطق تجاریِ اختصاصی هر فرایند زندگی می‌کند. موتور BPM
//  (workflow-engine) هیچ چیز از این فایل نمی‌داند؛ فقط رویداد شلیک می‌کند.
//  افزودن فرایند جدید = افزودن یک registerWorkflowHandler، بدون دست‌زدن به
//  قلب موتور.
// ══════════════════════════════════════════════════════════════════════

const log = createLogger({ mod: 'workflow.handlers' });

/** تغییر رشته تحصیلی — به‌روزرسانی majorId دانشجو پس از تأیید نهایی */
registerWorkflowHandler({
  name: 'MAJOR_CHANGE_APPLY',
  processCode: 'MAJOR_CHANGE',
  events: ['WORKFLOW_FINAL_APPROVED'],
  async run(ev) {
    const targetMajorId = Number(ev.formData?.targetMajorId);
    const termId = Number(ev.formData?.termId);
    if (!targetMajorId || !termId) throw new Error('targetMajorId یا termId در فرم وجود ندارد.');

    // بررسی وجود رشته مقصد
    const [targetMajor] = await db.select().from(majors).where(eq(majors.id, targetMajorId)).limit(1);
    if (!targetMajor) throw new Error('رشته مقصد یافت نشد.');

    // به‌روزرسانی رشته دانشجو
    await db.update(students)
      .set({ majorId: targetMajorId })
      .where(eq(students.id, ev.studentId));

    log.info('major_change_applied', {
      requestId: ev.requestId,
      studentId: ev.studentId,
      oldMajorId: ev.formData?.oldMajorId,
      newMajorId: targetMajorId,
      termId,
    });

    revalidatePath('/student');
    revalidatePath('/admin');
  },
});

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
        chargedTotal: res.chargedTotal ?? 0,
        registered: res.registered.length,
        rejected: res.rejected.length,
      });

      // صدور فرم رسمی ممهور → پروندهٔ فارغ‌التحصیلان + بایگانی الکترونیک
      try {
        const form = await issueEquivalenceForm(ev.requestId);
        log.info('equivalence_form_issued', { requestId: ev.requestId, ok: form.ok, skipped: !!form.skipped, hash: form.hash ?? null });
      } catch (e) {
        log.error('equivalence_form_failed', { requestId: ev.requestId, error: (e as Error)?.message });
      }
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

/** ثبت و پیگیری پروپزال/پایان‌نامه — لاگ تأیید نهایی */
registerWorkflowHandler({
  name: 'PROPOSAL_TRACKING_LOG',
  processCode: 'PROPOSAL_TRACKING',
  events: ['WORKFLOW_FINAL_APPROVED'],
  async run(ev) {
    log.info('proposal_tracking_approved', {
      requestId: ev.requestId,
      studentId: ev.studentId,
      proposalTitle: ev.formData?.proposalTitle,
      supervisorId: ev.formData?.supervisorId,
    });
  },
});