import crypto from 'crypto';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms,
  course_offerings,
  courses,
  enrollments,
  notifications,
  process_definitions,
  process_steps,
  process_transitions,
  request_parallel_checkpoints,
  request_step_logs,
  staff,
  student_ledger,
  student_requests,
  students,
  users,
} from '@/db/schema';

// ============================================================================
// تعاریف پیش‌فرض فرآیندهای گردش کار (Built-in Dynamic BPM Process Templates)
// ============================================================================

export interface FormFieldSchema {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'date' | 'file';
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  helperText?: string;
  defaultValue?: string | number;
}

export interface ProcessTemplate {
  code: string;
  title: string;
  category: string;
  description: string;
  outputTemplate: string;
  feeAmount: number;
  formSchema: FormFieldSchema[];
  steps: {
    stepOrder: number;
    title: string;
    stepType: 'USER' | 'AUTO_INTEGRATION' | 'PARALLEL_GATEWAY';
    roleCode: string;
    slaHours: number;
    timeoutAction: 'ESCALATE' | 'AUTO_APPROVE' | 'AUTO_REJECT' | 'NOTIFY';
    timeoutEscalateToRole?: string;
  }[];
}

export const BUILTIN_PROCESSES: ProcessTemplate[] = [
  {
    code: 'ENROLLMENT_CERT',
    title: 'گواهی اشتغال به تحصیل رسمی',
    category: 'گواهی و مدارک',
    description: 'صدور آنی و هوشمند گواهی اشتغال به تحصیل با مهر و بارکد رهگیری امنیتی وزارت علوم بدون نیاز به مراجعه حضوری.',
    outputTemplate: 'ENROLLMENT_CERT',
    feeAmount: 0,
    formSchema: [
      {
        key: 'recipientOrg',
        label: 'نام ارگان / سازمان مقصد',
        type: 'text',
        required: true,
        placeholder: 'مثال: سازمان نظام وظیفه عمومی، شهرداری تهران، بانک ملی و...',
        helperText: 'نام دقیق دستگاه یا ارگانی که گواهی برای آن صادر می‌شود را وارد کنید.',
      },
      {
        key: 'purpose',
        label: 'علت و هدف درخواست',
        type: 'select',
        required: true,
        options: [
          { value: 'MILITARY', label: 'ارائه به حوزه نظام وظیفه (معافیت تحصیلی)' },
          { value: 'INSURANCE', label: 'ارائه به سازمان تأمین اجتماعی / بیمه درمانی' },
          { value: 'EMPLOYMENT', label: 'ارائه به محل کار / تسهیلات استخدامی' },
          { value: 'BANK', label: 'ارائه به بانک و موسسات مالی' },
          { value: 'OTHER', label: 'سایر مراجع اداری و رسمی' },
        ],
      },
      {
        key: 'includeTermSchedule',
        label: 'درج جدول برنامه هفتگی ترم جاری',
        type: 'select',
        options: [
          { value: 'YES', label: 'بله، جدول دروس ترم جاری اضافه شود' },
          { value: 'NO', label: 'خیر، تنها متن گواهی کفایت می‌کند' },
        ],
      },
    ],
    steps: [
      {
        stepOrder: 1,
        title: 'اعتبارسنجی خودکار وضعیت ثبت‌نام و تسویه مالی',
        stepType: 'AUTO_INTEGRATION',
        roleCode: 'SYSTEM_BOT',
        slaHours: 1,
        timeoutAction: 'AUTO_APPROVE',
      },
      {
        stepOrder: 2,
        title: 'صدور و الصاق امضای دیجیتال اداره کل آموزش',
        stepType: 'USER',
        roleCode: 'EDU_EXPERT',
        slaHours: 24,
        timeoutAction: 'AUTO_APPROVE',
      },
    ],
  },
  {
    code: 'COURSE_TRANSFER',
    title: 'تطبیق واحد و معادل‌سازی دروس',
    category: 'آموزش و سرفصل',
    description: 'معادل‌سازی دروس گذرانده‌شده در دانشگاه‌ها و موسسات آموزش عالی معتبر قبلی و ثبت نمره در کارنامه آفاق.',
    outputTemplate: 'TRANSFER_REPORT',
    feeAmount: 50000,
    formSchema: [
      {
        key: 'previousUniversity',
        label: 'نام دانشگاه یا موسسه قبلی',
        type: 'text',
        required: true,
        placeholder: 'مثال: دانشگاه صنعتی شریف / دانشگاه تهران',
      },
      {
        key: 'sourceCourseTitle',
        label: 'عنوان دقیق درس گذرانده‌شده',
        type: 'text',
        required: true,
        placeholder: 'مثال: ریاضی عمومی ۱',
      },
      {
        key: 'sourceGrade',
        label: 'نمره اخذشده (از ۲۰)',
        type: 'number',
        required: true,
        placeholder: 'مثال: ۱۷.۵',
      },
      {
        key: 'sourceUnits',
        label: 'تعداد واحد گذرانده',
        type: 'number',
        required: true,
        placeholder: 'مثال: ۳',
      },
      {
        key: 'targetCourseCode',
        label: 'کد درس مقصد در چارت دانشگاه آفاق',
        type: 'text',
        required: true,
        placeholder: 'مثال: CS101',
      },
      {
        key: 'syllabusNote',
        label: 'توضیحات و هم‌پوشانی سرفصل',
        type: 'textarea',
        placeholder: 'سرفصل‌ها و توضیحات مدرس درس قبلی را در صورت لزوم شرح دهید...',
      },
    ],
    steps: [
      {
        stepOrder: 1,
        title: 'بررسی علمی و انطباق سرفصل توسط مدیر گروه تخصصی',
        stepType: 'USER',
        roleCode: 'DEPARTMENT_HEAD',
        slaHours: 48,
        timeoutAction: 'ESCALATE',
        timeoutEscalateToRole: 'VICE_CHANCELLOR',
      },
      {
        stepOrder: 2,
        title: 'تأیید نهایی، صدور ابلاغیه و ثبت سیستمی در کارنامه کل',
        stepType: 'USER',
        roleCode: 'EDU_EXPERT',
        slaHours: 24,
        timeoutAction: 'AUTO_APPROVE',
      },
    ],
  },
  {
    code: 'THESIS_DEFENSE',
    title: 'درخواست تعیین وقت و مجوز دفاع پایان‌نامه',
    category: 'تحصیلات تکمیلی و پژوهش',
    description: 'فرآیند احراز شرایط پژوهشی، تایید استاد راهنما، سالن و داوران جهت برگزاری جلسه دفاع پایان‌نامه کارشناسی ارشد.',
    outputTemplate: 'DEFENSE_MINUTES',
    feeAmount: 0,
    formSchema: [
      {
        key: 'thesisTitleFa',
        label: 'عنوان کامل پایان‌نامه (فارسی)',
        type: 'text',
        required: true,
        placeholder: 'مثال: ارزیابی کارایی الگوریتم‌های یادگیری ماشین در سامانه‌های توزیع‌شده...',
      },
      {
        key: 'thesisTitleEn',
        label: 'عنوان کامل پایان‌نامه (انگلیسی)',
        type: 'text',
        required: true,
        placeholder: 'Evaluation of ML Algorithms in Distributed...',
      },
      {
        key: 'supervisorName',
        label: 'استاد راهنمای اول',
        type: 'text',
        required: true,
        placeholder: 'مثال: دکتر جمیل احمدی',
      },
      {
        key: 'advisorName',
        label: 'استاد مشاور (در صورت وجود)',
        type: 'text',
        placeholder: 'مثال: دکتر سهراب علوی',
      },
      {
        key: 'proposedDate',
        label: 'تاریخ پیشنهادی برگزاری دفاع',
        type: 'date',
        required: true,
      },
      {
        key: 'abstractText',
        label: 'چکیده پایان‌نامه',
        type: 'textarea',
        required: true,
        placeholder: 'خلاصه دستاوردها و روش پژوهش را در حداکثر ۲۰۰ کلمه بنویسید...',
      },
    ],
    steps: [
      {
        stepOrder: 1,
        title: 'تأیید کفایت علمی و آمادگی دفاع توسط استاد راهنما',
        stepType: 'USER',
        roleCode: 'SUPERVISOR',
        slaHours: 48,
        timeoutAction: 'ESCALATE',
        timeoutEscalateToRole: 'DEPARTMENT_HEAD',
      },
      {
        stepOrder: 2,
        title: 'بررسی اتمام دروس تئوری و شرط معدل کل توسط کارشناس ارشد',
        stepType: 'USER',
        roleCode: 'EDU_EXPERT',
        slaHours: 24,
        timeoutAction: 'ESCALATE',
        timeoutEscalateToRole: 'VICE_CHANCELLOR',
      },
      {
        stepOrder: 3,
        title: 'تخصیص هیئت داوران، سالن و صدور آگهی دفاع رسمی',
        stepType: 'USER',
        roleCode: 'VICE_CHANCELLOR',
        slaHours: 48,
        timeoutAction: 'NOTIFY',
      },
    ],
  },
  {
    code: 'GRADUATION_CHECKOUT',
    title: 'تسویه حساب جامع فارغ‌التحصیلی',
    category: 'دانش‌آموختگان و فراغت',
    description: 'تسویه حساب همزمان و موازی با بخش‌های مالی، کتابخانه، صندوق رفاه و آزمایشگاه‌ها جهت صدور مدرک موقت و دانشنامه.',
    outputTemplate: 'CHECKOUT_CLEARANCE',
    feeAmount: 120000,
    formSchema: [
      {
        key: 'destinationAddress',
        label: 'آدرس پستی جهت ارسال مدارک',
        type: 'textarea',
        required: true,
        placeholder: 'نشانی دقیق پستی به همراه کد پستی ۱۰ رقمی...',
      },
      {
        key: 'postalCode',
        label: 'کد پستی ۱۰ رقمی',
        type: 'text',
        required: true,
        placeholder: 'مثال: ۱۲۳۴۵۶۷۸۹۰',
      },
      {
        key: 'mobileContact',
        label: 'شماره همراه در دسترس',
        type: 'text',
        required: true,
        placeholder: '۰۹۱۲XXXXXXX',
      },
    ],
    steps: [
      {
        stepOrder: 1,
        title: 'تسویه حساب موازی چندگانه (امور مالی، کتابخانه، رفاه، کارگاه)',
        stepType: 'PARALLEL_GATEWAY',
        roleCode: 'MULTI_CHECKPOINT',
        slaHours: 72,
        timeoutAction: 'NOTIFY',
      },
      {
        stepOrder: 2,
        title: 'تأیید نهایی، ابطال کارت و صدور گواهی موقت فارغ‌التحصیلی',
        stepType: 'USER',
        roleCode: 'GRADUATION_EXPERT',
        slaHours: 48,
        timeoutAction: 'ESCALATE',
        timeoutEscalateToRole: 'EDU_EXPERT',
      },
    ],
  },
  {
    code: 'EMERGENCY_DROP',
    title: 'درخواست حذف اضطراری تک‌درس',
    category: 'آموزش و سرفصل',
    description: 'حذف یک عنوان درسی تئوری در بازه اضطراری پایان ترم با رعایت حداقل حدنصاب واحدهای ترم (۱۲ واحد).',
    outputTemplate: 'DROP_REPORT',
    feeAmount: 0,
    formSchema: [
      {
        key: 'courseToDrop',
        label: 'نام و کد درس مورد نظر جهت حذف',
        type: 'text',
        required: true,
        placeholder: 'مثال: ساختمان داده‌ها (CS204)',
      },
      {
        key: 'remainingUnits',
        label: 'تعداد واحدهای باقی‌مانده پس از حذف',
        type: 'number',
        required: true,
        placeholder: 'حداقل ۱۲ واحد',
      },
      {
        key: 'dropReason',
        label: 'علت حذف اضطراری',
        type: 'textarea',
        required: true,
        placeholder: 'دلایل آموزشی یا شغلی/پزشکی خود را توضیح دهید...',
      },
    ],
    steps: [
      {
        stepOrder: 1,
        title: 'موافقت و امضای الکترونیک استاد درس',
        stepType: 'USER',
        roleCode: 'PROFESSOR',
        slaHours: 48,
        timeoutAction: 'AUTO_APPROVE',
      },
      {
        stepOrder: 2,
        title: 'تأیید مدیر گروه و بررسی سقف حداقل واحدها',
        stepType: 'USER',
        roleCode: 'DEPARTMENT_HEAD',
        slaHours: 24,
        timeoutAction: 'AUTO_APPROVE',
      },
    ],
  },
];

