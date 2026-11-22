'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { faNum, formatReportCell as fmtCell } from '@/lib/report-format';
import { faDigits, toJalali } from '@/lib/calendar';
import {
  cleanupReportPrint,
  prepareReportPrint,
  printReportDocument,
  type ReportPrintOrientation,
} from '@/lib/print-report';

/**
 * سند چاپی گزارش — **یک کپی ایزوله در ریشهٔ body** چاپ میشود، نه overlay
 * داخل صفحه. الگوی کار همان `print-transcript.ts` است.
 *
 * نسخهٔ دوم (بازخورد کاربر روی PDFـهای ۵۶ صفحهای):
 *   • آرم و نام دانشگاه از تنظیمات/پروفایل دانشگاه  → `universityLogoUrl`
 *   • تاریخ تهیۀ گزارش به **چپ** منتقل شد (ترتیب در `rp-meta`)
 *   • «صفحۀ ۱ از ۱» جعلی (شمارهٔ صفحهٔ وب) حذف شد؛ شمارهگذاری واقعی
 *     برگهها در `paginateReportPrint()` ساخته میشود: «صفحۀ N از M»
 *   • ردیف امضا **زیر هر برگه**، با برچسبهای قابلتنظیم از «تنظیمات سامانه»
 *   • اعداد طولانی (شماره فیش/حساب/پیگیری) دیگر روی ستون تاریخ سرریز نمیکنند
 *     (`white-space: nowrap` حذف شد + `break-all` برای ارقام بلند)
 *
 * ساختار `data-rp-*` قراردادی است با `src/lib/print-report.ts` که هنگام چاپ
 * سند را به برگههای A4 با ارتفاع اندازهگیری‌شده تقسیم میکند.
 */

type ReportColumn = { key: string; title: string; format?: string; pair?: string; line?: 'top' | 'bottom' };

/** وزنِ نسبی یک ستون — شناسههای بلند جای بیشتری میگیرند تا روی تاریخ نیفتند. */
function columnWeight(c: ReportColumn): number {
  if (c.format === 'DATE' || c.format === 'DATETIME') return 1.15;
  if (c.format === 'MONEY' || c.format === 'AMOUNT') return 1.4;
  if (c.format === 'NUMBER') return 1.0;
  // شماره فیش / شماره حساب / شماره پیگیری / کدهای بلند: عرض بیشتر + شکستن ارقام
  if (/شماره|فیش|حساب|پیگیری|سند|شناسه|کد|شبا/.test(c.title)) return 1.6;
  if (/نام|رشته|دانشکده|عنوان|شرح|توضیح|آدرس|درس|استاد/.test(c.title)) return 1.9;
  return 1.25;
}

/** وزن نسبی پهنای ستونها. ستونِ دوخطی (pair) عرضِ دو ستون را میگیرد. */
function columnWeights(columns: ReportColumn[], bottomOf: (pair?: string) => ReportColumn | undefined): number[] {
  const raw = columns.map(c => columnWeight(c) + (c.pair ? columnWeight(bottomOf(c.pair) ?? c) : 0));
  const total = raw.reduce((a, b) => a + b, 0) || 1;
  return raw.map(w => (w / total) * 100);
}

const DEFAULT_SIGNERS = ['تهیهکنندهٔ گزارش', 'تأیید حسابدار', 'مدیر مالی'];

/** سرستونهای دوخطی فرم کاغذی fqTrDaTe2 (سام قدیمی) — عیناً همان ترتیب و عبارت. */
const SEMESTER_HEADERS: Record<string, [string, string]> = {
  n: ['کد', ''], faculty: ['دانشکده', ''], degree: ['مقطع', ''],
  students: ['تعداد', 'دانشجو'], creditOpen: ['طلب', 'دانشجو'],
  debitOpen: ['بدهی', 'دانشجو'], carry: ['نقل از', 'ترم قبل'],
  fixed: ['شهریه ثبت', 'جاری'], variable: ['شهریه متغیر', 'جاری'],
  discount: ['تخفیفات', 'جاری'],
  termAmount: ['مبالغ', 'نیمسال'], paid: ['دریافتی از دانشجو', 'در ترم جاری'],
  debtBalance: ['مانده', 'بدهی'], creditBalance: ['مانده طلب', 'دانشجو'],
};

