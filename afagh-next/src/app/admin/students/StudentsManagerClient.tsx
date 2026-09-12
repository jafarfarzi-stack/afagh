'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getTranscript, getTranscriptRegulation, resetUserPasswordAction, setStudentRegulationAction, setUserActiveAction, type TranscriptRow } from './actions';
import type { RegulationConfig } from '@/lib/regulations-engine';
import { ClientTh, ServerTh, useClientTable, type ColumnDef } from '@/components/DataTable';
import { QUOTA_FA, STUDENT_STATUS_FA, gradeStatusChip, gradeStatusFa, studentStatusChip, studentStatusFa} from '@/lib/student-labels';

// ── هستهٔ خالص و قرارداد داده از ماژول‌های جدا (ریفکتور دور ۱۱) ──
import type { StudentItem, RegulationPick, Pagination, StaffItem, CodeLabels} from './types';
import { regThresholds, groupTranscript, faNum, dateToJalali} from './transcript-utils';
import OfficialTranscriptView from './components/OfficialTranscriptView';
import { adminSetGradeAction, getStudentGradeAuditLog } from '@/app/admin/grades/actions';

/**
 * چاپ مستقیم همان نمای روی صفحه (WYSIWYG) — با کلاس چاپ سراسری:
 * همه‌چیز پنهان می‌شود جز .transcript-print-area (تکنیک visibility).
 */
