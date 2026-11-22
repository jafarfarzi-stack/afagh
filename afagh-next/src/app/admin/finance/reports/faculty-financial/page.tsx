import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireRole } from "@/lib/auth";
import { getCurrentUniversity } from "@/lib/university-scope";
import { getReportPrintBrand } from "@/lib/report-print-brand";
import { faNum } from "@/lib/report-format";
import { toJalali } from "@/lib/calendar";
import PrintButton from "@/components/PrintButton";
import { joinAnd } from "@/app/admin/reports/report-helpers";
import {
  DEBT_LEDGER_TYPES,
  DISCOUNT_LEDGER_TYPES,
  PAID_LEDGER_TYPES,
  ledgerTypesCsv,
} from "@/lib/ledger-balance";

export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "EDU_EXPERT", "FINANCE_EXPERT", "FINANCE", "CASHIER"];

const VARIABLE = ["TUITION_VARIABLE"] as const;
const FIXED = ["TUITION_FIXED", "TUITION_CHARGE", "CHARGE"] as const;
const ADJ_DEC = ["TUITION_ADJUST_DEC"] as const;
const REFUND = ["POS_REFUND"] as const;
const DISC_VARIABLE = ["DISCOUNT_VARIABLE", "TUITION_BATES_VARIABLE"] as const;
const DISC_FIXED = ["DISCOUNT_FIXED", "TUITION_BATES_FIXED", "TUITION_BATES", "TUITION_ADJUST_INC"] as const;
const DISC_AMOUNT = ["TUITION_BATES_AMOUNT"] as const;
const CHARGE_TYPES = [...VARIABLE, ...FIXED, ...DISC_VARIABLE, ...DISC_FIXED, ...DISC_AMOUNT] as const;
const PAYMENTS = ["PAYMENT", "POS_PAYMENT", "SPONSORSHIP", "CREDIT"] as const;
const ADVANCE = ["LOAN"] as const;
const TOPIC_ADD = ["SUBJECT_ADDITIVE"] as const;
const TOPIC_DEDUCT = ["SUBJECT_DEDUCTIVE"] as const;

/** فقط از ثابت‌های کد میآید — ورودی کاربر در SQL.raw نمیرود. */
const inTypes = (types: readonly string[]) =>
  sql.raw(`sl."transactionType" IN (${ledgerTypesCsv(types)})`);
const sumOf = (types: readonly string[]) =>
  sql`COALESCE(SUM(sl.amount) FILTER (WHERE ${inTypes(types)}), 0)::text`;

type RawRow = {
  code: string | null;
  faculty: string | null;
  entryCode: number;
  students: number;
  variable: string;
  fixed: string;
  adjdec: string;
  refund: string;
  discVariable: string;
  discFixed: string;
  discAmount: string;
  payments: string;
  advance: string;
  topicAdd: string;
  topicDeduct: string;
};

type Row = RawRow & {
  debit: number;
  credit: number;
  net: number;
  debtor: number;
  creditor: number;
  status: string;
};

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const money = (v: number): string => faNum(Math.round(v).toLocaleString("en-US"));
const signedMoney = (v: number): string =>
  v < 0 ? `(${money(Math.abs(v))})` : money(v);

function todayJalali(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());
  const part = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const { jy, jm, jd } = toJalali(part("year"), part("month"), part("day"));
  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}

function Stack({ top, bottom }: { top: string; bottom: string }) {
  return (
    <div className="ff-stack">
      <span>{top}</span>
      <span>{bottom}</span>
    </div>
  );
}