/**
 * تاریخِ امروزِ شمسی با ساعتِ رسمیِ تهران (Asia/Tehran).
 *
 * چرا `toLocaleDateString('fa-IR')` را کنار گذاشتیم؟ خروجی آن به ICUِ محیطِ
 * اجرا (سرورِ SSR یا مرورگر) گره خورده است؛ در برخی محیطها سال/ماهِ تقویم
 * فارسی را اشتباه میدهد — موردِ گزارششده: «۱۴۰۵/۱۲/۲۶» بهجای «۱۴۰۵/۰۸/۲۵».
 * اینجا اجزای میلادیِ امروز را با timeZone صریحِ تهران میگیریم و با الگوریتم
 * جلالیِ خودِ پروژه (lib/calendar — مرجعِ حقیقتِ تقویم، مستقل از ICU) تبدیل
 * میکنیم؛ پس خروجی در سرور و کلاینت یکسان و همیشه درست است.
 *
 * Intl با locale «en-US» حتی در بیلدهای small-icu هم timeZone را میفهمد و
 * فقط اجزای عددی میخواهیم، پس وابستگی به ICU فارسی باقی نمیماند.
 */
function todayJalaliTehran(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date());
  const part = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const { jy, jm, jd } = toJalali(part('year'), part('month'), part('day'));
  return faDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
}

