'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getTranscript, type TranscriptRow } from './actions';
import { QUOTA_FA, STUDENT_STATUS_FA, gradeStatusChip, gradeStatusFa, quotaFa, studentStatusChip, studentStatusFa } from '@/lib/student-labels';

export type StudentItem = {
  id: number;
  studentCode: string;
  nationalCode: string;
  firstName: string;
  lastName: string;
  mobile: string;
  entryYear: number;
  entryTerm: number;
  status: string;
  samaStatusCode?: string | null;
  quotaType: string;
  currentTermNo: number;
  majorName: string;
  majorCode: string;
  degreeLevel: string;
  degreeCode: string;
  regulationTitle: string;
  role: string;
};

export type Pagination = {
  total: number;
  page: number;
  per: number;
  totalPages: number;
  q: string;
  status: string;
  degree: number;
};

export type StaffItem = {
  id: number;
  staffCode: string;
  nationalCode: string;
  firstName: string;
  lastName: string;
  mobile: string;
  academicRank: string;
  degree: string;
  staffType: string;
  role: string;
  departmentName?: string;
  departmentCode?: string | null;
  facultyName?: string;
  facultyCode?: string | null;
  fieldOfStudy?: string | null;
  fieldMain?: string | null;
  lastDegreeUniversity?: string | null;
  lastDegreeCountryCode?: string | null;
  personnelNo?: string | null;
  hireDate?: string | null;
  bankAccountNo?: string | null;
  academicBase?: string | null;
  isActive?: number | null;
};