export default async function FacultyFinancialReportPage(props: {
  searchParams: Promise<{ term?: string; facultyId?: string }>;
}) {
  await requireRole(ROLES);
  const sp = await props.searchParams;
  const uni = await getCurrentUniversity();
  const uid = uni?.id ?? null;
  const brand = await getReportPrintBrand("finance-report", uid);

  const [termRows, facultyRows] = await Promise.all([
    db.execute<{ code: string }>(sql`
      SELECT "termCode" AS code FROM academic_terms
      GROUP BY "termCode" ORDER BY "termCode" DESC LIMIT 40
    `),
    db.execute<{ id: number; name: string; code: string | null }>(sql`
      SELECT id, name, "facultyCode" AS code FROM faculties
      ${uid ? sql`WHERE "universityId" = ${uid} OR "universityId" IS NULL` : sql``}
      ORDER BY COALESCE(NULLIF("facultyCode", ''), id::text), name
    `),
  ]);

  const termCodes = termRows.rows.map((r) => r.code).filter(Boolean);
  const facultyId = Number(sp.facultyId) > 0 ? Number(sp.facultyId) : 0;
  const term = sp.term && termCodes.includes(sp.term) ? sp.term : termCodes[0] ?? "";

  const conds = [
    sql`t."termCode" = ${term}`,
    ...(uid
      ? [sql`(s."universityId" = ${uid} OR s."universityId" IS NULL)`]
      : []),
    ...(uid
      ? [sql`(sl."universityId" = ${uid} OR sl."universityId" IS NULL)`]
      : []),
    ...(facultyId ? [sql`fc.id = ${facultyId}`] : []),
  ];

  const data = await db.execute<RawRow>(sql`
    SELECT
      COALESCE(NULLIF(fc."facultyCode", ''), fc.id::text, '—') AS code,
      COALESCE(fc.name, '—') AS faculty,
      (s."entryYear" * 10 + COALESCE(s."entryTerm", 1))::int AS "entryCode",
      COALESCE(MAX(lpdf."studentCount"), MAX(lc."studentCount"),
        COUNT(DISTINCT s.id) FILTER (WHERE ${inTypes(CHARGE_TYPES)}))::int AS students,
      ${sumOf(VARIABLE)} AS variable,
      ${sumOf(FIXED)} AS fixed,
      ${sumOf(ADJ_DEC)} AS adjdec,
      ${sumOf(REFUND)} AS refund,
      ${sumOf(DISC_VARIABLE)} AS "discVariable",
      ${sumOf(DISC_FIXED)} AS "discFixed",
      ${sumOf(DISC_AMOUNT)} AS "discAmount",
      COALESCE(MAX(lpp."payments")::text, ${sumOf(PAYMENTS)}) AS payments,
      ${sumOf(ADVANCE)} AS advance,
      ${sumOf(TOPIC_ADD)} AS "topicAdd",
      ${sumOf(TOPIC_DEDUCT)} AS "topicDeduct"
    FROM students s
    JOIN student_ledger sl ON sl."studentId" = s.id
    JOIN academic_terms t ON t.id = sl."termId"
    LEFT JOIN majors m ON m.id = s."majorId"
    LEFT JOIN faculties fc ON fc.id = m."facultyId"
    LEFT JOIN legacy_faculty_student_counts lc
      ON lc."termCode" = ${term}
     AND lc."facultyCode" = COALESCE(NULLIF(fc."facultyCode", ''), fc.id::text)
     AND lc."cohort" = (s."entryYear" * 10 + COALESCE(s."entryTerm", 1))::text
    LEFT JOIN legacy_pdf_student_counts lpdf
      ON lpdf."termCode" = ${term}
     AND lpdf."facultyCode" = COALESCE(NULLIF(fc."facultyCode", ''), fc.id::text)
     AND lpdf."cohort" = (s."entryYear" * 10 + COALESCE(s."entryTerm", 1))::text
    LEFT JOIN legacy_pdf_payments lpp
      ON lpp."termCode" = ${term}
     AND lpp."facultyCode" = COALESCE(NULLIF(fc."facultyCode", ''), fc.id::text)
     AND lpp."cohort" = (s."entryYear" * 10 + COALESCE(s."entryTerm", 1))::text
    ${joinAnd(conds)}
    GROUP BY fc."facultyCode", fc.id, fc.name, s."entryYear", s."entryTerm"
    ORDER BY COALESCE(NULLIF(fc."facultyCode", ''), fc.id::text, '—'), "entryCode"
  `);

  const rows: Row[] = data.rows.map((r) => {
    const debit =
      n(r.variable) + n(r.fixed) + n(r.adjdec) + n(r.refund) + n(r.topicAdd);
    const credit =
      n(r.discVariable) + n(r.discFixed) + n(r.discAmount) +
      n(r.payments) + n(r.advance) + n(r.topicDeduct);
    const net = debit - credit;
    return {
      ...r,
      debit,
      credit,
      net,
      debtor: Math.max(net, 0),
      creditor: Math.max(-net, 0),
      status: net >= 0 ? "بدهکار" : "بستانکار",
    };
  });

  const total = rows.reduce(
    (a, r) => ({
      students: a.students + r.students,
      variable: a.variable + n(r.variable),
      fixed: a.fixed + n(r.fixed),
      discVariable: a.discVariable + n(r.discVariable),
      discFixed: a.discFixed + n(r.discFixed),
      discAmount: a.discAmount + n(r.discAmount),
      payments: a.payments + n(r.payments),
      advance: a.advance + n(r.advance),
      topicAdd: a.topicAdd + n(r.topicAdd),
      topicDeduct: a.topicDeduct + n(r.topicDeduct),
      debit: a.debit + r.debit,
      credit: a.credit + r.credit,
      net: a.net + r.net,
    }),
    {
      students: 0, variable: 0, fixed: 0, discVariable: 0, discFixed: 0,
      discAmount: 0, payments: 0, advance: 0, topicAdd: 0, topicDeduct: 0,
      debit: 0, credit: 0, net: 0,
    },
  );

  const css = `
    @media print {
      @page { size: A4 landscape; margin: 7mm; }
      .faculty-financial-root { display:block !important; width:100% !important; }
      .ff-no-print { display:none !important; }
      .ff-doc { border:0 !important; padding:0 !important; margin:0 !important; }
      .ff-table thead { display: table-header-group !important; }
      .ff-table tfoot { display: table-footer-group !important; }
      .ff-table tr { break-inside: avoid; page-break-inside: avoid; }
      .ff-table th, .ff-table td { border-color:#111 !important; }
    }
    .ff-doc { background:#fff; color:#111; border:1px solid #111; padding:10px; }
    .ff-head { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; border:1px solid #111; border-bottom:0; padding:6px 10px; min-height:78px; }
    .ff-head-right { display:flex; flex-direction:column; align-items:flex-start; gap:2px; font-size:11px; }
    .ff-head-center { text-align:center; }
    .ff-head-center h1 { font-size:16px; font-weight:800; letter-spacing:.02em; margin:0; }
    .ff-head-center p { font-size:12px; font-weight:700; margin:2px 0 0; }
    .ff-head-left { display:flex; flex-direction:column; align-items:flex-end; gap:2px; font-size:11px; }
    .ff-logo { width:42px; height:42px; object-fit:contain; }
    .ff-logo-fallback { width:42px; height:42px; border-radius:999px; border:2px solid #138a5a; color:#138a5a; display:grid; place-items:center; font-weight:900; }
    .ff-table { width:100%; border-collapse:collapse; table-layout:fixed; font-family:Tahoma,Arial,sans-serif; font-size:9px; }
    .ff-table th, .ff-table td { border:1px solid #111; padding:2px 3px; text-align:center; vertical-align:middle; }
    .ff-table thead th { background:#fff; font-weight:800; height:34px; }
    .ff-table tbody tr { height:34px; }
    .ff-table tfoot td { font-weight:800; background:#fff; }
    .ff-stack { display:flex; flex-direction:column; line-height:1.55; direction:rtl; }
    .ff-num { direction:ltr; unicode-bidi:isolate; font-variant-numeric:tabular-nums; }
    .ff-name { font-size:9px; font-weight:700; }
    .ff-foot { border:1px solid #111; border-top:0; padding:4px 8px; font-size:8px; display:flex; justify-content:space-between; gap:10px; }
  `;

  return (
    <div className="print-area faculty-financial-root" dir="rtl">
      <style>{css}</style>

      <div className="ff-no-print mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white p-3 shadow-sm">
        <div>
          <h1 className="text-base font-black text-slate-800">گزارش مالی دانشکده ها</h1>
          <p className="mt-0.5 text-xs text-slate-500">چیدمان دقیق سند چاپی سما — دانشکده × ترم ورود</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link prefetch={false} href="/admin/finance/reports" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold">بازگشت به گزارش‌ها</Link>
          <PrintButton />
        </div>
      </div>

      <form method="get" className="ff-no-print mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-300 bg-white p-3 text-xs shadow-sm">
        <label className="flex flex-col gap-1 font-bold text-slate-600">
          نیمسال
          <select name="term" defaultValue={term} className="rounded border border-slate-300 bg-white px-2 py-1.5">
            {termCodes.map((t) => <option key={t} value={t}>{faNum(t)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-bold text-slate-600">
          دانشکده
          <select name="facultyId" defaultValue={facultyId || ""} className="rounded border border-slate-300 bg-white px-2 py-1.5">
            <option value="">همه</option>
            {facultyRows.rows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded-lg bg-indigo-700 px-4 py-1.5 font-bold text-white">اعمال فیلتر</button>
        <span className="mr-auto text-slate-500">{faNum(rows.length)} ردیف</span>
      </form>

      <div className="ff-doc">
        <div className="ff-head">
          <div className="ff-head-right">
            {brand.universityLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="ff-logo" src={brand.universityLogoUrl} alt="" />
            ) : (
              <div className="ff-logo-fallback">{faNum("آ")}</div>
            )}
            <span>{brand.universityTitle}</span>
          </div>
          <div className="ff-head-center">
            <p>صفحه ۱</p>
            <h1>گزارش مالی دانشکده ها</h1>
            <p>نیمسال {faNum(term)}</p>
            <p>تاریخ {faNum(todayJalali())}</p>
          </div>
          <div className="ff-head-left">
            <span>کد {"f qTrDaTe"}</span>
            <span> noninstitutional </span>
          </div>
        </div>

        <table className="ff-table">
          <colgroup>
            <col style={{ width: "4%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "5%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "9%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>کد</th>
              <th>دانشکده</th>
              <th><div className="ff-stack"><span>ترم</span><span>ورود</span></div></th>
              <th><div className="ff-stack"><span>تعداد</span><span>دانشجو</span></div></th>
              <th><div className="ff-stack"><span>شهریه متغیر</span><span>شهریه ثابت</span></div></th>
              <th><div className="ff-stack"><span>تخفیفات متغیر</span><span>تخفیفات ثابت</span></div></th>
              <th><div className="ff-stack"><span>تخفیفات مبلغی</span><span>پرداختی ها</span></div></th>
              <th><div className="ff-stack"><span>مساعده</span><span>مبالغ موضوعی</span></div></th>
              <th><div className="ff-stack"><span>جمع بدهکار</span><span>جمع بستانکار</span></div></th>
              <th><div className="ff-stack"><span>بدهکار</span><span>بستانکار</span></div></th>
              <th>مانده</th>
              <th>ملاحظه</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={`${r.code}-${r.entryCode}-${idx}`}>
                <td className="ff-num">{faNum(r.code ?? "—")}</td>
                <td className="ff-name">{r.faculty}</td>
                <td className="ff-num">{faNum(r.entryCode)}</td>
                <td className="ff-num">{faNum(r.students)}</td>
                <td className="ff-num"><Stack top={money(n(r.variable))} bottom={money(n(r.fixed))} /></td>
                <td className="ff-num"><Stack top={money(n(r.discVariable))} bottom={money(n(r.discFixed))} /></td>
                <td className="ff-num"><Stack top={money(n(r.discAmount))} bottom={money(n(r.payments))} /></td>
                <td className="ff-num"><Stack top={money(n(r.advance))} bottom={money(n(r.topicAdd) - n(r.topicDeduct))} /></td>
                <td className="ff-num"><Stack top={money(r.debit)} bottom={money(r.credit)} /></td>
                <td className="ff-num"><Stack top={money(r.debtor)} bottom={money(r.creditor)} /></td>
                <td className="ff-num">{signedMoney(r.net)}</td>
                <td className="ff-name">{r.status}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={12} className="p-6 text-center">رکوردی با این فیلترها یافت نشد.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>جمع دانشکده ها</td>
              <td className="ff-num"><Stack top={money(total.variable)} bottom={money(total.fixed)} /></td>
              <td className="ff-num"><Stack top={money(total.discVariable)} bottom={money(total.discFixed)} /></td>
              <td className="ff-num"><Stack top={money(total.discAmount)} bottom={money(total.payments)} /></td>
              <td className="ff-num"><Stack top={money(total.advance)} bottom={money(total.topicAdd - total.topicDeduct)} /></td>
              <td className="ff-num"><Stack top={money(total.debit)} bottom={money(total.credit)} /></td>
              <td className="ff-num"><Stack top={money(Math.max(total.net, 0))} bottom={money(Math.max(-total.net, 0))} /></td>
              <td className="ff-num">{signedMoney(total.net)}</td>
              <td>{total.net >= 0 ? "بدهکار" : "بستانکار"}</td>
            </tr>
          </tfoot>
        </table>

        <div className="ff-foot">
          <span>تهیهکننده: سیستم جامع مالی آفاق</span>
          <span>مسئولیت صحت اطلاعات بر عهدهٔ اداره مالی است.</span>
        </div>
      </div>
    </div>
  );
}
