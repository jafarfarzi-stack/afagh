'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getTranscript, getTranscriptRegulation, setStudentRegulationAction, type TranscriptRow } from './actions';
import type { RegulationConfig } from '@/lib/regulations-engine';
import { ClientTh, ServerTh, useClientTable, type ColumnDef } from '@/components/DataTable';
import { QUOTA_FA, STUDENT_STATUS_FA, gradeStatusChip, gradeStatusFa, quotaFa, studentStatusChip, studentStatusFa } from '@/lib/student-labels';
import { gradeStatusCodeTitle, gradeStatusLegendLine } from '@/lib/grade-status-codes';

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
  facultyName?: string;
  degreeLevel: string;
  degreeCode: string;
  regulationTitle: string;
  fatherName?: string;
  birthCertNo?: string;
  birthDate?: string | null;
  placeOfBirth?: string;
  placeOfIssue?: string;
  nationality?: string | null;
  photoKey?: string | null;
  acceptanceType?: string | null;
  acceptanceAllocation?: string | null;
  studyingMode?: string | null;
  trainingMethod?: string | null;
  graduateDate?: string | null;
  regulationId?: number | null;
  role: string;
};

export type RegulationPick = { id: number; title: string; degreeLevelId: number };

export type Pagination = {
  total: number;
  page: number;
  per: number;
  totalPages: number;
  q: string;
  status: string;
  degree: number;
  sort?: string;
  f_code?: string;
  f_name?: string;
  f_nc?: string;
  f_major?: string;
  f_year?: string;
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
  cooperationType?: string | null;
  birthDate?: string | null;
  phone?: string | null;
  address?: string | null;
  email?: string | null;
  maritalStatus?: string | null;
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
  /** وضعیت همان نیمسال از فایل (نه وضعیت کلی دانشجو) */
  termStatusTitle: string | null;
  /** مشروطی: اول از فایل Mashroot، وگرنه معدل زیر ۱۲ */
  probation: boolean;
  rows: TranscriptRow[];
  taken: number;
  passed: number;
  failed: number;
  points: number;
  gpa: number | null;
  /** جمع تجمیعی تا پایان این نیمسال (سطر «کل» سما) */
  cumTaken: number;
  cumPassed: number;
  cumFailed: number;
  cumPoints: number;
  cumGpa: number | null;
};

export type TranscriptSummary = {
  terms: TermGroup[];
  totalTaken: number;
  totalPassed: number;
  gpa: number | null;
  /** آستانه‌های آیین‌نامه‌ای که با آن حساب شده (برای نمایش در سربرگ) */
  passGrade: number;
  probThreshold: number;
};

/** آستانه‌های اجرایی آیین‌نامه ملاک (پیش‌فرض: قبولی ۱۰، مشروطی ۱۲) */
export type RegThresholds = { pass: number; prob: number; exclFailed: boolean };
export function regThresholds(cfg: RegulationConfig | null | undefined): RegThresholds {
  const pass = Number(cfg?.grading_and_gpa?.default_passing_grade ?? 10);
  const prob = Number(cfg?.probation_and_tenure?.probation_gpa_threshold ?? 12);
  return {
    pass: Number.isFinite(pass) ? pass : 10,
    prob: Number.isFinite(prob) ? prob : 12,
    exclFailed: cfg?.grading_and_gpa?.failed_course_gpa_policy === 'EXCLUDE_IF_PASSED',
  };
}

/** درس‌هایی که دست‌کم یک بار قبول شده‌اند (برای سیاست حذف مردودی از معدل کل) */
function passedCourseSet(rows: TranscriptRow[], pass: number): Set<string> {
  const set = new Set<string>();
  for (const r of rows) {
    const g = numOrNull(r.gradeValue);
    if (r.gradeStatus === 'EXEMPT' || r.gradeStatus === 'PASSED_NO_GRADE') set.add(r.courseCode);
    else if (g !== null && g >= pass && (r.gradeStatus === 'FINALIZED' || r.gradeStatus === 'TEMPORARY')) set.add(r.courseCode);
  }
  return set;
}