/* ── کارنامه رسمی: گروه‌بندی ترم + معدل ── */
const numOrNull = (v: string | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export type TermGroup = {
  termCode: string;
  termTitle: string | null;
  rows: TranscriptRow[];
  taken: number;
  passed: number;
  gpa: number | null;
};

export type TranscriptSummary = {
  terms: TermGroup[];
  totalTaken: number;
  totalPassed: number;
  gpa: number | null;
};

function summarizeTerm(rows: TranscriptRow[]): { taken: number; passed: number; wsum: number; wunits: number } {
  let taken = 0, passed = 0, wsum = 0, wunits = 0;
  for (const r of rows) {
    const u = numOrNull(r.units) ?? 0;
    const g = numOrNull(r.gradeValue);
    if (r.gradeStatus === 'PENDING') continue;
    taken += u;
    if (r.gradeStatus === 'EXEMPT' || r.gradeStatus === 'PASSED_NO_GRADE') passed += u;
    else if (g !== null && g >= 10) passed += u;
    if (g !== null && (r.gradeStatus === 'FINALIZED' || r.gradeStatus === 'TEMPORARY')) {
      wsum += g * u;
      wunits += u;
    }
  }
  return { taken, passed, wsum, wunits };
}

export function groupTranscript(rows: TranscriptRow[]): TranscriptSummary {
  const map = new Map<string, TranscriptRow[]>();
  for (const r of rows) {
    const k = r.termCode || '—';
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  const terms: TermGroup[] = [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'en'))
    .map(([termCode, rs]) => {
      const s = summarizeTerm(rs);
      return { termCode, termTitle: rs[0]?.termTitle ?? null, rows: rs, taken: s.taken, passed: s.passed, gpa: s.wunits ? s.wsum / s.wunits : null };
    });
  const all = summarizeTerm(rows);
  return { terms, totalTaken: all.taken, totalPassed: all.passed, gpa: all.wunits ? all.wsum / all.wunits : null };
}

export const faNum = (n: number | null | undefined, digits = 2): string =>
  n == null ? '—' : n.toLocaleString('fa-IR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

const escHtml = (s: string | null | undefined): string =>
  String(s ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** چاپ کارنامهٔ رسمی در پنجرهٔ جدا (بدون نیاز به CSS سراسری چاپ) */
export function printOfficialTranscript(student: StudentItem, summary: TranscriptSummary): void {
  const infoRows = [
    ['نام و نام خانوادگی', `${student.lastName} ${student.firstName}`],
    ['شماره دانشجویی', student.studentCode],
    ['کد ملی', student.nationalCode],
    ['رشته', student.majorName],
    ['مقطع', student.degreeLevel],
    ['سال ورود', String(student.entryYear)],
    ['سهمیه', quotaFa(student.quotaType)],
    ['وضعیت', studentStatusFa(student.status, student.samaStatusCode)],
  ];
  const termTables = summary.terms.map(t => {
    const rows = t.rows.map((r, i) => `<tr><td>${(i + 1).toLocaleString('fa-IR')}</td><td>${escHtml(r.courseCode)}</td><td class="t">${escHtml(r.courseTitle)}</td><td>${faNum(numOrNull(r.units), 1)}</td><td><b>${r.gradeValue ?? '—'}</b></td><td>${escHtml(r.gradeStatusTitle || gradeStatusFa(r.gradeStatus))}</td></tr>`).join('');
    return `<h3>نیمسال ${escHtml(t.termCode)}${t.termTitle ? ` — ${escHtml(t.termTitle)}` : ''}</h3>
<table><thead><tr><th>ردیف</th><th>کد درس</th><th>عنوان درس</th><th>واحد</th><th>نمره</th><th>وضعیت</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><td colspan="3">جمع نیمسال</td><td>${faNum(t.taken, 1)} / ${faNum(t.passed, 1)}</td><td>${faNum(t.gpa)}</td><td>معدل</td></tr></tfoot></table>`;
  }).join('');
  const html = `<!DOCTYPE html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>کارنامه ${escHtml(student.studentCode)}</title>
<style>body{font-family:Tahoma,Arial,sans-serif;font-size:12px;color:#111;margin:24px}h1,h2{text-align:center;margin:4px}h2{font-size:15px}h3{background:#eee;padding:6px 10px;border:1px solid #999;margin:18px 0 0;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:6px}th,td{border:1px solid #555;padding:5px 6px;text-align:center}th{background:#ddd}.t{text-align:right}thead th{font-size:12px}tfoot td{font-weight:bold;background:#f4f4f4}.info{margin:12px 0}.info td{width:25%;text-align:right}.sign{display:flex;justify-content:space-between;margin-top:48px}.sign div{text-align:center}@media print{body{margin:8mm}}</style>
</head><body><h1>دانشگاه آفاق</h1><h2>ادارهٔ کل امور آموزشی — کارنامهٔ تحصیلی دانشجو</h2>
<table class="info"><tbody>${[0, 1, 2, 3].map(i => `<tr><td><b>${infoRows[i * 2][0]}:</b> ${escHtml(infoRows[i * 2][1])}</td><td><b>${infoRows[i * 2 + 1][0]}:</b> ${escHtml(infoRows[i * 2 + 1][1])}</td></tr>`).join('')}</tbody></table>
${termTables}
<h3>جمع کل</h3><table><tbody><tr><td><b>واحدهای اخذشده:</b> ${faNum(summary.totalTaken, 1)}</td><td><b>واحدهای گذرانده:</b> ${faNum(summary.totalPassed, 1)}</td><td><b>معدل کل:</b> ${faNum(summary.gpa)}</td></tr></tbody></table>
<div class="sign"><div>کارشناس آموزش<br><br>امضا و مهر</div><div>مدیر آموزش<br><br>امضا و مهر</div></div>
<script>window.onload=()=>{window.print();}</script></body></html>`;
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

/** نمای رسمی کارنامه داخل صفحه (همان ساختار نسخهٔ چاپی) */
function OfficialTranscriptView({ student, summary }: { student: StudentItem; summary: TranscriptSummary }) {
  const info: [string, string][] = [
    ['نام و نام خانوادگی', `${student.lastName} ${student.firstName}`],
    ['شماره دانشجویی', student.studentCode],
    ['کد ملی', student.nationalCode],
    ['رشته', student.majorName],
    ['مقطع', student.degreeLevel],
    ['سال ورود', String(student.entryYear)],
    ['سهمیه', quotaFa(student.quotaType)],
    ['وضعیت', studentStatusFa(student.status, student.samaStatusCode)],
  ];
  return (
    <div className="border border-slate-400 rounded overflow-hidden">
      <div className="bg-slate-900 text-white text-center py-2.5 px-3">
        <p className="font-extrabold text-sm">دانشگاه آفاق</p>
        <p className="text-[11px] text-slate-300">ادارهٔ کل امور آموزشی — کارنامهٔ تحصیلی دانشجو</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-200 text-[11px]">
        {info.map(([k, v]) => (
          <div key={k} className="bg-white px-2 py-1.5">
            <span className="text-slate-500">{k}: </span>
            <span className="font-bold">{v || '—'}</span>
          </div>
        ))}
      </div>
      {summary.terms.map(t => (
        <div key={t.termCode}>
          <div className="bg-slate-100 border-y border-slate-300 px-3 py-1.5 font-extrabold text-[12px]">
            نیمسال <span className="font-mono" dir="ltr">{t.termCode}</span>
            {t.termTitle && <span className="font-normal text-slate-500"> — {t.termTitle}</span>}
          </div>
          <table className="w-full text-right text-[11px]">
            <thead className="bg-white text-slate-500 border-b border-slate-200">
              <tr>
                <th className="p-1.5 w-10 text-center">ردیف</th>
                <th className="p-1.5">کد درس</th>
                <th className="p-1.5">عنوان درس</th>
                <th className="p-1.5 text-center">واحد</th>
                <th className="p-1.5 text-center">نمره</th>
                <th className="p-1.5 text-center">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="p-1.5 text-center text-slate-400">{(i + 1).toLocaleString('fa-IR')}</td>
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
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-bold border-t border-slate-300">
                <td colSpan={3} className="p-1.5">جمع نیمسال (اخذشده / گذرانده)</td>
                <td className="p-1.5 text-center font-mono">{faNum(t.taken, 1)} / {faNum(t.passed, 1)}</td>
                <td className="p-1.5 text-center">معدل: <span className="font-mono">{faNum(t.gpa)}</span></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ))}
      <div className="bg-indigo-950 text-white px-3 py-2 flex flex-wrap gap-x-6 gap-y-1 text-[12px] font-bold">
        <span>واحدهای اخذشده: <span className="font-mono">{faNum(summary.totalTaken, 1)}</span></span>
        <span>واحدهای گذرانده: <span className="font-mono">{faNum(summary.totalPassed, 1)}</span></span>
        <span>معدل کل: <span className="font-mono">{faNum(summary.gpa)}</span></span>
      </div>
    </div>
  );
}

export default function StudentsManagerClient(props: {
  students: StudentItem[];
  staffList: StaffItem[];
  pagination?: Pagination;
  degrees?: { id: number; title: string }[];
  statusCounts?: { status: string; n: number }[];
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
  // نمای کارنامه: رسمی (پیش‌فرض) یا جدول سادهٔ نمرات
  const [transcriptView, setTranscriptView] = useState<'official' | 'simple'>('official');

  const currentStudent = props.students[selectedStuIdx] || props.students[0];
  const currentStaff = props.staffList[selectedProfIdx] || props.staffList[0];

  useEffect(() => {
    if (stuTab !== 'transcript' || !currentStudent) return;
    setTranscriptLoading(true);
    setTranscript(null);
    getTranscript(currentStudent.id).then(r => setTranscript(r)).catch(() => setTranscript([])).finally(() => setTranscriptLoading(false));
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
    const cur = { q: pg?.q ?? '', status: pg?.status ?? 'ALL', degree: String(pg?.degree ?? 0), page: '1', ...patch };
    const p = new URLSearchParams();
    if (cur.q) p.set('q', cur.q);
    if (cur.status && cur.status !== 'ALL') p.set('status', cur.status);
    if (cur.degree && cur.degree !== '0') p.set('degree', cur.degree);
    if (cur.page && cur.page !== '1') p.set('page', cur.page);
    router.push(`${pathname}?${p.toString()}`);
  };

  const filteredStaff = props.staffList.filter(s =>
    !staffQuery ||
    s.staffCode.includes(staffQuery) ||
    s.nationalCode.includes(staffQuery) ||
    (s.firstName + ' ' + s.lastName).includes(staffQuery)
  );

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
                ◀ قبلی
              </button>
              <button
                onClick={() => selectedStuIdx < props.students.length - 1 && setSelectedStuIdx(selectedStuIdx + 1)}
                disabled={selectedStuIdx === props.students.length - 1}
                className="px-2 py-1 bg-white border border-slate-400 rounded hover:bg-slate-50 disabled:opacity-40"
              >
                بعدی ▶
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
            <div className="bg-white p-3 sm:p-5 border border-slate-400 rounded-b-md space-y-3">
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
                    <input type="text" defaultValue="محمد" className="bg-white border border-slate-300 px-2 py-1 rounded" />
                    <div className="flex items-center gap-1">
                      <span>جنس:</span>
                      <select className="bg-white border border-slate-300 px-1 py-1 rounded">
                        <option>مرد</option>
                        <option>زن</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-red-700 font-bold">* تاریخ تولد:</span>
                    <input type="text" defaultValue="۱۳۸۳/۰۵/۱۴" className="bg-white border border-slate-300 px-2 py-1 rounded font-mono" />
                    <div className="flex items-center gap-1">
                      <span>ش. شناسنامه:</span>
                      <input type="text" defaultValue="۳۴۱۶" className="bg-white border border-slate-300 px-1 py-1 rounded font-mono w-full" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-red-700 font-bold">* کد ملی:</span>
                    <input type="text" defaultValue={currentStudent.nationalCode} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-mono font-bold" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>محل صدور:</span>
                    <input type="text" defaultValue="تهران" className="bg-white border border-slate-300 px-2 py-1 rounded" />
                    <span>محل تولد: تهران</span>
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
                    <select className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-semibold">
                      <option>روزانه (کد ۱)</option>
                      <option>نوبت دوم / شبانه (کد ۲)</option>
                      <option>غیرانتفاعی (کد ۴)</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-red-700 font-bold">* کد و نام رشته:</span>
                    <input type="text" defaultValue={`۵۴۸ — ${currentStudent.majorName}`} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-bold" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>دانشکده:</span>
                    <input type="text" defaultValue="دانشکده فنی و مهندسی (کد ۱۲)" className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded" />
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
                    <select className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded">
                      <option>سنجش و آزمون سراسری (کد ۳)</option>
                      <option>پذیرش بر اساس سوابق تحصیلی</option>
                      <option>انتقال و میهمانی</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>شماره همراه:</span>
                    <input type="text" defaultValue={currentStudent.mobile || '۰۹۳۳۱۰۱۰۱۰۱'} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-mono" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>آیین‌نامه ملاک:</span>
                    <input type="text" defaultValue={currentStudent.regulationTitle} className="col-span-2 bg-slate-100 border border-slate-300 px-2 py-1 rounded font-semibold text-indigo-950" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── بخش ۲: اطلاعات تکمیلی دانشجو ── */}
          {stuTab === 'info_combined' && currentStudent && (
            <div className="bg-white p-3 sm:p-5 border border-slate-400 rounded-b-md space-y-3">
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
                      <input type="text" defaultValue="دکتر محمد رضایی (کد ۱۰۱)" className="bg-yellow-100 border border-slate-300 px-2 py-1 rounded w-full font-bold" />
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
                      <input type="text" defaultValue="بدون بورس (آزاد)" className="bg-white border border-slate-300 px-2 py-1 rounded w-full" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-24">Full Name:</span>
                      <input type="text" defaultValue="Ali Rezaei" className="bg-white border border-slate-300 px-2 py-1 rounded w-full font-mono text-left" dir="ltr" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-24">Father Name:</span>
                      <input type="text" defaultValue="Mohammad" className="bg-white border border-slate-300 px-2 py-1 rounded w-full font-mono text-left" dir="ltr" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-24">شماره پاسپورت:</span>
                      <input type="text" placeholder="—" className="bg-white border border-slate-300 px-2 py-1 rounded w-full font-mono" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-24">شماره بین‌المللی:</span>
                      <input type="text" placeholder="—" className="bg-white border border-slate-300 px-2 py-1 rounded w-full font-mono" />
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
            <div className="bg-white p-3 sm:p-5 border border-slate-400 rounded-b-md space-y-3">
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
            <div className="bg-white p-3 sm:p-5 border border-slate-400 rounded-b-md space-y-3">
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
            <div className="bg-white p-3 sm:p-4 border border-slate-400 rounded-b-md space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
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
                  {transcript && transcript.length > 0 && (
                    <button
                      onClick={() => printOfficialTranscript(currentStudent, groupTranscript(transcript))}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-700 text-white hover:bg-emerald-800"
                    >
                      🖨️ مشاهده / چاپ
                    </button>
                  )}
                </div>
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
                </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <OfficialTranscriptView student={currentStudent} summary={groupTranscript(transcript)} />
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
                {(pg?.q || pg?.status !== 'ALL' || (pg?.degree ?? 0) > 0) && (
                  <button type="button" onClick={() => { setSearchQuery(''); nav({ q: '', status: 'ALL', degree: '0' }); }} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-xs rounded">✖ پاک‌سازی فیلتر</button>
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
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold">
                    <tr>
                      <th className="p-2">شماره دانشجویی</th>
                      <th className="p-2">نام و نام خانوادگی</th>
                      <th className="p-2">کد ملی</th>
                      <th className="p-2">رشته</th>
                      <th className="p-2">مقطع</th>
                      <th className="p-2">سال ورود</th>
                      <th className="p-2">وضعیت</th>
                      <th className="p-2 text-left">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.students.map((s) => (
                      <tr key={s.id} className="border-b border-slate-200 hover:bg-slate-50">
                        <td className="p-2 font-mono font-bold text-indigo-950" dir="ltr">{s.studentCode}</td>
                        <td className="p-2 font-bold">{s.firstName} {s.lastName}</td>
                        <td className="p-2 font-mono" dir="ltr">{s.nationalCode}</td>
                        <td className="p-2">{s.majorName}</td>
                        <td className="p-2">{s.degreeLevel}</td>
                        <td className="p-2 font-mono">{s.entryYear}</td>
                        <td className="p-2">
                          <span title={s.samaStatusCode ? `کد سما: ${s.samaStatusCode}` : s.status} className={`${studentStatusChip(s.status)} text-[10px] font-bold px-2 py-0.5 rounded-full`}>
                            {studentStatusFa(s.status, s.samaStatusCode)}
                          </span>
                        </td>
                        <td className="p-2 text-left">
                          <button
                            onClick={() => {
                              const realIdx = props.students.findIndex(x => x.id === s.id);
                              setSelectedStuIdx(realIdx >= 0 ? realIdx : 0);
                              setStuTab('info_combined');
                            }}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-[11px] px-2.5 py-1 rounded font-bold"
                          >
                            مشاهده پرونده 🔍
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* صفحه‌بندی */}
              {pg && pg.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 text-xs">
                  <button disabled={pg.page <= 1} onClick={() => nav({ page: String(pg.page - 1) })} className="px-3 py-1.5 bg-white border border-slate-300 rounded font-bold disabled:opacity-40 hover:bg-slate-50">قبلی ◀</button>
                  <span className="font-bold text-slate-700">صفحه {pg.page.toLocaleString('fa-IR')} از {pg.totalPages.toLocaleString('fa-IR')}</span>
                  <button disabled={pg.page >= pg.totalPages} onClick={() => nav({ page: String(pg.page + 1) })} className="px-3 py-1.5 bg-white border border-slate-300 rounded font-bold disabled:opacity-40 hover:bg-slate-50">▶ بعدی</button>
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
            <div className="bg-white p-3 sm:p-5 border border-slate-400 rounded-b-md space-y-3">
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
            <div className="bg-white p-3 sm:p-5 border border-slate-400 rounded-b-md space-y-3">
              <div className="space-y-2 border border-slate-300 p-3 rounded bg-slate-50 max-w-2xl mx-auto">
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="font-bold">مدرک تحصیلی:</span>
                  <input type="text" defaultValue={currentStaff.degree || 'دکتری تخصصی (Ph.D)'} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-bold" />
                </div>
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="font-bold">نوع همکاری:</span>
                  <select defaultValue={currentStaff.staffType} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-semibold">
                    <option value="FULL_TIME">هیئت علمی تمام‌وقت</option>
                    <option value="ADJUNCT">استاد مدعو / حق‌التدریس</option>
                    <option value="PART_TIME">پاره‌وقت</option>
                  </select>
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
                  <input type="text" defaultValue="مدیر گروه آموزشی" className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded" />
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
            <div className="bg-white p-3 sm:p-5 border border-slate-400 rounded-b-md space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 border border-slate-300 p-2.5 rounded bg-slate-50">
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>کد ملی:</span>
                    <input type="text" defaultValue={currentStaff.nationalCode} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-mono font-bold" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>تاریخ تولد:</span>
                    <input type="text" defaultValue="۱۳۶۰/۰۴/۱۵" className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-mono" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>تلفن همراه:</span>
                    <input type="text" defaultValue={currentStaff.mobile || '۰۹۱۲۱۱۱۱۱۱۱'} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-mono" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>تلفن دفتر / ثابت:</span>
                    <input type="text" defaultValue="۰۲۱-۸۸۴۵۶۷۸۹" className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-mono" />
                  </div>
                </div>

                <div className="space-y-1.5 border border-slate-300 p-2.5 rounded bg-slate-50">
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>پست الکترونیکی:</span>
                    <input type="email" defaultValue="rezaei@afagh.ac.ir" className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-mono text-left" dir="ltr" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>وضعیت تأهل:</span>
                    <div className="col-span-2 flex items-center gap-4">
                      <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name="prof_married" defaultChecked /> متأهل</label>
                      <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name="prof_married" /> مجرد</label>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span>آدرس محل سکونت:</span>
                    <input type="text" defaultValue="تهران، بزرگراه چمران، کوی اساتید، پلاک ۱۸" className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded" />
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
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold">
                    <tr>
                      <th className="p-2">کد استاد</th>
                      <th className="p-2">نام و نام خانوادگی</th>
                      <th className="p-2">کد ملی</th>
                      <th className="p-2">گروه آموزشی</th>
                      <th className="p-2">مرتبه علمی</th>
                      <th className="p-2">مدرک</th>
                      <th className="p-2">نوع همکاری</th>
                      <th className="p-2 text-left">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStaff.slice(0, staffVisible).map((st, idx) => (
                      <tr key={st.id} className="border-b border-slate-200 hover:bg-slate-50">
                        <td className="p-2 font-mono font-bold text-slate-900" dir="ltr">{st.staffCode}</td>
                        <td className="p-2 font-bold">{st.firstName} {st.lastName}</td>
                        <td className="p-2 font-mono" dir="ltr">{st.nationalCode}</td>
                        <td className="p-2">{st.departmentName && st.departmentName !== '—' ? st.departmentName : '—'}</td>
                        <td className="p-2 font-semibold text-indigo-950">{st.academicRank}</td>
                        <td className="p-2">{st.degree}</td>
                        <td className="p-2">{st.staffType}</td>
                        <td className="p-2 text-left">
                          <button
                            onClick={() => {
                              const realIdx = props.staffList.findIndex(x => x.id === st.id);
                              setSelectedProfIdx(realIdx >= 0 ? realIdx : 0);
                              setProfTab('info_combined');
                            }}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-[11px] px-2.5 py-1 rounded font-bold"
                          >
                            مشاهده پرونده 🔍
                          </button>
                        </td>
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

    </div>
  );
}