export function doPrintTranscript(): void {
  if (typeof document === 'undefined') return;
  document.body.classList.add('printing-transcript');
  const done = () => {
    document.body.classList.remove('printing-transcript');
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
  // fallback اگر afterprint نیامد (بستن دستی دیالوگ)
  setTimeout(done, 3000);
}

export default function StudentsManagerClient(props: {
  logoUrl?: string | null;
  codeLabels?: CodeLabels | null;
  regulations?: RegulationPick[];
  students: StudentItem[];
  staffList: StaffItem[];
  pagination?: Pagination;
  degrees?: { id: number; title: string }[];
  statusCounts?: { status: string; n: number }[];
  canEditGrades?: boolean;
}) {
  // انتخاب بخش اصلی (دانشجویان / اساتید / عملیات سریع)
  const [mainView, setMainView] = useState<'students' | 'professors' | 'quick_menu'>('students');

  // تب‌های فرم دانشجو — لیست اول است و ۴ تب اطلاعات در یک تب ادغام شده‌اند
  const [stuTab, setStuTab] = useState<'list' | 'info_combined' | 'transcript'>('list');
  const [stuSubTab, setStuSubTab] = useState<'extra' | 'alumni'>('extra');

  // تب‌های فرم استاد — لیست اول است و ۳ تب اطلاعات در یک تب ادغام شده‌اند
  const [profTab, setProfTab] = useState<'list' | 'info_combined'>('list');

  // ناوبری و انتخاب
  const [selectedStuIdx, setSelectedStuIdx] = useState<number>(0);
  const [selectedProfIdx, setSelectedProfIdx] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>(props.pagination?.q ?? '');
  const [toastMsg, setToastMsg] = useState<string>('');
  const [quickActionModal, setQuickActionModal] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptRow[] | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  // پیکربندی اجرایی آیین‌نامه ملاک دانشجو (مبنای قبولی/مشروطی کارنامه)
  const [regConfig, setRegConfig] = useState<RegulationConfig | null>(null);
  // نمای کارنامه: رسمی (پیش‌فرض) یا جدول سادهٔ نمرات
  const [transcriptView, setTranscriptView] = useState<'official' | 'simple'>('official');

  // مودال ثبت / اصلاح نمره
  const [gradeEditTarget, setGradeEditTarget] = useState<TranscriptRow | null>(null);
  const [gradeEditModalOpen, setGradeEditModalOpen] = useState(false);
  const [gradeValueInput, setGradeValueInput] = useState<string>('');
  const [gradeReasonInput, setGradeReasonInput] = useState<string>('');
  const [gradeSaving, setGradeSaving] = useState(false);

  // مودال تاریخچه لاگ تغییرات نمره
  const [auditLogModalOpen, setAuditLogModalOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);

  // ── مدیریت حساب وب کاربر (فعال/غیرفعال + تغییر رمز — فقط ADMIN) ──
  const [pwModalFor, setPwModalFor] = useState<{ userId: number; name: string } | null>(null);
  const [pwInput, setPwInput] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const handleToggleActive = async (userId: number | null | undefined, next: boolean, name: string) => {
    if (!userId) { showToast('شناسه کاربری این پرونده یافت نشد.'); return; }
    if (!confirm(`دسترسی وب «${name}» ${next ? 'فعال' : 'غیرفعال'} شود؟`)) return;
    const r = await setUserActiveAction(userId, next).catch(() => ({ ok: false, error: 'خطا در ارتباط با سرور.' }));
    showToast(r.ok ? (next ? '✅ دسترسی وب فعال شد.' : '⛔ دسترسی وب غیرفعال شد.') : (r.error || 'انجام نشد.'));
    if (r.ok) router.refresh();
  };
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwModalFor) return;
    setPwSaving(true);
    try {
      const r = await resetUserPasswordAction(pwModalFor.userId, pwInput);
      showToast(r.ok ? `✅ رمز «${pwModalFor.name}» تغییر کرد (در اولین ورود باید عوض شود).` : (r.error || 'انجام نشد.'));
      if (r.ok) { setPwModalFor(null); setPwInput(''); router.refresh(); }
    } finally {
      setPwSaving(false);
    }
  };

  const openEditGrade = (row: TranscriptRow) => {
    setGradeEditTarget(row);
    setGradeValueInput(row.gradeValue ?? '');
    setGradeReasonInput('');
    setGradeEditModalOpen(true);
  };

  const handleSaveGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentStudent || !gradeEditTarget) return;
    const num = gradeValueInput.trim() === '' ? null : Number(gradeValueInput.trim());
    if (num !== null && (isNaN(num) || num < 0 || num > 20)) {
      showToast('نمره باید بین ۰ تا ۲۰ باشد.');
      return;
    }
    if (!gradeReasonInput.trim()) {
      showToast('لطفاً دلیل تغییر را وارد کنید.');
      return;
    }
    setGradeSaving(true);
    try {
      const res = await adminSetGradeAction({ ok: false }, {
        enrollmentId: gradeEditTarget.enrollmentId,
        offeringId: gradeEditTarget.offeringId,
        studentId: currentStudent.id,
        studentCode: currentStudent.studentCode,
        termCode: gradeEditTarget.termCode,
        courseCode: gradeEditTarget.courseCode,
        gradeValue: num,
        reason: gradeReasonInput.trim(),
      });
      if (res.ok) {
        showToast(res.message || 'نمره با موفقیت ثبت شد.');
        setGradeEditModalOpen(false);
        setTranscriptLoading(true);
        getTranscript(currentStudent.id).then(r => setTranscript(r)).catch(() => setTranscript([])).finally(() => setTranscriptLoading(false));
      } else {
        showToast(res.error || 'خطا در ثبت نمره.');
      }
    } catch (err: any) {
      showToast(err?.message || 'خطا در ارتباط با سرور.');
    } finally {
      setGradeSaving(false);
    }
  };

  const openAuditLogs = async () => {
    if (!currentStudent) return;
    setAuditLogModalOpen(true);
    setAuditLogsLoading(true);
    try {
      const logs = await getStudentGradeAuditLog(currentStudent.id);
      setAuditLogs(logs);
    } catch {
      setAuditLogs([]);
    } finally {
      setAuditLogsLoading(false);
    }
  };

  const currentStudent = props.students[selectedStuIdx] || props.students[0];
  const currentStaff = props.staffList[selectedProfIdx] || props.staffList[0];

  useEffect(() => {
    if (stuTab !== 'transcript' || !currentStudent) return;
    setTranscriptLoading(true);
    setTranscript(null);
    setRegConfig(null);
    getTranscript(currentStudent.id).then(r => setTranscript(r)).catch(() => setTranscript([])).finally(() => setTranscriptLoading(false));
    getTranscriptRegulation(currentStudent.id).then(r => setRegConfig(r?.config ?? null)).catch(() => setRegConfig(null));
  }, [stuTab, currentStudent?.id]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4000);
  };

  const router = useRouter();
  const pathname = usePathname();
  const pg = props.pagination;
  // جست‌وجوی دانشجو سمت سرور است (props.students فقط یک صفحه است)؛ جست‌وجوی استاد محلی
  const [staffQuery, setStaffQuery] = useState('');
  const [staffVisible, setStaffVisible] = useState(100);
  const nav = (patch: Record<string, string>) => {
    const cur = {
      q: pg?.q ?? '', status: pg?.status ?? 'ALL', degree: String(pg?.degree ?? 0), page: '1',
      sort: pg?.sort ?? '', f_code: pg?.f_code ?? '', f_name: pg?.f_name ?? '', f_nc: pg?.f_nc ?? '',
      f_major: pg?.f_major ?? '', f_year: pg?.f_year ?? '', ...patch,
    };
    const p = new URLSearchParams();
    if (cur.q) p.set('q', cur.q);
    if (cur.status && cur.status !== 'ALL') p.set('status', cur.status);
    if (cur.degree && cur.degree !== '0') p.set('degree', cur.degree);
    if (cur.page && cur.page !== '1') p.set('page', cur.page);
    if (cur.sort) p.set('sort', cur.sort);
    if (cur.f_code) p.set('f_code', cur.f_code);
    if (cur.f_name) p.set('f_name', cur.f_name);
    if (cur.f_nc) p.set('f_nc', cur.f_nc);
    if (cur.f_major) p.set('f_major', cur.f_major);
    if (cur.f_year) p.set('f_year', cur.f_year);
    router.push(`${pathname}?${p.toString()}`);
  };
  // سورت ستونی دانشجویان (سروری): key -> asc -> desc -> بدون سورت
  const [stuSortKey, stuSortDir] = (pg?.sort ?? '').split(':') as [string, string?];
  const toggleStuSort = (key: string) => {
    if (stuSortKey !== key) nav({ sort: `${key}:asc` });
    else if (stuSortDir === 'asc') nav({ sort: `${key}:desc` });
    else nav({ sort: '' });
  };
  // فیلترهای ستونی (لوکال + اعمال با Enter)
  const [stuFilters, setStuFilters] = useState({ f_code: pg?.f_code ?? '', f_name: pg?.f_name ?? '', f_nc: pg?.f_nc ?? '', f_major: pg?.f_major ?? '', f_year: pg?.f_year ?? '' });
  const applyStuFilters = () => nav({ f_code: stuFilters.f_code.trim(), f_name: stuFilters.f_name.trim(), f_nc: stuFilters.f_nc.trim(), f_major: stuFilters.f_major.trim(), f_year: stuFilters.f_year.trim() });

  const staffQueryFiltered = props.staffList.filter(s =>
    !staffQuery ||
    s.staffCode.includes(staffQuery) ||
    s.nationalCode.includes(staffQuery) ||
    (s.firstName + ' ' + s.lastName).includes(staffQuery)
  );

  // جدول اساتید: سورت + فیلتر هر ستون (کلاینتی — کل لیست دست مرورگر است)
  const STAFF_COLS: ColumnDef<StaffItem>[] = [
    { key: 'staffCode', label: 'کد استاد', get: s => s.staffCode },
    { key: 'name', label: 'نام و نام خانوادگی', get: s => `${s.firstName} ${s.lastName}` },
    { key: 'nationalCode', label: 'کد ملی', get: s => s.nationalCode },
    { key: 'department', label: 'گروه آموزشی', get: s => s.departmentName && s.departmentName !== '—' ? s.departmentName : '' },
    { key: 'rank', label: 'مرتبه علمی', get: s => s.academicRank },
    { key: 'degree', label: 'مدرک', get: s => s.degree },
    { key: 'coop', label: 'نوع همکاری', get: s => s.staffType },
  ];
  const staffTable = useClientTable(staffQueryFiltered, STAFF_COLS);
  const filteredStaff = staffTable.visible;

  return (
    <div className="space-y-4 font-sans text-xs text-slate-900">
      
      {/* ─── نوار سوئیچ بین بخش دانشجویان، اساتید و منوی عملیات سریع ─── */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-800 text-white p-2.5 px-4 rounded-xl shadow-md border border-slate-700">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMainView('students')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
              mainView === 'students' ? 'bg-emerald-600 text-white shadow' : 'bg-slate-700/80 hover:bg-slate-700 text-slate-200'
            }`}
          >
            <span>👨‍🎓</span>
            <span>فرم پرونده و ثبت‌نام دانشجو</span>
          </button>

          <button
            onClick={() => setMainView('professors')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
              mainView === 'professors' ? 'bg-indigo-600 text-white shadow' : 'bg-slate-700/80 hover:bg-slate-700 text-slate-200'
            }`}
          >
            <span>👨‍🏫</span>
            <span>معرفی و پرونده اساتید</span>
          </button>

          <button
            onClick={() => setMainView('quick_menu')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
              mainView === 'quick_menu' ? 'bg-amber-600 text-white shadow' : 'bg-slate-700/80 hover:bg-slate-700 text-slate-200'
            }`}
          >
            <span>⚡</span>
            <span>کاشی‌ها و عملیات سریع</span>
          </button>
        </div>

        <div className="text-[11px] text-slate-300 font-mono">
          {mainView === 'students' ? `دانشجو: ${currentStudent?.studentCode || '—'}` : `استاد: ${currentStaff?.staffCode || '—'}`}
        </div>
      </div>

      {toastMsg && (
        <div className="p-3 bg-emerald-100 text-emerald-900 font-bold border border-emerald-300 rounded-xl shadow-sm text-center animate-fade">
          {toastMsg}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ۱. فرم پرونده و ثبت‌نام دانشجو (مطابق تصاویر ۱ تا ۴)             */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {mainView === 'students' && (
        <div className="bg-slate-200 p-2 sm:p-4 rounded-xl border border-slate-400 shadow-xl space-y-2">
          
          {/* تب‌های اصلی بالای فرم ثبت‌نام دانشجو — لیست اول + اطلاعات ادغام‌شده */}
          <div className="flex flex-wrap items-center gap-1 border-b border-slate-400 pb-1 text-slate-800">
            <button
              onClick={() => setStuTab('list')}
              className={`px-3 py-1.5 font-bold rounded-t-md border-t border-x transition-colors ${
                stuTab === 'list' ? 'bg-white border-slate-400 text-indigo-950 shadow-sm' : 'bg-slate-300 border-transparent hover:bg-slate-100'
              }`}
            >
              📋 لیست دانشجویان
            </button>
            <button
              onClick={() => setStuTab('info_combined')}
              className={`px-3 py-1.5 font-bold rounded-t-md border-t border-x transition-colors ${
                stuTab === 'info_combined' ? 'bg-white border-slate-400 text-indigo-950 shadow-sm' : 'bg-slate-300 border-transparent hover:bg-slate-100'
              }`}
            >
              📄 اطلاعات دانشجو (اصلی + تکمیلی + سایر + اضافی)
            </button>
            <button
              onClick={() => setStuTab('transcript')}
              className={`px-3 py-1.5 font-bold rounded-t-md border-t border-x transition-colors ${
                stuTab === 'transcript' ? 'bg-white border-slate-400 text-indigo-950 shadow-sm' : 'bg-emerald-50 border-transparent hover:bg-emerald-100 text-emerald-900'
              }`}
            >
              📊 کارنامه و نمرات
            </button>
          </div>

          {/* نوار سربرگ شماره دانشجویی و ناوبری رکورد */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100 p-2 border border-slate-300 rounded">
            <div className="flex items-center gap-1">
              <button
                onClick={() => selectedStuIdx > 0 && setSelectedStuIdx(selectedStuIdx - 1)}
                disabled={selectedStuIdx === 0}
                className="px-2 py-1 bg-white border border-slate-400 rounded hover:bg-slate-50 disabled:opacity-40"
              >
                قبلی ▶
              </button>
              <button
                onClick={() => selectedStuIdx < props.students.length - 1 && setSelectedStuIdx(selectedStuIdx + 1)}
                disabled={selectedStuIdx === props.students.length - 1}
                className="px-2 py-1 bg-white border border-slate-400 rounded hover:bg-slate-50 disabled:opacity-40"
              >
                ◀ بعدی
              </button>
              <span className="text-[11px] text-slate-500 mr-2 font-mono">
                پرونده {selectedStuIdx + 1} از {props.students.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-bold text-red-700">* شماره دانشجویی:</span>
              <input
                type="text"
                value={currentStudent?.studentCode || ''}
                readOnly
                className="bg-yellow-300 text-slate-950 font-mono font-bold text-sm px-3 py-1 border border-slate-500 rounded text-center w-36 tracking-wider shadow-inner"
              />
              <span className="text-[11px] text-slate-600 mr-2">نام و نام خانوادگی:</span>
              <b className="text-slate-900 bg-white px-3 py-1 border border-slate-300 rounded font-bold">
                {currentStudent ? `${currentStudent.lastName} - ${currentStudent.firstName}` : '—'}
              </b>
            </div>
          </div>

          {/* ── تب ادغام‌شده: اطلاعات دانشجو (۴ بخش) — بخش ۱: اطلاعات دانشجویان ── */}
          {stuTab === 'info_combined' && currentStudent && (
            <div key={`stu-a-${currentStudent.id}`} className="bg-white p-3 sm:p-5 border border-slate-400 rounded-b-md space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* ستون ۱ */}
                <div className="space-y-1.5 border border-slate-300 p-2.5 rounded bg-slate-50/50">
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-red-700 font-bold">* کد ترم ورود:</span>
                    <input type="text" defaultValue={`${currentStudent.entryYear}1`} className="bg-white border border-slate-300 px-2 py-1 rounded font-mono" />
                    <span className="text-slate-500 text-[10px]">* شروع: {currentStudent.entryYear}/۰۷/۰۱</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-red-700 font-bold">* نام خانوادگی و نام:</span>
                    <input type="text" defaultValue={`${currentStudent.lastName} - ${currentStudent.firstName}`} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-bold" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>نام پدر:</span>
                    <input type="text" defaultValue={currentStudent.fatherName || '—'} className="bg-white border border-slate-300 px-2 py-1 rounded" />
                    <div className="flex items-center gap-1">
                      <span>جنس:</span>
                      <select
                        key={`gender-${currentStudent.id}`}
                        defaultValue={currentStudent.gender === 'FEMALE' ? 'زن' : currentStudent.gender === 'MALE' ? 'مرد' : ''}
                        className="bg-white border border-slate-300 px-1 py-1 rounded"
                      >
                        <option value="">—</option>
                        <option value="مرد">مرد</option>
                        <option value="زن">زن</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-red-700 font-bold">* تاریخ تولد:</span>
                    <input type="text" defaultValue={dateToJalali(currentStudent.birthDate)} className="bg-white border border-slate-300 px-2 py-1 rounded font-mono" title={currentStudent.birthDate ? `میلادی: ${currentStudent.birthDate}` : undefined} />
                    <div className="flex items-center gap-1">
                      <span>ش. شناسنامه:</span>
                      <input type="text" defaultValue={currentStudent.birthCertNo || '—'} className="bg-white border border-slate-300 px-1 py-1 rounded font-mono w-full" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-red-700 font-bold">* کد ملی:</span>
                    <input type="text" defaultValue={currentStudent.nationalCode} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-mono font-bold" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>محل صدور:</span>
                    <input type="text" defaultValue={currentStudent.placeOfIssue || '—'} className="bg-white border border-slate-300 px-2 py-1 rounded" />
                    <span>محل تولد: {currentStudent.placeOfBirth || '—'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>وضعیت تحصیلی:</span>
                    <select key={currentStudent.id} defaultValue={currentStudent.status} className="col-span-2 bg-emerald-50 text-emerald-900 border border-emerald-300 px-2 py-1 rounded font-bold">
                      {Object.entries(STUDENT_STATUS_FA).map(([v, fa]) => (
                        <option key={v} value={v}>{fa}</option>
                      ))}
                    </select>
                  </div>
                  {currentStudent.samaStatusCode && (
                    <div className="grid grid-cols-3 gap-2 items-center text-[11px] text-slate-500">
                      <span>وضعیت در سما:</span>
                      <span className="col-span-2">کد {currentStudent.samaStatusCode} — {studentStatusFa(currentStudent.status, currentStudent.samaStatusCode)}</span>
                    </div>
                  )}
                </div>

                {/* ستون ۲ */}
                <div className="space-y-1.5 border border-slate-300 p-2.5 rounded bg-slate-50/50">
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-red-700 font-bold">* نوع دوره:</span>
                    <select key={currentStudent.id + '-sm'} defaultValue={currentStudent.studyingMode || ''} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-semibold">
                      <option value="">—</option>
                      <option value="روزانه">روزانه</option>
                      <option value="شبانه">نوبت دوم / شبانه</option>
                      <option value="غیرانتفاعی">غیرانتفاعی</option>
                      <option value="پیام نور">پیام نور</option>
                      <option value="مجازی">مجازی</option>
                      <option value="بین‌الملل">بین‌الملل</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-red-700 font-bold">* مقطع:</span>
                    <select key={currentStudent.id + '-dl'} defaultValue={currentStudent.degreeLevelId} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-semibold">
                      {(props.degrees ?? []).map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-red-700 font-bold">* کد و نام رشته:</span>
                    <input type="text" defaultValue={`${currentStudent.majorCode} — ${currentStudent.majorName}`} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-bold" readOnly />
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>دانشکده:</span>
                    <input type="text" defaultValue={currentStudent.facultyName || '—'} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded" readOnly />
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-red-700 font-bold">* سهمیه نهایی:</span>
                    <select key={currentStudent.id + '-q'} defaultValue={currentStudent.quotaType} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded">
                      {Object.entries(QUOTA_FA).map(([v, fa]) => (
                        <option key={v} value={v}>{fa}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-red-700 font-bold">* نحوه ورود:</span>
                    <select key={currentStudent.id + '-at'} defaultValue={currentStudent.acceptanceType || ''} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded">
                      <option value="">—</option>
                      <option value="سنجش و آزمون سراسری">سنجش و آزمون سراسری</option>
                      <option value="پذیرش بر اساس سوابق تحصیلی">پذیرش بر اساس سوابق تحصیلی</option>
                      <option value="انتقال و میهمانی">انتقال و میهمانی</option>
                      <option value="بین‌الملل">بین‌الملل</option>
                      <option value="میهمان">میهمان</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>شماره همراه:</span>
                    <input type="text" defaultValue={currentStudent.mobile && currentStudent.mobile !== '—' ? currentStudent.mobile : ''} placeholder="—" className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-mono" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>آیین‌نامه ملاک:</span>
                    <div className="col-span-2 flex gap-1.5">
                      <select
                        value={currentStudent.regulationId ?? 0}
                        onChange={e => {
                          const rid = Number(e.target.value);
                          if (!rid || !currentStudent) return;
                          setStudentRegulationAction(currentStudent.id, rid).then(r => {
                            showToast(r.ok ? 'آیین‌نامه دانشجو تغییر کرد.' : (r.error || 'انجام نشد.'));
                            if (r.ok) router.refresh();
                          }).catch(() => showToast('انجام نشد.'));
                        }}
                        className="flex-1 bg-white border border-slate-300 px-2 py-1 rounded font-semibold text-indigo-950"
                      >
                        <option value={0} disabled>{currentStudent.regulationTitle}</option>
                        {(props.regulations ?? []).map(r => (
                          <option key={r.id} value={r.id}>{r.title}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {/* ── حساب وب دانشجو: فعال/غیرفعال + تغییر رمز (فقط ADMIN) ── */}
                  <div className="grid grid-cols-3 gap-2 items-center border-t border-slate-200 pt-2 mt-2">
                    <span className="font-bold">🔐 حساب وب:</span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full text-center ${currentStudent.isActive === 0 ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {currentStudent.isActive === 0 ? '⛔ غیرفعال' : '✅ فعال'}
                    </span>
                    <div className="flex gap-1.5 justify-end">
                      <button
                        onClick={() => handleToggleActive(currentStudent.userId, currentStudent.isActive === 0, `${currentStudent.firstName} ${currentStudent.lastName}`)}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold border ${currentStudent.isActive === 0 ? 'bg-emerald-700 text-white hover:bg-emerald-800' : 'bg-red-50 text-red-800 border-red-300 hover:bg-red-100'}`}
                        title="فعال/غیرفعال‌سازی ورود به وب (فقط مدیر سیستم)"
                      >
                        {currentStudent.isActive === 0 ? 'فعال‌سازی وب' : 'غیرفعال‌سازی وب'}
                      </button>
                      <button
                        onClick={() => { setPwModalFor({ userId: currentStudent.userId ?? 0, name: `${currentStudent.firstName} ${currentStudent.lastName}` }); setPwInput(''); }}
                        className="px-2.5 py-1 rounded text-[11px] font-bold bg-slate-700 text-white hover:bg-slate-800"
                        title="تغییر رمز عبور دانشجو (فقط مدیر سیستم)"
                      >
                        🔑 تغییر رمز
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── بخش ۲: اطلاعات تکمیلی دانشجو ── */}
          {stuTab === 'info_combined' && currentStudent && (
            <div key={`stu-b-${currentStudent.id}`} className="bg-white p-3 sm:p-5 border border-slate-400 rounded-b-md space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* کادر عکس پرسنلی */}
                <div className="border border-slate-300 p-3 rounded bg-slate-50 flex flex-col items-center justify-center space-y-2">
                  <div className="w-28 h-36 bg-slate-200 border-2 border-slate-400 rounded flex flex-col items-center justify-center text-slate-500 shadow-inner">
                    <span className="text-3xl">👤</span>
                    <span className="text-[10px] mt-1 font-bold">عکس پرسنلی</span>
                  </div>
                  <div className="flex flex-col gap-1 w-full max-w-[140px]">
                    <button onClick={() => showToast('📁 کادر انتخاب تصویر باز شد')} className="px-2 py-1 bg-white border border-slate-300 rounded hover:bg-slate-100 font-bold text-[11px]">فایل تصویر</button>
                    <button onClick={() => showToast('تصویر حذف گردید')} className="px-2 py-1 bg-white border border-slate-300 rounded hover:bg-slate-100 text-red-700 text-[11px]">حذف تصویر</button>
                    <button onClick={() => showToast('کپی تصویر انجام شد')} className="px-2 py-1 bg-white border border-slate-300 rounded hover:bg-slate-100 text-[11px]">کپی تصویر به فایل</button>
                  </div>
                </div>

                {/* فیلدهای تکمیلی */}
                <div className="md:col-span-2 space-y-2 border border-slate-300 p-3 rounded bg-slate-50">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-24">استاد راهنما:</span>
                      <input type="text" defaultValue="" className="bg-yellow-100 border border-slate-300 px-2 py-1 rounded w-full font-bold" placeholder="—" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-24">وضعیت نظام وظیفه:</span>
                      <select className="bg-white border border-slate-300 px-2 py-1 rounded w-full">
                        <option>معافیت تحصیلی فعال</option>
                        <option>کارت پایان خدمت</option>
                        <option>معافیت دائم</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-24">وضعیت مدارک:</span>
                      <select className="bg-white border border-slate-300 px-2 py-1 rounded w-full">
                        <option>تکمیل و تأییدشده ✓</option>
                        <option>دارای نقص مدرک</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-24">نوع بورسیه:</span>
                      <input type="text" defaultValue="" className="bg-white border border-slate-300 px-2 py-1 rounded w-full" placeholder="—" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-24">Full Name:</span>
                      <input type="text" defaultValue={[currentStudent.firstNameEn, currentStudent.lastNameEn].filter(Boolean).join(' ') || '—'} className="bg-white border border-slate-300 px-2 py-1 rounded w-full font-mono text-left" dir="ltr" readOnly />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-24">Father Name:</span>
                      <input type="text" defaultValue={currentStudent.fatherName || '—'} className="bg-white border border-slate-300 px-2 py-1 rounded w-full font-mono text-left" dir="ltr" readOnly />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-24">شماره پاسپورت:</span>
                      <input type="text" defaultValue={currentStudent.passportNumber || '—'} className="bg-white border border-slate-300 px-2 py-1 rounded w-full font-mono" readOnly />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-24">تاریخ فارغ‌التحصیلی:</span>
                      <input type="text" defaultValue={currentStudent.graduateDate || '—'} className="bg-white border border-slate-300 px-2 py-1 rounded w-full font-mono" readOnly />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-1 border-t border-slate-200">
                    <label className="flex items-center gap-1.5 cursor-pointer font-bold">
                      <input type="checkbox" defaultChecked className="w-4 h-4 text-emerald-600 rounded" />
                      <span>تابعیت ایرانی دارد</span>
                    </label>
                    <span className="text-slate-500">سال‌های استفاده از آموزش رایگان:</span>
                    <input type="number" defaultValue="۰" className="w-16 bg-white border border-slate-300 px-2 py-0.5 rounded font-mono text-center" />
                  </div>
                </div>
              </div>

              {/* کادر نمره آزمون زبان و ممیزی ثبت‌کننده */}
              <div className="border border-slate-300 p-2.5 rounded bg-slate-50 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-800">وضعیت نمره آزمون زبان انگلیسی:</span>
                  <span>نوع آزمون:</span>
                  <select className="bg-white border border-slate-300 px-2 py-1 rounded">
                    <option>MSRT</option>
                    <option>Tolimo</option>
                    <option>IELTS</option>
                    <option>TOEFL</option>
                  </select>
                  <span>نمره آزمون:</span>
                  <input type="text" defaultValue="۷۸" className="w-20 bg-white border border-slate-300 px-2 py-1 rounded font-mono text-center font-bold" />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 text-[11px] text-slate-600">
                  <div className="bg-white p-1.5 border border-slate-200 rounded">
                    <span>اولین ثبت‌کننده: </span>
                    <b className="text-slate-800">کارشناس ثبت‌نام (خانم نجفی)</b> | ساعت: ۱۳:۱۵ | تاریخ: ۱۴۰۳/۰۶/۲۵
                  </div>
                  <div className="bg-white p-1.5 border border-slate-200 rounded">
                    <span>آخرین تغییرات: </span>
                    <b className="text-slate-800">مدیر آموزش</b> | ساعت: ۱۰:۴۵ | تاریخ: ۱۴۰۵/۰۶/۰۸
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── بخش ۳: سایر اطلاعات ── */}
          {stuTab === 'info_combined' && currentStudent && (
            <div key={`stu-c-${currentStudent.id}`} className="bg-white p-3 sm:p-5 border border-slate-400 rounded-b-md space-y-3">
              {/* بخش خوابگاه و آدرس */}
              <div className="border border-slate-300 p-2.5 rounded bg-slate-50 space-y-1.5">
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span>نام خوابگاه و شماره اتاق:</span>
                  <input type="text" defaultValue="خوابگاه شهید چمران" className="bg-yellow-100 border border-slate-300 px-2 py-1 rounded font-bold" />
                  <input type="text" defaultValue="اتاق ۲۰۴" className="bg-white border border-slate-300 px-2 py-1 rounded text-center" />
                </div>
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span>عنوان و شغل ولی/قیم:</span>
                  <input type="text" defaultValue="کارمند" className="bg-white border border-slate-300 px-2 py-1 rounded" />
                  <div className="flex items-center gap-1">
                    <span>تلفن ولی:</span>
                    <input type="text" defaultValue="۰۲۱-۶۶۵۴۳۲۱۰" className="bg-white border border-slate-300 px-2 py-1 rounded font-mono w-full" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span>کد پستی و ایمیل:</span>
                  <input type="text" defaultValue="14156-83491" className="bg-white border border-slate-300 px-2 py-1 rounded font-mono" />
                  <input type="email" defaultValue="ali.rezaei@student.afagh.ac.ir" className="bg-white border border-slate-300 px-2 py-1 rounded font-mono text-left" dir="ltr" />
                </div>
              </div>

              {/* ماتریس سوابق مقاطع قبلی */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border border-slate-300 p-2.5 rounded bg-slate-50 space-y-1">
                  <h4 className="font-bold text-slate-800 border-b pb-1">سوابق دوره پیش‌دانشگاهی / دیپلم:</h4>
                  <p>محل اخذ: دبیرستان البرز تهران</p>
                  <p>سال اخذ: ۱۴۰۳ | معدل کتبی دیپلم: <b className="text-emerald-800">۱۸.۷۵</b></p>
                </div>
                <div className="border border-slate-300 p-2.5 rounded bg-slate-50 space-y-1">
                  <h4 className="font-bold text-slate-800 border-b pb-1">اطلاعات وضعیت شهریه‌پرداز:</h4>
                  <p>نوع دوره: روزانه (آموزش رایگان دولتی)</p>
                  <label className="flex items-center gap-1.5 font-bold mt-1">
                    <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded" />
                    <span>دانشجوی شهریه‌پرداز است (نوبت دوم/پردیس)</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* ── بخش ۴: اطلاعات اضافی و دانش‌آموختگان ── */}
          {stuTab === 'info_combined' && currentStudent && (
            <div key={`stu-d-${currentStudent.id}`} className="bg-white p-3 sm:p-5 border border-slate-400 rounded-b-md space-y-3">
              {/* زیرتب‌ها */}
              <div className="flex items-center gap-2 border-b border-slate-300 pb-2">
                <button
                  onClick={() => setStuSubTab('extra')}
                  className={`px-3 py-1 rounded font-bold ${
                    stuSubTab === 'extra' ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  📄 اطلاعات اضافی و پرونده
                </button>
                <button
                  onClick={() => setStuSubTab('alumni')}
                  className={`px-3 py-1 rounded font-bold ${
                    stuSubTab === 'alumni' ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  🎓 اطلاعات دانش‌آموختگان و تسویه‌ها
                </button>
              </div>

              {stuSubTab === 'extra' && (
                <div className="grid grid-cols-2 gap-3 border border-slate-300 p-3 rounded bg-slate-50">
                  <div className="space-y-1.5">
                    <p>نوع دیپلم پایه: ریاضی و فیزیک (نظری)</p>
                    <p>کد صحت مدارک: ۹۸۴۲۱۰-SHAT</p>
                    <p>ابطال نظام وظیفه: در حال تحصیل (معافیت موقت)</p>
                    <p>تعداد صدور گواهی ۳ ماهه: ۰ فقره</p>
                    <p>شماره پرونده شمس: AF-2026-9481</p>
                  </div>
                  <div className="space-y-1.5">
                    <p>تعداد ترم معادل‌سازی: ۰ ترم</p>
                    <p>وضعیت صدور کارت دانشجویی: <b className="text-emerald-700">صادر و تحویل شده</b></p>
                    <p>نواقص پرونده: <b className="text-emerald-700">فاقد نقص پرونده</b></p>
                    <p>واحد مانده تا فارغ‌التحصیلی: ۱۱۸ واحد</p>
                  </div>
                </div>
              )}

              {stuSubTab === 'alumni' && (
                <div className="space-y-3 border border-slate-300 p-3 rounded bg-slate-50">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="border border-slate-200 p-2 rounded bg-white">
                      <p className="font-bold text-slate-800">📜 دانشنامه رسمی</p>
                      <p className="text-[11px] text-slate-500 mt-1">تاریخ صدور: —</p>
                      <p className="text-[11px] text-slate-500">شماره دبیرخانه: —</p>
                    </div>
                    <div className="border border-slate-200 p-2 rounded bg-white">
                      <p className="font-bold text-slate-800">📑 ریزنمرات رسمی</p>
                      <p className="text-[11px] text-slate-500 mt-1">تاریخ صدور: —</p>
                      <p className="text-[11px] text-slate-500">شماره دبیرخانه: —</p>
                    </div>
                    <div className="border border-slate-200 p-2 rounded bg-white">
                      <p className="font-bold text-slate-800">📄 گواهی موقت پایان تحصیلات</p>
                      <p className="text-[11px] text-slate-500 mt-1">تاریخ صدور: —</p>
                      <p className="text-[11px] text-slate-500">شماره دبیرخانه: —</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-around bg-slate-100 p-2 rounded border border-slate-200 font-semibold text-[11px]">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded" />
                      <span>تسویه حساب داخلی دانشکده</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded" />
                      <span>نامه لغو تعهد آموزش رایگان</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded" />
                      <span>نامه عدم بدهی صندوق رفاه دانشجویان</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded" />
                      <span>تأیید اصالت و صدور QRCode دانشنامه</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── تب ۵: کارنامهٔ رسمی + جدول نمرات ── */}
          {stuTab === 'transcript' && currentStudent && (
            <div key={`stu-tr-${currentStudent.id}`} className="transcript-print-area bg-white p-3 sm:p-4 border border-slate-400 rounded-b-md space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
                <h3 className="font-extrabold text-slate-900">📊 کارنامهٔ {currentStudent.lastName} - {currentStudent.firstName} ({currentStudent.studentCode})</h3>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 ml-1">{transcript ? `${transcript.length} درس` : ''}</span>
                  <button
                    onClick={() => setTranscriptView('official')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${transcriptView === 'official' ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-slate-50 border-slate-300 hover:bg-slate-100'}`}
                  >
                    🧾 کارنامه رسمی
                  </button>
                  <button
                    onClick={() => setTranscriptView('simple')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${transcriptView === 'simple' ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-slate-50 border-slate-300 hover:bg-slate-100'}`}
                  >
                    📋 جدول نمرات
                  </button>
                  {props.canEditGrades && (
                    <>
                      <button
                        onClick={() => {
                          if (transcript && transcript.length > 0) {
                            openEditGrade(transcript[0]);
                          } else {
                            setGradeEditTarget({
                              termCode: '',
                              termTitle: null,
                              courseCode: '',
                              courseTitle: '',
                              units: null,
                              courseType: null,
                              gradeValue: null,
                              gradeStatus: 'PENDING',
                              gradeStatusTitle: null,
                              gradeStatusCode: null,
                              offeringType: null,
                              termStatusTitle: null,
                              termProbation: null,
                            });
                            setGradeValueInput('');
                            setGradeReasonInput('');
                            setGradeEditModalOpen(true);
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-600 text-white hover:bg-amber-700"
                        title="ثبت یا اصلاح نمره توسط آموزش / فارغ‌التحصیلان"
                      >
                        ✏️ ثبت / تغییر نمره
                      </button>
                      <button
                        onClick={openAuditLogs}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-700 text-white hover:bg-slate-800"
                        title="مشاهده لاگ ممیزی و تاریخچه تغییرات نمرات دانشجو"
                      >
                        📜 لاگ ممیزی نمرات
                      </button>
                    </>
                  )}
                  {transcript && transcript.length > 0 && (
                    <button
                      onClick={() => doPrintTranscript()}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-700 text-white hover:bg-emerald-800"
                    >
                      🖨️ چاپ کارنامه
                    </button>
                  )}
                </div>
                {transcript && transcript.length > 0 && (
                  <p className="text-[10px] text-slate-500">
                    ⚖️ مبنای محاسبه: <b>{currentStudent.regulationTitle}</b>
                    {(() => { const th = regThresholds(regConfig); return ` (قبولی ${faNum(th.pass, 0)} — مشروطی زیر ${faNum(th.prob, 0)}${th.exclFailed ? ' — حذف مردودی قبول‌شده از معدل کل' : ''})`; })()}
                  </p>
                )}
              </div>
              {transcriptLoading ? (
                <p className="text-center text-slate-500 py-6">در حال بارگذاری کارنامه…</p>
              ) : !transcript || transcript.length === 0 ? (
                <p className="text-center text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">کارنامه‌ای برای این دانشجو یافت نشد (ممکن است نمرات در مرحلهٔ انتقال باشد).</p>
              ) : transcriptView === 'simple' ? (
                <div className="overflow-x-auto border border-slate-300 rounded">
                  <table className="w-full text-right text-[11px]">
                    <thead className="bg-slate-100 border-b border-slate-300 font-bold">
                      <tr>
                        <th className="p-1.5">ترم</th>
                        <th className="p-1.5">کد درس</th>
                        <th className="p-1.5">عنوان درس</th>
                        <th className="p-1.5 text-center">واحد</th>
                        <th className="p-1.5 text-center">نمره</th>
                        <th className="p-1.5 text-center">وضعیت</th>
                        {props.canEditGrades && <th className="p-1.5 text-center">عملیات</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {transcript.map((r, i) => (
                        <tr key={i} className="border-b border-slate-200 hover:bg-slate-50">
                          <td className="p-1.5 font-mono" dir="ltr">{r.termCode}</td>
                          <td className="p-1.5 font-mono" dir="ltr">{r.courseCode}</td>
                          <td className="p-1.5">{r.courseTitle}</td>
                          <td className="p-1.5 text-center font-mono">{r.units ?? '—'}</td>
                          <td className="p-1.5 text-center font-mono font-bold">{r.gradeValue ?? '—'}</td>
                  <td className="p-1.5 text-center">
                    {r.gradeStatusTitle && <span className="ml-1 font-bold">{r.gradeStatusTitle}</span>}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${gradeStatusChip(r.gradeStatus)}`}>
                      {gradeStatusFa(r.gradeStatus)}
                    </span>
                  </td>
                  {props.canEditGrades && (
                    <td className="p-1.5 text-center">
                      <button
                        onClick={() => openEditGrade(r)}
                        className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300"
                        title="ویرایش یا اصلاح نمره"
                      >
                        ✏️ ویرایش
                      </button>
                    </td>
                  )}
                </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <OfficialTranscriptView
                  student={currentStudent}
                  summary={groupTranscript(transcript)}
                  logoUrl={props.logoUrl}
                  codeLabels={props.codeLabels}
                  canEditGrades={props.canEditGrades}
                  onEditGrade={openEditGrade}
                />
              )}
            </div>
          )}

          {/* ── تب ۶: لیست و جستجوی سریع دانشجویان (صفحه‌بندی سمت سرور) ── */}
          {stuTab === 'list' && (
            <div className="bg-white p-4 border border-slate-400 rounded-b-md space-y-3">
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={e => { e.preventDefault(); setSelectedStuIdx(0); nav({ q: searchQuery }); }}
              >
                <input
                  type="text"
                  placeholder="🔍 جستجو: شماره دانشجویی، کد ملی یا نام..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full max-w-md bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs"
                />
                <button type="submit" className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold rounded">جستجو</button>
                {(pg?.q || pg?.status !== 'ALL' || (pg?.degree ?? 0) > 0 || pg?.sort || pg?.f_code || pg?.f_name || pg?.f_nc || pg?.f_major || pg?.f_year) && (
                  <button type="button" onClick={() => { setSearchQuery(''); setStuFilters({ f_code: '', f_name: '', f_nc: '', f_major: '', f_year: '' }); nav({ q: '', status: 'ALL', degree: '0', sort: '', f_code: '', f_name: '', f_nc: '', f_major: '', f_year: '' }); }} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-xs rounded">✖ پاک‌سازی فیلتر</button>
                )}
                <span className="text-xs text-slate-500 mr-auto">{(pg?.total ?? props.students.length).toLocaleString('fa-IR')} پرونده</span>
              </form>

              {/* چیپ‌های وضعیت */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <button onClick={() => nav({ status: 'ALL' })} className={`px-2.5 py-1 rounded-full border font-bold ${(!pg || pg.status === 'ALL') ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 border-slate-300 hover:bg-slate-100'}`}>
                  همه ({(props.statusCounts ?? []).reduce((a, c) => a + c.n, 0).toLocaleString('fa-IR')})
                </button>
                {(props.statusCounts ?? []).map(c => (
                  <button key={c.status} onClick={() => nav({ status: c.status })} title={c.status}
                    className={`px-2.5 py-1 rounded-full border font-bold ${pg?.status === c.status ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 border-slate-300 hover:bg-slate-100'}`}>
                    {studentStatusFa(c.status)} <span className="opacity-70">({c.n.toLocaleString('fa-IR')})</span>
                  </button>
                ))}
                <select
                  value={pg?.degree ?? 0}
                  onChange={e => nav({ degree: e.target.value })}
                  className="mr-auto bg-slate-50 border border-slate-300 rounded px-2 py-1 text-[11px]"
                >
                  <option value={0}>همه مقاطع</option>
                  {(props.degrees ?? []).map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
              </div>

              <div className="overflow-x-auto border border-slate-300 rounded">
                <table className="w-full table-fixed text-right text-xs">
                  <colgroup>
                    <col style={{ width: 150 }} />
                    <col style={{ width: 140 }} />
                    <col />
                    <col style={{ width: 120 }} />
                    <col />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 90 }} />
                    <col style={{ width: 120 }} />
                  </colgroup>
                  <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold">
                    <tr>
                      <th className="p-2 text-right whitespace-nowrap">عملیات</th>
                      <ServerTh label="شماره دانشجویی" sortKey="studentCode" activeKey={stuSortKey || null} dir={(stuSortDir as 'asc' | 'desc') ?? 'asc'} onSort={() => toggleStuSort('studentCode')} filter={stuFilters.f_code} onFilter={v => setStuFilters(f => ({ ...f, f_code: v }))} onApply={applyStuFilters} />
                      <ServerTh label="نام و نام خانوادگی" sortKey="name" activeKey={stuSortKey || null} dir={(stuSortDir as 'asc' | 'desc') ?? 'asc'} onSort={() => toggleStuSort('name')} filter={stuFilters.f_name} onFilter={v => setStuFilters(f => ({ ...f, f_name: v }))} onApply={applyStuFilters} />
                      <ServerTh label="کد ملی" sortKey="nc" activeKey={stuSortKey || null} dir={(stuSortDir as 'asc' | 'desc') ?? 'asc'} onSort={() => toggleStuSort('nc')} filter={stuFilters.f_nc} onFilter={v => setStuFilters(f => ({ ...f, f_nc: v }))} onApply={applyStuFilters} />
                      <ServerTh label="رشته" sortKey="major" activeKey={stuSortKey || null} dir={(stuSortDir as 'asc' | 'desc') ?? 'asc'} onSort={() => toggleStuSort('major')} filter={stuFilters.f_major} onFilter={v => setStuFilters(f => ({ ...f, f_major: v }))} onApply={applyStuFilters} />
                      <ServerTh label="مقطع" sortKey="degree" activeKey={stuSortKey || null} dir={(stuSortDir as 'asc' | 'desc') ?? 'asc'} onSort={() => toggleStuSort('degree')} />
                      <ServerTh label="سال ورود" sortKey="year" activeKey={stuSortKey || null} dir={(stuSortDir as 'asc' | 'desc') ?? 'asc'} onSort={() => toggleStuSort('year')} filter={stuFilters.f_year} onFilter={v => setStuFilters(f => ({ ...f, f_year: v }))} onApply={applyStuFilters} />
                      <ServerTh label="وضعیت" sortKey="status" activeKey={stuSortKey || null} dir={(stuSortDir as 'asc' | 'desc') ?? 'asc'} onSort={() => toggleStuSort('status')} />
                    </tr>
                    <tr>
                      <td colSpan={8} className="p-1.5 bg-slate-50">
                        <button
                          onClick={applyStuFilters}
                          className="px-3 py-1 bg-indigo-700 hover:bg-indigo-800 text-white text-[11px] font-bold rounded"
                        >
                          اعمال فیلتر ستون‌ها (Enter)
                        </button>
                        <span className="mr-2 text-[10px] text-slate-400">فیلتر هر ستون را بنویسید و Enter بزنید</span>
                      </td>
                    </tr>
                  </thead>
                  <tbody>
                    {props.students.map((s) => (
                      <tr key={s.id} className="border-b border-slate-200 hover:bg-slate-50">
                        <td className="p-2 text-right whitespace-nowrap">
                          <button
                            onClick={() => {
                              const realIdx = props.students.findIndex(x => x.id === s.id);
                              setSelectedStuIdx(realIdx >= 0 ? realIdx : 0);
                              setStuTab('info_combined');
                            }}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-[11px] px-2.5 py-1 rounded font-bold whitespace-nowrap"
                          >
                            مشاهده پرونده 🔍
                          </button>
                        </td>
                        <td className="p-2 font-mono font-bold text-indigo-950 whitespace-nowrap" dir="ltr">{s.studentCode}</td>
                        <td className="p-2 font-bold break-words">{s.firstName} {s.lastName}</td>
                        <td className="p-2 font-mono whitespace-nowrap" dir="ltr">{s.nationalCode}</td>
                        <td className="p-2">{s.majorName}</td>
                        <td className="p-2 whitespace-nowrap">{s.degreeLevel}</td>
                        <td className="p-2 font-mono whitespace-nowrap">{s.entryYear}</td>
                        <td className="p-2 whitespace-nowrap">
                          <span title={s.samaStatusCode ? `کد سما: ${s.samaStatusCode}` : s.status} className={`${studentStatusChip(s.status)} text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap`}>
                            {studentStatusFa(s.status, s.samaStatusCode)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* صفحه‌بندی */}
              {pg && pg.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 text-xs">
                  <button disabled={pg.page <= 1} onClick={() => nav({ page: String(pg.page - 1) })} className="px-3 py-1.5 bg-white border border-slate-300 rounded font-bold disabled:opacity-40 hover:bg-slate-50">قبلی ▶</button>
                  <span className="font-bold text-slate-700">صفحه {pg.page.toLocaleString('fa-IR')} از {pg.totalPages.toLocaleString('fa-IR')}</span>
                  <button disabled={pg.page >= pg.totalPages} onClick={() => nav({ page: String(pg.page + 1) })} className="px-3 py-1.5 bg-white border border-slate-300 rounded font-bold disabled:opacity-40 hover:bg-slate-50">◀ بعدی</button>
                </div>
              )}
              <p className="text-[10px] text-slate-400 text-center">ناوبری پرونده (قبلی/بعدی) در محدوده همین صفحه (۵۰ رکورد) است — برای پرونده خاص، جست‌وجو کنید.</p>
            </div>
          )}

          {/* دکمه‌های عملیاتی پایین فرم ثبت‌نام دانشجو (F2 ذخیره / F4 ویرایش / انصراف / خروج) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-300">
            <div className="flex items-center gap-2">
              <button onClick={() => showToast('✅ اطلاعات پرونده دانشجو با موفقیت ذخیره شد (F2)')} className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded shadow flex items-center gap-1">
                <span>✔️</span> <span>F2 ذخیره</span>
              </button>
              <button onClick={() => showToast('حالت ویرایش فعال گردید (F4)')} className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-400 font-bold rounded flex items-center gap-1">
                <span>✏️</span> <span>F4 ویرایش</span>
              </button>
              <button onClick={() => setToastMsg('')} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-400 rounded flex items-center gap-1 text-slate-700">
                <span>❌</span> <span>انصراف (Ctrl+Z)</span>
              </button>
            </div>

            <button onClick={() => setStuTab('list')} className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 font-semibold rounded flex items-center gap-1">
              <span>📋</span> <span>انتقال به لیست داوطلبان</span>
            </button>
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ۲. فرم معرفی و پرونده استاد (مطابق تصاویر ۵ تا ۷)                */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {mainView === 'professors' && (
        <div className="bg-slate-200 p-2 sm:p-4 rounded-xl border border-slate-400 shadow-xl space-y-2">
          
          {/* تب‌های بالای فرم معرفی استاد — لیست اول + اطلاعات ادغام‌شده */}
          <div className="flex flex-wrap items-center gap-1 border-b border-slate-400 pb-1 text-slate-800">
            <button
              onClick={() => setProfTab('list')}
              className={`px-3 py-1.5 font-bold rounded-t-md border-t border-x transition-colors ${
                profTab === 'list' ? 'bg-white border-slate-400 text-indigo-950 shadow-sm' : 'bg-slate-300 border-transparent hover:bg-slate-100'
              }`}
            >
              📋 لیست اطلاعات اساتید
            </button>
            <button
              onClick={() => setProfTab('info_combined')}
              className={`px-3 py-1.5 font-bold rounded-t-md border-t border-x transition-colors ${
                profTab === 'info_combined' ? 'bg-white border-slate-400 text-indigo-950 shadow-sm' : 'bg-slate-300 border-transparent hover:bg-slate-100'
              }`}
            >
              📄 اطلاعات استاد (آموزشی + استخدامی + فردی)
            </button>
          </div>

          {/* نوار سربرگ کد استاد و جستجو */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100 p-2 border border-slate-300 rounded">
            <div className="flex items-center gap-2">
              <span className="font-bold text-red-700">* کد استاد:</span>
              <input
                type="text"
                value={currentStaff?.staffCode || ''}
                readOnly
                className="bg-yellow-300 text-slate-950 font-mono font-bold text-sm px-3 py-1 border border-slate-500 rounded text-center w-28 shadow-inner"
              />
              <span className="text-[11px] text-slate-500 mr-2">(برای جستجو کد استاد را وارد کنید)</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-600">نام و نام خانوادگی استاد:</span>
              <b className="text-slate-900 bg-white px-3 py-1 border border-slate-300 rounded font-bold">
                {currentStaff ? `${currentStaff.firstName} ${currentStaff.lastName}` : '—'}
              </b>
            </div>
          </div>

          {/* ── بخش ۱ استاد: اطلاعات آموزشی (ادغام‌شده) ── */}
          {profTab === 'info_combined' && currentStaff && (
            <div key={`prof-a-${currentStaff.id}`} className="bg-white p-3 sm:p-5 border border-slate-400 rounded-b-md space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* کادرهای عکس و امضای الکترونیک استاد */}
                <div className="space-y-3">
                  <div className="border border-slate-300 p-2.5 rounded bg-slate-50 flex flex-col items-center space-y-1.5">
                    <div className="w-24 h-28 bg-slate-200 border border-slate-400 rounded flex flex-col items-center justify-center text-slate-500">
                      <span className="text-2xl">👨‍🏫</span>
                      <span className="text-[9px] font-bold">تصویر پرسنلی</span>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => showToast('فایل تصویر پرسنلی استاد انتخاب شد')} className="px-2 py-0.5 bg-white border border-slate-300 rounded text-[10px]">فایل تصویر</button>
                      <button onClick={() => showToast('تصویر حذف شد')} className="px-2 py-0.5 bg-white border border-slate-300 rounded text-red-700 text-[10px]">حذف</button>
                    </div>
                  </div>

                  <div className="border border-slate-300 p-2.5 rounded bg-slate-50 flex flex-col items-center space-y-1.5">
                    <span className="font-bold text-red-700 text-[11px]">تصویر امضای الکترونیک استاد:</span>
                    <div className="w-full h-16 bg-white border border-dashed border-slate-400 rounded flex items-center justify-center font-mono text-slate-400 text-[10px]">
                      [نمونه امضای دیجیتال]
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => showToast('فایل امضای الکترونیک بارگذاری شد')} className="px-2 py-0.5 bg-white border border-slate-300 rounded text-[10px]">بارگذاری امضا</button>
                      <button onClick={() => showToast('امضا حذف شد')} className="px-2 py-0.5 bg-white border border-slate-300 rounded text-red-700 text-[10px]">حذف</button>
                    </div>
                  </div>
                </div>

                {/* ماتریس مشخصات آموزشی استاد */}
                <div className="md:col-span-2 space-y-2 border border-slate-300 p-3 rounded bg-slate-50">
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-red-700 font-bold">* نام خانوادگی و نام:</span>
                    <input type="text" defaultValue={`${currentStaff.lastName} - ${currentStaff.firstName}`} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-bold" />
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-slate-600">Full Name:</span>
                    <input type="text" defaultValue={`${currentStaff.firstName} ${currentStaff.lastName}`} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-mono text-left" dir="ltr" />
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-red-700 font-bold">* دانشکده:</span>
                    <input type="text" defaultValue={currentStaff.facultyName && currentStaff.facultyName !== '—' ? `${currentStaff.facultyName}${currentStaff.facultyCode ? ` (کد ${currentStaff.facultyCode})` : ''}` : '—'} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-semibold" />
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-red-700 font-bold">* گروه آموزشی:</span>
                    <input type="text" defaultValue={currentStaff.departmentName && currentStaff.departmentName !== '—' ? `${currentStaff.departmentName}${currentStaff.departmentCode ? ` (کد ${currentStaff.departmentCode})` : ''}` : '—'} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded" />
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-red-700 font-bold">* وضعیت کلی:</span>
                    <select defaultValue={currentStaff.isActive === 0 ? 'غیرفعال' : 'فعال'} className="col-span-2 bg-emerald-50 text-emerald-900 border border-emerald-300 px-2 py-1 rounded font-bold">
                      <option value="فعال">فعال / اشتغال به تدریس</option>
                      <option value="غیرفعال">غیرفعال</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>رشته و گرایش تخصصی:</span>
                    <input type="text" defaultValue={currentStaff.fieldOfStudy || currentStaff.fieldMain || '—'} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded" />
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>آخرین دانشگاه دانش‌آموختگی:</span>
                    <input type="text" defaultValue={currentStaff.lastDegreeUniversity || '—'} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded" />
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>کشور اخذ آخرین مدرک:</span>
                    <input type="text" defaultValue={currentStaff.lastDegreeCountryCode || '—'} className="bg-white border border-slate-300 px-2 py-1 rounded" />
                    <span>رشته: <b>{currentStaff.fieldMain || '—'}</b></span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── بخش ۲ استاد: اطلاعات استخدامی ── */}
          {profTab === 'info_combined' && currentStaff && (
            <div key={`prof-b-${currentStaff.id}`} className="bg-white p-3 sm:p-5 border border-slate-400 rounded-b-md space-y-3">
              <div className="space-y-2 border border-slate-300 p-3 rounded bg-slate-50 max-w-2xl mx-auto">
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="font-bold">مدرک تحصیلی:</span>
                  <input type="text" defaultValue={currentStaff.degree || 'دکتری تخصصی (Ph.D)'} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-bold" />
                </div>
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="font-bold">نوع همکاری:</span>
                  <input type="text" defaultValue={currentStaff.cooperationType || currentStaff.staffType || '—'} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-semibold" />
                </div>
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="font-bold">مرتبه علمی:</span>
                  <input type="text" defaultValue={currentStaff.academicRank || 'استادیار'} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-bold text-indigo-950" />
                </div>
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span>شماره مستخدم:</span>
                  <input type="text" defaultValue={currentStaff.personnelNo || '—'} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-mono" />
                </div>
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span>تاریخ استخدام:</span>
                  <input type="text" defaultValue={currentStaff.hireDate || '—'} className="bg-white border border-slate-300 px-2 py-1 rounded font-mono" />
                  <span>پایه: <b className="font-mono">{currentStaff.academicBase || '—'}</b></span>
                </div>
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span>سمت اجرایی:</span>
                  <input type="text" defaultValue={currentStaff.staffType && currentStaff.staffType !== '—' ? currentStaff.staffType : '—'} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded" />
                </div>
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span>شماره حساب بانکی:</span>
                  <input type="text" defaultValue={currentStaff.bankAccountNo || '—'} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-mono text-left" dir="ltr" />
                </div>
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span>پایه استادی:</span>
                  <input type="text" defaultValue={currentStaff.academicBase || '—'} className="w-24 bg-white border border-slate-300 px-2 py-1 rounded font-mono font-bold text-center" />
                  <span>وضعیت: <b>{currentStaff.isActive === 0 ? 'غیرفعال' : 'فعال'}</b></span>
                </div>
              </div>
            </div>
          )}

          {/* ── بخش ۳ استاد: اطلاعات فردی ── */}
          {profTab === 'info_combined' && currentStaff && (
            <div key={`prof-c-${currentStaff.id}`} className="bg-white p-3 sm:p-5 border border-slate-400 rounded-b-md space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 border border-slate-300 p-2.5 rounded bg-slate-50">
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>کد ملی:</span>
                    <input type="text" defaultValue={currentStaff.nationalCode} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-mono font-bold" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>تاریخ تولد:</span>
                    <input type="text" defaultValue={dateToJalali(currentStaff.birthDate)} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-mono" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>تلفن همراه:</span>
                    <input type="text" defaultValue={currentStaff.mobile && currentStaff.mobile !== '—' ? currentStaff.mobile : '—'} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-mono" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>تلفن دفتر / ثابت:</span>
                    <input type="text" defaultValue={currentStaff.phone || '—'} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-mono" />
                  </div>
                </div>

                <div className="space-y-1.5 border border-slate-300 p-2.5 rounded bg-slate-50">
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>پست الکترونیکی:</span>
                    <input type="email" defaultValue={currentStaff.email || '—'} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-mono text-left" dir="ltr" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>وضعیت تأهل:</span>
                    <div className="col-span-2 flex items-center gap-4">
                      <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name="prof_married" defaultChecked={currentStaff.maritalStatus !== 'مجرد'} /> متأهل</label>
                      <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name="prof_married" defaultChecked={currentStaff.maritalStatus === 'مجرد'} /> مجرد</label>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>آدرس محل سکونت:</span>
                    <input type="text" defaultValue={currentStaff.address || '—'} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded" />
                  </div>
                  {/* ── حساب وب استاد: فعال/غیرفعال + تغییر رمز (فقط ADMIN) ── */}
                  <div className="grid grid-cols-3 gap-2 items-center border-t border-slate-200 pt-2 mt-1">
                    <span className="font-bold">🔐 حساب وب:</span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full text-center ${(currentStaff.userIsActive ?? 1) === 0 ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {(currentStaff.userIsActive ?? 1) === 0 ? '⛔ غیرفعال' : '✅ فعال'}
                    </span>
                    <div className="flex gap-1.5 justify-end">
                      <button
                        onClick={() => handleToggleActive(currentStaff.userId, (currentStaff.userIsActive ?? 1) === 0, `${currentStaff.firstName} ${currentStaff.lastName}`)}
                        className="px-2 py-1 rounded text-[11px] font-bold bg-white border border-slate-300 hover:bg-slate-100"
                        title="فعال/غیرفعال‌سازی ورود به وب (فقط مدیر سیستم)"
                      >
                        {(currentStaff.userIsActive ?? 1) === 0 ? 'فعال‌سازی وب' : 'غیرفعال‌سازی وب'}
                      </button>
                      <button
                        onClick={() => { setPwModalFor({ userId: currentStaff.userId ?? 0, name: `${currentStaff.firstName} ${currentStaff.lastName}` }); setPwInput(''); }}
                        className="px-2 py-1 rounded text-[11px] font-bold bg-slate-700 text-white hover:bg-slate-800"
                        title="تغییر رمز عبور استاد (فقط مدیر سیستم)"
                      >
                        🔑 تغییر رمز
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── تب ۴ استاد: لیست اساتید ── */}
          {profTab === 'list' && (
            <div className="bg-white p-4 border border-slate-400 rounded-b-md space-y-3">
              <div className="flex items-center justify-between gap-3">
                <input
                  type="text"
                  placeholder="🔍 جستجو بر اساس کد پرسنلی، کد ملی یا نام استاد..."
                  value={staffQuery}
                  onChange={e => { setStaffQuery(e.target.value); setStaffVisible(100); }}
                  className="w-full max-w-md bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs"
                />
                <span className="text-xs text-slate-500">{filteredStaff.length} استاد</span>
              </div>

              <div className="overflow-x-auto border border-slate-300 rounded">
                <table className="w-full table-fixed text-right text-xs">
                  <colgroup>
                    <col style={{ width: 150 }} />
                    <col style={{ width: 90 }} />
                    <col />
                    <col style={{ width: 120 }} />
                    <col />
                    <col style={{ width: 110 }} />
                    <col style={{ width: 90 }} />
                    <col style={{ width: 110 }} />
                  </colgroup>
                  <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold">
                    <tr>
                      <th className="p-2 text-right whitespace-nowrap">عملیات</th>
                      {STAFF_COLS.map(c => (
                        <ClientTh
                          key={c.key}
                          col={c}
                          sortKey={staffTable.sortKey}
                          sortDir={staffTable.sortDir}
                          filter={staffTable.filters[c.key] ?? ''}
                          onSort={() => staffTable.toggleSort(c.key)}
                          onFilter={v => { staffTable.setFilter(c.key, v); setStaffVisible(100); }}
                        />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStaff.slice(0, staffVisible).map((st, idx) => (
                      <tr key={st.id} className="border-b border-slate-200 hover:bg-slate-50">
                        <td className="p-2 text-right whitespace-nowrap">
                          <button
                            onClick={() => {
                              const realIdx = props.staffList.findIndex(x => x.id === st.id);
                              setSelectedProfIdx(realIdx >= 0 ? realIdx : 0);
                              setProfTab('info_combined');
                            }}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-[11px] px-2.5 py-1 rounded font-bold whitespace-nowrap"
                          >
                            مشاهده پرونده 🔍
                          </button>
                        </td>
                        <td className="p-2 font-mono font-bold text-slate-900 whitespace-nowrap" dir="ltr">{st.staffCode}</td>
                        <td className="p-2 font-bold break-words">{st.firstName} {st.lastName}</td>
                        <td className="p-2 font-mono whitespace-nowrap" dir="ltr">{st.nationalCode}</td>
                        <td className="p-2">{st.departmentName && st.departmentName !== '—' ? st.departmentName : '—'}</td>
                        <td className="p-2 font-semibold text-indigo-950 whitespace-nowrap">{st.academicRank}</td>
                        <td className="p-2 whitespace-nowrap">{st.degree}</td>
                        <td className="p-2 whitespace-nowrap">{st.staffType}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredStaff.length > staffVisible && (
                <div className="text-center">
                  <button onClick={() => setStaffVisible(v => v + 200)} className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded text-xs font-bold">
                    نمایش {Math.min(200, filteredStaff.length - staffVisible).toLocaleString('fa-IR')} نفر بعدی ({(filteredStaff.length - staffVisible).toLocaleString('fa-IR')} باقی‌مانده)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* دکمه‌های استاندارد پایین فرم استاد (Ins اضافه / F2 ذخیره / F4 ویرایش / حذف / انصراف / خروج) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-300">
            <div className="flex items-center gap-2">
              <button onClick={() => showToast('➕ فرم استاد جدید باز شد (Ins)')} className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white font-bold rounded shadow flex items-center gap-1">
                <span>➕</span> <span>اضافه (Ins)</span>
              </button>
              <button onClick={() => showToast('✅ اطلاعات استاد با موفقیت ذخیره شد (F2)')} className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded shadow flex items-center gap-1">
                <span>✔️</span> <span>F2 ذخیره</span>
              </button>
              <button onClick={() => showToast('حالت ویرایش فعال شد (F4)')} className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-400 font-bold rounded flex items-center gap-1">
                <span>✏️</span> <span>F4 ویرایش</span>
              </button>
              <button onClick={() => showToast('حذف رکورد انجام شد')} className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-300 rounded flex items-center gap-1">
                <span>🗑️</span> <span>حذف</span>
              </button>
            </div>

            <button onClick={() => setProfTab('list')} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-400 rounded">
              <span>📋 لیست اساتید</span>
            </button>
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ۳. کاشی‌ها و منوی عملیات سریع اساتید و آموزش (مطابق تصویر ۸)     */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {mainView === 'quick_menu' && (
        <div className="bg-slate-200 p-5 sm:p-8 rounded-xl border border-slate-400 shadow-xl space-y-4">
          <div className="bg-white p-3 rounded-lg border border-slate-300 font-bold text-slate-800 text-sm">
            ⚡ کاشی‌ها و منوی میانبرهای امور اساتید و آموزش
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {/* کاشی ۱: معرفی استاد جدید */}
            <button
              onClick={() => {
                setMainView('professors');
                setProfTab('info_combined');
                showToast('فرم معرفی استاد جدید باز شد');
              }}
              className="p-4 bg-gradient-to-b from-white to-slate-100 border-2 border-dashed border-indigo-400 hover:border-indigo-600 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-3 text-right group"
            >
              <div className="w-12 h-12 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                👥
              </div>
              <div>
                <p className="font-extrabold text-sm text-indigo-950">معرفی استاد جدید</p>
                <p className="text-[11px] text-slate-500 mt-0.5">ثبت مشخصات، استخدام و امضای الکترونیک</p>
              </div>
            </button>

            {/* کاشی ۲: تغییر کلمه عبور جاری */}
            <button
              onClick={() => showToast('پنجره تغییر کلمه عبور جاری باز شد')}
              className="p-4 bg-gradient-to-b from-white to-slate-100 border-2 border-slate-300 hover:border-slate-500 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-3 text-right group"
            >
              <div className="w-12 h-12 rounded-lg bg-yellow-100 text-yellow-800 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                🔑
              </div>
              <div>
                <p className="font-extrabold text-sm text-slate-900">تغییر کلمه عبور جاری</p>
                <p className="text-[11px] text-slate-500 mt-0.5">تغییر رمز ورود و تنظیمات امنیتی</p>
              </div>
            </button>

            {/* کاشی ۳: تخصیص استاد راهنمای جمعی */}
            <button
              onClick={() => showToast('فرآیند تخصیص استاد راهنمای جمعی دانشجویان فعال گردید')}
              className="p-4 bg-gradient-to-b from-white to-slate-100 border-2 border-slate-300 hover:border-slate-500 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-3 text-right group"
            >
              <div className="w-12 h-12 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                👨‍💼
              </div>
              <div>
                <p className="font-extrabold text-sm text-slate-900">تخصیص استاد راهنمای جمعی</p>
                <p className="text-[11px] text-slate-500 mt-0.5">انتساب گروهی دانشجویان به اساتید راهنما</p>
              </div>
            </button>

            {/* کاشی ۴: ارسال پیامک به دانشجویان کلاس */}
            <button
              onClick={() => showToast('سامانه ارسال پیامک گروهی به کلاس آماده است')}
              className="p-4 bg-gradient-to-b from-white to-slate-100 border-2 border-slate-300 hover:border-slate-500 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-3 text-right group"
            >
              <div className="w-12 h-12 rounded-lg bg-sky-100 text-sky-800 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                📱
              </div>
              <div>
                <p className="font-extrabold text-sm text-slate-900">ارسال پیامک به دانشجویان کلاس</p>
                <p className="text-[11px] text-slate-500 mt-0.5">ارسال اطلاعیه، لغو یا تغییر زمان جلسه</p>
              </div>
            </button>

            {/* کاشی ۵: مدیریت جلسات استاد */}
            <button
              onClick={() => showToast('تقویم و گزارش جلسات کلاسی اساتید بارگذاری شد')}
              className="p-4 bg-gradient-to-b from-white to-slate-100 border-2 border-slate-300 hover:border-slate-500 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-3 text-right group"
            >
              <div className="w-12 h-12 rounded-lg bg-purple-100 text-purple-800 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                🎓
              </div>
              <div>
                <p className="font-extrabold text-sm text-slate-900">مدیریت جلسات استاد (حضور و غیاب و جبرانی)</p>
                <p className="text-[11px] text-slate-500 mt-0.5">جلسات ۱۶گانه، کلاس‌های جبرانی و محاسبه کسور حق‌التدریس</p>
              </div>
            </button>

            {/* کاشی ۶: کاتالوگ و سرفصل رشته‌ها */}
            <Link
              href="/admin/curriculum"
              className="p-4 bg-gradient-to-b from-white to-slate-100 border-2 border-indigo-300 hover:border-indigo-500 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-3 text-right group"
            >
              <div className="w-12 h-12 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                📚
              </div>
              <div>
                <p className="font-extrabold text-sm text-indigo-950">کاتالوگ و سرفصل رشته‌ها</p>
                <p className="text-[11px] text-slate-500 mt-0.5">مدیریت چارت، انتقال کاتالوگ و سقف واحدها</p>
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* ── مودال ثبت / اصلاح نمره (ادمین و کارشناس فارغ‌التحصیلان) ── */}
      {gradeEditModalOpen && currentStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-300 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-amber-700 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-extrabold text-sm flex items-center gap-2">
                <span>✏️</span> ثبت و اصلاح نمره (آموزش / فارغ‌التحصیلان)
              </h3>
              <button
                type="button"
                onClick={() => setGradeEditModalOpen(false)}
                className="text-amber-100 hover:text-white text-lg leading-none"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveGrade} className="p-5 space-y-4 text-xs">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1 text-slate-800">
                <p><b>دانشجو:</b> {currentStudent.firstName} {currentStudent.lastName} ({currentStudent.studentCode})</p>
                <p><b>رشته:</b> {currentStudent.majorName} — <b>مقطع:</b> {currentStudent.degreeLevel}</p>
                {gradeEditTarget?.courseTitle ? (
                  <p><b>درس:</b> {gradeEditTarget.courseTitle} (<span className="font-mono">{gradeEditTarget.courseCode}</span>) — <b>ترم:</b> <span className="font-mono">{gradeEditTarget.termCode}</span></p>
                ) : transcript && transcript.length > 0 ? (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">انتخاب درس از کارنامه:</label>
                    <select
                      className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs font-mono"
                      value={gradeEditTarget?.courseCode ? `${gradeEditTarget.termCode}|${gradeEditTarget.courseCode}` : ''}
                      onChange={e => {
                        const [tCode, cCode] = e.target.value.split('|');
                        const found = transcript.find(r => r.termCode === tCode && r.courseCode === cCode);
                        if (found) {
                          setGradeEditTarget(found);
                          setGradeValueInput(found.gradeValue ?? '');
                        }
                      }}
                    >
                      {transcript.map((r, i) => (
                        <option key={i} value={`${r.termCode}|${r.courseCode}`}>
                          {r.termCode} — {r.courseCode} ({r.courseTitle}) — نمره: {r.gradeValue ?? '—'}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <p><b>نمره فعلی:</b> <span className="font-mono font-bold text-indigo-700">{gradeEditTarget?.gradeValue ?? 'ثبت نشده'}</span> ({gradeEditTarget?.gradeStatusTitle || (gradeEditTarget?.gradeStatus ? gradeStatusFa(gradeEditTarget.gradeStatus) : '—')})</p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  نمره جدید (۰ تا ۲۰):
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="20"
                  required
                  placeholder="مثال: ۱۶.۵۰"
                  value={gradeValueInput}
                  onChange={e => setGradeValueInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  دلیل تغییر و مستند قانونی (الزامی):
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="مثال: حکم کمیسیون موارد خاص به شماره ۱۲۳۴ یا اصلاح نمره طبق صورتجلسه شورای آموزشی"
                  value={gradeReasonInput}
                  onChange={e => setGradeReasonInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded p-2.5 text-[11px] text-slate-600 space-y-1">
                <p>🔒 <b>قوانین ممیزی:</b></p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>این عملیات مستقیماً در لاگ ممیزی نمرات (<span className="font-mono">grade_change_log</span>) با نام کاربری، نقش و زمان دقیق ثبت می‌شود.</li>
                  <li>کد وضعیت سما (<span className="font-mono">samaGradeStatusCode</span>) متناسب با حدنصاب قبولی رشته به‌طور خودکار محاسبه و درج می‌گردد.</li>
                  <li>نمره به‌صورت قطعی (<span className="font-mono">FINALIZED</span>) منظور می‌شود.</li>
                </ul>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setGradeEditModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={gradeSaving}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white font-bold rounded-lg transition-colors flex items-center gap-1.5"
                >
                  {gradeSaving ? 'در حال ثبت…' : '💾 ثبت نمره و لاگ ممیزی'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── مودال لاگ ممیزی تغییرات نمره (Audit Trail) ── */}
      {auditLogModalOpen && currentStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full border border-slate-300 overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-800 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-extrabold text-sm flex items-center gap-2">
                <span>📜</span> تاریخچه و لاگ ممیزی نمرات (Audit Trail)
              </h3>
              <button
                type="button"
                onClick={() => setAuditLogModalOpen(false)}
                className="text-slate-300 hover:text-white text-lg leading-none"
              >
                ✕
              </button>
            </div>
            <div className="p-4 border-b border-slate-200 bg-slate-50 text-xs flex flex-wrap items-center justify-between gap-2">
              <p><b>دانشجو:</b> {currentStudent.firstName} {currentStudent.lastName} — <b>شماره دانشجویی:</b> <span className="font-mono">{currentStudent.studentCode}</span></p>
              <span className="text-[11px] text-slate-500 font-mono">{auditLogs.length} رکورد ثبت‌شده</span>
            </div>
            <div className="p-4 overflow-y-auto flex-1 text-xs">
              {auditLogsLoading ? (
                <p className="text-center text-slate-500 py-8">در حال بارگذاری سوابق ممیزی…</p>
              ) : auditLogs.length === 0 ? (
                <p className="text-center text-slate-500 py-8 bg-slate-50 rounded-lg border border-slate-200">هیچ لاگ تغییری برای نمرات این دانشجو در سامانه ثبت نشده است.</p>
              ) : (
                <div className="border border-slate-300 rounded-lg overflow-x-auto">
                  <table className="w-full text-right text-[11px]">
                    <thead className="bg-slate-100 border-b border-slate-300 font-bold">
                      <tr>
                        <th className="p-2">#</th>
                        <th className="p-2">تاریخ و زمان</th>
                        <th className="p-2">اقدام‌کننده</th>
                        <th className="p-2">عملیات</th>
                        <th className="p-2 text-center">نمره قبلی → جدید</th>
                        <th className="p-2 text-center">کد وضعیت سما</th>
                        <th className="p-2">دلیل ثبت‌شده</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log, idx) => (
                        <tr key={log.id || idx} className="border-b border-slate-200 hover:bg-slate-50">
                          <td className="p-2 font-mono text-slate-500">{idx + 1}</td>
                          <td className="p-2 font-mono text-slate-700" dir="ltr">
                            {log.createdAt ? new Date(log.createdAt).toLocaleString('fa-IR') : '—'}
                          </td>
                          <td className="p-2">
                            <span className="font-bold">{log.actorFirstName || log.actorLastName ? `${log.actorFirstName ?? ''} ${log.actorLastName ?? ''}`.trim() : `کاربر #${log.actorUserId ?? 'سیستم'}`}</span>
                            <span className="block text-[10px] text-slate-500 font-mono">[{log.actorRole || 'SYSTEM'}]</span>
                          </td>
                          <td className="p-2">
                            <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-200 text-slate-800">
                              {log.action}
                            </span>
                          </td>
                          <td className="p-2 text-center font-mono font-bold">
                            <span className="text-slate-500">{log.oldGradeValue ?? '—'}</span>
                            <span className="mx-1 text-slate-400">←</span>
                            <span className="text-indigo-700">{log.newGradeValue ?? '—'}</span>
                          </td>
                          <td className="p-2 text-center font-mono">
                            <span className="text-slate-500">{log.oldSamaStatusCode ?? '—'}</span>
                            <span className="mx-1 text-slate-400">←</span>
                            <span className="text-emerald-700 font-bold">{log.newSamaStatusCode ?? '—'}</span>
                          </td>
                          <td className="p-2 text-slate-700 max-w-xs truncate" title={log.reason ?? undefined}>
                            {log.reason ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setAuditLogModalOpen(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition-colors"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── مودال تغییر رمز کاربر (فقط ADMIN) ── */}
      {pwModalFor && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-300 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-800 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-extrabold text-sm">🔑 تغییر رمز «{pwModalFor.name}»</h3>
              <button type="button" onClick={() => setPwModalFor(null)} className="text-slate-300 hover:text-white text-lg leading-none">✕</button>
            </div>
            <form onSubmit={handleResetPassword} className="p-5 space-y-3 text-xs">
              <p className="text-slate-600">رمز جدید را وارد کنید (۴ تا ۶۴ کاراکتر). کاربر در اولین ورود ملزم به تغییر رمز می‌شود.</p>
              <input
                type="text"
                required
                minLength={4}
                maxLength={64}
                dir="ltr"
                placeholder="رمز جدید"
                value={pwInput}
                onChange={e => setPwInput(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
              />
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button type="button" onClick={() => setPwModalFor(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg">انصراف</button>
                <button type="submit" disabled={pwSaving} className="px-5 py-2 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-400 text-white font-bold rounded-lg">
                  {pwSaving ? 'در حال ثبت…' : '💾 ثبت رمز جدید'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}