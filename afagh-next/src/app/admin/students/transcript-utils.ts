// ═══════════════════════════════════════════════════════════════════════
//  هستهٔ خالص کارنامه — بدون React، بدون DB، بدون DOM.
//  معدل/مشروطی/تفکیک نوع درس + تبدیل تاریخ جلالی + رقم و حروف فارسی.
//  همه قابل Unit Test → tests/transcript-summary.test.ts
// ═══════════════════════════════════════════════════════════════════════
import type { TermGroup, TranscriptSummary } from './types';
import type { TranscriptRow } from './actions';
import type { RegulationConfig } from '@/lib/regulations-engine';

/* ── کارنامه رسمی: گروه‌بندی ترم + معدل ── */
export const numOrNull = (v: string | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
/** آستانه‌های اجرایی آیین‌نامه ملاک (پیش‌فرض: قبولی ۱۰، مشروطی ۱۲) */
export type RegThresholds = {
  pass: number;
  prob: number;
  exclFailed: boolean;        // حذف مردودی از کل (EXCLUDE_IF_PASSED یا EXCLUDE_IF_PASSED_1391)
  exclFromTerm: boolean;      // حذف مردودی از نیمسال (فقط EXCLUDE_IF_PASSED_1391)
  retakeMinGrade: number;     // حد نصاب قبولی مجدد
  regulationLabel?: string;   // برچسب آیین‌نامه
  dedupeRepeated: boolean;    // فقط بهترین نمرهٔ هر کد درس در معدل کل شمرده شود (سوییچ ادمین)
};
export function regThresholds(cfg: RegulationConfig | null | undefined): RegThresholds {
  const passRaw = cfg?.grading_and_gpa?.default_passing_grade;
  const probRaw = cfg?.probation_and_tenure?.probation_gpa_threshold;
  const retakeRaw = cfg?.grading_and_gpa?.retakeMinGrade;
  const pass = passRaw != null ? Number(passRaw) : 10;
  const prob = probRaw != null ? Number(probRaw) : 12;
  const policy = cfg?.grading_and_gpa?.failed_course_gpa_policy;
  const retakeMin = retakeRaw != null ? Number(retakeRaw) : pass;
  return {
    pass: Number.isFinite(pass) ? pass : 10,
    prob: Number.isFinite(prob) ? prob : 12,
    exclFailed: policy === 'EXCLUDE_IF_PASSED' || policy === 'EXCLUDE_IF_PASSED_1391',
    exclFromTerm: policy === 'EXCLUDE_IF_PASSED_1391',
    retakeMinGrade: Number.isFinite(retakeMin) ? retakeMin : 10,
    regulationLabel: cfg?.grading_and_gpa?.regulationLabel,
    dedupeRepeated: cfg?.grading_and_gpa?.dedupeRepeatedCourses === true,
  };
}

/** درس‌هایی که دست‌کم یک بار قبول شده‌اند (برای سیاست حذف مردودی از معدل کل) */
export function passedCourseSet(rows: TranscriptRow[], retakeMinGrade: number): Set<string> {
  const set = new Set<string>();
  for (const r of rows) {
    const g = numOrNull(r.gradeValue);
    if (r.gradeStatus === 'EXEMPT' || r.gradeStatus === 'PASSED_NO_GRADE') set.add(r.courseCode);
    else if (g !== null && g >= retakeMinGrade && r.gradeStatus === 'FINALIZED') set.add(r.courseCode);
  }
  return set;
}

export function summarizeTerm(rows: TranscriptRow[], pass = 10): { taken: number; passed: number; failed: number; wsum: number; wunits: number } {
  let taken = 0, passed = 0, wsum = 0, wunits = 0;
  for (const r of rows) {
    const u = numOrNull(r.units) ?? 0;
    const g = numOrNull(r.gradeValue);
    if (r.gradeStatus === 'PENDING') continue;
    taken += u;
    if (r.gradeStatus === 'EXEMPT' || r.gradeStatus === 'PASSED_NO_GRADE') passed += u;
    else if (g !== null && g >= pass) passed += u;
    // معدل نیمسال: فقط نمرات FINALIZED (TEMPORARY در معدل حساب نمی‌شود)
    if (g !== null && r.gradeStatus === 'FINALIZED') {
      wsum += g * u;
      wunits += u;
    }
  }
  return { taken, passed, failed: Math.max(0, taken - passed), wsum, wunits };
}

/** برای هر کد درس، تنها رکورد با بالاترین نمرهٔ FINALIZED را نگه می‌دارد (برای dedupeRepeatedCourses) */
export function bestFinalizedRowPerCourse(rows: TranscriptRow[]): Map<string, TranscriptRow> {
  const best = new Map<string, TranscriptRow>();
  for (const r of rows) {
    if (r.gradeStatus !== 'FINALIZED') continue;
    const g = numOrNull(r.gradeValue);
    if (g === null) continue;
    const cur = best.get(r.courseCode);
    const curG = cur ? numOrNull(cur.gradeValue) : null;
    if (!cur || curG === null || g > curG) best.set(r.courseCode, r);
  }
  return best;
}

/** جمع معدل کل با سیاست نمره مردودی آیین‌نامه */
export function summarizeTotal(rows: TranscriptRow[], th: RegThresholds): { wsum: number; wunits: number } {
  const passedSet = th.exclFailed ? passedCourseSet(rows, th.retakeMinGrade) : null;
  const bestRow = th.dedupeRepeated ? bestFinalizedRowPerCourse(rows) : null;
  let wsum = 0, wunits = 0;
  for (const r of rows) {
    const u = numOrNull(r.units) ?? 0;
    const g = numOrNull(r.gradeValue);
    if (g === null || r.gradeStatus !== 'FINALIZED') continue;
    // dedupeRepeatedCourses: اگر این تلاش بهترین نمرهٔ همین درس نیست، از معدل کل کنار گذاشته می‌شود
    if (bestRow && bestRow.get(r.courseCode) !== r) continue;
    // EXCLUDE_IF_PASSED: مردودی درسی که بعداً قبول شده از معدل کل حذف می‌شود
    if (passedSet && g < th.pass && passedSet.has(r.courseCode)) continue;
    wsum += g * u;
    wunits += u;
  }
  return { wsum, wunits };
}

export function groupTranscript(rows: TranscriptRow[], cfg?: RegulationConfig | null): TranscriptSummary {
  const th = regThresholds(cfg);
  const passedSet = th.exclFailed ? passedCourseSet(rows, th.retakeMinGrade) : null;
  const map = new Map<string, TranscriptRow[]>();
  for (const r of rows) {
    const k = r.termCode || '—';
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  const terms: TermGroup[] = [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'en'))
    .map(([termCode, rs]) => {
      // اعمال حذف مردودی از نیمسال (فقط EXCLUDE_IF_PASSED_1391)
      let effectiveRows = rs;
      if (th.exclFromTerm && passedSet) {
        effectiveRows = rs.map(r => {
          const g = numOrNull(r.gradeValue);
          if (g !== null && g < th.pass && passedSet.has(r.courseCode) && r.gradeStatus === 'FINALIZED') {
            return { ...r, _excludedByRegulation: th.regulationLabel || 'آیین‌نامه ۱۳۹۱' };
          }
          return r;
        });
      }
      const s = summarizeTerm(effectiveRows, th.pass);
      const gpa = s.wunits ? s.wsum / s.wunits : null;
      const fileProb = rs.find(r => r.termProbation !== null)?.termProbation ?? null;
      return {
        termCode, termTitle: rs[0]?.termTitle ?? null,
        termStatusTitle: rs.find(r => r.termStatusTitle)?.termStatusTitle ?? null,
        probation: fileProb ?? (gpa !== null && gpa < th.prob),
        rows: effectiveRows,
        taken: s.taken, passed: s.passed, failed: s.failed, points: s.wsum,
        gpa,
        cumTaken: 0, cumPassed: 0, cumFailed: 0, cumPoints: 0, cumGpa: null,
      };
    });
  // جمع تجمیعی «کل» تا پایان هر نیمسال (معدل کل با سیاست نمره مردودی آیین‌نامه)
  let ct = 0, cp = 0, cw = 0, cwu = 0;
  for (const t of terms) {
    const s = summarizeTerm(t.rows, th.pass);
    ct += s.taken; cp += s.passed;
    for (const r of t.rows) {
      const u = numOrNull(r.units) ?? 0;
      const g = numOrNull(r.gradeValue);
      if (g === null || r.gradeStatus !== 'FINALIZED') continue;
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
export const FA_ONES = ['صفر', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه', 'ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده', 'بیست'];
/** ده‌تایی‌ها — بدون این جدول، اعداد رُندِ ده‌تایی (۳۰، ۵۰، …) اشتباه ساخته می‌شد */
export const FA_TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];

/** عدد صحیح ۰..۹۹ به حروف فارسی */
export function faIntWords(n: number): string {
  if (n <= 20) return FA_ONES[n];
  const t = Math.floor(n / 10), o = n % 10;
  return o === 0 ? FA_TENS[t] : `${FA_TENS[t]} و ${FA_ONES[o]}`;
}

export function faWords(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const neg = n < 0 ? 'منفی ' : '';
  const a = Math.abs(Math.round(n * 100) / 100);
  const ip = Math.floor(a);
  const fp = Math.round((a - ip) * 100);
  if (ip >= 100) return `${neg}${faNum(a)}`;
  const ipW = faIntWords(ip);
  if (!fp) return `${neg}${ipW}`;
  return `${neg}${ipW} و ${faIntWords(fp)} صدم`;
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
  const passedSet = th.exclFailed ? passedCourseSet(rows, th.retakeMinGrade) : null;
  const acc = new Map<string, { units: number; wsum: number; wunits: number }>();
  for (const r of rows) {
    const g = courseTypeGroup(r.courseType);
    if (!acc.has(g)) acc.set(g, { units: 0, wsum: 0, wunits: 0 });
    const a = acc.get(g)!;
    const u = numOrNull(r.units) ?? 0;
    const gv = numOrNull(r.gradeValue);
    if (r.gradeStatus !== 'PENDING' && (gv === null || gv >= th.pass)) a.units += u;
    if (gv !== null && r.gradeStatus === 'FINALIZED') {
      if (passedSet && gv < th.pass && passedSet.has(r.courseCode)) continue;
      a.wsum += gv * u; a.wunits += u;
    }
  }
  return order.map(t => {
    const a = acc.get(t);
    return { type: t, units: a?.units ?? 0, gpa: a && a.wunits ? a.wsum / a.wunits : null };
  });
}

/** حل برچسب فارسی کد سما با fallback به خود کد */
export function codeLabel(map: Record<string, string> | undefined, v: string | null | undefined): string {
  if (!v || v === '—') return '—';
  return (map && map[v]) || v;
}
