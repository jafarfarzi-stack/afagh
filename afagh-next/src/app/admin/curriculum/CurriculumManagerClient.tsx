'use client';

// ════════════════════════════════════════════════════════════════════════
// فاز ۷ — Thin Client برنامهٔ درسی
// ────────────────────────────────────────────────────────────────────────
// قانون طلایی (توافق): هیچ دادهٔ Mock در این فایل نیست. همهچیز از
// Server Actions دامنه خوانده می‌شود؛ هر تغییر = یک اکشن گارددار با تراکنش
// و زنجیرهٔ حسابرسی. UI فقط «نمایش وضعیت واقعی» و «فراخوانی اکشن» است.
// ════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from 'react';
import {
  getCurriculumOverviewAction, getCurriculumVersionDetailAction, listCourseBankAction,
  createCurriculumVersionAction, addCourseToCurriculumAction, bulkAddCoursesAction,
  removeCourseFromCurriculumAction, updateCourseInCurriculumAction, updateCurriculumMetaAction,
  assignCourseToSemesterAction, validateCurriculumAction,
  submitCurriculumForApprovalAction, approveCurriculumAction, rejectCurriculumAction,
  publishCurriculumAction, archiveCurriculumAction, createCurriculumRevisionAction,
} from './actions';
import { describeLogicNode, type LogicNode } from '@/lib/curriculum-types';

// ─────────────────────────── Types ───────────────────────────

export interface MajorItem {
  id: number;
  code: string;
  name: string;
  degreeLevelId: number | null;
  degreeTitle: string | null;
  /** غنی‌سازی صفحهٔ سرور (ادغام فاز ۷الف): دانشکده/گروه/واحد الزامی/گرایش‌ها */
  departmentName?: string;
  facultyName?: string;
  minUnits?: number;
  tracks?: string[];
}

export interface VersionRow {
  id: number;
  majorId: number;
  degreeLevelId: number;
  trackId: number | null;
  versionCode: string;
  title: string;
  status: string;
  entryYearFrom: number;
  entryYearTo: number | null;
  totalRequiredUnits: string;
  courseCount: number;
}

export interface CurriculumWorkspace {
  majors: MajorItem[];
  versions: VersionRow[];
  tracks: { id: number; code: string | null; title: string }[];
}

interface CourseRow {
  courseId: number;
  code: string;
  title: string;
  units: number;
  roleType: string;
  isRequired: number;
  isElective: number;
  isGraduationRequired: number;
  recommendedSemester: number | null;
}

interface RuleRow { courseId: number; ruleType: string; logicTree: LogicNode; }
interface ApprovalRow {
  id: number; approvalType: string; fromStatus: string; toStatus: string;
  decisionNote: string | null; approvedAt: Date | string | null;
}
interface CheckRow { check: string; severity: 'ERROR' | 'WARN'; message: string; affected: (string | number)[]; }

interface VersionDetail {
  version: VersionRow & { maxUnitsPerTerm: number | null };
  courses: CourseRow[];
  rules: RuleRow[];
  approvals: ApprovalRow[];
  checks: CheckRow[];
}

interface BankCourse { id: number; code: string; title: string; units: string; courseType: string; }

// ─────────────────────────── ثابت‌های نمایشی ───────────────────────────

const faNum = (n: any) => (n === null || n === undefined || n === '' ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]));

const STATUS_UI: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'پیش‌نویس', cls: 'bg-slate-200 text-slate-800' },
  REVIEW: { label: 'در بازبینی', cls: 'bg-amber-200 text-amber-900' },
  APPROVED: { label: 'تأییدشده', cls: 'bg-blue-200 text-blue-900' },
  PUBLISHED: { label: 'منتشرشده', cls: 'bg-emerald-200 text-emerald-900' },
  ARCHIVED: { label: 'بایگانی‌شده', cls: 'bg-rose-200 text-rose-900' },
};

const ROLE_LABELS: Record<string, string> = {
  CORE: 'پایه', MAJOR: 'اصلی', ELECTIVE: 'اختیاری', GENERAL: 'عمومی',
  THESIS: 'پایان‌نامه', INTERNSHIP: 'کارآموزی', WORKSHOP: 'کارگاه',
};

const faDate = (d: Date | string | null | undefined) => {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(dt);
};

// ─────────────────────────── کامپوننت ───────────────────────────

