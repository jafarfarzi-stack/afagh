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

type ReportColumn = { key: string; title: string; format?: string };

/** وزن نسبی پهنای ستونها؛ شناسههای بلند جای بیشتری میگیرند تا روی تاریخ نیفتند. */
function columnWeights(columns: ReportColumn[]): number[] {
  const weight = (c: ReportColumn): number => {
    if (c.format === 'DATE' || c.format === 'DATETIME') return 1.15;
    if (c.format === 'MONEY') return 1.4;
    if (c.format === 'NUMBER') return 1.0;
    // شماره فیش / شماره حساب / شماره پیگیری / کدهای بلند: عرض بیشتر + شکستن ارقام
    if (/شماره|فیش|حساب|پیگیری|سند|شناسه|کد|شبا/.test(c.title)) return 1.6;
    if (/نام|رشته|دانشکده|عنوان|شرح|توضیح|آدرس|درس|استاد/.test(c.title)) return 1.9;
    return 1.25;
  };
  const raw = columns.map(weight);
  const total = raw.reduce((a, b) => a + b, 0) || 1;
  return raw.map(w => (w / total) * 100);
}

const DEFAULT_SIGNERS = ['تهیهکنندهٔ گزارش', 'تأیید حسابدار', 'مدیر مالی'];

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
  universityTitle,
  universityLogoUrl,
  signers,
  reportDate,
  fetchAll,
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
}) {
  const faDate = reportDate || todayJalaliTehran();
  const orientation: ReportPrintOrientation = columns.length >= 7 ? 'landscape' : 'portrait';
  const widths = useMemo(() => columnWeights(columns), [columns]);
  const signLabels = signers && signers.length ? signers : DEFAULT_SIGNERS;

  /** ردیف‌های کاملِ چاپ (اگر با fetchAll آمده باشند) + وضعیت آماده‌سازی */
  const [printRows, setPrintRows] = useState<Record<string, unknown>[] | null>(null);
  const [printTotal, setPrintTotal] = useState<number | null>(null);
  const [printTruncated, setPrintTruncated] = useState(false);
  const [fetching, setFetching] = useState(false);
  const displayRows = printRows ?? rows;

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
              {columns.map((c, i) => (
                <col key={c.key} style={{ width: `${widths[i].toFixed(2)}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {columns.map(c => <th key={c.key} scope="col">{c.title}</th>)}
              </tr>
            </thead>
            <tbody data-rp-tbody>
              {displayRows.map((row, i) => (
                <tr key={i}>
                  {columns.map(c => {
                    const formatted = fmtCell(row[c.key], c.format);
                    // ستونهای بدون format (کد دانشجو، شماره فیش، …) هم ارقام
                    // فارسی بگیرند؛ ستونهای DATE/MONEY/NUMBER قبلتر قالب خوردهاند.
                    const text = c.format ? formatted : faNum(formatted);
                    const isNumeric = /^[\d\u06F0-\u06F9,.،\s—-]+$/.test(text);
                    // شماره فیش/حساب/پیگیریِ بلند نباید nowrap بماند و وارد
                    // ستون تاریخ شود؛ به آن کلاس rp-longnum میدهیم تا بشکند.
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
              ))}
            </tbody>
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
