import Link from 'next/link';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { getReportPrintBrand } from '@/lib/report-print-brand';
import { faNum } from '@/lib/report-format';
import { toJalali } from '@/lib/calendar';
import PrintButton from '@/components/PrintButton';
import {
  loadLegacyFinancial,
  sumTotals,
  withBalance,
  type LegacyTotals,
} from '../legacy-financial';

export const dynamic = 'force-dynamic';

const ROLES = ['ADMIN', 'EDU_EXPERT', 'FINANCE_EXPERT', 'FINANCE', 'CASHIER'];

/**
 * «گزارش مالی دانشکده ها» — فرم رسمی سما (fqTrDaTe / r2).
 *
 * ۱۲ ستون فیزیکی؛ هر گروه عددی دوخطی (بالا/پایین):
 *   کد | دانشکده | ترم/ورود | تعداد/دانشجو |
 *   شهریه متغیر/ثابت | تخفیفات متغیر/ثابت | تخفیفات مبلغی/پرداختیها |
 *   مساعده/مبالغ موضوعی | جمع بدهکار/جمع بستانکار | مانده بدهکار/مانده بستانکار |
 *   مانده (ترکیبی: مبلغ + وضعیت بدهکار/بستانکار، بالاسر ستون فقط «مانده»)
 *
 * جمع در انتهای هر دانشکده = «جمع دانشکده»؛ جمع کل ندارد.
 * بُعد دانشکده از moshgel.facultyCode (مطابق PDF سما) می‌آید.
 */

const money = (v: number): string => faNum(Math.round(v).toLocaleString('en-US'));
const signedMoney = (v: number): string => (v > 0 ? `-${money(v)}` : money(-v));

function todayJalali(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran', year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(new Date());
  const part = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const { jy, jm, jd } = toJalali(part('year'), part('month'), part('day'));
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}

function Stack({ top, bottom }: { top: string; bottom: string }) {
  return <div className="ff-stack"><span>{top}</span><span>{bottom}</span></div>;
}

