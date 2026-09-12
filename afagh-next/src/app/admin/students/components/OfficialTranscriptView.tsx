'use client';

// ═══════════════════════════════════════════════════════════════════════
//  نمای رسمی کارنامه با فرمت سما: ۳ نیمسال کنار هم + سربرگ/پانوشت + صفحهٔ دوم
//  (این همان چیزی است که دکمهٔ چاپ هم عیناً چاپ می‌کند — WYSIWYG.)
// ═══════════════════════════════════════════════════════════════════════
import type { StudentItem, TermGroup, TranscriptSummary, CodeLabels } from '../types';
import { gradeStatusFa, quotaFa, studentStatusFa } from '@/lib/student-labels';
import { breakdownByType, codeLabel, dateToJalali, faNum, faWords, todayJalali } from '../transcript-utils';

/** نمای رسمی کارنامه با فرمت سما: ۳ نیمسال کنار هم + سربرگ/پانوشت + صفحه دوم تفکیکی */
export default function OfficialTranscriptView({ student, summary, logoUrl, codeLabels }: { student: StudentItem; summary: TranscriptSummary; logoUrl?: string | null; codeLabels?: CodeLabels | null }) {
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

  const termLabel = (code: string) => code.endsWith('3') ? 'نیمسال تابستان' : 'نیمسال';
  // راهنمای کد وضع نمره (فقط ردیف‌هایی که کد خام سما دارند؛ متن کامل در پایین کارنامه یک‌بار می‌آید)
  const statusLegend = new Map<string, string>();
  for (const t of summary.terms) for (const r of t.rows) {
    if (r.gradeStatusCode && r.gradeStatusTitle && !statusLegend.has(r.gradeStatusCode)) {
      statusLegend.set(r.gradeStatusCode, r.gradeStatusTitle);
    }
  }
  const statusCell = (r: TermGroup['rows'][number]) => {
    if (r.gradeStatusCode && r.gradeStatusTitle) {
      // به‌جای متن کامل (که ستون را به‌هم می‌ریزد) فقط کد؛ توضیح کامل در راهنمای پایین کارنامه
      return <span title={r.gradeStatusTitle} className="font-mono font-bold">{r.gradeStatusCode}</span>;
    }
    return gradeStatusFa(r.gradeStatus);
  };
  const termCell = (t: TermGroup) => (
    <td key={t.termCode} className="align-top border-l border-slate-400 p-0 term-block" style={{ width: '33.33%' }}>
      <div className="bg-slate-100 border-b border-slate-300 px-1 py-1 font-extrabold text-[10px] text-center">
        {termLabel(t.termCode)} <span className="font-mono" dir="ltr">{t.termCode}</span>
        <span className="block font-normal text-slate-700">وضعیت نیمسال: {t.termStatusTitle || '—'} — <b className={t.probation ? 'text-red-700' : 'text-emerald-700'}>{t.probation ? 'مشروط' : 'عادی'}</b></span>
      </div>
      <table className="w-full text-[9px]" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '15%' }} />
          <col style={{ width: '40%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '21%' }} />
        </colgroup>
        <thead>
          <tr className="border-b border-slate-300 text-slate-500">
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
              <td className="p-1 font-mono text-center" dir="ltr">{r.courseCode}</td>
              <td className="p-1 leading-tight">
                {r.courseTitle}
                {r._excludedByRegulation && (
                  <span className="block text-[7px] text-amber-600 font-bold">({r._excludedByRegulation} اعمال شد)</span>
                )}
              </td>
              <td className="p-1 text-center font-mono">{r.units ?? '—'}</td>
              <td className="p-1 text-center font-mono font-bold">{r.gradeValue ?? '—'}</td>
              <td className="p-1 text-center text-[8px]">{statusCell(r)}</td>
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
      <table className="w-full border-collapse term-grid">
        <tbody>
          {chunks.map((ch, i) => (
            <tr key={i} className="border-b-2 border-slate-700">{ch.map(termCell)}</tr>
          ))}
        </tbody>
      </table>
      {/* راهنمای کد وضع نمره — فقط اگر کدی در کارنامه استفاده شده باشد */}
      {statusLegend.size > 0 && (
        <div className="border-t-2 border-slate-700 px-3 py-1.5 text-[9px] bg-slate-50 leading-relaxed">
          <b>راهنمای کد وضع نمره:</b>{' '}
          {[...statusLegend.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([code, title]) => (
            <span key={code} className="inline-block ml-3">
              <b className="font-mono">{code}</b> = {title}
            </span>
          ))}
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
      <div className="border-t-2 border-slate-700 px-3 py-2 page-break-before">
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