function summarizeTerm(rows: TranscriptRow[], pass = 10): { taken: number; passed: number; failed: number; wsum: number; wunits: number } {
  let taken = 0, passed = 0, wsum = 0, wunits = 0;
  for (const r of rows) {
    const u = numOrNull(r.units) ?? 0;
    const g = numOrNull(r.gradeValue);
    if (r.gradeStatus === 'PENDING') continue;
    taken += u;
    if (r.gradeStatus === 'EXEMPT' || r.gradeStatus === 'PASSED_NO_GRADE') passed += u;
    else if (g !== null && g >= pass) passed += u;
    // معدل نیمسال: حقیقت تاریخی همان نیمسال — همه نمرات نهایی (ماده ۶ آیین‌نامه ۱۴۰۲)
    if (g !== null && (r.gradeStatus === 'FINALIZED' || r.gradeStatus === 'TEMPORARY')) {
      wsum += g * u;
      wunits += u;
    }
  }
  return { taken, passed, failed: Math.max(0, taken - passed), wsum, wunits };
}

/** جمع معدل کل با سیاست نمره مردودی آیین‌نامه */
function summarizeTotal(rows: TranscriptRow[], th: RegThresholds): { wsum: number; wunits: number } {
  const passedSet = th.exclFailed ? passedCourseSet(rows, th.pass) : null;
  let wsum = 0, wunits = 0;
  for (const r of rows) {
    const u = numOrNull(r.units) ?? 0;
    const g = numOrNull(r.gradeValue);
    if (g === null || (r.gradeStatus !== 'FINALIZED' && r.gradeStatus !== 'TEMPORARY')) continue;
    // EXCLUDE_IF_PASSED: مردودی درسی که بعداً قبول شده از معدل کل حذف می‌شود
    if (passedSet && g < th.pass && passedSet.has(r.courseCode)) continue;
    wsum += g * u;
    wunits += u;
  }
  return { wsum, wunits };
}

export function groupTranscript(rows: TranscriptRow[], cfg?: RegulationConfig | null): TranscriptSummary {
  const th = regThresholds(cfg);
  const map = new Map<string, TranscriptRow[]>();
  for (const r of rows) {
    const k = r.termCode || '—';
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  const terms: TermGroup[] = [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'en'))
    .map(([termCode, rs]) => {
      const s = summarizeTerm(rs, th.pass);
      const gpa = s.wunits ? s.wsum / s.wunits : null;
      const fileProb = rs.find(r => r.termProbation !== null)?.termProbation ?? null;
      return {
        termCode, termTitle: rs[0]?.termTitle ?? null,
        termStatusTitle: rs.find(r => r.termStatusTitle)?.termStatusTitle ?? null,
        probation: fileProb ?? (gpa !== null && gpa < th.prob),
        rows: rs,
        taken: s.taken, passed: s.passed, failed: s.failed, points: s.wsum,
        gpa,
        cumTaken: 0, cumPassed: 0, cumFailed: 0, cumPoints: 0, cumGpa: null,
      };
    });
  // جمع تجمیعی «کل» تا پایان هر نیمسال (معدل کل با سیاست نمره مردودی آیین‌نامه)
  const passedSet = th.exclFailed ? passedCourseSet(rows, th.pass) : null;
  let ct = 0, cp = 0, cw = 0, cwu = 0;
  for (const t of terms) {
    const s = summarizeTerm(t.rows, th.pass);
    ct += s.taken; cp += s.passed;
    for (const r of t.rows) {
      const u = numOrNull(r.units) ?? 0;
      const g = numOrNull(r.gradeValue);
      if (g === null || (r.gradeStatus !== 'FINALIZED' && r.gradeStatus !== 'TEMPORARY')) continue;
      if (passedSet && g < th.pass && passedSet.has(r.courseCode)) continue;
      cw += g * u; cwu += u;
    }
    t.cumTaken = ct; t.cumPassed = cp; t.cumFailed = Math.max(0, ct - cp);
    t.cumPoints = cw; t.cumGpa = cwu ? cw / cwu : null;
  }
  const all = summarizeTerm(rows, th.pass);
  const tot = summarizeTotal(rows, th);
  return { terms, totalTaken: all.taken, totalPassed: all.passed, gpa: tot.wunits ? tot.wsum / tot.wunits : null, passGrade: th.pass, probThreshold: th.prob };
}