export default function ReportPrint({
  title,
  subtitle,
  columns,
  rows,
  summary,
  totals,
  universityTitle,
  universityLogoUrl,
  signers,
  reportDate,
  fetchAll,
  form,
}: {
  /** عنوان گزارش */
  title: string;
  /** زیرعنوان (فیلترهای اعمالشده) — بدون شمارهٔ صفحهٔ وب */
  subtitle: string;
  /** ستونها (همان ReportColumn[]) */
  columns: ReportColumn[];
  /** ردیفها (همان ReportResult.rows[]) */
  rows: Record<string, unknown>[];
  /** متن خلاصه */
  summary?: string;
  /** ردیفِ جمع (tfoot) — فقط در برگهٔ آخر چاپ می‌شود */
  totals?: Record<string, unknown>;
  /** نام دانشگاه (از پروفایل دانشگاه / تنظیمات) */
  universityTitle?: string;
  /** نشانی آرم دانشگاه (universities.logoUrl یا UNIVERSITY_LOGO) */
  universityLogoUrl?: string;
  /** برچسب جایگاههای امضا — از تنظیمات سامانه، به تفکیک فرم */
  signers?: string[];
  /** تاریخ گزارش */
  reportDate?: string;
  /**
   * دریافت همهٔ ردیف‌های گزارش برای چاپ (نه فقط صفحهٔ جاری).
   * اگر داده شود، هنگام کلیک «چاپ» اول داده کامل می‌آید و بعد سند چاپ
   * می‌شود؛ در غیر این صورت همان `rows` (صفحهٔ جاری) چاپ می‌شود.
   */
  fetchAll?: () => Promise<{ rows: Record<string, unknown>[]; total: number; truncated: boolean }>;
  /** الگوی چاپ ویژهٔ فرم قدیمی (مثلاً fqTrDaTe2 — تفصیلی مالی نیمسال). */
  form?: 'semester-detail';
}) {
  const faDate = reportDate || todayJalaliTehran();
  const orientation: ReportPrintOrientation = columns.length >= 7 ? 'landscape' : 'portrait';
  const renderCols = columns.filter(c => c.line !== 'bottom');
  const widths = useMemo(
    () => columnWeights(renderCols, c => columns.find(x => x.pair === c.pair && x.line === 'bottom')),
    [columns, renderCols],
  );
  const signLabels = signers && signers.length ? signers : DEFAULT_SIGNERS;

  /** ردیف‌های کاملِ چاپ (اگر با fetchAll آمده باشند) + وضعیت آماده‌سازی */
  const [printRows, setPrintRows] = useState<Record<string, unknown>[] | null>(null);
  const [printTotal, setPrintTotal] = useState<number | null>(null);
  const [printTruncated, setPrintTruncated] = useState(false);
  const [fetching, setFetching] = useState(false);
  const displayRows = printRows ?? rows;

  /**
   * 🔒 هر تغییر گزارش/فیلتر باید ردیف‌های چاپِ قبلی را دور بریزد.
   * پیش‌تر این state هرگز ریست نمی‌شد و بعد از یک چاپ موفق، چاپ گزارش بعدی
   * همان دادهٔ قبلی را زیر هدر جدید چاپ می‌کرد.
   */
  useEffect(() => {
    setPrintRows(null);
    setPrintTotal(null);
    setPrintTruncated(false);
  }, [rows, columns, title]);

  /**
   * چاپ: اگر `fetchAll` هست، اول همهٔ ردیف‌ها را می‌گیریم و بعد سند را
   * می‌سازیم. React پس از setState دوباره رندر می‌کند؛ دو frame صبر می‌کنیم
   * تا الگوی چاپی با ردیف‌های تازه در DOM بنشیند.
   */
  const handlePrint = async () => {
    if (!fetchAll || fetching) {
      await printReportDocument(orientation);
      return;
    }
    setFetching(true);
    try {
      const data = await fetchAll();
      setPrintRows(data.rows);
      setPrintTotal(data.total);
      setPrintTruncated(data.truncated);
      setFetching(false);
      await new Promise<void>(r => requestAnimationFrame(() => r()));
      await new Promise<void>(r => requestAnimationFrame(() => r()));
      await printReportDocument(orientation);
    } catch {
      setFetching(false);
      // 🔒 هرگز سندِ ناقص را «کامل» چاپ نکن: صفحهٔ جاری با برچسب «سند ناقص».
      setPrintRows(null);
      setPrintTotal(null);
      setPrintTruncated(true);
      // حتی اگر واکشی کامل نشد، همان صفحهٔ جاری چاپ شود (بهتر از هیچ)
      await printReportDocument(orientation);
    }
  };

  // مسیر پشتیبان: Ctrl+P / چاپ از منوی مرورگر هم همان سند ایزوله را بگیرد
  useEffect(() => {
    const before = () => prepareReportPrint(orientation);
    const after = () => cleanupReportPrint();
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
      cleanupReportPrint();
    };
  }, [orientation]);

  return (
    <>
      <button
        type="button"
        onClick={handlePrint}
        disabled={fetching}
        title="چاپ / ذخیرهٔ PDF — فقط سند گزارش، بدون منو و سربرگ مرورگر"
        className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white font-bold rounded print:hidden disabled:opacity-60"
      >
        {fetching ? '⏳ آماده‌سازی همهٔ ردیف‌ها…' : '🖨️ چاپ گزارش'}
      </button>

      {/* الگوی چاپی: روی صفحه پنهان است؛ هنگام چاپ کلون شده به ریشهٔ body میرود.
          از تگهای header/footer/nav/button عمداً استفاده نشده چون قواعد
          سراسری `@media print` آنها را `display:none` میکنند. */}
      <div className="report-print-template" aria-hidden="true" data-rp-template>
        <div className="rp-doc" data-rp-doc>
          <div className="rp-head" data-rp-head>
            <div className="rp-head-row">
              {universityLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="rp-logo" src={universityLogoUrl} alt="" />
              ) : (
                <span className="rp-logo rp-logo-fallback">🏛️</span>
              )}
              <div className="rp-brand-block">
                <div className="rp-brand">{universityTitle || 'سامانه جامع آفاق'}</div>
                <div className="rp-system">سامانهٔ جامع مدیریت دانشگاهی آفاق</div>
              </div>
            </div>
            <div className="rp-title">{title}</div>
            {subtitle && <div className="rp-sub">{subtitle}</div>}
            {/* در RTL، نخستین فرزند سمت راست قرار میگیرد؛ پس ترتیب عمداً
                «تعداد ردیفها» ← «تاریخ» است تا تاریخ در سمت چپ بیاید. */}
            <div className="rp-meta">
              <span>تعداد ردیفها: {faNum(displayRows.length)}{printTruncated ? ` از ${faNum(printTotal ?? displayRows.length)} (سقف چاپ)` : ''}</span>
              {/* suppressHydrationWarning: تاریخِ «امروز» در سرور و کلاینت در
                  نیمهشب (به وقت تهران) میتواند یکی تیک بخورد؛ ناهماهنگیِ آبِ
                  کاری نباید هشدار React تولید کند. */}
              <span suppressHydrationWarning>تاریخ تهیۀ گزارش: {faDate}</span>
            </div>
          </div>

          <table className="rp-table" data-rp-table>
            <colgroup>
              {renderCols.map((c, i) => (
                <col key={c.key} style={{ width: `${(widths[i] ?? 0).toFixed(2)}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {renderCols.map(c => {
                  // هدر دوخطیِ فرم قدیمی fqTrDaTe2 (الگوی ایجنت دیگر) — اولویت با آن
                  const legacy = form === 'semester-detail' ? SEMESTER_HEADERS[c.key] : undefined;
                  if (legacy) {
                    return (
                      <th key={c.key} scope="col">
                        <span style={{ display: 'block' }}>{legacy[0]}</span>
                        <span style={{ display: 'block' }}>{legacy[1]}</span>
                      </th>
                    );
                  }
                  // ستونهای دوخطیِ pair (fqSumTa) — دو عنوان روی هم در یک سلول
                  const b = columns.find(x => x.pair === c.pair && x.line === 'bottom');
                  return (
                    <th key={c.key} scope="col">{b ? `${c.title}\n${b.title}` : c.title}</th>
                  );
              </tr>
            </thead>
            <tbody data-rp-tbody>
              {displayRows.map((row, i) => {
                if (row.__kind === 'band') {
                  return (
                    <tr key={i}>
                      <td colSpan={columns.length} className="rp-band">{String(row.__label ?? '')}</td>
                    </tr>
                  );
                }
                const isSub = row.__kind === 'subtotal';
                const labelCol = String((row as Record<string, unknown>).__labelCol ?? '');
                return (
                  <tr key={i}>
                    {renderCols.map(c => {
                      if (isSub && labelCol === c.key) {
                        return (
                          <td key={c.key} className="rp-band">{String(row.__label ?? '')}</td>
                        );
                      }
                      const b = columns.find(x => x.pair === c.pair && x.line === 'bottom');
                      if (b) {
                        const top = fmtCell(row[c.key], c.format);
                        const bot = fmtCell(row[b.key], b.format);
                        return (
                          <td key={c.key} dir="ltr" className="rp-num rp-pair">
                            <div>{top}</div>
                            <div>{bot}</div>
                          </td>
                        );
                      }
                      const formatted = fmtCell(row[c.key], c.format);
                      // ستونهای بدون format (کد دانشجو، شماره فیش، …) هم ارقام
                      // فارسی بگیرند؛ ستونهای DATE/MONEY/NUMBER قبلتر قالب خوردهاند.
                      const text = c.format ? formatted : faNum(formatted);
                      const isNumeric = /^[\d\u06F0-\u06F9,.،\s—-]+$/.test(text);
                      const isLong = text.replace(/[\s,.،—-]/g, '').length > 13;
                      return (
                        <td
                          key={c.key}
                          dir={isNumeric ? 'ltr' : 'auto'}
                          className={isNumeric ? (isLong ? 'rp-num rp-longnum' : 'rp-num') : undefined}
                        >
                          {text}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            {totals && (
              <tfoot>
                <tr>
                  {renderCols.map(c => {
                    const b = columns.find(x => x.pair === c.pair && x.line === 'bottom');
                    if (b) {
                      const top = fmtCell(totals[c.key], c.format);
                      const bot = fmtCell(totals[b.key], b.format);
                      return (
                        <td key={c.key} dir="ltr" className="rp-num rp-pair">
                          <div>{top}</div>
                          <div>{bot}</div>
                        </td>
                      );
                    }
                    const formatted = fmtCell(totals[c.key], c.format);
                    const text = c.format ? formatted : faNum(formatted);
                    const isNumeric = /^[\d\u06F0-\u06F9,.،\s—-]+$/.test(text);
                    return (
                      <td key={c.key} dir={isNumeric ? 'ltr' : 'auto'} className={isNumeric ? 'rp-num rp-total' : 'rp-total'}>
                        {text}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>

          {summary && <div className="rp-summary" data-rp-summary>{summary}</div>}

          {/* پاصفحهٔ تکرارشونده: امضاها + شمارهٔ برگه. محتوای نهایی و شمارهٔ
              واقعی توسط paginateReportPrint() در هر برگه نوشته میشود. */}
          <div className="rp-page-foot" data-rp-foot>
            <div className="rp-page-signs" data-rp-signs>
              {signLabels.map(s => <div className="rp-sign" key={s}>{s}</div>)}
            </div>
            <div className="rp-page-num" data-rp-pageno>صفحۀ ۱ از ۱</div>
          </div>
        </div>
      </div>
    </>
  );
}