// ============================================================================
// عملیات آماده‌سازی و راه‌اندازی فرآیندها در پایگاه داده
// ============================================================================

export async function ensureDefaultProcesses() {
  try {
    for (const p of BUILTIN_PROCESSES) {
      const [existing] = await db
        .select()
        .from(process_definitions)
        .where(eq(process_definitions.code, p.code))
        .limit(1);

      let processId = existing?.id;

      if (!existing) {
        const [inserted] = await db
          .insert(process_definitions)
          .values({
            code: p.code,
            title: p.title,
            category: p.category,
            description: p.description,
            outputTemplate: p.outputTemplate,
            feeAmount: p.feeAmount,
            formSchema: JSON.stringify(p.formSchema),
            isActive: 1,
          })
          .returning();
        processId = inserted.id;
      } else {
        await db
          .update(process_definitions)
          .set({
            title: p.title,
            category: p.category,
            description: p.description,
            outputTemplate: p.outputTemplate,
            feeAmount: p.feeAmount,
            formSchema: JSON.stringify(p.formSchema),
            isActive: 1,
          })
          .where(eq(process_definitions.id, existing.id));
      }

      if (processId) {
        // اطمینان از وجود گام‌ها
        const existingSteps = await db
          .select()
          .from(process_steps)
          .where(eq(process_steps.processId, processId));

        if (existingSteps.length === 0) {
          for (const s of p.steps) {
            await db.insert(process_steps).values({
              processId: processId,
              stepOrder: s.stepOrder,
              title: s.title,
              stepType: s.stepType,
              roleCode: s.roleCode,
              slaHours: s.slaHours,
              timeoutAction: s.timeoutAction,
              timeoutEscalateToRole: s.timeoutEscalateToRole,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('Error ensuring default processes:', err);
  }
}

// ============================================================================
// ثبت درخواست جدید توسط دانشجو (Submit Student Request)
// ============================================================================

export async function submitStudentRequest(params: {
  studentId: number;
  userId: number;
  processCode: string;
  formData: Record<string, any>;
}) {
  await ensureDefaultProcesses();

  const [proc] = await db
    .select()
    .from(process_definitions)
    .where(eq(process_definitions.code, params.processCode))
    .limit(1);

  if (!proc) throw new Error('فرآیند مورد نظر یافت نشد.');

  const steps = await db
    .select()
    .from(process_steps)
    .where(eq(process_steps.processId, proc.id))
    .orderBy(process_steps.stepOrder);

  if (steps.length === 0) throw new Error('مراحل این فرآیند هنوز پیکربندی نشده است.');

  const firstStep = steps[0];
  const now = new Date();
  const yearFa = '1405';
  const randomSuffix = Math.floor(10000 + Math.random() * 90000);
  const trackingCode = `REQ-${yearFa}-${randomSuffix}`;

  // اعتبارسنجی ویژه برای گواهی اشتغال به تحصیل:
  if (params.processCode === 'ENROLLMENT_CERT') {
    // ۱. بررسی انتخاب واحد ترم جاری
    const [currentTerm] = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1)).limit(1);
    let hasEnrollment = false;
    if (currentTerm) {
      const myEnrollments = await db
        .select({ id: enrollments.id })
        .from(enrollments)
        .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
        .where(
          and(
            eq(enrollments.studentId, params.studentId),
            eq(course_offerings.termId, currentTerm.id),
            inArray(enrollments.status, ['REGISTERED', 'FINALIZED'])
          )
        );
      hasEnrollment = myEnrollments.length > 0;
    }

    // ۲. بررسی تراز مالی (بدهی شهریه)
    const ledgerRows = await db
      .select({ type: student_ledger.transactionType, amount: student_ledger.amount })
      .from(student_ledger)
      .where(eq(student_ledger.studentId, params.studentId));

    let balance = 0;
    for (const row of ledgerRows) {
      const amt = Number(row.amount || 0);
      if (row.type === 'TUITION_CHARGE' || row.type === 'CHARGE') balance -= amt;
      else if (row.type === 'PAYMENT' || row.type === 'CREDIT') balance += amt;
    }

    // اگر دانشجو دارای انتخاب واحد معتبر و بدون بدهی است، صدور آنی (AUTO_APPROVE)
    const digitalHash = crypto
      .createHash('sha256')
      .update(`${trackingCode}:${params.studentId}:${now.toISOString()}:AFAGH_CERT`)
      .digest('hex');

    const certNumber = `CERT-${yearFa}-${randomSuffix}`;

    const [created] = await db
      .insert(student_requests)
      .values({
        trackingCode,
        studentId: params.studentId,
        processId: proc.id,
        currentStepId: firstStep.id,
        formData: JSON.stringify(params.formData),
        status: hasEnrollment ? 'APPROVED' : 'IN_REVIEW',
        digitalStampHash: digitalHash,
        certificateNumber: certNumber,
        issuedAt: hasEnrollment ? now : null,
      })
      .returning();

    // ثبت لاگ گردش کار
    await db.insert(request_step_logs).values({
      requestId: created.id,
      stepId: firstStep.id,
      assignedAt: now,
      completedAt: hasEnrollment ? now : null,
      actorRole: 'SYSTEM_BOT',
      action: hasEnrollment ? 'APPROVE' : 'SUBMIT',
      note: hasEnrollment
        ? 'احراز صلاحیت خودکار: ثبت‌نام ترم جاری و تراز مالی معتبر تایید گردید و گواهی صادر شد.'
        : 'در انتظار بررسی تکمیلی کارشناس آموزش (عدم احراز شرایط خودکار).',
      slaStatus: 'ON_TIME',
    });

    // اعلان دانشجو
    await db.insert(notifications).values({
      userId: params.userId,
      eventCode: 'REQUEST_SUBMITTED',
      payload: JSON.stringify({
        text: hasEnrollment
          ? `گواهی اشتغال به تحصیل شما به شماره ${certNumber} صادر شد و آماده دریافت/چاپ است.`
          : `درخواست گواهی اشتغال به تحصیل شما با کد رهگیری ${trackingCode} ثبت و جهت بررسی ارسال گردید.`,
      }),
    });

    return created;
  }

  // فرآیند تسویه حساب فارغ‌التحصیلی (Parallel Gateway Setup):
  if (params.processCode === 'GRADUATION_CHECKOUT') {
    const [created] = await db
      .insert(student_requests)
      .values({
        trackingCode,
        studentId: params.studentId,
        processId: proc.id,
        currentStepId: firstStep.id,
        formData: JSON.stringify(params.formData),
        status: 'IN_REVIEW',
      })
      .returning();

    // ساخت بخش‌های موازی تسویه
    const checkpoints = [
      { code: 'FINANCE', title: 'امور مالی و شهریه (عدم بدهی)' },
      { code: 'LIBRARY', title: 'کتابخانه مرکزی (عدم امانت کتاب)' },
      { code: 'WELFARE_FUND', title: 'صندوق رفاه دانشجویان (تسویه وام)' },
      { code: 'LABORATORY', title: 'آزمایشگاه‌ها و کارگاه‌های تخصصی' },
      { code: 'DORMITORY', title: 'امور خوابگاه‌ها و اسکان' },
    ];

    for (const cp of checkpoints) {
      await db.insert(request_parallel_checkpoints).values({
        requestId: created.id,
        departmentCode: cp.code,
        departmentTitle: cp.title,
        isCleared: 0,
      });
    }

    await db.insert(request_step_logs).values({
      requestId: created.id,
      stepId: firstStep.id,
      assignedAt: now,
      actorRole: 'MULTI_CHECKPOINT',
      action: 'SUBMIT',
      note: 'پرونده تسویه حساب موازی تشکیل شد و برای واحدهای پنج‌گانه ارسال گردید.',
      slaStatus: 'ON_TIME',
    });

    return created;
  }

  // سایر فرآیندهای عمومی
  const [created] = await db
    .insert(student_requests)
    .values({
      trackingCode,
      studentId: params.studentId,
      processId: proc.id,
      currentStepId: firstStep.id,
      formData: JSON.stringify(params.formData),
      status: 'SUBMITTED',
    })
    .returning();

  await db.insert(request_step_logs).values({
    requestId: created.id,
    stepId: firstStep.id,
    assignedAt: now,
    actorRole: firstStep.roleCode || 'USER',
    action: 'SUBMIT',
    note: `درخواست با موفقیت ثبت و به کارتابل ${firstStep.title} ارجاع داده شد.`,
    slaStatus: 'ON_TIME',
  });

  return created;
}

// ============================================================================
// پیشبرد گام گردش کار توسط پرسنل (Advance Workflow Step)
// ============================================================================

export async function advanceWorkflowStep(params: {
  requestId: number;
  actorStaffId?: number;
  actorRole: string;
  action: 'APPROVE' | 'REJECT' | 'RETURN_FOR_REVISION' | 'ESCALATE';
  note?: string;
}) {
  const [req] = await db
    .select()
    .from(student_requests)
    .where(eq(student_requests.id, params.requestId))
    .limit(1);

  if (!req) throw new Error('درخواست یافت نشد.');

  const [currentStep] = req.currentStepId
    ? await db.select().from(process_steps).where(eq(process_steps.id, req.currentStepId)).limit(1)
    : [null];

  const allSteps = await db
    .select()
    .from(process_steps)
    .where(eq(process_steps.processId, req.processId))
    .orderBy(process_steps.stepOrder);

  const now = new Date();

  // محاسبه مدت زمان توقف مرحله
  const [lastLog] = await db
    .select()
    .from(request_step_logs)
    .where(and(eq(request_step_logs.requestId, req.id), isNull(request_step_logs.completedAt)))
    .orderBy(desc(request_step_logs.id))
    .limit(1);

  let durationMin = 0;
  if (lastLog?.assignedAt) {
    durationMin = Math.round((now.getTime() - new Date(lastLog.assignedAt).getTime()) / 60000);
  }

  // ثبت لاگ پایان این مرحله
  if (lastLog) {
    const isSlaBreached = currentStep?.slaHours ? durationMin > currentStep.slaHours * 60 : false;
    await db
      .update(request_step_logs)
      .set({
        completedAt: now,
        actorStaffId: params.actorStaffId,
        actorRole: params.actorRole,
        action: params.action,
        note: params.note || (params.action === 'APPROVE' ? 'تایید شد' : 'رد شد'),
        durationMinutes: durationMin,
        slaStatus: isSlaBreached ? 'SLA_BREACHED' : 'ON_TIME',
      })
      .where(eq(request_step_logs.id, lastLog.id));
  }

  // ۱. حالت رد درخواست (REJECT)
  if (params.action === 'REJECT') {
    await db
      .update(student_requests)
      .set({
        status: 'REJECTED',
        updatedAt: now,
      })
      .where(eq(student_requests.id, req.id));

    // اطلاع‌رسانی به دانشجو
    const [stu] = await db.select().from(students).where(eq(students.id, req.studentId)).limit(1);
    if (stu) {
      await db.insert(notifications).values({
        userId: stu.userId,
        eventCode: 'REQUEST_REJECTED',
        payload: JSON.stringify({
          text: `درخواست شما با کد رهگیری ${req.trackingCode} رد شد. دلیل: ${params.note || 'عدم احراز شرایط'}`,
        }),
      });
    }
    return { status: 'REJECTED' };
  }

  // ۲. حالت بازگشت برای اصلاح (RETURN_FOR_REVISION)
  if (params.action === 'RETURN_FOR_REVISION') {
    await db
      .update(student_requests)
      .set({
        status: 'RETURNED',
        updatedAt: now,
      })
      .where(eq(student_requests.id, req.id));

    const [stu] = await db.select().from(students).where(eq(students.id, req.studentId)).limit(1);
    if (stu) {
      await db.insert(notifications).values({
        userId: stu.userId,
        eventCode: 'REQUEST_RETURNED',
        payload: JSON.stringify({
          text: `درخواست ${req.trackingCode} جهت اصلاح مدارک به شما بازگردانده شد: ${params.note || 'لطفاً فرم را ویرایش کنید.'}`,
        }),
      });
    }
    return { status: 'RETURNED' };
  }

  // ۳. حالت ارجاع / تشدید (ESCALATE)
  if (params.action === 'ESCALATE') {
    const nextRole = currentStep?.timeoutEscalateToRole || 'VICE_CHANCELLOR';
    await db
      .update(student_requests)
      .set({
        status: 'IN_REVIEW',
        updatedAt: now,
      })
      .where(eq(student_requests.id, req.id));

    await db.insert(request_step_logs).values({
      requestId: req.id,
      stepId: currentStep?.id || allSteps[0].id,
      assignedAt: now,
      actorRole: nextRole,
      action: 'ESCALATE',
      note: `ارجاع مدیریتی پرونده به ${nextRole}: ${params.note || 'به دلیل عدم اقدام در مهلت یا نیاز به تصمیم مقام بالاتر'}`,
      slaStatus: 'ESCALATED',
    });
    return { status: 'ESCALATED', targetRole: nextRole };
  }

  // ۴. حالت تأیید مرحله (APPROVE)
  if (params.action === 'APPROVE') {
    const currentOrder = currentStep?.stepOrder || 1;
    const nextStep = allSteps.find(s => s.stepOrder > currentOrder);

    if (nextStep) {
      // انتقال به مرحله بعدی
      await db
        .update(student_requests)
        .set({
          currentStepId: nextStep.id,
          status: 'IN_REVIEW',
          updatedAt: now,
        })
        .where(eq(student_requests.id, req.id));

      await db.insert(request_step_logs).values({
        requestId: req.id,
        stepId: nextStep.id,
        assignedAt: now,
        actorRole: nextStep.roleCode || 'USER',
        action: 'ASSIGN',
        note: `پرونده به مرحله «${nextStep.title}» ارجاع داده شد.`,
        slaStatus: 'ON_TIME',
      });
      return { status: 'MOVED_TO_NEXT_STEP', nextStepTitle: nextStep.title };
    } else {
      // این آخرین مرحله بود -> تایید نهایی و مختومه شدن پرونده (FINAL APPROVAL)
      const digitalHash = crypto
        .createHash('sha256')
        .update(`${req.trackingCode}:${req.studentId}:${now.toISOString()}:AFAGH_FINAL`)
        .digest('hex');

      const certNumber = req.certificateNumber || `DOC-${req.trackingCode}`;

      await db
        .update(student_requests)
        .set({
          status: 'APPROVED',
          digitalStampHash: digitalHash,
          certificateNumber: certNumber,
          issuedAt: now,
          updatedAt: now,
        })
        .where(eq(student_requests.id, req.id));

      // منطق تجاری ویژه تطبیق واحد (Course Transfer Final Application):
      const [proc] = await db
        .select()
        .from(process_definitions)
        .where(eq(process_definitions.id, req.processId))
        .limit(1);

      if (proc?.code === 'COURSE_TRANSFER' && req.formData) {
        try {
          const form = JSON.parse(req.formData);
          // ثبت مستقیم درس تطبیق‌داده‌شده با کد مقصد
          // پیدا کردن یا ایجاد درس مقصد
          const [targetCourse] = await db
            .select()
            .from(courses)
            .where(eq(courses.code, form.targetCourseCode || 'TRANS-01'))
            .limit(1);

          if (targetCourse) {
            // پیدا کردن یا ایجاد آفرینگ تطبیق
            const [currentTerm] = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1)).limit(1);
            if (currentTerm) {
              const [offering] = await db
                .select()
                .from(course_offerings)
                .where(and(eq(course_offerings.courseId, targetCourse.id), eq(course_offerings.termId, currentTerm.id)))
                .limit(1);

              if (offering) {
                await db.insert(enrollments).values({
                  studentId: req.studentId,
                  offeringId: offering.id,
                  status: 'REGISTERED',
                  gradeValue: String(form.sourceGrade || 17.0),
                  gradeStatus: 'FINALIZED',
                  isDirectedReading: 0,
                }).onConflictDoNothing();
              }
            }
          }
        } catch (e) {
          console.error('Error applying course transfer to transcript:', e);
        }
      }

      // اطلاع‌رسانی نهایی به دانشجو
      const [stu] = await db.select().from(students).where(eq(students.id, req.studentId)).limit(1);
      if (stu) {
        await db.insert(notifications).values({
          userId: stu.userId,
          eventCode: 'REQUEST_APPROVED',
          payload: JSON.stringify({
            text: `درخواست شما با کد رهگیری ${req.trackingCode} به طور کامل تایید و نهایی گردید.`,
          }),
        });
      }

      return { status: 'APPROVED_FINAL', certificateNumber: certNumber };
    }
  }

  return { status: 'UNCHANGED' };
}

// ============================================================================
// تسویه حساب موازی (Parallel Gateway Checkpoints Toggle)
// ============================================================================

export async function clearParallelCheckpoint(params: {
  checkpointId: number;
  clearedByStaffId?: number;
  notes?: string;
}) {
  const [cp] = await db
    .select()
    .from(request_parallel_checkpoints)
    .where(eq(request_parallel_checkpoints.id, params.checkpointId))
    .limit(1);

  if (!cp) throw new Error('چک‌پوینت تسویه یافت نشد.');

  const now = new Date();
  await db
    .update(request_parallel_checkpoints)
    .set({
      isCleared: 1,
      clearedByStaffId: params.clearedByStaffId,
      clearedAt: now,
      notes: params.notes || 'تسویه حساب تایید گردید.',
    })
    .where(eq(request_parallel_checkpoints.id, cp.id));

  // بررسی وضعیت تمام بخش‌های موازی این درخواست
  const allCheckpoints = await db
    .select()
    .from(request_parallel_checkpoints)
    .where(eq(request_parallel_checkpoints.requestId, cp.requestId));

  const allCleared = allCheckpoints.every(c => c.id === cp.id || c.isCleared === 1);

  if (allCleared) {
    // همه بخش‌ها تسویه کردند -> پیشبرد خودکار به مرحله بعدی
    await advanceWorkflowStep({
      requestId: cp.requestId,
      actorStaffId: params.clearedByStaffId,
      actorRole: 'MULTI_CHECKPOINT',
      action: 'APPROVE',
      note: 'تمامی بخش‌های پنج‌گانه (مالی، کتابخانه، رفاه، آزمایشگاه، خوابگاه) تسویه را تأیید کردند.',
    });
  }

  return { ok: true, allCleared };
}

// ============================================================================
// موتور بررسی SLA و اجرای خودکار سیاست‌های انقضا (SLA Scheduler & Timeout Trigger)
// ============================================================================

export async function checkAndTriggerSlaTimeouts() {
  const now = new Date();

  // دریافت تمام پرونده‌های در جریان (SUBMITTED, IN_REVIEW)
  const openRequests = await db
    .select({
      id: student_requests.id,
      track: student_requests.trackingCode,
      status: student_requests.status,
      currentStepId: student_requests.currentStepId,
      processId: student_requests.processId,
      createdAt: student_requests.createdAt,
    })
    .from(student_requests)
    .where(inArray(student_requests.status, ['SUBMITTED', 'IN_REVIEW']));

  const results: {
    requestId: number;
    trackingCode: string;
    stepTitle: string;
    actionTaken: string;
  }[] = [];

  for (const r of openRequests) {
    if (!r.currentStepId) continue;

    const [step] = await db
      .select()
      .from(process_steps)
      .where(eq(process_steps.id, r.currentStepId))
      .limit(1);

    if (!step || !step.slaHours) continue;

    const [openLog] = await db
      .select()
      .from(request_step_logs)
      .where(and(eq(request_step_logs.requestId, r.id), isNull(request_step_logs.completedAt)))
      .orderBy(desc(request_step_logs.id))
      .limit(1);

    if (!openLog?.assignedAt) continue;

    const assignedTime = new Date(openLog.assignedAt).getTime();
    const hoursElapsed = (now.getTime() - assignedTime) / (1000 * 3600);

    // اگر از مهلت قانونی SLA تجاوز کرده باشد:
    if (hoursElapsed >= step.slaHours) {
      if (step.timeoutAction === 'ESCALATE') {
        const nextRole = step.timeoutEscalateToRole || 'VICE_CHANCELLOR';
        await advanceWorkflowStep({
          requestId: r.id,
          actorRole: 'SYSTEM_SLA_ENGINE',
          action: 'ESCALATE',
          note: `انقضای مهلت پاسخگویی (${step.slaHours} ساعت) — ارجاع خودکار سیستمی به ${nextRole}`,
        });
        results.push({
          requestId: r.id,
          trackingCode: r.track,
          stepTitle: step.title,
          actionTaken: `ESCALATE TO ${nextRole}`,
        });
      } else if (step.timeoutAction === 'AUTO_APPROVE') {
        await advanceWorkflowStep({
          requestId: r.id,
          actorRole: 'SYSTEM_SLA_ENGINE',
          action: 'APPROVE',
          note: `انقضای مهلت قانونی مرحله (${step.slaHours} ساعت) — تایید خودکار و عبور از مرحله به استناد آیین‌نامه تسریع امور`,
        });
        results.push({
          requestId: r.id,
          trackingCode: r.track,
          stepTitle: step.title,
          actionTaken: 'AUTO_APPROVE',
        });
      } else if (step.timeoutAction === 'AUTO_REJECT') {
        await advanceWorkflowStep({
          requestId: r.id,
          actorRole: 'SYSTEM_SLA_ENGINE',
          action: 'REJECT',
          note: `انقضای مهلت قانونی مرحله (${step.slaHours} ساعت) — بسته‌شدن خودکار پرونده به دلیل عدم ارائه مدارک در مهلت`,
        });
        results.push({
          requestId: r.id,
          trackingCode: r.track,
          stepTitle: step.title,
          actionTaken: 'AUTO_REJECT',
        });
      }
    }
  }

  return results;
}

// ============================================================================
// ثبت نظرسنجی و امتیاز رضایت دانشجو (CSAT Satisfaction Score)
// ============================================================================

export async function submitRequestSatisfaction(params: {
  requestId: number;
  score: number; // 1 to 5
  feedback?: string;
}) {
  const [req] = await db
    .select()
    .from(student_requests)
    .where(eq(student_requests.id, params.requestId))
    .limit(1);

  if (!req) throw new Error('درخواست یافت نشد.');

  await db
    .update(student_requests)
    .set({
      satisfactionScore: Math.max(1, Math.min(5, params.score)),
      feedbackText: params.feedback || null,
      updatedAt: new Date(),
    })
    .where(eq(student_requests.id, req.id));

  return { ok: true };
}