export default function CurriculumManagerClient({ initial }: { initial: CurriculumWorkspace }) {
  const [majors, setMajors] = useState<MajorItem[]>(initial.majors);
  const [versions, setVersions] = useState<VersionRow[]>(initial.versions);
  const [tracks] = useState(initial.tracks);
  const [selectedMajorId, setSelectedMajorId] = useState<number>(initial.majors[0]?.id ?? 0);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [detail, setDetail] = useState<VersionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [bank, setBank] = useState<BankCourse[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankQuery, setBankQuery] = useState('');
  const [bankSelected, setBankSelected] = useState<Set<number>>(new Set());
  const [bulkRoleType, setBulkRoleType] = useState('CORE');

  const [modal, setModal] = useState<null | 'NEW_VERSION' | 'ADD_COURSE' | 'REJECT'>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // فرم‌ها
  const [newVersionForm, setNewVersionForm] = useState({
    versionCode: '', title: '', entryYearFrom: 1405, totalRequiredUnits: 140, maxUnitsPerTerm: 20, cloneFromId: '',
  });
  const [addCourseForm, setAddCourseForm] = useState({ courseId: '', roleType: 'CORE', recommendedSemester: '' });
  const [rejectNote, setRejectNote] = useState('');

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4200);
  };

  const selectedVersion = versions.find(v => v.id === selectedVersionId) ?? null;
  const majorVersions = versions.filter(v => v.majorId === selectedMajorId);

  const reloadOverview = useCallback(async () => {
    const w = await getCurriculumOverviewAction();
    if (!w.ok) { showToast(w.error, 'error'); return; }
    setMajors(w.data.majors.map(m => ({ ...m, code: m.code ?? String(m.id) })));
    setVersions(w.data.versions);
  }, []);

  const reloadDetail = useCallback(async (versionId: number) => {
    setDetailLoading(true);
    try {
      const r = await getCurriculumVersionDetailAction(versionId);
      if (!r.ok) { showToast(r.error, 'error'); return; }
      setDetail(r.data as unknown as VersionDetail);
    } finally {
      setDetailLoading(false);
    }
  }, [showToast]);

  // پاک‌سازی انتخاب بانک هنگام بستن مودال
  const closeAddCourse = () => {
    setModal(null);
    setBankQuery('');
    setBankSelected(new Set());
  };

  // بارگذاری جزئیات با تغییر نسخهٔ انتخابی
  useEffect(() => {
    if (selectedVersionId == null) { setDetail(null); return; }
    reloadDetail(selectedVersionId);
  }, [selectedVersionId, reloadDetail]);

  // بانک دروس (هنگام نیاز برای افزودن)
  useEffect(() => {
    if (modal !== 'ADD_COURSE' || bank.length > 0 || bankLoading) return;
    setBankLoading(true);
    listCourseBankAction().then(r => {
      setBankLoading(false);
      if (r.ok) setBank(r.data);
      else showToast(r.error, 'error');
    });
  }, [modal, bank.length, bankLoading, showToast]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = async (fn: () => Promise<any>, okText?: string) => {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) { showToast(res.error ?? 'عملیات ناموفق بود.', 'error'); return false; }
      showToast(okText ?? res.message ?? 'انجام شد.', 'success');
      return true;
    } finally {
      setBusy(false);
    }
  };

  // ── چرخهٔ حیات ──
  const handleValidate = async () => {
    if (selectedVersionId == null) return;
    setBusy(true);
    try {
      const r = await validateCurriculumAction(selectedVersionId);
      if (!r.ok) { showToast(r.error, 'error'); return; }
      showToast(`اعتبارسنجی کامل شد: ${r.data.checks.length} یافته (${r.data.checks.filter(c => c.severity === 'ERROR').length} مانع جدی).`, 'success');
    } finally {
      setBusy(false);
    }
    reloadDetail(selectedVersionId);
  };

  const handleSubmit = async (note: string) => {
    if (selectedVersionId == null) return;
    const ok = await run(() => submitCurriculumForApprovalAction(selectedVersionId, note));
    if (ok) { reloadOverview(); reloadDetail(selectedVersionId); }
  };

  const handleApprove = async (note: string) => {
    if (selectedVersionId == null) return;
    const ok = await run(() => approveCurriculumAction(selectedVersionId, note));
    if (ok) { reloadOverview(); reloadDetail(selectedVersionId); }
  };

  const handleReject = async (note: string) => {
    if (selectedVersionId == null) return;
    const ok = await run(() => rejectCurriculumAction(selectedVersionId, note));
    if (ok) { setModal(null); reloadOverview(); reloadDetail(selectedVersionId); }
  };

  const handlePublish = async () => {
    if (selectedVersionId == null) return;
    const ok = await run(() => publishCurriculumAction(selectedVersionId));
    if (ok) { reloadOverview(); reloadDetail(selectedVersionId); }
  };

  const handleArchive = async () => {
    if (selectedVersionId == null) return;
    const ok = await run(() => archiveCurriculumAction(selectedVersionId));
    if (ok) { reloadOverview(); reloadDetail(selectedVersionId); }
  };

  const handleCreateRevision = async () => {
    if (selectedVersionId == null) return;
    const ok = await run(() => createCurriculumRevisionAction(selectedVersionId).then(r =>
      r.ok ? { ok: true, message: `نسخهٔ جدید (${r.data.versionCode}) ساخته شد.` } : r
    ));
    if (ok) reloadOverview();
  };

  const handleCreateVersion = async () => {
    const f = newVersionForm;
    if (!f.versionCode.trim() || !f.entryYearFrom) { showToast('کد نسخه و سال ورودی الزامی است.', 'error'); return; }
    const ok = await run(() => createCurriculumVersionAction({
      majorId: selectedMajorId,
      versionCode: f.versionCode.trim(),
      title: f.title.trim() || `برنامهٔ ${majors.find(m => m.id === selectedMajorId)?.name ?? ''} ${f.versionCode.trim()}`,
      entryYearFrom: f.entryYearFrom,
      totalRequiredUnits: f.totalRequiredUnits,
      maxUnitsPerTerm: f.maxUnitsPerTerm || null,
      cloneFromId: f.cloneFromId ? Number(f.cloneFromId) : undefined,
    }));
    if (ok) { setModal(null); setNewVersionForm({ versionCode: '', title: '', entryYearFrom: 1405, totalRequiredUnits: 140, maxUnitsPerTerm: 20, cloneFromId: '' }); reloadOverview(); }
  };

  // ── ویرایش دروس (فقط DRAFT؛ اکشن خودش گیت می‌زند) ──
  const handleAddCourse = async () => {
    if (selectedVersionId == null || !addCourseForm.courseId) return;
    const ok = await run(() => addCourseToCurriculumAction(selectedVersionId, {
      courseId: Number(addCourseForm.courseId),
      roleType: addCourseForm.roleType,
      recommendedSemester: addCourseForm.recommendedSemester ? Number(addCourseForm.recommendedSemester) : null,
    }));
    if (ok) { setModal(null); setAddCourseForm({ courseId: '', roleType: 'CORE', recommendedSemester: '' }); reloadDetail(selectedVersionId); }
  };

  const handleBulkAddCourses = async () => {
    if (selectedVersionId == null || bankSelected.size === 0) return;
    const items = [...bankSelected].map(courseId => ({
      courseId,
      roleType: bulkRoleType,
      recommendedSemester: addCourseForm.recommendedSemester ? Number(addCourseForm.recommendedSemester) : null,
    }));
    const ok = await run(() => bulkAddCoursesAction(selectedVersionId, items));
    if (ok) { closeAddCourse(); reloadDetail(selectedVersionId); }
  };

  const handleRemoveCourse = async (courseId: number) => {
    if (selectedVersionId == null) return;
    const ok = await run(() => removeCourseFromCurriculumAction(selectedVersionId, courseId));
    if (ok) reloadDetail(selectedVersionId);
  };

  const handleAssignSemester = async (courseId: number, semesterNo: number | null) => {
    if (selectedVersionId == null) return;
    await run(() => assignCourseToSemesterAction(selectedVersionId, courseId, semesterNo));
    reloadDetail(selectedVersionId);
  };

  const handleUpdateMaxUnits = async (value: number) => {
    if (selectedVersionId == null) return;
    await run(() => updateCurriculumMetaAction(selectedVersionId, { maxUnitsPerTerm: value || null }));
    reloadDetail(selectedVersionId);
  };

  const handleUpdateRequired = async (courseId: number, isRequired: number) => {
    if (selectedVersionId == null) return;
    await run(() => updateCourseInCurriculumAction(selectedVersionId, courseId, { isRequired }));
    reloadDetail(selectedVersionId);
  };

  const handleUpdateRole = async (courseId: number, roleType: string) => {
    if (selectedVersionId == null) return;
    await run(() => updateCourseInCurriculumAction(selectedVersionId, courseId, { roleType }));
    reloadDetail(selectedVersionId);
  };

  const handleUpdateGradReq = async (courseId: number, isGraduationRequired: number) => {
    if (selectedVersionId == null) return;
    await run(() => updateCourseInCurriculumAction(selectedVersionId, courseId, { isGraduationRequired }));
    reloadDetail(selectedVersionId);
  };

  // ── رندر ──
  const courseCodeOf = new Map((detail?.courses ?? []).map(c => [c.courseId, c.code]));
  const isDraft = (detail?.version.status ?? selectedVersion?.status) === 'DRAFT';

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 p-3 sm:p-6 space-y-5" dir="rtl">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-4 right-4 sm:right-auto sm:left-6 z-50 p-4 rounded-xl shadow-2xl border text-sm font-bold ${
          toast.type === 'success' ? 'bg-emerald-900 text-emerald-100 border-emerald-700'
            : toast.type === 'error' ? 'bg-rose-900 text-rose-100 border-rose-700'
            : 'bg-blue-900 text-blue-100 border-blue-700'
        }`}>
          {toast.type === 'success' ? '✅' : toast.type === 'error' ? '⚠️' : 'ℹ️'} {toast.text}
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-l from-indigo-950 via-indigo-900 to-slate-900 text-white rounded-2xl p-5 shadow-lg border border-indigo-700/50">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-slate-950">ماژول برنامهٔ درسی</span>
              <span className="text-xs text-indigo-200">{faNum(majorVersions.length)} نسخه در {majors.find(m => m.id === selectedMajorId)?.name ?? '—'}</span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">📚 مدیریت نسخه‌های برنامهٔ درسی (چرخهٔ حیات مصوب)</h1>
          </div>
          <button
            onClick={() => setModal('NEW_VERSION')}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 text-slate-950 font-extrabold text-xs shadow-md transition"
          >
            ➕ نسخهٔ جدید
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="text-indigo-200 font-bold block mb-1">رشته / مقطع:</label>
            <select
              value={selectedMajorId}
              onChange={e => { setSelectedMajorId(Number(e.target.value)); setSelectedVersionId(null); setDetail(null); }}
              className="w-full bg-slate-900/90 text-white border border-indigo-400/50 rounded-lg px-2.5 py-2 font-bold"
            >
              {majors.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} — {m.degreeTitle ?? '—'}{m.facultyName ? ` (${m.facultyName}${m.departmentName ? ` / ${m.departmentName}` : ''})` : ''}
                </option>
              ))}
            </select>
            {(() => { const m = majors.find(x => x.id === selectedMajorId); if (!m) return null; return (
              <p className="text-[10px] text-indigo-300 mt-1.5 font-bold">
                {m.facultyName ?? '—'} · {m.departmentName ?? '—'} · {faNum(m.minUnits ?? 0)} واحد الزامی
                {m.tracks && m.tracks.length > 0 ? ` · گرایش: ${m.tracks.join('، ')}` : ''}
              </p>
            ); })()}
          </div>
          <div className="sm:col-span-2 flex items-end">
            <p className="text-[11px] text-indigo-200 leading-relaxed bg-white/5 rounded-xl p-3 border border-white/10">
              هر تغییر پس از تأیید فقط با <b>نسخهٔ جدید (R1, R2,…)</b> انجام می‌شود؛ نسخهٔ تأییدشده هرگز درجا ویرایش نمی‌شود.
              وضعیت هر نسخه و «یافته‌های اعتبارسنجی» (CheckResult) مستقیماً از موتور واقعی خوانده می‌شود.
            </p>
          </div>
        </div>
      </div>

      {/* Versions Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-slate-900 text-sm">🗂️ نسخه‌های این رشته</h3>
          <span className="text-[11px] text-slate-500 font-bold">{isDraft ? 'حالت پیش‌نویس: ویرایش فعال' : 'حالت فقط‌خواندنی (بسته به وضعیت)'}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-white text-center">
                <th className="p-2.5 border border-slate-800">کد نسخه</th>
                <th className="p-2.5 border border-slate-800">عنوان</th>
                <th className="p-2.5 border border-slate-800">ورودی</th>
                <th className="p-2.5 border border-slate-800">واحد الزامی</th>
                <th className="p-2.5 border border-slate-800">تعداد درس</th>
                <th className="p-2.5 border border-slate-800">وضعیت</th>
                <th className="p-2.5 border border-slate-800 w-28">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {majorVersions.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-slate-400 font-bold">هنوز نسخه‌ای برای این رشته ساخته نشده است.</td></tr>
              )}
              {majorVersions.map(v => {
                const st = STATUS_UI[v.status] ?? { label: v.status, cls: 'bg-slate-200 text-slate-800' };
                return (
                  <tr key={v.id} className={`text-center transition ${selectedVersionId === v.id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                    <td className="p-2.5 border border-slate-200 font-mono font-black text-indigo-900">{v.versionCode}</td>
                    <td className="p-2.5 border border-slate-200 font-bold text-slate-800 text-right">{v.title}</td>
                    <td className="p-2.5 border border-slate-200">{faNum(v.entryYearFrom)}{v.entryYearTo ? `–${faNum(v.entryYearTo)}` : ' به بعد'}</td>
                    <td className="p-2.5 border border-slate-200 font-extrabold">{faNum(v.totalRequiredUnits)}</td>
                    <td className="p-2.5 border border-slate-200 font-extrabold">{faNum(v.courseCount)} درس</td>
                    <td className="p-2.5 border border-slate-200">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="p-2.5 border border-slate-200">
                      <button
                        onClick={() => setSelectedVersionId(v.id)}
                        className={`px-3 py-1.5 rounded-lg font-extrabold text-[11px] transition ${
                          selectedVersionId === v.id ? 'bg-indigo-900 text-white' : 'bg-indigo-100 text-indigo-900 hover:bg-indigo-200'
                        }`}
                      >
                        {selectedVersionId === v.id ? 'باز است' : 'باز کردن'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail */}
      {selectedVersion && (
        <div className="space-y-5">
          {/* Detail header + transitions */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-extrabold text-slate-900 text-base">📄 {selectedVersion.title}</h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${(STATUS_UI[selectedVersion.status] ?? { cls: 'bg-slate-200 text-slate-800' }).cls}`}>
                    {(STATUS_UI[selectedVersion.status] ?? { label: selectedVersion.status }).label}
                  </span>
                  {isDraft && <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">✏️ قابل ویرایش</span>}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  کد {selectedVersion.versionCode} · ورودی {faNum(selectedVersion.entryYearFrom)}{selectedVersion.entryYearTo ? ` تا ${faNum(selectedVersion.entryYearTo)}` : ' به بعد'}
                  {' '}· واحد الزامی {faNum(selectedVersion.totalRequiredUnits)}
                  {' '}· سقف ترم {isDraft ? (
                    <span className="inline-flex items-center gap-1.5">
                      <input
                        type="number"
                        defaultValue={detail?.version.maxUnitsPerTerm ?? ''}
                        key={detail?.version.maxUnitsPerTerm ?? 'none'}
                        onBlur={e => { const v = Number(e.target.value); if (v && v !== detail?.version.maxUnitsPerTerm) handleUpdateMaxUnits(v); }}
                        className="w-16 border border-slate-300 rounded px-1.5 py-0.5 font-bold text-center"
                      />
                      <span className="text-[10px] text-slate-400">واحد (Enter/Blur برای ذخیره)</span>
                    </span>
                  ) : `${faNum(detail?.version.maxUnitsPerTerm ?? '—')} واحد`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button onClick={handleValidate} disabled={busy} className="px-3 py-2 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-900 font-extrabold text-[11px] disabled:opacity-50">
                  🔍 اعتبارسنجی کامل
                </button>
                {selectedVersion.status === 'DRAFT' && (
                  <button
                    onClick={() => handleSubmit('')}
                    disabled={busy}
                    className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-[11px] disabled:opacity-50"
                  >
                    📤 ارجاع به بازبینی (REVIEW)
                  </button>
                )}
                {selectedVersion.status === 'REVIEW' && (
                  <>
                    <button onClick={() => handleApprove('')} disabled={busy} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] disabled:opacity-50">
                      ✓ تأیید (APPROVED)
                    </button>
                    <button onClick={() => setModal('REJECT')} disabled={busy} className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[11px] disabled:opacity-50">
                      ✕ رد و بازگشت به پیش‌نویس
                    </button>
                  </>
                )}
                {selectedVersion.status === 'APPROVED' && (
                  <button onClick={handlePublish} disabled={busy} className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[11px] disabled:opacity-50">
                    🚀 انتشار (PUBLISHED)
                  </button>
                )}
                {selectedVersion.status === 'PUBLISHED' && (
                  <button onClick={handleArchive} disabled={busy} className="px-3 py-2 rounded-lg bg-slate-600 hover:bg-slate-700 text-white font-extrabold text-[11px] disabled:opacity-50">
                    🗃️ بایگانی (ARCHIVED)
                  </button>
                )}
                {(selectedVersion.status === 'APPROVED' || selectedVersion.status === 'PUBLISHED' || selectedVersion.status === 'ARCHIVED') && (
                  <button onClick={handleCreateRevision} disabled={busy} className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-[11px] disabled:opacity-50">
                    🔁 ایجاد نسخهٔ جدید (R+1)
                  </button>
                )}
              </div>
            </div>
            {detailLoading && <div className="text-center text-xs text-slate-400 font-bold py-4">در حال بارگذاری جزئیات از سرور…</div>}
          </div>

          {/* Checks */}
          {detail && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
              <h4 className="font-extrabold text-slate-900 text-sm">🧪 نتایج اعتبارسنجی (Validator — از موتور واقعی)</h4>
              {detail.checks.length === 0 && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center text-xs font-bold text-emerald-800">
                  بدون یافته — برنامهٔ درسی سالم است. ✓
                </div>
              )}
              <div className="space-y-2">
                {detail.checks.map((c, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-xl border text-xs space-y-1 ${
                      c.severity === 'ERROR' ? 'bg-rose-50 border-rose-300' : 'bg-amber-50 border-amber-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-black text-slate-900">
                        {c.severity === 'ERROR' ? '⛔' : '⚠️'} {c.check}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                        c.severity === 'ERROR' ? 'bg-rose-200 text-rose-900' : 'bg-amber-200 text-amber-900'
                      }`}>
                        {c.severity === 'ERROR' ? 'مانع تأیید' : 'هشدار'}
                      </span>
                    </div>
                    <p className="text-slate-700 leading-relaxed font-bold">{c.message}</p>
                    {c.affected.length > 0 && (
                      <p className="text-[10px] text-slate-500 font-mono">{c.affected.map(a => faNum(a)).join('، ')}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Courses */}
          {detail && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-slate-900 text-sm">📖 دروس نسخه ({faNum(detail.courses.length)} درس)</h4>
                {isDraft && (
                  <button
                    onClick={() => setModal('ADD_COURSE')}
                    className="px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-[11px]"
                  >
                    ➕ افزودن درس از بانک
                  </button>
                )}
              </div>
              {detail.courses.length === 0 && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs font-bold text-slate-500">
                  هنوز درسی به این نسخه افزوده نشده است.
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white text-center">
                      <th className="p-2.5 border border-slate-800 w-10">ردیف</th>
                      <th className="p-2.5 border border-slate-800">کد</th>
                      <th className="p-2.5 border border-slate-800">عنوان درس</th>
                      <th className="p-2.5 border border-slate-800">واحد</th>
                      <th className="p-2.5 border border-slate-800">نقش</th>
                      <th className="p-2.5 border border-slate-800">ترم پیشنهادی</th>
                      <th className="p-2.5 border border-slate-800">الزامی در ترم</th>
                      <th className="p-2.5 border border-slate-800">الزام پایان‌نامه</th>
                      <th className="p-2.5 border border-slate-800">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.courses.map((c, idx) => (
                      <tr key={c.courseId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                        <td className="p-2 border border-slate-200 text-center text-slate-500 font-bold">{faNum(idx + 1)}</td>
                        <td className="p-2 border border-slate-200 font-mono text-center font-bold text-indigo-900">{c.code}</td>
                        <td className="p-2 border border-slate-200 font-extrabold text-right">{c.title}</td>
                        <td className="p-2 border border-slate-200 text-center font-black">{faNum(c.units)}</td>
                        <td className="p-2 border border-slate-200 text-center">
                          {isDraft ? (
                            <select
                              value={c.roleType}
                              onChange={e => handleUpdateRole(c.courseId, e.target.value)}
                              className="border border-slate-300 rounded px-1.5 py-1 font-bold bg-white"
                            >
                              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="font-bold">{ROLE_LABELS[c.roleType] ?? c.roleType}</span>
                          )}
                        </td>
                        <td className="p-2 border border-slate-200 text-center">
                          {isDraft ? (
                            <select
                              value={c.recommendedSemester ?? ''}
                              onChange={e => handleAssignSemester(c.courseId, e.target.value ? Number(e.target.value) : null)}
                              className="border border-slate-300 rounded px-1.5 py-1 font-bold bg-white"
                            >
                              <option value="">نامشخص</option>
                              {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={s}>ترم {faNum(s)}</option>)}
                            </select>
                          ) : (
                            <span className="font-bold">{c.recommendedSemester ? `ترم ${faNum(c.recommendedSemester)}` : 'نامشخص'}</span>
                          )}
                        </td>
                        <td className="p-2 border border-slate-200 text-center">
                          <input
                            type="checkbox"
                            checked={c.isRequired === 1}
                            disabled={!isDraft}
                            onChange={e => handleUpdateRequired(c.courseId, e.target.checked ? 1 : 0)}
                            className="accent-indigo-700 w-4 h-4"
                          />
                        </td>
                        <td className="p-2 border border-slate-200 text-center">
                          <input
                            type="checkbox"
                            checked={c.isGraduationRequired === 1}
                            disabled={!isDraft}
                            onChange={e => handleUpdateGradReq(c.courseId, e.target.checked ? 1 : 0)}
                            className="accent-indigo-700 w-4 h-4"
                          />
                        </td>
                        <td className="p-2 border border-slate-200 text-center">
                          {isDraft && (
                            <button
                              onClick={() => handleRemoveCourse(c.courseId)}
                              className="px-2 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 font-extrabold text-[10px]"
                            >
                              حذف
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Rules */}
              {(detail.rules.length > 0) && (
                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <h5 className="font-extrabold text-slate-900 text-xs">🔗 قواعد پیش‌نیاز / هم‌نیاز / نمرهٔ قبولی (از course_rules — درخت منطقی)</h5>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    {detail.rules.map((r, i) => (
                      <div key={i} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px]">
                        <span className="font-black text-indigo-900">{courseCodeOf.get(r.courseId) ?? r.courseId}</span>
                        <span className="text-slate-400 mx-1">·</span>
                        <span className="font-bold text-slate-600">
                          {r.ruleType === 'PREREQ' ? 'پیش‌نیاز' : r.ruleType === 'COREQ' ? 'هم‌نیاز' : r.ruleType === 'PASSING_GRADE' ? 'نمرهٔ قبولی' : r.ruleType}
                        </span>
                        <div className="text-slate-700 font-bold mt-1">{describeLogicNode(r.logicTree, code => courseCodeOf.get(Number(code)) ?? code) || '—'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Approvals */}
              {(detail.approvals.length > 0) && (
                <div className="pt-3 border-t border-slate-200 space-y-1.5">
                  <h5 className="font-extrabold text-slate-900 text-xs">📜 تاریخچهٔ تأیید (append-only)</h5>
                  {detail.approvals.map((a, i) => (
                    <div key={a.id ?? i} className="flex items-center justify-between gap-2 bg-indigo-50/60 rounded-lg p-2 text-[11px]">
                      <span className="font-bold text-slate-700">
                        {a.fromStatus} ← {a.toStatus} <span className="text-slate-400">({a.approvalType})</span>
                      </span>
                      <span className="text-slate-500">{faDate(a.approvedAt)}{a.decisionNote ? ` — ${a.decisionNote}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Modal: New version ── */}
      {modal === 'NEW_VERSION' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-5 space-y-3">
            <h3 className="font-extrabold text-slate-900 text-sm">➕ ایجاد نسخهٔ جدید برای «{majors.find(m => m.id === selectedMajorId)?.name}»</h3>
            <div className="space-y-2 text-xs">
              <label className="block font-bold text-slate-700">
                کد نسخه (مثل ۱۴۰۴ یا ۱۴۰۴-R1):
                <input value={newVersionForm.versionCode} onChange={e => setNewVersionForm({ ...newVersionForm, versionCode: e.target.value })}
                  placeholder="1405-R1" className="mt-1 w-full border border-slate-300 rounded-lg p-2 font-mono font-bold" />
              </label>
              <label className="block font-bold text-slate-700">
                عنوان:
                <input value={newVersionForm.title} onChange={e => setNewVersionForm({ ...newVersionForm, title: e.target.value })}
                  placeholder="برنامهٔ …" className="mt-1 w-full border border-slate-300 rounded-lg p-2" />
              </label>
              <label className="block font-bold text-slate-700">
                کپی عمیق از نسخهٔ دیگر (انتقال کاتالوگ — دروس + پیش‌نیازها + ترم‌بندی + نمره‌ها):
                <select
                  value={newVersionForm.cloneFromId}
                  onChange={e => setNewVersionForm({ ...newVersionForm, cloneFromId: e.target.value })}
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2 font-bold bg-white"
                >
                  <option value="">بدون کپی (نسخهٔ خالی)</option>
                  {versions.filter(v => v.id !== selectedVersionId).map(v => (
                    <option key={v.id} value={v.id}>
                      {v.versionCode} — {v.title} ({STATUS_UI[v.status]?.label ?? v.status})
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <label className="block font-bold text-slate-700">
                  ورودی از:
                  <input type="number" value={newVersionForm.entryYearFrom} onChange={e => setNewVersionForm({ ...newVersionForm, entryYearFrom: Number(e.target.value) })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2" />
                </label>
                <label className="block font-bold text-slate-700">
                  کل واحد:
                  <input type="number" value={newVersionForm.totalRequiredUnits} onChange={e => setNewVersionForm({ ...newVersionForm, totalRequiredUnits: Number(e.target.value) })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2" />
                </label>
                <label className="block font-bold text-slate-700">
                  سقف ترم:
                  <input type="number" value={newVersionForm.maxUnitsPerTerm} onChange={e => setNewVersionForm({ ...newVersionForm, maxUnitsPerTerm: Number(e.target.value) })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2" />
                </label>
              </div>
              <p className="text-[10px] text-slate-400 font-bold">
                (کپی عمیق از نسخهٔ مرجع = از دکمهٔ «ایجاد نسخهٔ جدید R+1» روی همان نسخه استفاده کنید)
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModal(null)} className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs">انصراف</button>
              <button onClick={handleCreateVersion} disabled={busy} className="px-5 py-1.5 rounded-lg bg-emerald-700 text-white font-extrabold text-xs disabled:opacity-50">
                ایجاد نسخه
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Add course from bank ── */}
      {modal === 'ADD_COURSE' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-5 space-y-3">
            <h3 className="font-extrabold text-slate-900 text-sm">➕ افزودن درس از بانک دروس</h3>
            <div className="space-y-2 text-xs">
              <label className="block font-bold text-slate-700">
                جستجو در بانک دروس (کد یا عنوان):
                <div className="mt-1 flex gap-2">
                  <input
                    value={bankQuery}
                    onChange={e => setBankQuery(e.target.value)}
                    placeholder="مثلاً ریاضی یا 101…"
                    className="w-full border border-slate-300 rounded-lg p-2 font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => { setBank([]); }}
                    className="px-3 rounded-lg bg-indigo-100 text-indigo-900 font-extrabold text-[10px] shrink-0"
                  >
                    {bankLoading ? '…' : 'به‌روزرسانی'}
                  </button>
                </div>
              </label>
              {bank.length > 0 && (
                <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                  {bank
                    .filter(b => !bankQuery.trim() || String(b.id).includes(bankQuery.trim()) || b.code.includes(bankQuery.trim()) || b.title.includes(bankQuery.trim()))
                    .slice(0, 60)
                    .map(b => (
                      <label key={b.id} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-indigo-50 cursor-pointer text-[11px] font-bold">
                        <input
                          type="checkbox"
                          className="accent-indigo-700 w-3.5 h-3.5 shrink-0"
                          checked={bankSelected.has(b.id)}
                          onChange={e => {
                            const next = new Set(bankSelected);
                            if (e.target.checked) { next.add(b.id); setAddCourseForm(f => ({ ...f, courseId: String(b.id) })); }
                            else next.delete(b.id);
                            setBankSelected(next);
                          }}
                        />
                        <span className="font-mono text-indigo-900 shrink-0">{b.code}</span>
                        <span className="truncate">{b.title}</span>
                        <span className="text-slate-400 shrink-0">({faNum(b.units)} واحد)</span>
                      </label>
                    ))}
                </div>
              )}
              {bankSelected.size > 0 && (
                <p className="text-[10px] font-black text-indigo-700">{faNum(bankSelected.size)} درس انتخاب شد.</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <label className="block font-bold text-slate-700">
                  نقش:
                  <select value={addCourseForm.roleType} onChange={e => setAddCourseForm({ ...addCourseForm, roleType: e.target.value })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 font-bold bg-white">
                    {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="block font-bold text-slate-700">
                  ترم پیشنهادی:
                  <select value={addCourseForm.recommendedSemester} onChange={e => setAddCourseForm({ ...addCourseForm, recommendedSemester: e.target.value })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 font-bold bg-white">
                    <option value="">نامشخص</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={s}>ترم {faNum(s)}</option>)}
                  </select>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={closeAddCourse} className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs">انصراف</button>
              <button onClick={handleAddCourse} disabled={busy || !addCourseForm.courseId} className="px-3 py-1.5 rounded-lg bg-indigo-100 text-indigo-900 font-extrabold text-xs disabled:opacity-50">
                افزودن انتخابی
              </button>
              <button onClick={handleBulkAddCourses} disabled={busy || bankSelected.size === 0} className="px-5 py-1.5 rounded-lg bg-emerald-700 text-white font-extrabold text-xs disabled:opacity-50">
                افزودن {bankSelected.size > 0 ? faNum(bankSelected.size) : ''} درس منتخب
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Reject with note ── */}
      {modal === 'REJECT' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-5 space-y-3">
            <h3 className="font-extrabold text-slate-900 text-sm">✕ رد نسخه و بازگشت به پیش‌نویس</h3>
            <label className="block text-xs font-bold text-slate-700">
              دلیل رد (الزامی):
              <textarea
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                rows={3}
                className="mt-1 w-full border border-slate-300 rounded-lg p-2"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs">انصراف</button>
              <button
                onClick={() => rejectNote.trim() && handleReject(rejectNote.trim())}
                disabled={busy || !rejectNote.trim()}
                className="px-5 py-1.5 rounded-lg bg-rose-600 text-white font-extrabold text-xs disabled:opacity-50"
              >
                ثبت رد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