export default async function FacultyFinancialReportPage(props: {
  searchParams: Promise<{ term?: string; facultyCode?: string; run?: string }>;
}) {
  await requireRole(ROLES);
  const sp = await props.searchParams;
  const uni = await getCurrentUniversity();
  const uid = uni?.id ?? null;
  const brand = await getReportPrintBrand('finance-report', uid);

  const [termRows, facultyRows] = await Promise.all([
    db.execute<{ code: string }>(sql`
      SELECT "termCode" AS code FROM academic_terms
      GROUP BY "termCode" ORDER BY "termCode" DESC LIMIT 40
    `),
    db.execute<{ code: string; name: string }>(sql`
      SELECT COALESCE(NULLIF("facultyCode",''), id::text) AS code, name FROM faculties
      ${uid ? sql`WHERE "universityId" = ${uid} OR "universityId" IS NULL` : sql``}
      ORDER BY NULLIF(COALESCE(NULLIF("facultyCode",''), id::text), '')::int, name
    `),
  ]);

  const termCodes = termRows.rows.map((r) => String(r.code)).filter(Boolean);
  const term = sp.term && termCodes.includes(sp.term) ? sp.term : (termCodes[0] ?? '');
  const facultyCode = sp.facultyCode ? String(sp.facultyCode) : '';
  const shouldLoad = sp.run === '1' && !!term;

  const { rows: raw, fromMoshgel } = shouldLoad
    ? await loadLegacyFinancial({ termCode: term, universityId: uid ?? 0, facultyCode: facultyCode || null })
    : { rows: [], fromMoshgel: false };

  // تجمیع در سطح (دانشکدهٔ سما × نیمسال ورود) — r2
  type Row = LegacyTotals & {
    facultyCode: string; faculty: string; entryCode: string;
  };
  const byKey = new Map<string, Row>();
  for (const r of raw) {
    const key = `${r.mosFacultyCode}\x00${r.entryCode}`;
    let g = byKey.get(key);
    if (!g) {
      g = {
        facultyCode: r.mosFacultyCode, faculty: r.mosFaculty, entryCode: r.entryCode,
        students: 0, variable: 0, fixed: 0, discVar: 0, discFixed: 0, discAmount: 0,
        paid: 0, loan: 0, subject: 0, debit: 0, credit: 0, debtBalance: 0, creditBalance: 0,
      };
      byKey.set(key, g);
    }
    g.students += r.students; g.variable += r.variable; g.fixed += r.fixed;
    g.discVar += r.discVar; g.discFixed += r.discFixed; g.discAmount += r.discAmount;
    g.paid += r.paid; g.loan += r.loan; g.subject += r.subject;
    g.debit += r.debit; g.credit += r.credit;
  }
  const groups: Row[] = Array.from(byKey.values()).map((g) => ({ ...g, ...withBalance(g) }));
  groups.sort((a, b) =>
    (Number(a.facultyCode) || 0) - (Number(b.facultyCode) || 0)
    || (Number(a.entryCode) || 0) - (Number(b.entryCode) || 0),
  );

  // جمع دانشکده (هر دانشکده جدا)
  type SubRow = { __kind: 'sub'; facultyCode: string; faculty: string; totals: LegacyTotals };
  type DataRow = { __kind: 'row'; row: Row };
  const out: (DataRow | SubRow)[] = [];
  let cur = '';
  let bucket: Row[] = [];
  const flush = () => {
    if (!bucket.length) return;
    const totals = sumTotals(bucket.map(withBalance));
    out.push({ __kind: 'sub', facultyCode: bucket[0].facultyCode, faculty: bucket[0].faculty, totals });
  };
  for (const g of groups) {
    if (g.facultyCode !== cur) {
      flush();
      cur = g.facultyCode;
      bucket = [];
    }
    out.push({ __kind: 'row', row: g });
    bucket.push(g);
  }
  flush();

  const css = `
    @media print {
      @page { size: A4 landscape; margin: 7mm; }
      .faculty-financial-root { display:block !important; width:100% !important; }
      .ff-no-print { display:none !important; }
      .ff-doc { border:0 !important; padding:0 !important; margin:0 !important; }
      .ff-table thead { display: table-header-group !important; }
      .ff-table tr { break-inside: avoid; page-break-inside: avoid; }
      .ff-table th, .ff-table td { border-color:#111 !important; }
      .ff-debt { color:#c0392b !important; font-weight:800 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      .ff-sub td { font-weight:800 !important; background:#f5f5f5 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    }
    .ff-doc { background:#fff; color:#111; border:1px solid #111; padding:10px; }
    .ff-head { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; border:1px solid #111; border-bottom:0; padding:6px 10px; min-height:78px; }
    .ff-head-right { display:flex; flex-direction:column; align-items:flex-start; gap:2px; font-size:11px; }
    .ff-head-center { text-align:center; }
    .ff-head-center h1 { font-size:16px; font-weight:800; margin:0; }
    .ff-head-center p { font-size:12px; font-weight:700; margin:2px 0 0; }
    .ff-head-left { display:flex; flex-direction:column; align-items:flex-end; gap:2px; font-size:11px; }
    .ff-logo { width:42px; height:42px; object-fit:contain; }
    .ff-logo-fallback { width:42px; height:42px; border-radius:999px; border:2px solid #138a5a; color:#138a5a; display:grid; place-items:center; font-weight:900; }
    .ff-table { width:100%; border-collapse:collapse; table-layout:fixed; font-family:Tahoma,Arial,sans-serif; font-size:9px; }
    .ff-table th, .ff-table td { border:1px solid #111; padding:2px 3px; text-align:center; vertical-align:middle; }
    .ff-table thead th { background:#fff; font-weight:800; height:34px; }
    .ff-table tbody tr { height:34px; }
    .ff-stack { display:flex; flex-direction:column; line-height:1.55; direction:rtl; }
    .ff-num { direction:ltr; unicode-bidi:isolate; font-variant-numeric:tabular-nums; }
    .ff-name { font-size:9px; font-weight:700; }
    .ff-sub td { font-weight:800; background:#f5f5f5; }
    .ff-foot { border:1px solid #111; border-top:0; padding:4px 8px; font-size:8px; display:flex; justify-content:space-between; gap:10px; }
  `;

  const statusText = (t: LegacyTotals) => (t.debtBalance >= t.creditBalance ? 'بدهکار' : 'بستانکار');
  const netAmount = (t: LegacyTotals) => (t.debtBalance >= t.creditBalance ? t.debtBalance : t.creditBalance);
  const netIsDebt = (t: LegacyTotals) => t.debtBalance >= t.creditBalance;

  return (
    <div className="print-area faculty-financial-root" dir="rtl">
      <style>{css}</style>

      <div className="ff-no-print mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white p-3 shadow-sm">
        <div>
          <h1 className="text-base font-black text-slate-800">گزارش مالی دانشکده ها</h1>
          <p className="mt-0.5 text-xs text-slate-500">فرم رسمی سما (fqTrDaTe) — دانشکده × ترم ورود{fromMoshgel ? ' · جمعیت: مشکل' : ''}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link prefetch={false} href="/admin/finance/reports" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold">بازگشت به گزارش‌ها</Link>
          <PrintButton />
        </div>
      </div>

      <form method="get" className="ff-no-print mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-300 bg-white p-3 text-xs shadow-sm">
        <input type="hidden" name="run" value="1" />
        <label className="flex flex-col gap-1 font-bold text-slate-600">
          نیمسال
          <select name="term" defaultValue={term} className="rounded border border-slate-300 bg-white px-2 py-1.5">
            {termCodes.map((t) => <option key={t} value={t}>{faNum(t)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-bold text-slate-600">
          دانشکده
          <select name="facultyCode" defaultValue={facultyCode} className="rounded border border-slate-300 bg-white px-2 py-1.5">
            <option value="">همه</option>
            {facultyRows.rows.map((f) => <option key={String(f.code)} value={String(f.code)}>{String(f.name)}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded-lg bg-indigo-700 px-4 py-1.5 font-bold text-white">نمایش گزارش</button>
        <span className="mr-auto text-slate-500">{shouldLoad ? `${faNum(groups.length)} ردیف` : 'برای مشاهده، فیلتر را انتخاب و «نمایش گزارش» را بزنید.'}</span>
      </form>

      <div className="ff-doc">
        <div className="ff-head">
          <div className="ff-head-right">
            {brand.universityLogoUrl
              ? <img className="ff-logo" src={brand.universityLogoUrl} alt="" />
              : <div className="ff-logo-fallback">{faNum('آ')}</div>}
            <span>{brand.universityTitle}</span>
          </div>
          <div className="ff-head-center">
            <p>صفحه ۱</p>
            <h1>گزارش مالی دانشکده ها</h1>
            <p>نیمسال {faNum(term)}</p>
            <p>تاریخ {faNum(todayJalali())}</p>
          </div>
          <div className="ff-head-left">
            <span>کد f qTrDaTe</span>
          </div>
        </div>

        <table className="ff-table">
          <colgroup>
            <col style={{ width: '4%' }} /><col style={{ width: '14%' }} /><col style={{ width: '6%' }} />
            <col style={{ width: '5%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} />
            <col style={{ width: '9%' }} /><col style={{ width: '8%' }} /><col style={{ width: '9%' }} />
            <col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>کد</th>
              <th>دانشکده</th>
              <th><Stack top="ترم" bottom="ورود" /></th>
              <th><Stack top="تعداد" bottom="دانشجو" /></th>
              <th><Stack top="شهریه متغیر" bottom="شهریه ثابت" /></th>
              <th><Stack top="تخفیفات متغیر" bottom="تخفیفات ثابت" /></th>
              <th><Stack top="تخفیفات مبلغی" bottom="پرداختی ها" /></th>
              <th><Stack top="مساعده" bottom="مبالغ موضوعی" /></th>
              <th><Stack top="جمع بدهکار" bottom="جمع بستانکار" /></th>
              <th><Stack top="مانده بدهکار" bottom="مانده بستانکار" /></th>
              <th colSpan={2}>مانده</th>
            </tr>
          </thead>
          <tbody>
            {out.map((item, idx) => {
              if (item.__kind === 'sub') {
                const t = item.totals;
                return (
                  <tr key={`sub-${item.facultyCode}-${idx}`} className="ff-sub">
                    <td className="ff-num">{faNum(item.facultyCode)}</td>
                    <td className="ff-name" colSpan={2}>جمع دانشکده</td>
                    <td className="ff-num">{faNum(t.students)}</td>
                    <td className="ff-num"><Stack top={money(t.variable)} bottom={money(t.fixed)} /></td>
                    <td className="ff-num"><Stack top={money(t.discVar)} bottom={money(t.discFixed)} /></td>
                    <td className="ff-num"><Stack top={money(t.discAmount)} bottom={money(t.paid)} /></td>
                    <td className="ff-num"><Stack top={money(t.loan)} bottom={money(t.subject)} /></td>
                    <td className="ff-num"><Stack top={money(t.debit)} bottom={money(t.credit)} /></td>
                    <td className="ff-num"><Stack top={money(t.debtBalance)} bottom={money(t.creditBalance)} /></td>
                    <td className={`ff-num${netIsDebt(t) ? ' ff-debt' : ''}`} colSpan={2}>
                      <Stack top={signedMoney(netAmount(t))} bottom={statusText(t)} />
                    </td>
                  </tr>
                );
              }
              const r = item.row;
              return (
                <tr key={`${r.facultyCode}-${r.entryCode}-${idx}`}>
                  <td className="ff-num">{faNum(r.facultyCode)}</td>
                  <td className="ff-name">{r.faculty}</td>
                  <td className="ff-num">{faNum(r.entryCode)}</td>
                  <td className="ff-num">{faNum(r.students)}</td>
                  <td className="ff-num"><Stack top={money(r.variable)} bottom={money(r.fixed)} /></td>
                  <td className="ff-num"><Stack top={money(r.discVar)} bottom={money(r.discFixed)} /></td>
                  <td className="ff-num"><Stack top={money(r.discAmount)} bottom={money(r.paid)} /></td>
                  <td className="ff-num"><Stack top={money(r.loan)} bottom={money(r.subject)} /></td>
                  <td className="ff-num"><Stack top={money(r.debit)} bottom={money(r.credit)} /></td>
                  <td className="ff-num"><Stack top={money(r.debtBalance)} bottom={money(r.creditBalance)} /></td>
                  <td className={`ff-num${netIsDebt(r) ? ' ff-debt' : ''}`} colSpan={2}>
                    <Stack top={signedMoney(netAmount(r))} bottom={statusText(r)} />
                  </td>
                </tr>
              );
            })}
            {groups.length === 0 && (
              <tr><td colSpan={12} className="p-6 text-center">{shouldLoad ? 'رکوردی با این فیلترها یافت نشد.' : 'فیلتر را انتخاب کنید و «نمایش گزارش» را بزنید تا داده بارگذاری شود.'}</td></tr>
            )}
          </tbody>
        </table>

        <div className="ff-foot">
          <span>تهیه‌کننده: سیستم جامع مالی آفاق</span>
          <span>مسئولیت صحت اطلاعات بر عهدهٔ اداره مالی است.</span>
        </div>
      </div>
    </div>
  );
}
