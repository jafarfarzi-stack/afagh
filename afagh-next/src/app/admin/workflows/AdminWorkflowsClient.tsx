'use client';

import { useCallback, useState } from 'react';
import {
  adminApproveWorkflowStepAction,
  adminClearParallelCheckpointAction,
  adminEscalateWorkflowStepAction,
  adminRejectWorkflowStepAction,
  adminReturnWorkflowStepAction,
  adminRunSlaTimeoutCheckerAction,
  adminSaveProcessDefinitionAction,
} from './actions';
import Modal from '@/components/ui/Modal';

interface ProcessStepDef {
  id?: number;
  stepOrder: number;
  title: string;
  stepType: 'USER' | 'AUTO_INTEGRATION' | 'PARALLEL_GATEWAY';
  roleCode: string;
  slaHours: number;
  timeoutAction: 'ESCALATE' | 'AUTO_APPROVE' | 'AUTO_REJECT' | 'NOTIFY';
  timeoutEscalateToRole?: string;
}

interface ProcessItem {
  id: number;
  code: string;
  title: string;
  category: string;
  description: string;
  feeAmount: number;
  formSchema: any[];
  steps: ProcessStepDef[];
}

/** پیش‌نویسِ فرآیند در حالت ویرایش/ساخت — id تا پیش از ذخیره وجود ندارد */
type ProcessDraft = Omit<ProcessItem, 'id'> & { id?: number };

interface RequestInboxItem {
  id: number;
  trackingCode: string;
  studentName: string;
  studentCode: string;
  /** شناسهٔ دانشجو — برای میان‌بر پروندهٔ مالی در درخواست‌های FINANCE_STATEMENT */
  studentId?: number | null;
  processTitle: string;
  processCode: string;
  status: string;
  created: string | null;
  currentStepTitle?: string;
  currentRoleCode?: string;
  slaHours?: number;
  hoursElapsed: number;
  isBreached: boolean;
  formData: any;
  satisfactionScore?: number | null;
  checkpoints: {
    id: number;
    departmentCode: string;
    departmentTitle: string;
    isCleared: number;
    notes?: string | null;
  }[];
  logs: {
    id: number;
    stepTitle: string;
    actorRole: string;
    action: string;
    notes: string;
    assignedAt: string | null;
    completedAt: string | null;
  }[];
}

interface AnalyticsData {
  summary: {
    totalRequests: number;
    activeRequests: number;
    approvedRequests: number;
    rejectedRequests: number;
    bounceRatePercent: number;
    avgSatisfaction: number;
  };
  heatmap: {
    processId: number;
    processCode: string;
    processTitle: string;
    stepId: number;
    stepTitle: string;
    roleCode: string;
    targetSlaHours: number;
    avgDurationHours: number;
    pendingCount: number;
    breachCount: number;
    statusLevel: 'NORMAL' | 'WARNING' | 'BOTTLENECK';
  }[];
  departmentQueues: {
    roleCode: string;
    roleTitleFa: string;
    pendingCount: number;
    oldestPendingHours: number;
    avgWaitHours: number;
  }[];
  staffKpiList: {
    staffId?: number;
    actorRole: string;
    fullName: string;
    totalResolved: number;
    avgMttrHours: number;
    slaAdherencePercent: number;
    escalationCount: number;
    avgCsatScore: number;
    productivityScore: number;
  }[];
  urgentCases?: {
    requestId: number;
    trackingCode: string;
    studentName: string;
    processTitle: string;
    currentStepTitle: string;
    roleCode: string;
    slaHours: number;
    hoursElapsed: number;
    hoursRemaining: number;
    isBreached: boolean;
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  }[];
  facultyReports?: {
    facultyId: number;
    facultyName: string;
    departmentsCount: number;
    totalRequests: number;
    avgMttrHours: number;
    slaCompliancePercent: number;
    csatScore: number;
    bounceRatePercent: number;
    efficiencyGrade: 'A+' | 'A' | 'B' | 'C';
  }[];
}

interface AdminWorkflowsClientProps {
  processes: ProcessItem[];
  inbox: RequestInboxItem[];
  analytics: AnalyticsData;
}

const statusFa: Record<string, string> = {
  SUBMITTED: 'ثبت‌شده (در انتظار اقدام)',
  IN_REVIEW: 'در گردش و بررسی',
  APPROVED: 'تأیید نهایی شده ✓',
  REJECTED: 'ردشده ✗',
  RETURNED: 'بازگشت جهت اصلاح',
};

const statusBadge: Record<string, string> = {
  SUBMITTED: 'bg-amber-100 text-amber-900 border-amber-300 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
  IN_REVIEW: 'bg-sky-100 text-sky-900 border-sky-300 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200',
  APPROVED: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  REJECTED: 'bg-red-100 text-red-900 border-red-300 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
  RETURNED: 'bg-purple-100 text-purple-900 border-purple-300 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-200',
};

const roleFa: Record<string, string> = {
  SUPERVISOR: 'استاد راهنما',
  DEPARTMENT_HEAD: 'مدیر گروه آموزشی',
  EDU_EXPERT: 'کارشناس آموزش کل',
  FINANCE_EXPERT: 'کارشناس امور مالی',
  LIBRARY_STAFF: 'مسئول کتابخانه مرکزی',
  WELFARE_STAFF: 'صندوق رفاه دانشجویی',
  LAB_STAFF: 'مسئول آزمایشگاه / کارگاه',
  GRADUATION_EXPERT: 'کارشناس فارغ‌التحصیلی',
  VICE_CHANCELLOR: 'معاونت آموزشی و تحصیلات تکمیلی',
  MULTI_CHECKPOINT: 'تسویه حساب موازی',
  SYSTEM_BOT: 'موتور هوشمند سیستمی',
  PROFESSOR: 'استاد درس',
};

