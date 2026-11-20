'use client';

// ═══════════════════════════════════════════════════════════════════════
//  نمای رسمی کارنامه با فرمت سما: ۳ نیمسال کنار هم + سربرگ/پانوشت + صفحهٔ دوم
//  (این همان چیزی است که دکمهٔ چاپ هم عیناً چاپ می‌کند — WYSIWYG.)
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react';
import type { StudentItem, TermGroup, TranscriptSummary, CodeLabels, TranscriptPrintOptions, OriginUniversity, CohortStats } from '../types';
import PersonPhoto from './PersonPhoto';
import VerifyQrBlock from '@/components/VerifyQrBlock';
import { DEFAULT_PRINT_OPTIONS } from '../types';
import type { TranscriptRow } from '../actions';
import { courseTypeFa, gradeStatusFa, quotaFinalFa, studentStatusFa, studyModeFa } from '@/lib/student-labels';
import { breakdownByType, codeLabel, courseTypeGroup, dateToJalali, entryDateFa, faDigits, faNum, faStr, faWords, numOrNull, termDisplayTitle, thesisLegend, thesisQualitativeLabel, todayJalali } from '../transcript-utils';
import { DEGREE_LEVEL_CONFIGS } from '@/lib/degree-configs';

/** نمای رسمی کارنامه با فرمت سما: ۳ نیمسال کنار هم + سربرگ/پانوشت + صفحه دوم تفکیکی */
export default function OfficialTranscriptView({
  student,
  summary,
  logoUrl,
  codeLabels,
  canEditGrades,
  onEditGrade,
  printOptions = DEFAULT_PRINT_OPTIONS,
  originUniversity = null,
  universityCode = null,
  cohortStats = null,
  cohortLoading = false,
}: {
  student: StudentItem;
  summary: TranscriptSummary;
  logoUrl?: string | null;
  codeLabels?: CodeLabels | null;
  canEditGrades?: boolean;
  onEditGrade?: (row: TranscriptRow) => void;
  printOptions?: TranscriptPrintOptions;
  originUniversity?: OriginUniversity | null;
  /** کد دانشگاه مالک رکورد (مثل ZARINE) — برای عنوان دقیق وضعیت سما */
  universityCode?: string | null;
  cohortStats?: CohortStats | null;
  cohortLoading?: boolean;
}) {
  const lbl = {
    accept: (v: string | null | undefined) => {
      if (!v || v === '—') return '—';
      return codeLabels?.accept[v] || codeLabels?.acceptByTarget[v] || v;
    },
    period: (v: string | null | undefined) => codeLabel(codeLabels?.period, v),
    quota: (v: string | null | undefined) => codeLabel(codeLabels?.quota, v),
  };
  const probation = summary.terms.filter(t => t.probation).length;

  // ── QR استعلام برخط اصالت کارنامه (از API ادمین؛ فقط برای دانشجوی بازشده) ──
  const [verifyQr, setVerifyQr] = useState<{ url: string; qr: string; expiresAt: string | null } | null>(null);
  useEffect(() => {
    let alive = true;
    setVerifyQr(null);
    if (!student?.id) return;
    fetch(`/api/admin/students/transcript-qr?studentId=${student.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.qr) setVerifyQr(d as { url: string; qr: string; expiresAt: string | null }); })
      .catch(() => { /* بی‌صدا: نبودِ QR نباید کارنامه را خراب کند */ });
    return () => { alive = false; };
  }, [student?.id]);
  // شمار نیمسال‌ها به تفکیک نوع (مثل پانوشت سما) — همان قاعدهٔ groupTranscript
  const termKindCounts = (() => {
    let regular = 0, summer = 0, equiv = 0;
    for (const t of summary.terms) {
      const code = t.termCode || '';
      const title = t.termTitle || '';
      if (code.endsWith('5') || code.toUpperCase().includes('EQ') || title.includes('معادل')) equiv++;
      else if (code.endsWith('3') || title.includes('تابستان')) summer++;
      else regular++;
    }
    return { regular, summer, equiv };
  })();
  const info: [string, string][] = [
    ['نام خانوادگی و نام', `${student.lastName} ${student.firstName}`],
    ['شماره دانشجویی', faDigits(student.studentCode)],
    ['نام پدر', student.fatherName || '—'],
    ['شماره شناسنامه', student.birthCertNo ? faDigits(student.birthCertNo) : '—'],
    ['محل صدور', student.placeOfIssue || '—'],
    ['محل تولد', student.placeOfBirth || '—'],
    ['کد ملی', faDigits(student.nationalCode)],
    ['تاریخ تولد', dateToJalali(student.birthDate)],
    ['مقطع', student.degreeLevel],
    // نوع دوره در ستون studyingMode است (COURSTYPE).
    // نگاشت جدول سما (COURSE_TYPE_FA) — نه PERIOD_TYPE؛ وگرنه کد ۴ «پیام نور» می‌شد
    ['نوع دوره', courseTypeFa(student.studyingMode)],
    ['دانشکده', student.facultyName || '—'],
    ['رشته تحصیلی', student.majorName],
    ...(printOptions.showAcceptance ? [['نحوه ورود', lbl.accept(student.acceptanceType)] as [string, string]] : []),
    ...(originUniversity ? [[
      'دانشگاه مبدا',
      originUniversity.dissolved ? `${originUniversity.title} (منحله)` : originUniversity.title,
    ] as [string, string]] : []),
    ...(printOptions.showStudyMode ? [['شیوه آموزشی', studyModeFa(student.trainingMethod)] as [string, string]] : []),
    ...(printOptions.showAllQuotas ? [
      ['سهمیه قبولی', quotaFinalFa(student.quotaType)] as [string, string],
      ['سهمیه نهایی', quotaFinalFa(student.quotaType)] as [string, string],
    ] : []),
    ['سهمیه ثبت‌نامی', quotaFinalFa(student.quotaType)],
    ...(printOptions.showNationality ? [[
      'ملیت',
      student.nationality === '120001' ? 'ایرانی' : (!student.nationality || /^\s*unknown\s*$/i.test(student.nationality) ? '—' : student.nationality),
    ] as [string, string]] : []),
    ['استاد راهنما', student.supervisorName?.trim() || '—'],
  ];
  // خانه‌های خالی ردیف آخر جدول مشخصات (تا نوار طوسیِ gap دیده نشود)
  const infoFillers = (3 - (info.length % 3)) % 3;
  // گروه‌بندی ۳تایی نیمسال‌ها (مثل سما)
  const chunks: TermGroup[][] = [];
  const perRow = printOptions.layout === '2col' ? 2 : 3;
  for (let i = 0; i < summary.terms.length; i += perRow) chunks.push(summary.terms.slice(i, i + perRow));
  const breakdown = breakdownByType(summary.terms.flatMap(t => t.rows));
  // راهنمای کد وضع نمره (فقط ردیف‌هایی که کد خام سما دارند؛ متن کامل در پایین کارنامه یک‌بار می‌آید)
  const statusLegend = new Map<string, string>();
  for (const t of summary.terms) for (const r of t.rows) {
    if (r.gradeStatusCode && !statusLegend.has(r.gradeStatusCode)) {
      statusLegend.set(r.gradeStatusCode, r.gradeStatusTitle || r.gradeStatusCode);
    }
  }
  const statusCell = (r: TermGroup['rows'][number]) => {
    // کد سما همیشه نمایش داده می‌شود (نشان بده ولی بر اساس نوع کد احتساب نکن)؛
    // عنوان کامل در tooltip + راهنمای پایین کارنامه. اگر عنوان نداشت، خود کد.
    if (r.gradeStatusCode) {
      return (
        <span title={r.gradeStatusTitle || r.gradeStatusCode} className="font-mono font-bold">
          {faDigits(r.gradeStatusCode)}
        </span>
      );
    }
    return gradeStatusFa(r.gradeStatus);
  };
  /** سلول نمره: اگر تیک «پایان‌نامه کیفی» روشن و درس پایان‌نامه/رساله است، برچسب کیفی */
  const gradeCell = (r: TermGroup['rows'][number]) => {
    if (printOptions.thesisQualitative && courseTypeGroup(r.courseType) === 'پایان‌نامه') {
      return <span className="font-sans whitespace-nowrap">{thesisQualitativeLabel(numOrNull(r.gradeValue), summary.passGrade)}</span>;
    }
    return faStr(r.gradeValue);
  };
  const termCell = (t: TermGroup) => (
    <section key={t.termCode} className="term-block min-w-0">
      <div className="bg-slate-100 border-b border-slate-300 px-1 py-1 font-extrabold text-3xs text-center">
        {termDisplayTitle(t.termCode, t.termTitle)}
        <span className="block font-normal text-slate-700">وضعیت دانشجو: {t.termStatusTitle || '—'} — <b className={t.probation ? 'text-red-700' : 'text-emerald-700'}>{t.probation ? 'مشروط' : 'عادی'}</b></span>
      </div>
      <table className="tr-term-table w-full text-[9px] rt" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          {/* کدِ درس باید یک‌خطی بماند: با ۱۵٪، کدِ ۷ رقمی می‌شکست و ردیف
              دوخطی می‌شد (شکایت کاربر). ۲٪ از «وضع» و ۱٪ از «نام» به کد
              منتقل شد؛ «نام» هم ۳٪ پهن‌تر شد تا عنوان کمتر بشکند. */}
          <col style={{ width: '17%' }} />
          <col style={{ width: '41%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '17%' }} />
        </colgroup>
        <thead>
          <tr className="border-b border-slate-300 text-slate-500">
            <th scope="col" className="p-1">کد درس</th>
            <th scope="col" className="p-1">نام درس</th>
            <th scope="col" className="p-1">واحد</th>
            <th scope="col" className="p-1">نمره</th>
            <th scope="col" className="p-1">وضع</th>
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r, i) => (
            <tr
              key={i}
              className={`border-b border-slate-100 ${canEditGrades && onEditGrade ? 'hover:bg-amber-100/60 cursor-pointer' : ''}`}
              onClick={() => {
                if (canEditGrades && onEditGrade) onEditGrade(r);
              }}
              title={canEditGrades && onEditGrade ? 'برای ویرایش یا ثبت نمره کلیک کنید' : undefined}
            >
              <td className="whitespace-nowrap p-1 font-mono text-center text-[8px]" dir="ltr">{faDigits(r.courseCode)}</td>
              <td className={`tr-course-title p-1 leading-[1.12] ${(r.courseTitle || '').length > 18 ? 'text-[8px] break-words' : ''}`}>
                {r.courseTitle}
                {r._excludedByRegulation && (
                  <span className="block text-[7px] text-amber-600 font-bold">({r._excludedByRegulation} اعمال شد)</span>
                )}
              </td>
              <td className="p-1 text-center font-mono">{r.units == null ? '—' : faStr(r.units, 1)}</td>
              <td className="tr-grade-cell p-1 text-center font-mono font-bold whitespace-nowrap">{gradeCell(r)}</td>
              <td className="p-1 text-center text-[8px]">{statusCell(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tr-term-footer border-t-2 border-slate-400 text-[9px] px-1 py-1 space-y-0.5 bg-slate-50">
        <p><b>نیمسال</b> — اخذشده: <b className="font-mono">{faNum(t.taken, 0)}</b> گذرانده: <b className="font-mono">{faNum(t.passed, 0)}</b> مردودی: <b className="font-mono">{faNum(t.failed, 0)}</b></p>
        <p>معدل: <b className="font-mono">{faNum(t.gpa)}</b> امتیاز: <b className="font-mono">{faNum(t.points, 1)}</b> حذف: <b className="font-mono">{faNum(t.droppedUnits, 0)}</b></p>
        <p className="border-t border-slate-300 pt-0.5"><b>کل</b> — اخذشده: <b className="font-mono">{faNum(t.cumTaken, 0)}</b> گذرانده: <b className="font-mono">{faNum(t.cumPassed, 0)}</b> مردودی: <b className="font-mono">{faNum(t.cumFailed, 0)}</b></p>
        <p>معدل: <b className="font-mono">{faNum(t.cumGpa)}</b> امتیاز: <b className="font-mono">{faNum(t.cumPoints, 1)}</b> موثر: <b className="font-mono">{faNum(t.cumEffectiveUnits, 0)}</b></p>
      </div>
    </section>
  );

  return (
    <div dir="rtl" className="tr-root border-2 border-slate-700 text-slate-900 bg-white">
      {/* کل کادر بالا (سربرگ + مشخصات) در thead است تا در همهٔ صفحات چاپ تکرار شود */}
      <table className="tr-doc rt">
        <thead>
          <tr><td className="tr-doc-cell">
      {/* سربرگ سما */}
      {/* گریدِ سه‌ستونه (1fr / auto / 1fr): ستونِ میانی همیشه دقیقاً وسط
          می‌ماند، حتی اگر متنِ راست یا عکس چپ بلندتر شود. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 border-b-2 border-slate-700 px-3 py-2">
        <div className="text-3xs text-right">
          <p className="font-bold">باسمه تعالی</p>
          <p>اداره کل امور آموزشی</p>
          <p className="font-extrabold">کارنامه کل</p>
          <p className="mt-1">تاریخ تهیه: <b className="font-mono">{todayJalali()}</b></p>
        </div>
        {/* آرم در وسط، نام دانشگاه زیرِ آن (درخواست کاربر) */}
        <div className="flex flex-col items-center">
          {printOptions.showLogo ? (logoUrl ? <img src={logoUrl} alt="آرم دانشگاه" className="max-h-16 max-w-16 object-contain" /> : <span className="text-[9px] text-slate-400 border border-dashed border-slate-300 rounded p-1">آرم دانشگاه</span>) : null}
          <p className="mt-1 text-center text-3xs">موسسه آموزش عالی غیرانتفاعی - غیردولتی آفاق</p>
        </div>
        {/* عکس دانشجو — چپ‌چین در انتهای سربرگ. کادرِ ۳×۴ِ ثابت با
            object-cover تا چهره کشیده نشود (همان چیدمانِ کارنامهٔ مالی). */}
        <div className="flex justify-end">
          {printOptions.showPhoto && student.photoKey ? (
            <div className="h-[22mm] w-[17mm] shrink-0 overflow-hidden">
              <PersonPhoto userId={student.userId} hasPhoto={!!student.photoKey} className="h-full w-full object-cover" icon="👤" label="عکس" />
            </div>
          ) : null}
        </div>
      </div>
      {/* مشخصات — در چاپ همیشه ۳ ستونه (مثل سما) */}
      <div className="tr-info-grid grid grid-cols-2 sm:grid-cols-3 gap-px bg-slate-300 border-b-2 border-slate-700 text-3xs">
        {info.map(([k, v]) => (
          <div key={k} className="bg-white px-2 py-1 flex justify-between gap-1">
            <span className="font-bold whitespace-nowrap">{k}:</span>
            <span className="text-left">{v}</span>
          </div>
        ))}
        {Array.from({ length: infoFillers }).map((_, i) => (
          <div key={`filler-${i}`} className="bg-white px-2 py-1" aria-hidden="true" />
        ))}
      </div>
          </td></tr>
        </thead>
        <tbody>
      {/* نیمسال‌ها ۳تایی — گرید هم‌ارتفاع تا پانوشت نیمسال‌های یک ردیف هم‌تراز شود */}
      {chunks.map((ch, i) => (
        <tr key={i} className="tr-doc-row"><td className="tr-doc-cell">
          <div className="tr-term-row" style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}>{ch.map(termCell)}</div>
        </td></tr>
      ))}
      {/* راهنمای کد وضع نمره — فقط اگر تیک سما روشن و کدی در کارنامه استفاده شده باشد */}
      {printOptions.showLegend && statusLegend.size > 0 && (
        <tr><td className="tr-doc-cell">
        <div className="border-t-2 border-slate-700 px-3 py-1.5 text-[9px] bg-slate-50 leading-relaxed">
          <b>توضیح وضع نمرات:</b>{' '}
          {[...statusLegend.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([code, title]) => (
            <span key={code} className="inline-block ml-3">
              <b className="font-mono">{code}</b>={title}
            </span>
          ))}
        </div>
        </td></tr>
      )}
      {/* پانوشت */}
      <tr><td className="tr-doc-cell">
      <div className="border-t-2 border-slate-700 px-3 py-2 text-3xs space-y-1">
        <div className="flex flex-wrap gap-x-6">
          <span>تعداد نیمسال مشروط: <b className="font-mono">{probation.toLocaleString('fa-IR')}</b></span>
          <span>وضعیت کلی دانشجو: <b>{studentStatusFa(student.status, student.samaStatusCode, universityCode)}</b></span>
          <span>مقطع فارغ‌التحصیلی: <b>{student.graduateDegreeLevelId ? (() => { const d = DEGREE_LEVEL_CONFIGS.find(d => d.id === student.graduateDegreeLevelId); return d ? d.title : '—'; })() : '—'}</b></span>
          <span>تاریخ شروع تحصیل: <b className="font-mono">{entryDateFa(student.entryYear, student.entryTerm)}</b></span>
          <span>تاریخ توقف تحصیل: <b className="font-mono">{student.graduateDate ? faDigits(student.graduateDate) : '—'}</b></span>
        </div>
        <div className="flex flex-wrap gap-x-6">
          <span>معدل کل به عدد: <b className="font-mono">{faNum(summary.gpa)}</b></span>
          <span>معدل کل به حروف: <b>{faWords(summary.gpa)}</b></span>
        </div>
        <p className="text-center text-slate-600">این کارنامه بدون مهر و امضا فقط برای اطلاع دانشجو صادر شده است و ارزش دیگری ندارد</p>
        <div className="flex flex-wrap gap-x-6">
          <span>تعداد نیمسال‌ها: در حال تحصیل (<b className="font-mono">{faNum(termKindCounts.regular, 0)}</b>) ترم تابستان (<b className="font-mono">{faNum(termKindCounts.summer, 0)}</b>){termKindCounts.equiv > 0 ? <> معادل‌سازی (<b className="font-mono">{faNum(termKindCounts.equiv, 0)}</b>)</> : null}</span>
        </div>
        {originUniversity?.dissolved && (
          <div className="flex flex-wrap gap-x-6">
            <span>توضیح: این دانشجو از دانشگاه منحلهٔ <b>{originUniversity.title}</b> منتقل شده است.</span>
          </div>
        )}
        {printOptions.thesisQualitative && (
          <p className="text-slate-500 text-[9px]">توضیح: نمرهٔ دروس پایان‌نامه/رساله به‌صورت کیفی درج شده است ({thesisLegend(summary.passGrade)}).</p>
        )}
        <p className="text-center text-slate-500 text-[9px]">سیستم مدیریت آموزش دانشگاه‌ها — آفاق · شماره دانشجویی <b className="font-mono">{faDigits(student.studentCode)}</b> · تاریخ تهیه <b className="font-mono">{todayJalali()}</b></p>
        {/* بلوک رسمیت: QR استعلام — در پانوشت، بالای جدول کاتالوگ (درخواست کاربر) */}
        {verifyQr && (
          <div className="pt-1">
            <VerifyQrBlock
              title="استعلام برخط اصالت این کارنامه"
              url={verifyQr.url}
              qr={verifyQr.qr}
              expiresAt={verifyQr.expiresAt}
              shortUrl
              compact
            />
          </div>
        )}
      </div>
      </td></tr>
      {/* صفحه دوم: جدول وضعیت دروس گذرانده — در جریان طبیعی صفحه می‌آید، تکه نمی‌شود */}
      {printOptions.showBreakdown && (
      <tr><td className="tr-doc-cell">
      <div className="tr-breakdown border-t-2 border-slate-700 px-3 py-2">
        <p className="font-extrabold text-2xs mb-1">جدول وضعیت دروس گذرانده (کاتالوگ رشته)</p>
        <table className="w-full text-3xs border border-slate-400 rt">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-300">
              <th scope="col" className="p-1 border-l border-slate-300">نوع درس</th>
              {breakdown.map(b => <th scope="col" key={b.type} className="p-1 border-l border-slate-300">{b.type}</th>)}
              <th scope="col" className="p-1">مجموع</th>
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
      </td></tr>
      )}
      {/* رتبه در رشته ورودی و میانگین هم‌رشته‌ای‌ها (تیک سما) */}
      {printOptions.showRank && (
        <tr><td className="tr-doc-cell">
        <div className="border-t border-slate-300 px-3 py-1.5 text-3xs bg-slate-50 leading-relaxed">
          <div className="flex flex-wrap gap-x-6">
            <span>رتبهٔ معدل کل دانشجو در رشته ورودی{cohortStats ? (cohortStats.scope === 'term' ? ' (هم‌ورودی ترم)' : ' (هم‌ورودی سال)') : ''}: <b className="font-mono">{cohortLoading ? '…' : (cohortStats && cohortStats.rank != null ? `${faNum(cohortStats.rank, 0)} / ${faNum(cohortStats.total, 0)}` : '—')}</b></span>
            <span>میانگین معدل دانشجویان هم‌رشته ورودی: <b className="font-mono">{cohortLoading ? '…' : faNum(cohortStats?.avgGpa)}</b></span>
            <span>میانگین واحد گذرانده دانشجویان هم‌رشته ورودی: <b className="font-mono">{cohortLoading ? '…' : faNum(cohortStats?.avgPassed, 1)}</b></span>
          </div>
        </div>
        </td></tr>
      )}
        {/* امضاها — فقط یکبار در پایان سند (نه تکرار در هر صفحه) */}
        <tr><td className="tr-doc-cell">
          <div className="tr-signatures flex justify-between px-3 py-2 text-3xs">
            <span>امضاء رئیس خدمات آموزش</span>
            <span>امضاء و مهر اداره کل آموزش</span>
            <span>امضاء و مهر امور آموزشی دانشگاه منتخب</span>
          </div>
        </td></tr>
        </tbody>
      </table>
    </div>
  );
}