export const faNum = (n: number | null | undefined, digits = 2): string =>
  n == null ? '—' : n.toLocaleString('fa-IR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** میلادی → جلالی (برای تاریخ تهیه/تولد در کارنامه) */
export function g2j(gy: number, gm: number, gd: number): [number, number, number] {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  let jl = 0, jm = 0, jd = 0;
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 365 * gy + ~~((gy2 + 3) / 4) - ~~((gy2 + 99) / 100) + ~~((gy2 + 399) / 400) - 80 + gd + g_d_m[gm - 1];
  jy += 33 * ~~(days / 12053);
  days %= 12053;
  jy += 4 * ~~(days / 1461);
  days %= 1461;
  if (days > 365) { jy += ~~((days - 1) / 365); days = (days - 1) % 365; }
  const jm0 = days < 186 ? 1 + ~~(days / 31) : 7 + ~~((days - 186) / 30);
  const jd0 = days < 186 ? 1 + (days % 31) : 1 + ((days - 186) % 30);
  jl = jy; jm = jm0; jd = jd0;
  void breaks;
  return [jl, jm, jd];
}

export function todayJalali(): string {
  const d = new Date();
  const [jy, jm, jd] = g2j(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}

export function dateToJalali(v: string | null | undefined): string {
  if (!v) return '—';
  const s = String(v);
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) {
    // فرمت‌های دیگر (مثل خروجی Date) را با Date پارس کن
    const d = new Date(s);
    if (isNaN(d.getTime())) return s.slice(0, 10);
    m = [ '', String(d.getUTCFullYear()), String(d.getUTCMonth() + 1), String(d.getUTCDate()) ];
  }
  const [jy, jm, jd] = g2j(+m[1], +m[2], +m[3]);
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}

/** معدل به حروف فارسی (مثل «هفده و بیست و شش صدم») */
const FA_ONES = ['صفر', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه', 'ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده', 'بیست'];
export function faWords(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const neg = n < 0 ? 'منفی ' : '';
  const a = Math.abs(Math.round(n * 100) / 100);
  const ip = Math.floor(a);
  const fp = Math.round((a - ip) * 100);
  const ipW = ip <= 20 ? FA_ONES[ip] : String(ip);
  if (!fp) return `${neg}${ipW}`;
  const fpW = fp <= 20 ? FA_ONES[fp] : fp < 100 ? `${FA_ONES[Math.floor(fp / 10) * 10 <= 20 ? Math.floor(fp / 10) * 10 : 20]} و ${FA_ONES[fp % 10]}` : String(fp);
  return `${neg}${ipW} و ${fpW} صدم`;
}

/** نرمال‌سازی نوع درس به ۶ ستون جدول سما */
export function courseTypeGroup(t: string | null | undefined): string {
  const s = (t || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک');
  if (/پایان.?نامه|thesis/i.test(s)) return 'پایان‌نامه';
  if (/جبران/i.test(s)) return 'جبرانی';
  if (/اختیار/i.test(s)) return 'اختیاری';
  if (/پایه/i.test(s)) return 'پایه';
  if (/اصلی|تخصص/i.test(s)) return 'اصلی-تخصصی';
  if (/عموم/i.test(s)) return 'عمومی';
  return 'اختیاری';
}

export type TypeBreakdown = { type: string; units: number; gpa: number | null };
export function breakdownByType(rows: TranscriptRow[], cfg?: RegulationConfig | null): TypeBreakdown[] {
  const th = regThresholds(cfg);
  const order = ['عمومی', 'پایه', 'اصلی-تخصصی', 'اختیاری', 'جبرانی', 'پایان‌نامه'];
  const passedSet = th.exclFailed ? passedCourseSet(rows, th.pass) : null;
  const acc = new Map<string, { units: number; wsum: number; wunits: number }>();
  for (const r of rows) {
    const g = courseTypeGroup(r.courseType);
    if (!acc.has(g)) acc.set(g, { units: 0, wsum: 0, wunits: 0 });
    const a = acc.get(g)!;
    const u = numOrNull(r.units) ?? 0;
    const gv = numOrNull(r.gradeValue);
    if (r.gradeStatus !== 'PENDING' && (gv === null || gv >= th.pass)) a.units += u;
    if (gv !== null && (r.gradeStatus === 'FINALIZED' || r.gradeStatus === 'TEMPORARY')) {
      if (passedSet && gv < th.pass && passedSet.has(r.courseCode)) continue;
      a.wsum += gv * u; a.wunits += u;
    }
  }
  return order.map(t => {
    const a = acc.get(t);
    return { type: t, units: a?.units ?? 0, gpa: a && a.wunits ? a.wsum / a.wunits : null };
  });
}

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

/** نمای رسمی کارنامه با فرمت سما: ۳ نیمسال کنار هم + سربرگ/پانوشت + صفحه دوم تفکیکی */
function OfficialTranscriptView({ student, summary, logoUrl, codeLabels }: { student: StudentItem; summary: TranscriptSummary; logoUrl?: string | null; codeLabels?: CodeLabels | null }) {
  const lbl = {
    accept: (v: string | null | undefined) => {
      if (!v || v === '—') return '—';
      return codeLabels?.accept[v] || codeLabels?.acceptByTarget[v] || v;
    },
    period: (v: string | null | undefined) => codeLabel(codeLabels?.period, v),
    quota: (v: string | null | undefined) => codeLabel(codeLabels?.quota, v),
  };
  const probation = summary.terms.filter(t => t.probation).length;
  const info: [string, string][] = [
    ['نام خانوادگی و نام', `${student.lastName} ${student.firstName}`],
    ['شماره دانشجویی', student.studentCode],
    ['نام پدر', student.fatherName || '—'],
    ['شماره شناسنامه', student.birthCertNo || '—'],
    ['محل صدور', student.placeOfIssue || '—'],
    ['کد ملی', student.nationalCode],
    ['تاریخ تولد', dateToJalali(student.birthDate)],
    ['مقطع', student.degreeLevel],
    ['نوع دوره', lbl.period(student.trainingMethod) !== '—' ? lbl.period(student.trainingMethod) : (student.studyingMode || '—')],
    ['دانشکده', student.facultyName || '—'],
    ['رشته تحصیلی', student.majorName],
    ['نحوه ورود', lbl.accept(student.acceptanceType)],
    ['شیوه آموزشی', student.studyingMode || '—'],
    ['سهمیه قبولی', quotaFa(student.quotaType)],
    ['سهمیه نهایی', quotaFa(student.quotaType)],
    ['سهمیه ثبت‌نامی', lbl.quota(student.acceptanceAllocation) !== '—' ? lbl.quota(student.acceptanceAllocation) : quotaFa(student.quotaType)],
    ['ملیت', student.nationality === '120001' ? 'ایرانی' : student.nationality || '—'],
    ['استاد راهنما', '—'],
  ];
  // گروه‌بندی ۳تایی نیمسال‌ها (مثل سما)
  const chunks: TermGroup[][] = [];
  for (let i = 0; i < summary.terms.length; i += 3) chunks.push(summary.terms.slice(i, i + 3));
  const breakdown = breakdownByType(summary.terms.flatMap(t => t.rows));

  // ── راهنمای کدهای «وضع» نمره ──
  // ستون وضع فقط «کد» می‌گیرد (عنوان بلند جدول سه‌ستونی را به هم می‌ریخت)؛
  // توضیح کدها یک‌جا و *در یک خط* پایین کارنامه می‌آید تا سند طولانی نشود.
  // عنوان دقیقِ سیستم قدیمی (جدول مرجع/میز تطبیق) بر عنوان مرجع مقدم است.
  const allRows = summary.terms.flatMap(t => t.rows);
  const titleByCode = new Map<string, string>();
  for (const r of allRows) {
    if (r.gradeStatusCode && r.gradeStatusTitle && !titleByCode.has(r.gradeStatusCode)) {
      titleByCode.set(r.gradeStatusCode, r.gradeStatusTitle);
    }
  }
  const statusLegendLine = gradeStatusLegendLine(
    allRows.map(r => r.gradeStatusCode),
    code => titleByCode.get(code) ?? null,
    '', // برچسب در خودِ JSX چاپ می‌شود
  );

  const termCell = (t: TermGroup) => (
    <td key={t.termCode} className="align-top border-l border-slate-400 p-0" style={{ width: '33.33%' }}>
      <div className="bg-slate-100 border-b border-slate-300 px-1 py-1 font-extrabold text-[10px] text-center">
        نیمسال <span className="font-mono" dir="ltr">{t.termCode}</span>
        <span className="block font-normal text-slate-700">وضعیت نیمسال: {t.termStatusTitle || '—'} — <b className={t.probation ? 'text-red-700' : 'text-emerald-700'}>{t.probation ? 'مشروط' : 'عادی'}</b></span>
      </div>
      <table className="w-full table-fixed text-[9px]">
        {/* عرض ستون‌ها ثابت: هیچ مقدار بلندی (مثل عنوان وضع نمره) نمی‌تواند
            ستون را باز کند و چیدمان سه نیمسال کنار هم را به هم بریزد */}
        <colgroup>
          <col style={{ width: '20%' }} />
          <col />
          <col style={{ width: '10%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '11%' }} />
        </colgroup>
        <thead>
          <tr className="border-b border-slate-300 text-slate-500 whitespace-nowrap">
            <th className="p-1">کد درس</th>
            <th className="p-1">نام درس</th>
            <th className="p-1">واحد</th>
            <th className="p-1">نمره</th>
            <th className="p-1">وضع</th>
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100">
              <td className="p-1 font-mono text-center overflow-hidden" dir="ltr"><span className="block truncate">{r.courseCode}</span></td>
              <td className="p-1 overflow-hidden" title={r.courseTitle}><span className="block truncate">{r.courseTitle}</span></td>
              <td className="p-1 text-center font-mono">{r.units ?? '—'}</td>
              <td className="p-1 text-center font-mono font-bold">{r.gradeValue ?? '—'}</td>
              {/* فقط کد وضع نمره — راهنمای کدها پایین کارنامه است */}
              <td
                className="p-1 text-center font-mono font-bold"
                dir="ltr"
                title={gradeStatusCodeTitle(r.gradeStatusCode, r.gradeStatus, r.gradeStatusTitle)}
              >
                {r.gradeStatusCode || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t-2 border-slate-400 text-[9px] px-1 py-1 space-y-0.5 bg-slate-50">
        <p><b>نیمسال</b> — اخذشده: <b className="font-mono">{faNum(t.taken, 0)}</b> گذرانده: <b className="font-mono">{faNum(t.passed, 0)}</b> مردودی: <b className="font-mono">{faNum(t.failed, 0)}</b></p>
        <p>معدل: <b className="font-mono">{faNum(t.gpa)}</b> امتیاز: <b className="font-mono">{faNum(t.points, 1)}</b></p>
        <p className="border-t border-slate-300 pt-0.5"><b>کل</b> — اخذشده: <b className="font-mono">{faNum(t.cumTaken, 0)}</b> گذرانده: <b className="font-mono">{faNum(t.cumPassed, 0)}</b> مردودی: <b className="font-mono">{faNum(t.cumFailed, 0)}</b></p>
        <p>معدل: <b className="font-mono">{faNum(t.cumGpa)}</b> امتیاز: <b className="font-mono">{faNum(t.cumPoints, 1)}</b> موثر: <b className="font-mono">{faNum(t.cumPassed, 0)}</b></p>
      </div>
    </td>
  );

  return (
    <div className="border-2 border-slate-700 text-slate-900 bg-white">
      {/* سربرگ سما */}
      <div className="flex items-start justify-between border-b-2 border-slate-700 px-3 py-2">
        <div className="text-[10px] text-center">
          <p className="font-bold">باسمه تعالی</p>
          <p>اداره کل امور آموزشی</p>
          <p className="font-extrabold">کارنامه کل</p>
          <p className="mt-1">تاریخ تهیه: <b className="font-mono">{todayJalali()}</b></p>
        </div>
        <div className="text-center">
          <p className="text-[10px]">موسسه آموزش عالی غیرانتفاعی - غیردولتی آفاق</p>
          {student.photoKey ? (
            <div className="mx-auto mt-1 w-14 h-[70px] bg-slate-100 border border-slate-300 text-[8px] text-slate-400 flex items-center justify-center">عکس دانشجو</div>
          ) : null}
        </div>
        <div className="w-16 h-16 flex items-center justify-center">
          {logoUrl ? <img src={logoUrl} alt="ارم دانشگاه" className="max-w-16 max-h-16 object-contain" /> : <span className="text-[9px] text-slate-400 border border-dashed border-slate-300 rounded p-1">ارم دانشگاه</span>}
        </div>
      </div>
      {/* مشخصات */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-slate-300 border-b-2 border-slate-700 text-[10px]">
        {info.map(([k, v]) => (
          <div key={k} className="bg-white px-2 py-1 flex justify-between gap-1">
            <span className="font-bold whitespace-nowrap">{k}:</span>
            <span className="text-left">{v}</span>
          </div>
        ))}
      </div>
      {/* نیمسال‌ها ۳تایی */}
      <table className="w-full border-collapse">
        <tbody>
          {chunks.map((ch, i) => (
            <tr key={i} className="border-b-2 border-slate-700">{ch.map(termCell)}</tr>
          ))}
        </tbody>
      </table>
      {/* راهنمای کدهای ستون «وضع» — یک خط، با ویرگول، تا کارنامه طولانی نشود */}
      {statusLegendLine && (
        <div className="border-t-2 border-slate-700 px-3 py-1.5 text-[9px] leading-5">
          <p className="font-bold text-slate-800">
            <span className="font-extrabold">راهنمای کد وضعیت نمره: </span>
            <span className="font-mono">{statusLegendLine}</span>
          </p>
          <p className="text-slate-500">
            کدهای عددی = کدهای وضعیت نمرهٔ سیستم قدیمی؛ کدهای با پیشوند
            <b className="font-mono" dir="ltr"> N </b>
            = وضعیت‌های داخلی سامانهٔ جدید.
          </p>
        </div>
      )}
      {/* پانوشت */}
      <div className="border-t-2 border-slate-700 px-3 py-2 text-[10px] space-y-1">
        <div className="flex flex-wrap gap-x-6">
          <span>تعداد نیمسال مشروط: <b className="font-mono">{probation.toLocaleString('fa-IR')}</b></span>
          <span>وضعیت کلی دانشجو: <b>{studentStatusFa(student.status, student.samaStatusCode)}</b></span>
          <span>تاریخ شروع تحصیل: <b className="font-mono">{student.entryYear}</b></span>
          <span>تاریخ توقف تحصیل: <b className="font-mono">{student.graduateDate || '—'}</b></span>
        </div>
        <div className="flex flex-wrap gap-x-6">
          <span>معدل کل به عدد: <b className="font-mono">{faNum(summary.gpa)}</b></span>
          <span>معدل کل به حروف: <b>{faWords(summary.gpa)}</b></span>
        </div>
        <p className="text-center text-slate-600">این کارنامه بدون مهر و امضا فقط برای اطلاع دانشجو صادر شده است و ارزش دیگری ندارد</p>
        <div className="flex justify-between pt-2">
          <span>امضاء رئیس خدمات آموزش</span>
          <span>امضاء و مهر اداره کل آموزش</span>
          <span>امضاء و مهر امور آموزشی دانشگاه منتخب</span>
        </div>
      </div>
      {/* صفحه دوم: جدول وضعیت دروس گذرانده */}
      <div className="border-t-2 border-slate-700 px-3 py-2">
        <p className="font-extrabold text-[11px] mb-1">جدول وضعیت دروس گذرانده (کاتالوگ رشته)</p>
        <table className="w-full text-[10px] border border-slate-400">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-300">
              <th className="p-1 border-l border-slate-300">نوع درس</th>
              {breakdown.map(b => <th key={b.type} className="p-1 border-l border-slate-300">{b.type}</th>)}
              <th className="p-1">مجموع</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-200">
              <td className="p-1 font-bold border-l border-slate-300">تعداد واحد</td>
              {breakdown.map(b => <td key={b.type} className="p-1 text-center font-mono border-l border-slate-300">{faNum(b.units, 1)}</td>)}
              <td className="p-1 text-center font-mono font-bold">{faNum(summary.totalPassed, 1)}</td>
            </tr>
            <tr>
              <td className="p-1 font-bold border-l border-slate-300">معدل</td>
              {breakdown.map(b => <td key={b.type} className="p-1 text-center font-mono border-l border-slate-300">{faNum(b.gpa)}</td>)}
              <td className="p-1 text-center font-mono font-bold">{faNum(summary.gpa)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export type CodeLabels = {
  accept: Record<string, string>;
  acceptByTarget: Record<string, string>;
  period: Record<string, string>;
  quota: Record<string, string>;
};

/** حل برچسب فارسی کد سما با fallback به خود کد */
export function codeLabel(map: Record<string, string> | undefined, v: string | null | undefined): string {
  if (!v || v === '—') return '—';
  return (map && map[v]) || v;
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
                  <td className="p-1.5 text-center whitespace-nowrap">
                    {/* کد وضع نمره (همان کد کارنامهٔ رسمی) + عنوان برای خوانایی روی صفحه */}
                    <span
                      className="inline-block min-w-[2rem] px-1 py-0.5 ml-1 rounded bg-slate-200 text-slate-800 font-mono text-[10px] font-bold"
                      dir="ltr"
                      title={gradeStatusCodeTitle(r.gradeStatusCode, r.gradeStatus, r.gradeStatusTitle)}
                    >
                      {r.gradeStatusCode || '—'}
                    </span>
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
                <OfficialTranscriptView student={currentStudent} summary={groupTranscript(transcript)} logoUrl={props.logoUrl} codeLabels={props.codeLabels} />
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

    </div>
  );
}