export default function AdminWorkflowsClient({
  processes: initialProcesses,
  inbox: initialInbox,
  analytics,
}: AdminWorkflowsClientProps) {
  const [activeTab, setActiveTab] = useState<'INBOX' | 'DESIGNER' | 'ANALYTICS'>('INBOX');
  const [inboxList, setInboxList] = useState<RequestInboxItem[]>(initialInbox);
  const [processesList, setProcessesList] = useState<ProcessItem[]>(initialProcesses);
  const [selectedProcessId, setSelectedProcessId] = useState<number>(initialProcesses[0]?.id || 1);

  // پیام‌ها و لاگ‌ها
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detailReq, setDetailReq] = useState<RequestInboxItem | null>(null);

  // دیالوگ اقدام روی پرونده
  const [decisionModal, setDecisionModal] = useState<{
    requestId: number;
    trackingCode: string;
    studentName: string;
    actionType: 'APPROVE' | 'REJECT' | 'RETURN' | 'ESCALATE';
    note: string;
  } | null>(null);

  // مرجع ثابت: Modal اثر فوکوس را با تغییر onClose دوباره اجرا می‌کند و فوکوس را می‌رباید
  const closeDecisionModal = useCallback(() => setDecisionModal(null), []);

  // اجرای موتور بررسی SLA
  const handleRunSlaChecker = async () => {
    setIsProcessing(true);
    const res = await adminRunSlaTimeoutCheckerAction();
    setIsProcessing(false);
    if (res.ok) {
      setFeedbackMsg({
        text: `بررسی SLA با موفقیت انجام شد: ${res.count} پرونده بر اساس قوانین ضرب‌الاجل اقدام خودکار شدند.`,
        type: 'success',
      });
      setTimeout(() => setFeedbackMsg(null), 6000);
    }
  };

  // ثبت اقدام روی درخواست
  const handleDecisionSubmit = async () => {
    if (!decisionModal) return;
    setIsProcessing(true);

    if (decisionModal.actionType === 'APPROVE') {
      await adminApproveWorkflowStepAction(decisionModal.requestId, decisionModal.note);
    } else if (decisionModal.actionType === 'REJECT') {
      await adminRejectWorkflowStepAction(decisionModal.requestId, decisionModal.note);
    } else if (decisionModal.actionType === 'RETURN') {
      await adminReturnWorkflowStepAction(decisionModal.requestId, decisionModal.note);
    } else if (decisionModal.actionType === 'ESCALATE') {
      await adminEscalateWorkflowStepAction(decisionModal.requestId, decisionModal.note);
    }

    setIsProcessing(false);
    setDecisionModal(null);
    setFeedbackMsg({ text: 'اقدام مورد نظر با موفقیت در گردش کار ثبت گردید.', type: 'success' });
    setTimeout(() => setFeedbackMsg(null), 5000);
  };

  // تایید تسویه موازی
  const handleClearCheckpoint = async (cpId: number) => {
    setIsProcessing(true);
    await adminClearParallelCheckpointAction(cpId, 'تسویه تایید شد');
    setIsProcessing(false);
    setFeedbackMsg({ text: 'بخش تسویه حساب مورد نظر با موفقیت تأیید گردید.', type: 'success' });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const selectedProcess = processesList.find(p => p.id === selectedProcessId) || processesList[0];

  // ── طراح فرآیند: حالت مشاهده / ویرایش / ساخت فرآیند جدید ──
  const [draft, setDraft] = useState<ProcessDraft | null>(null);
  const [designerSaving, setDesignerSaving] = useState(false);

  const blankStep = (order: number): ProcessStepDef => ({
    stepOrder: order,
    title: '',
    stepType: 'USER',
    roleCode: 'EDU_EXPERT',
    slaHours: 48,
    timeoutAction: 'ESCALATE',
    timeoutEscalateToRole: 'VICE_CHANCELLOR',
  });

  const startCreate = () => {
    setDraft({
      code: '', title: '', category: 'آموزشی', description: '', feeAmount: 0,
      formSchema: [], steps: [blankStep(1)],
    });
    setFeedbackMsg(null);
  };

  const startEdit = (p: ProcessItem) => {
    setDraft(JSON.parse(JSON.stringify(p)) as ProcessDraft);
    setFeedbackMsg(null);
  };

  const patchDraft = (patch: Partial<ProcessDraft>) =>
    setDraft(d => (d ? { ...d, ...patch } : d));

  const patchStep = (i: number, patch: Partial<ProcessStepDef>) =>
    setDraft(d => (d ? { ...d, steps: d.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) } : d));

  const addStep = () =>
    setDraft(d => (d ? { ...d, steps: [...d.steps, blankStep(d.steps.length + 1)] } : d));

  const removeStep = (i: number) =>
    setDraft(d => (d
      ? { ...d, steps: d.steps.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, stepOrder: idx + 1 })) }
      : d));

  const moveStep = (i: number, dir: -1 | 1) =>
    setDraft(d => {
      if (!d) return d;
      const j = i + dir;
      if (j < 0 || j >= d.steps.length) return d;
      const steps = [...d.steps];
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return { ...d, steps: steps.map((s, idx) => ({ ...s, stepOrder: idx + 1 })) };
    });

  const addField = () =>
    setDraft(d => (d
      ? { ...d, formSchema: [...(d.formSchema || []), { key: `field${(d.formSchema?.length || 0) + 1}`, label: '', type: 'text', required: false }] }
      : d));

  const patchField = (i: number, patch: Record<string, unknown>) =>
    setDraft(d => (d
      ? { ...d, formSchema: (d.formSchema || []).map((f, idx) => (idx === i ? { ...f, ...patch } : f)) }
      : d));

  const removeField = (i: number) =>
    setDraft(d => (d ? { ...d, formSchema: (d.formSchema || []).filter((_, idx) => idx !== i) } : d));

  /** ذخیرهٔ فرآیند (جدید یا ویرایش) — دکمهٔ واقعی که قبلاً در UI نبود */
  const saveDraft = async () => {
    if (!draft) return;
    const errors: string[] = [];
    if (!draft.title.trim()) errors.push('عنوان فرآیند الزامی است.');
    if (!draft.code.trim()) errors.push('کد یکتای فرآیند الزامی است.');
    if (!draft.steps.length) errors.push('حداقل یک گام برای فرآیند لازم است.');
    draft.steps.forEach((s, i) => {
      if (!s.title.trim()) errors.push(`عنوان گام ${i + 1} خالی است.`);
      if (!(Number(s.slaHours) > 0)) errors.push(`مهلت گام ${i + 1} باید بیشتر از صفر باشد.`);
    });
    if (errors.length) {
      setFeedbackMsg({ text: errors.join(' '), type: 'error' });
      return;
    }

    setDesignerSaving(true);
    const steps = draft.steps.map((s, i) => ({ ...s, stepOrder: i + 1, slaHours: Number(s.slaHours) || 48 }));
    const res = await adminSaveProcessDefinitionAction({
      id: draft.id,
      code: draft.code.trim(),
      title: draft.title.trim(),
      category: draft.category || 'عمومی',
      description: draft.description || '',
      feeAmount: Number(draft.feeAmount) || 0,
      formSchema: draft.formSchema || [],
      steps,
    });
    setDesignerSaving(false);

    if (!res.ok) {
      setFeedbackMsg({ text: res.error || 'ذخیرهٔ فرآیند انجام نشد.', type: 'error' });
      return;
    }

    const savedId = res.processId ?? draft.id ?? 0;
    const saved: ProcessItem = {
      id: savedId,
      code: draft.code.trim(),
      title: draft.title.trim(),
      category: draft.category || 'عمومی',
      description: draft.description || '',
      feeAmount: Number(draft.feeAmount) || 0,
      formSchema: draft.formSchema || [],
      steps,
    };
    setProcessesList(prev => {
      const idx = prev.findIndex(p => p.id === savedId);
      if (idx < 0) return [...prev, saved];
      const copy = [...prev];
      copy[idx] = saved;
      return copy;
    });
    if (savedId) setSelectedProcessId(savedId);
    setDraft(null);
    setFeedbackMsg({ text: 'فرآیند و گام‌های آن با موفقیت ذخیره شد.', type: 'success' });
    setTimeout(() => setFeedbackMsg(null), 5000);
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* هدر صفحه */}
      <div className="bg-gradient-to-l from-indigo-950 via-slate-900 to-indigo-900 text-white rounded-3xl p-6 shadow-xl border border-indigo-700/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-400 text-slate-950">
            موتور گردش کار و مدیریت فرآیندها
          </span>
          <h1 className="text-xl font-black mt-2">
            گردش کار و فرآیندها
          </h1>
          <p className="text-xs text-indigo-200 mt-1">
            طراحی فرآیند، پیگیری درخواست‌ها و ارزیابی خدمت
          </p>
        </div>

        {/* دکمه‌های ناوبری تب‌ها */}
        <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-3">
          <button
            onClick={() => setActiveTab('INBOX')}
            className={`inline-flex min-h-11 items-center justify-center px-4 py-2 rounded-xl text-xs font-extrabold transition-all shadow ${
              activeTab === 'INBOX'
                ? 'bg-white text-indigo-950'
                : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
            }`}
          >
            📥 کارتابل پرونده‌ها ({inboxList.length})
          </button>
          <button
            onClick={() => setActiveTab('DESIGNER')}
            className={`inline-flex min-h-11 items-center justify-center px-4 py-2 rounded-xl text-xs font-extrabold transition-all shadow ${
              activeTab === 'DESIGNER'
                ? 'bg-amber-400 text-slate-950'
                : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
            }`}
          >
            ⚙️ طراح فرآیندها و سطح خدمت
          </button>
          <button
            onClick={() => setActiveTab('ANALYTICS')}
            className={`inline-flex min-h-11 items-center justify-center px-4 py-2 rounded-xl text-xs font-extrabold transition-all shadow ${
              activeTab === 'ANALYTICS'
                ? 'bg-emerald-400 text-slate-950'
                : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
            }`}
          >
            📊 تحلیل گلوگاه‌ها و شاخص پرسنل
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div
          className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between animate-fadeIn ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
              : 'bg-red-50 border-red-300 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
          }`}
        >
          <span>✓ {feedbackMsg.text}</span>
          <button onClick={() => setFeedbackMsg(null)} className="font-black">✕</button>
        </div>
      )}

      {/* خلاصه وضعیت بالای صفحه */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <div className="card text-center !p-3">
          <p className="text-xl font-bold text-slate-800">{analytics.summary.totalRequests}</p>
          <p className="text-xs text-slate-500">کل درخواست‌ها</p>
        </div>
        <div className="card text-center !p-3">
          <p className="text-xl font-bold text-amber-600">{analytics.summary.activeRequests}</p>
          <p className="text-xs text-slate-500">در گردش و انتظار</p>
        </div>
        <div className="card text-center !p-3">
          <p className="text-xl font-bold text-emerald-600">{analytics.summary.approvedRequests}</p>
          <p className="text-xs text-slate-500">تأیید نهایی</p>
        </div>
        <div className="card text-center !p-3">
          <p className="text-xl font-bold text-red-600">{analytics.summary.rejectedRequests}</p>
          <p className="text-xs text-slate-500">رد یا بازگشتی</p>
        </div>
        <div className="card text-center !p-3">
          <p className="text-xl font-bold text-purple-700">{analytics.summary.bounceRatePercent}%</p>
          <p className="text-xs text-slate-500">نرخ اصلاح (Bounce)</p>
        </div>
        <div className="card text-center !p-3">
          <p className="text-xl font-bold text-amber-500">★ {analytics.summary.avgSatisfaction}</p>
          <p className="text-xs text-slate-500">رضایت دانشجو (CSAT)</p>
        </div>
      </div>

      {/* TAB 1: کارتابل اداری و اقدامات (Staff Workflow Inbox) */}
      {activeTab === 'INBOX' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div>
              <h2 className="text-sm font-extrabold text-slate-800">
                📥 فهرست پرونده‌های در انتظار رسیدگی
              </h2>
              <p className="text-xs text-slate-500">
                بررسی مستندات، تایید مراحل، ارجاع مدیریتی و کنترل مهلت قانونی SLA
              </p>
            </div>

            <button
              onClick={handleRunSlaChecker}
              disabled={isProcessing}
              className="px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-extrabold text-xs shadow flex items-center gap-1.5 transition disabled:opacity-50"
            >
              <span>⏱️</span>
              <span>اجرای ارزیابی خودکار ضرب‌الاجل</span>
            </button>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-right text-xs rt">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-extrabold">
                  <th scope="col" className="p-3">کد رهگیری</th>
                  <th scope="col" className="p-3">دانشجو</th>
                  <th scope="col" className="p-3">عنوان خدمت</th>
                  <th scope="col" className="p-3">مرحله فعلی و متولی</th>
                  <th scope="col" className="p-3">وضعیت SLA</th>
                  <th scope="col" className="p-3">وضعیت پرونده</th>
                  <th scope="col" className="p-3 text-left">اقدامات مدیریتی</th>
                </tr>
              </thead>
              <tbody>
                {inboxList.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      هیچ پرونده‌ای در این کارتابل موجود نیست.
                    </td>
                  </tr>
                )}
                {inboxList.map(req => {
                  const isFinished = req.status === 'APPROVED' || req.status === 'REJECTED';
                  const hasParallel = req.checkpoints && req.checkpoints.length > 0;

                  return (
                    <tr key={req.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition">
                      <td className="p-3 font-mono font-bold text-indigo-900" dir="ltr">
                        {req.trackingCode}
                      </td>
                      <td className="p-3">
                        <p className="font-bold text-slate-900">{req.studentName}</p>
                        <p className="text-2xs font-mono text-slate-400" dir="ltr">{req.studentCode}</p>
                        {/* درخواست تأیید کارنامهٔ مالی: کارشناس بدون ترک کارتابل،
                            پروندهٔ مالی همان دانشجو را می‌بیند و بعد تأیید/رد می‌کند. */}
                        {req.processCode === 'FINANCE_STATEMENT' && req.studentId ? (
                          <a
                            href={`/admin/finance/student/${req.studentId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-3xs font-bold text-sky-800 transition hover:bg-sky-100"
                          >
                            📄 مشاهدهٔ کارنامهٔ مالی
                          </a>
                        ) : null}
                      </td>
                      <td className="p-3 font-semibold text-slate-800">
                        {req.processTitle}
                      </td>
                      <td className="p-3">
                        <p className="font-bold text-slate-800">{req.currentStepTitle || 'مرحله اول'}</p>
                        <span className="text-3xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                          نقش: {roleFa[req.currentRoleCode || ''] || req.currentRoleCode || 'کارشناس'}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="space-y-1">
                          <span
                            className={`px-2 py-0.5 rounded-full text-3xs font-bold ${
                              req.isBreached
                                ? 'bg-red-100 text-red-900 border border-red-300 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
                                : 'bg-emerald-100 text-emerald-900 border border-emerald-300 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                            }`}
                          >
                            {req.isBreached ? '⚠️ تاخیر از SLA' : '✓ در مهلت مجاز'}
                          </span>
                          <p className="text-3xs text-slate-400 font-mono">
                            {req.hoursElapsed} ساعت از {req.slaHours || 48} ساعت
                          </p>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`px-2.5 py-1 rounded-full text-2xs font-bold border ${statusBadge[req.status] || 'bg-slate-100'}`}>
                          {statusFa[req.status] ?? req.status}
                        </span>
                      </td>
                      <td className="p-3 text-left">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <button
                            onClick={() => setDetailReq(req)}
                            className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-800 text-white font-bold text-2xs transition"
                          >
                            جزئیات
                          </button>
                          {!isFinished ? (
                            <>
                              <button
                                onClick={() =>
                                  setDecisionModal({
                                    requestId: req.id,
                                    trackingCode: req.trackingCode,
                                    studentName: req.studentName,
                                    actionType: 'APPROVE',
                                    note: '',
                                  })
                                }
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-2xs shadow transition"
                              >
                                ✓ تایید
                              </button>
                              <button
                                onClick={() =>
                                  setDecisionModal({
                                    requestId: req.id,
                                    trackingCode: req.trackingCode,
                                    studentName: req.studentName,
                                    actionType: 'REJECT',
                                    note: '',
                                  })
                                }
                                className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-2xs shadow transition"
                              >
                                ✗ رد
                              </button>
                              <button
                                onClick={() =>
                                  setDecisionModal({
                                    requestId: req.id,
                                    trackingCode: req.trackingCode,
                                    studentName: req.studentName,
                                    actionType: 'RETURN',
                                    note: '',
                                  })
                                }
                                className="px-2 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-2xs transition"
                              >
                                اصلاح
                              </button>
                              <button
                                onClick={() =>
                                  setDecisionModal({
                                    requestId: req.id,
                                    trackingCode: req.trackingCode,
                                    studentName: req.studentName,
                                    actionType: 'ESCALATE',
                                    note: '',
                                  })
                                }
                                className="px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-2xs transition"
                              >
                                ارجاع
                              </button>
                            </>
                          ) : (
                            <span className="text-slate-400 font-bold text-2xs">مختومه</span>
                          )}
                        </div>

                        {/* اگر چک‌پوینت موازی دارد */}
                        {hasParallel && (
                          <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-1 justify-end">
                            {req.checkpoints.map(cp => (
                              <button
                                key={cp.id}
                                disabled={cp.isCleared === 1}
                                onClick={() => handleClearCheckpoint(cp.id)}
                                className={`px-2 py-0.5 rounded text-3xs font-bold border transition ${
                                  cp.isCleared === 1
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                                    : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900'
                                }`}
                              >
                                {cp.departmentTitle}: {cp.isCleared === 1 ? '✓ تسویه' : 'کلیک جهت تسویه'}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: طراح فرآیندها و SLA (Visual BPM Process Builder) */}
      {activeTab === 'DESIGNER' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* ستون لیست فرآیندها */}
            <div className="md:col-span-1 space-y-2">
              <div className="flex items-center justify-between mb-2 gap-2">
                <h3 className="text-xs font-black text-slate-800">فرآیندهای آموزشی و اداری:</h3>
                <button
                  type="button"
                  onClick={startCreate}
                  className="px-2.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-2xs font-bold"
                >
                  ➕ فرایند جدید
                </button>
              </div>
              {processesList.map(proc => (
                <div
                  key={proc.id}
                  onClick={() => setSelectedProcessId(proc.id)}
                  className={`p-3 rounded-2xl border transition cursor-pointer text-xs space-y-1 ${
                    selectedProcessId === proc.id
                      ? 'bg-indigo-900 text-white border-indigo-700 shadow-md'
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold">{proc.title}</span>
                    <span className={`text-3xs px-2 py-0.2 rounded-full ${selectedProcessId === proc.id ? 'bg-indigo-800 text-indigo-200' : 'bg-slate-100 text-slate-600'}`}>
                      {proc.steps?.length || 0} گام
                    </span>
                  </div>
                  <p className={`text-2xs truncate ${selectedProcessId === proc.id ? 'text-indigo-200' : 'text-slate-400'}`}>
                    کد: {proc.code}
                  </p>
                </div>
              ))}
            </div>

            {/* ستون ویرایشگر فلوچارت و مراحل */}
            <div className="md:col-span-3 card p-6 bg-white border border-slate-200 rounded-2xl space-y-6 shadow-sm">
              {draft ? (
                <div className="space-y-5">
                  {/* ── ویرایشگر فرآیند (جدید/ویرایش) ── */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                    <h2 className="text-base font-black text-slate-900">
                      {draft.id ? '✏️ ویرایش فرآیند' : '➕ تعریف فرآیند جدید'}
                    </h2>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={saveDraft}
                        disabled={designerSaving}
                        className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold disabled:opacity-50"
                      >
                        {designerSaving ? '⏳ در حال ذخیره…' : '💾 ذخیره فرآیند'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraft(null)}
                        className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700"
                      >
                        ↩ انصراف
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <label className="space-y-1">
                      <span className="font-bold text-slate-700">کد یکتا *</span>
                      <input
                        value={draft.code}
                        disabled={!!draft.id}
                        onChange={e => patchDraft({ code: e.target.value })}
                        placeholder="مثلاً VALID_TRANSCRIPT"
                        className="w-full rounded-xl border border-slate-300 px-2.5 py-2 font-mono disabled:bg-slate-100"
                        dir="ltr"
                      />
                      {draft.id && <span className="block text-3xs text-slate-500">کد پس از ساخت تغییر نمی‌کند.</span>}
                    </label>
                    <label className="space-y-1">
                      <span className="font-bold text-slate-700">عنوان فرآیند *</span>
                      <input
                        value={draft.title}
                        onChange={e => patchDraft({ title: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 px-2.5 py-2"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="font-bold text-slate-700">دسته</span>
                      <input
                        value={draft.category}
                        onChange={e => patchDraft({ category: e.target.value })}
                        placeholder="آموزشی / مالی / اداری"
                        className="w-full rounded-xl border border-slate-300 px-2.5 py-2"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="font-bold text-slate-700">هزینه (ریال)</span>
                      <input
                        type="number"
                        min={0}
                        value={draft.feeAmount}
                        onChange={e => patchDraft({ feeAmount: Number(e.target.value) })}
                        className="w-full rounded-xl border border-slate-300 px-2.5 py-2 font-mono"
                        dir="ltr"
                      />
                    </label>
                    <label className="space-y-1 sm:col-span-2">
                      <span className="font-bold text-slate-700">توضیح</span>
                      <textarea
                        value={draft.description}
                        onChange={e => patchDraft({ description: e.target.value })}
                        rows={2}
                        className="w-full rounded-xl border border-slate-300 px-2.5 py-2"
                      />
                    </label>
                  </div>

                  {/* گام‌ها */}
                  <div className="space-y-2 border-t pt-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black text-slate-800">گام‌های گردش کار *</h3>
                      <button type="button" onClick={addStep} className="px-2.5 py-1 rounded-lg bg-indigo-700 text-white text-2xs font-bold">➕ افزودن گام</button>
                    </div>
                    {draft.steps.map((s, i) => (
                      <div key={i} className="rounded-xl border-2 border-slate-200 bg-slate-50/70 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold text-slate-800">گام {i + 1}</span>
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0} className="px-2 py-0.5 rounded border border-slate-300 bg-white text-2xs disabled:opacity-40">↑</button>
                            <button type="button" onClick={() => moveStep(i, 1)} disabled={i === draft.steps.length - 1} className="px-2 py-0.5 rounded border border-slate-300 bg-white text-2xs disabled:opacity-40">↓</button>
                            <button type="button" onClick={() => removeStep(i)} className="px-2 py-0.5 rounded border border-rose-300 bg-white text-2xs font-bold text-rose-700">حذف</button>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <label className="space-y-1">
                            <span className="text-slate-600">عنوان گام *</span>
                            <input value={s.title} onChange={e => patchStep(i, { title: e.target.value })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5" />
                          </label>
                          <label className="space-y-1">
                            <span className="text-slate-600">نوع گام</span>
                            <select value={s.stepType} onChange={e => patchStep(i, { stepType: e.target.value as ProcessStepDef['stepType'] })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5">
                              <option value="USER">کاربر (USER)</option>
                              <option value="AUTO_INTEGRATION">یکپارچه‌سازی خودکار</option>
                              <option value="PARALLEL_GATEWAY">دروازه موازی</option>
                            </select>
                          </label>
                          <label className="space-y-1">
                            <span className="text-slate-600">نقش متولی</span>
                            <select value={s.roleCode} onChange={e => patchStep(i, { roleCode: e.target.value })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5">
                              {Object.entries(roleFa).map(([code, label]) => (
                                <option key={code} value={code}>{label} ({code})</option>
                              ))}
                            </select>
                          </label>
                          <label className="space-y-1">
                            <span className="text-slate-600">مهلت SLA (ساعت) *</span>
                            <input type="number" min={1} value={s.slaHours} onChange={e => patchStep(i, { slaHours: Number(e.target.value) })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono" dir="ltr" />
                          </label>
                          <label className="space-y-1">
                            <span className="text-slate-600">اقدام در صورت انقضا</span>
                            <select value={s.timeoutAction} onChange={e => patchStep(i, { timeoutAction: e.target.value as ProcessStepDef['timeoutAction'] })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5">
                              <option value="ESCALATE">ارجاع به مقام بالاتر</option>
                              <option value="AUTO_APPROVE">تأیید خودکار</option>
                              <option value="AUTO_REJECT">رد خودکار</option>
                              <option value="NOTIFY">فقط اطلاع‌رسانی</option>
                            </select>
                          </label>
                          <label className="space-y-1">
                            <span className="text-slate-600">مقصد ارجاع خودکار</span>
                            <select value={s.timeoutEscalateToRole || ''} onChange={e => patchStep(i, { timeoutEscalateToRole: e.target.value || undefined })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5">
                              <option value="">—</option>
                              {Object.entries(roleFa).map(([code, label]) => (
                                <option key={code} value={code}>{label}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* فیلدهای فرم */}
                  <div className="space-y-2 border-t pt-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black text-slate-800">فیلدهای فرم پویا</h3>
                      <button type="button" onClick={addField} className="px-2.5 py-1 rounded-lg bg-indigo-700 text-white text-2xs font-bold">➕ افزودن فیلد</button>
                    </div>
                    {(draft.formSchema || []).map((f: any, i: number) => (
                      <div key={i} className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs items-end">
                        <label className="space-y-1">
                          <span className="text-slate-600">کلید داده</span>
                          <input value={f.key} onChange={e => patchField(i, { key: e.target.value })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono" dir="ltr" />
                        </label>
                        <label className="space-y-1">
                          <span className="text-slate-600">برچسب</span>
                          <input value={f.label} onChange={e => patchField(i, { label: e.target.value })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5" />
                        </label>
                        <label className="space-y-1">
                          <span className="text-slate-600">نوع</span>
                          <select value={f.type || 'text'} onChange={e => patchField(i, { type: e.target.value })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5">
                            <option value="text">متن</option>
                            <option value="textarea">متن بلند</option>
                            <option value="select">انتخابی</option>
                            <option value="number">عدد</option>
                            <option value="date">تاریخ</option>
                          </select>
                        </label>
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-1">
                            <input type="checkbox" checked={!!f.required} onChange={e => patchField(i, { required: e.target.checked })} />
                            الزامی
                          </label>
                          <button type="button" onClick={() => removeField(i)} className="px-2 py-0.5 rounded border border-rose-300 bg-white text-2xs font-bold text-rose-700">حذف</button>
                        </div>
                      </div>
                    ))}
                    {(!draft.formSchema || draft.formSchema.length === 0) && (
                      <p className="text-2xs text-slate-500">هیچ فیلدی تعریف نشده است — در صورت نیاز «افزودن فیلد» را بزنید.</p>
                    )}
                  </div>
                </div>
              ) : (
                <>
              <div className="flex items-center justify-between border-b pb-4">
                <div>
                  <h2 className="text-base font-black text-slate-900">
                    ⚙️ پیکربندی مراحل و قوانین زمان‌بندی: {selectedProcess.title}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    تعیین نقش‌های تاییدکننده، مهلت قانونی هر گام (SLA) و اقدام در صورت انقضا (Timeout Action)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-3 py-1 rounded-xl bg-indigo-50 text-indigo-900 border border-indigo-200">
                    کد یکتا: {selectedProcess.code}
                  </span>
                  <button
                    type="button"
                    onClick={() => startEdit(selectedProcess)}
                    className="px-3 py-1.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-2xs font-bold"
                  >
                    ✏️ ویرایش این فرآیند
                  </button>
                </div>
              </div>

              {/* نمایش خطی و بصری گام‌های گردش کار (Visual Flowchart) */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-700">زنجیره مراحل فرآیند (Workflow Steps Chain):</h3>
                
                <div className="space-y-3">
                  {selectedProcess.steps?.map((step, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-2xl border-2 border-slate-200 bg-slate-50/70 space-y-3 relative hover:border-indigo-300 transition"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-indigo-600 text-white font-extrabold text-xs flex items-center justify-center">
                            {step.stepOrder}
                          </span>
                          <span className="font-extrabold text-sm text-slate-900">{step.title}</span>
                          <span className="text-2xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                            نوع گام: {step.stepType}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-lg border border-amber-300">
                            ⏱️ مهلت (SLA): {step.slaHours} ساعت
                          </span>
                        </div>
                      </div>

                      {/* تنظیمات نقش و اکشن انقضا */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200 text-xs">
                        <div>
                          <span className="text-slate-500 block mb-1">نقش متولی اقدام:</span>
                          <span className="font-bold text-indigo-950 bg-white p-2 rounded-xl border border-slate-200 block">
                            👤 {roleFa[step.roleCode] || step.roleCode}
                          </span>
                        </div>

                        <div>
                          <span className="text-slate-500 block mb-1">اقدام در صورت انقضای مهلت (Timeout):</span>
                          <span className="font-bold text-red-900 bg-red-50 p-2 rounded-xl border border-red-200 block dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                            ⚡ {step.timeoutAction === 'ESCALATE' ? 'ارجاع خودکار به مقام بالاتر (Escalation)' : step.timeoutAction === 'AUTO_APPROVE' ? 'تأیید خودکار سیستمی (Auto-Approve)' : 'بستن خودکار پرونده'}
                          </span>
                        </div>

                        <div>
                          <span className="text-slate-500 block mb-1">مقصد ارجاع خودکار:</span>
                          <span className="font-bold text-slate-800 bg-white p-2 rounded-xl border border-slate-200 block">
                            {step.timeoutEscalateToRole ? roleFa[step.timeoutEscalateToRole] || step.timeoutEscalateToRole : 'معاونت آموزشی'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ساختار فیلدهای فرم‌ساز پویا */}
              <div className="space-y-2 pt-4 border-t border-slate-200">
                <h3 className="text-xs font-bold text-slate-700">فیلدهای فرم پویا (JSON Form Schema):</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {selectedProcess.formSchema?.map((f: any, i: number) => (
                    <div key={i} className="p-2.5 rounded-xl bg-white border border-slate-200 text-xs">
                      <p className="font-extrabold text-slate-800">{f.label}</p>
                      <p className="text-3xs text-slate-400 mt-0.5">کلید داده: {f.key} · نوع: {f.type}</p>
                    </div>
                  ))}
                </div>
              </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: تحلیل گلوگاه‌ها و ارزیابی پرسنل (Bottlenecks & Staff KPI Analytics) */}
      {activeTab === 'ANALYTICS' && (
        <div className="space-y-6">
          {/* ۰. داشبورد زنده عملیاتی و پرونده‌های فوری (Real-time Operations Dashboard) */}
          {analytics.urgentCases && analytics.urgentCases.length > 0 && (
            <div className="card p-5 bg-gradient-to-r from-red-950 via-slate-900 to-indigo-950 text-white rounded-2xl shadow-lg border border-red-700/50 space-y-4">
              <div className="flex items-center justify-between border-b border-red-800/60 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
                  <h2 className="text-sm font-black text-white">
                    🚨 پایش زنده پرونده‌های بحرانی و در آستانه انقضای SLA (Urgent Operations Monitor)
                  </h2>
                </div>
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-red-600/80 text-white">
                  {analytics.urgentCases.length} پرونده فوری
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {analytics.urgentCases.map(uc => (
                  <div
                    key={uc.requestId}
                    className="p-3.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-between text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-amber-300" dir="ltr">{uc.trackingCode}</span>
                        <span className="font-bold text-white">{uc.studentName}</span>
                      </div>
                      <p className="text-2xs text-slate-300">
                        {uc.processTitle} · {uc.currentStepTitle} ({roleFa[uc.roleCode] || uc.roleCode})
                      </p>
                    </div>

                    <div className="text-left space-y-1">
                      <span
                        className={`px-2 py-0.5 rounded text-3xs font-bold block ${
                          uc.isBreached
                            ? 'bg-red-500 text-white'
                            : 'bg-amber-400 text-slate-950'
                        }`}
                      >
                        {uc.isBreached ? '⚠️ نقض مهلت SLA' : `⏳ ${uc.hoursRemaining} ساعت باقی‌مانده`}
                      </span>
                      <span className="text-3xs text-slate-300 font-mono">
                        سپری‌شده: {uc.hoursElapsed}h / {uc.slaHours}h
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ۰.۱. گزارش مقایسه‌ای دانشکده‌ها (Comparative Faculty Benchmarking) */}
          {analytics.facultyReports && analytics.facultyReports.length > 0 && (
            <div className="card p-5 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
              <div className="border-b pb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <span>🏛️ گزارش مقایسه‌ای عملکرد دانشکده‌ها (Comparative Faculty Reports)</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    مقایسه سرعت پاسخگویی، پایبندی به SLA و رضایت دانشجویی بین دانشکده‌های دانشگاه آفاق
                  </p>
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-xl bg-indigo-50 text-indigo-900 border">
                  دوره ارزیابی: نیمسال جاری
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {analytics.facultyReports.map(fac => (
                  <div
                    key={fac.facultyId}
                    className="p-4 rounded-2xl border-2 border-slate-200 bg-slate-50/70 space-y-3 hover:border-indigo-300 transition"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-black text-xs text-slate-900">{fac.facultyName}</h3>
                      <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-black text-xs flex items-center justify-center">
                        {fac.efficiencyGrade}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs pt-2 border-t border-slate-200 text-slate-600">
                      <div className="flex justify-between">
                        <span>حجم پرونده‌های مختومه:</span>
                        <b className="font-mono text-slate-900">{fac.totalRequests} پرونده</b>
                      </div>
                      <div className="flex justify-between">
                        <span>سرعت اقدام (MTTR):</span>
                        <b className="font-mono text-indigo-950">{fac.avgMttrHours} ساعت</b>
                      </div>
                      <div className="flex justify-between">
                        <span>پایبندی به ضرب‌الاجل (SLA %):</span>
                        <b className="font-mono text-emerald-800 font-black">{fac.slaCompliancePercent}٪</b>
                      </div>
                      <div className="flex justify-between">
                        <span>رضایت دانشجو (CSAT):</span>
                        <b className="font-mono text-amber-600 font-black">★ {fac.csatScore}</b>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ۱. نقشه حرارتی مراحل (Process Step Heatmap) */}
          <div className="card p-5 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
            <div>
              <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <span>🔥 نقشه حرارتی مراحل و شناسایی گلوگاه‌ها (Process Step Heatmap)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                مقایسه میانگین زمان توقف واقعی در هر گام اداری در مقایسه با استاندارد مجاز (SLA)
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs rt">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-extrabold">
                    <th scope="col" className="p-2.5">فرآیند</th>
                    <th scope="col" className="p-2.5">گام اجرایی</th>
                    <th scope="col" className="p-2.5">نقش متولی</th>
                    <th scope="col" className="p-2.5">مهلت هدف (SLA)</th>
                    <th scope="col" className="p-2.5">میانگین زمان واقعی</th>
                    <th scope="col" className="p-2.5">تعداد در صف</th>
                    <th scope="col" className="p-2.5">وضعیت گلوگاه</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.heatmap.map((item, idx) => (
                    <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-2.5 font-bold text-slate-800">{item.processTitle}</td>
                      <td className="p-2.5">{item.stepTitle}</td>
                      <td className="p-2.5 font-medium">{roleFa[item.roleCode] || item.roleCode}</td>
                      <td className="p-2.5 font-mono">{item.targetSlaHours} ساعت</td>
                      <td className="p-2.5 font-mono font-bold text-indigo-950">{item.avgDurationHours} ساعت</td>
                      <td className="p-2.5 font-mono font-bold text-amber-700">{item.pendingCount} پرونده</td>
                      <td className="p-2.5">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-3xs font-bold ${
                            item.statusLevel === 'BOTTLENECK'
                              ? 'bg-red-500 text-white shadow-sm'
                              : item.statusLevel === 'WARNING'
                              ? 'bg-amber-400 text-slate-950 font-bold'
                              : 'bg-emerald-100 text-emerald-900'
                          }`}
                        >
                          {item.statusLevel === 'BOTTLENECK' ? '🚨 گلوگاه حاد' : item.statusLevel === 'WARNING' ? '⚠️ هشدار تاخیر' : '✓ روان و بهینه'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ۲. وضعیت صف‌های اداری (Queue Depth Monitor) */}
          <div className="card p-5 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
            <div>
              <h2 className="text-sm font-black text-slate-900">
                📊 پایش طول صف کارتابل ادارات و دوایر دانشگاه (Queue Length Monitor)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                تعداد درخواست‌های انباشته‌شده و مدت زمان معطلی قدیمی‌ترین پرونده در هر بخش
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {analytics.departmentQueues.map((dept, i) => (
                <div key={i} className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-xs text-slate-900">{dept.roleTitleFa}</span>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-white border text-indigo-900">
                      {dept.pendingCount} پرونده
                    </span>
                  </div>
                  <div className="space-y-1 text-2xs text-slate-500 pt-2 border-t border-slate-200">
                    <p>میانگین زمان رسیدگی: <b className="text-slate-800 font-mono">{dept.avgWaitHours} ساعت</b></p>
                    <p>قدیمی‌ترین پرونده معلق: <b className="text-amber-800 font-mono">{dept.oldestPendingHours} ساعت پیش</b></p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ۳. ماتریس ارزیابی عملکرد پرسنل (Staff KPI Matrix) */}
          <div className="card p-5 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
            <div>
              <h2 className="text-sm font-black text-slate-900">
                🏆 ماتریس ارزیابی شاخص‌های عملکرد کلیدی کارکنان و اساتید (Staff KPI Matrix)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                سنجش سرعت اقدام (MTTR)، نرخ پایبندی به مهلت‌ها (SLA %)، حجم خروجی، نرخ ارجاع خودکار و رضایت دانشجویان (CSAT)
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs rt">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-extrabold">
                    <th scope="col" className="p-3">نام و مسئولیت</th>
                    <th scope="col" className="p-3 text-center">حجم خروجی (Throughput)</th>
                    <th scope="col" className="p-3 text-center">سرعت اقدام (MTTR)</th>
                    <th scope="col" className="p-3 text-center">پایبندی به مهلت (SLA %)</th>
                    <th scope="col" className="p-3 text-center">ارجاع خودکار (Escalations)</th>
                    <th scope="col" className="p-3 text-center">رضایت دانشجو (CSAT)</th>
                    <th scope="col" className="p-3 text-center">امتیاز بهره‌وری</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.staffKpiList.map((st, idx) => (
                    <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-3">
                        <p className="font-extrabold text-slate-900">{st.fullName}</p>
                        <span className="text-3xs text-slate-400">{roleFa[st.actorRole] || st.actorRole}</span>
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-indigo-950">
                        {st.totalResolved} پرونده
                      </td>
                      <td className="p-3 text-center font-mono text-slate-700">
                        {st.avgMttrHours} ساعت
                      </td>
                      <td className="p-3 text-center">
                        <span className="font-mono font-extrabold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                          {st.slaAdherencePercent}%
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono text-red-700 font-bold">
                        {st.escalationCount} بار
                      </td>
                      <td className="p-3 text-center font-mono text-amber-500 font-bold">
                        ★ {st.avgCsatScore}
                      </td>
                      <td className="p-3 text-center">
                        <div className="w-20 mx-auto bg-slate-200 rounded-full h-2.5 overflow-hidden">
                          <div
                            className="bg-indigo-600 h-2.5 rounded-full"
                            style={{ width: `${st.productivityScore}%` }}
                          />
                        </div>
                        <span className="text-3xs font-mono text-slate-500 mt-0.5 block">{st.productivityScore} / ۱۰۰</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* دیالوگ اقدام تصمیم‌گیری */}
      {detailReq && (
        <Modal
          open
          onClose={() => setDetailReq(null)}
          title={`جزئیات پرونده ${detailReq.trackingCode}`}
          size="lg"
          footer={(
            <div className="ms-auto">
              <button onClick={() => setDetailReq(null)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100">بستن</button>
            </div>
          )}
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3">
              <div><span className="text-slate-500">دانشجو:</span> <b>{detailReq.studentName}</b> <span className="font-mono text-slate-400" dir="ltr">{detailReq.studentCode}</span></div>
              <div><span className="text-slate-500">فرآیند:</span> <b>{detailReq.processTitle}</b></div>
              <div><span className="text-slate-500">وضعیت:</span> <span className={`px-2 py-0.5 rounded-full text-2xs font-bold border ${statusBadge[detailReq.status] || 'bg-slate-100'}`}>{statusFa[detailReq.status] ?? detailReq.status}</span></div>
              <div><span className="text-slate-500">گام فعلی:</span> <b>{detailReq.currentStepTitle || '—'}</b></div>
            </div>

            <div>
              <h3 className="mb-2 font-black text-slate-800">فرم/اطلاعات درخواست</h3>
              {detailReq.formData && Object.keys(detailReq.formData).length > 0 ? (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-right">
                    <tbody>
                      {Object.entries(detailReq.formData).map(([k, v]) => (
                        <tr key={k} className="border-b border-slate-100 last:border-0">
                          <td className="p-2 font-bold text-slate-600 bg-slate-50 w-40">{k}</td>
                          <td className="p-2 text-slate-800 whitespace-pre-wrap break-words">{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-slate-400">اطلاعات فرمی ثبت نشده است.</p>}
            </div>

            <div>
              <h3 className="mb-2 font-black text-slate-800">گام‌ها و یادداشت‌ها</h3>
              {detailReq.logs.length > 0 ? (
                <div className="space-y-2">
                  {detailReq.logs.map((l) => (
                    <div key={l.id} className="rounded-xl border border-slate-200 p-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <b className="text-slate-800">{l.stepTitle}</b>
                        <span className="text-2xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{roleFa[l.actorRole] || l.actorRole || '—'}</span>
                        <span className="text-2xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">{l.action || '—'}</span>
                      </div>
                      {l.notes && <p className="mt-1 text-slate-600 whitespace-pre-wrap">{l.notes}</p>}
                      <p className="mt-1 text-3xs text-slate-400 font-mono" dir="ltr">
                        {l.assignedAt ? `assign: ${new Date(l.assignedAt).toLocaleString('fa-IR')}` : ''}
                        {l.completedAt ? ` · done: ${new Date(l.completedAt).toLocaleString('fa-IR')}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              ) : <p className="text-slate-400">لاگی ثبت نشده است.</p>}
            </div>

            {detailReq.checkpoints.length > 0 && (
              <div>
                <h3 className="mb-2 font-black text-slate-800">تسویه‌های موازی</h3>
                <div className="flex flex-wrap gap-2">
                  {detailReq.checkpoints.map((cp) => (
                    <span key={cp.id} className={`px-2 py-1 rounded-lg text-2xs font-bold border ${cp.isCleared ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                      {cp.departmentTitle} — {cp.isCleared ? 'تسویه شده' : 'در انتظار'}{cp.notes ? ` (${cp.notes})` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="text-slate-500">نتیجه/وضعیت نهایی: </span>
              <b>{statusFa[detailReq.status] ?? detailReq.status}</b>
              {detailReq.satisfactionScore != null && <span className="ms-2 text-slate-500">امتیاز رضایت: <b>{detailReq.satisfactionScore}</b></span>}
            </div>
          </div>
        </Modal>
      )}

      {decisionModal && (
        <Modal
          open
          onClose={closeDecisionModal}
          title={
            decisionModal.actionType === 'APPROVE'
              ? '✓ تایید و پیشبرد پرونده'
              : decisionModal.actionType === 'REJECT'
              ? '✗ رد قطعی درخواست'
              : decisionModal.actionType === 'RETURN'
              ? 'نیازمند بازبینی و اصلاح دانشجو'
              : 'ارجاع مدیریتی پرونده (Escalate)'
          }
          footer={(
            <div className="ms-auto flex items-center gap-2">
              <button
                onClick={closeDecisionModal}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                onClick={handleDecisionSubmit}
                disabled={isProcessing}
                className="px-5 py-2 rounded-xl text-xs font-extrabold bg-indigo-600 hover:bg-indigo-700 text-white shadow disabled:opacity-50"
              >
                {isProcessing ? 'در حال ثبت...' : 'ثبت قطعی اقدام'}
              </button>
            </div>
          )}
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              کد رهگیری: <b className="font-mono text-slate-800" dir="ltr">{decisionModal.trackingCode}</b> · دانشجو: {decisionModal.studentName}
            </p>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">توضیحات و دلیل تصمیم:</label>
              <textarea
                rows={3}
                placeholder="توضیحات تکمیلی یا علت رد/اصلاح را بنویسید..."
                value={decisionModal.note}
                onChange={e => setDecisionModal({ ...decisionModal, note: e.target.value })}
                className="w-full p-2.5 text-xs rounded-xl border border-slate-300 bg-slate-50 focus:bg-white"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
