// ══════════════════════════════════════════════════════════════════════
//  آفاق ERP — خروجی مستقیم Word/Text/CSV اسناد مالی
//  (بازسازی «خروجی Word/Text مستقیم» سیستم قدیم)
//
//  GET /api/admin/finance/export?type=statement|payments&format=doc|txt|csv
//    • type=statement → صورت‌حساب ترم‌به‌ترم یک دانشجو (studentId اجباری)
//    • type=payments  → فهرست پرداخت‌ها (studentId/dateFrom/dateTo اختیاری)
//
//  داده از مسیر کانونی می‌آید (getStudentFinance — همان سازندهٔ کارنامه و
//  صفحهٔ صورت‌حساب)؛ هیچ محاسبهٔ مالی موازیِ جدیدی اینجا نیست.
//  خروجی attachment با Content-Disposition است.
// ══════════════════════════════════════════════════════════════════════
import { NextResponse } from 'next/server';
import { and, asc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, student_ledger, students, users } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { getStudentFinance } from '@/lib/finance-engine';
import { ledgerBalance } from '@/lib/ledger-balance';
import { toNum } from '@/lib/finance-rules';
import {
  CSV_CONTENT_TYPE, DOC_CONTENT_TYPE, TXT_CONTENT_TYPE,
  buildCsv, buildPlainText, buildWordDocHtml, makeExportFilename,
  type ExportDocInput,
} from '@/lib/export-doc';

export const dynamic = 'force-dynamic';

// کلیدهای مجوز — عیناً از مسیر مالی موجود (api/admin/finance/reports/student-statement)
const ROLES: string[] = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE', 'CASHIER'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** پاسخ خطای JSON (درخواست نامعتبر/دسترسی) */
function err(msg: string, status: number) {
  return NextResponse.json({ error: msg }, { status });
}

/** نام فایل → هدر Content-Disposition با پشتیبانی UTF-8 */
function attachmentHeaders(filename: string, contentType: string): Headers {
  const h = new Headers({ 'Content-Type': contentType, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` });
  return h;
}

/** خروجی نهایی بر اساس format */
function respond(format: string, input: ExportDocInput, baseName: string): Response {
  if (format === 'doc') {
    const html = buildWordDocHtml(input);
    return new Response('\ufeff' + html, {
      headers: attachmentHeaders(makeExportFilename(baseName, 'doc'), `${DOC_CONTENT_TYPE}; charset=utf-8`),
    });
  }
  if (format === 'txt') {
    const txt = buildPlainText(input);
    return new Response('\ufeff' + txt, {
      headers: attachmentHeaders(makeExportFilename(baseName, 'txt'), TXT_CONTENT_TYPE),
    });
  }
  // csv (پیش‌فرض)
  const csv = buildCsv(input);
  return new Response('\ufeff' + csv, {
    headers: attachmentHeaders(makeExportFilename(baseName, 'csv'), CSV_CONTENT_TYPE),
  });
}

export async function GET(request: Request) {
  try {
    await requireRole(ROLES);
  } catch (e: any) {
    // requireRole ریدایرکت می‌کند — در مسیر API به 401 ترجمه می‌شود
    return err(e?.message || 'دسترسی غیرمجاز', 401);
  }

  const uni = await getCurrentUniversity().catch(() => null);
  if (!uni) return err('دانشگاه فعال یافت نشد', 400);

  const url = new URL(request.url);
  const type = (url.searchParams.get('type') || '').trim();
  const format = (url.searchParams.get('format') || 'doc').trim();
  const studentId = Number(url.searchParams.get('studentId') ?? 0);
  const dateFrom = (url.searchParams.get('dateFrom') || '').trim();
  const dateTo = (url.searchParams.get('dateTo') || '').trim();

  if (type !== 'statement' && type !== 'payments') {
    return err('نوع خروجی نامعتبر است (statement یا payments)', 400);
  }
  if (!['doc', 'txt', 'csv'].includes(format)) {
    return err('فرمت خروجی نامعتبر است (doc، txt یا csv)', 400);
  }
  if (dateFrom && !DATE_RE.test(dateFrom)) return err('تاریخ شروع باید به شکل YYYY-MM-DD باشد', 400);
  if (dateTo && !DATE_RE.test(dateTo)) return err('تاریخ پایان باید به شکل YYYY-MM-DD باشد', 400);

  // ─── صورت‌حساب دانشجو ───
  if (type === 'statement') {
    if (!studentId) return err('شناسه دانشجو الزامی است', 400);

    const [stu] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.id, studentId), or(eq(students.universityId, uni.id), isNull(students.universityId))))
      .limit(1);
    if (!stu) return err('دانشجو یافت نشد', 404);

    // مسیر کانونی: همان اعداد صفحهٔ صورت‌حساب و کارنامه (بدون جمع دستی موازی)
    const fin = await getStudentFinance(studentId, { universityId: uni.id });
    if (!fin) return err('دانشجو یافت نشد', 404);

    // ماندهٔ کل دفتر (همهٔ ترم‌ها) — عیناً مثل مسیر student-statement
    const ledgerRows = await db
      .select({ termId: student_ledger.termId, transactionType: student_ledger.transactionType, amount: student_ledger.amount })
      .from(student_ledger)
      .where(eq(student_ledger.studentId, studentId));
    const balance = ledgerBalance(ledgerRows);

    const termCodeById = new Map(fin.terms.map((t) => [t.id, t.termCode]));
    const rows = fin.transcript.map((s) => ({
      termCode: termCodeById.get(s.termId) ?? '',
      termTitle: s.termTitle,
      charges: s.charges,
      discounts: s.discounts,
      sponsorships: s.sponsorships,
      payments: s.payments,
      chequesCleared: s.chequesCleared,
      loans: s.loans,
      netPayable: s.netPayable,
      balance: s.balance,
    }));

    const sum = (k: keyof (typeof rows)[number]) => rows.reduce((a, r) => a + toNum(r[k]), 0);

    const input: ExportDocInput = {
      title: 'صورت‌حساب مالی دانشجو',
      subtitle: 'سیستم جامع مالی دانشگاه آفاق',
      meta: [
        { label: 'نام دانشجو', value: fin.student.fullName },
        { label: 'شماره دانشجویی', value: fin.student.studentCode ?? '—' },
        { label: 'رشته/مقطع', value: `${fin.student.majorTitle ?? '—'} — ${fin.student.degreeTitle ?? '—'}` },
        { label: 'ورودی', value: fin.student.entryYear ? String(fin.student.entryYear) : '—' },
      ],
      columns: [
        { key: 'termCode', title: 'کد ترم' },
        { key: 'termTitle', title: 'ترم' },
        { key: 'charges', title: 'بدهی (ریال)' },
        { key: 'discounts', title: 'تخفیف (ریال)' },
        { key: 'sponsorships', title: 'پوشش بنیاد (ریال)' },
        { key: 'payments', title: 'پرداخت (ریال)' },
        { key: 'chequesCleared', title: 'چک وصول‌شده (ریال)' },
        { key: 'loans', title: 'وام (ریال)' },
        { key: 'netPayable', title: 'قابل پرداخت (ریال)' },
        { key: 'balance', title: 'مانده (ریال)' },
      ],
      rows,
      footer: `جمع کل بدهی: ${sum('charges').toLocaleString('fa-IR')} ریال — جمع کل پرداخت: ${sum('payments').toLocaleString('fa-IR')} ریال — ماندهٔ کلی دفتر: ${balance.toLocaleString('fa-IR')} ریال (مثبت = بدهی)`,
    };

    return respond(format, input, `صورت_حساب_${fin.student.studentCode || fin.student.fullName}`);
  }

  // ─── فهرست پرداخت‌ها ───
  const conds = [inArray(student_ledger.transactionType, ['PAYMENT', 'POS_PAYMENT'])];
  if (studentId) conds.push(eq(student_ledger.studentId, studentId));
  if (dateFrom) conds.push(gte(student_ledger.createdAt, new Date(`${dateFrom}T00:00:00.000`)));
  if (dateTo) conds.push(lte(student_ledger.createdAt, new Date(`${dateTo}T23:59:59.999`)));

  const pays = await db
    .select({
      createdAt: student_ledger.createdAt,
      transactionType: student_ledger.transactionType,
      amount: student_ledger.amount,
      description: student_ledger.description,
      studentCode: students.studentCode,
      studentName: users.firstName,
      studentLastName: users.lastName,
      termCode: academic_terms.termCode,
    })
    .from(student_ledger)
    .innerJoin(students, eq(students.id, student_ledger.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(academic_terms, eq(academic_terms.id, student_ledger.termId))
    .where(and(...conds, or(eq(students.universityId, uni.id), isNull(students.universityId))))
    .orderBy(asc(student_ledger.createdAt))
    .limit(5000);

  const rows = pays.map((p) => ({
    date: p.createdAt ? new Date(p.createdAt).toLocaleString('fa-IR') : '—',
    studentCode: p.studentCode ?? '',
    studentName: `${p.studentName ?? ''} ${p.studentLastName ?? ''}`.trim() || '—',
    termCode: p.termCode ?? '—',
    kind: p.transactionType === 'POS_PAYMENT' ? 'پرداخت POS' : 'پرداخت آنلاین',
    amount: Number(p.amount),
    description: p.description ?? '',
  }));
  const total = rows.reduce((a, r) => a + (Number.isFinite(r.amount) ? r.amount : 0), 0);

  const meta: Array<{ label: string; value: string }> = [
    { label: 'تعداد ردیف', value: String(rows.length) },
  ];
  if (studentId) meta.push({ label: 'شماره دانشجویی', value: pays[0]?.studentCode ?? String(studentId) });
  if (dateFrom || dateTo) meta.push({ label: 'بازهٔ گزارش', value: `${dateFrom || 'ابتدای تاریخ'} تا ${dateTo || 'امروز'}` });

  const input: ExportDocInput = {
    title: 'فهرست پرداخت‌های مالی',
    subtitle: 'سیستم جامع مالی دانشگاه آفاق',
    meta,
    columns: [
      { key: 'date', title: 'تاریخ ثبت' },
      { key: 'studentCode', title: 'شماره دانشجویی' },
      { key: 'studentName', title: 'نام دانشجو' },
      { key: 'termCode', title: 'ترم' },
      { key: 'kind', title: 'نوع پرداخت' },
      { key: 'amount', title: 'مبلغ (ریال)' },
      { key: 'description', title: 'شرح' },
    ],
    rows,
    footer: `جمع کل پرداخت‌ها: ${total.toLocaleString('fa-IR')} ریال`,
  };

  return respond(format, input, 'فهرست_پرداخت‌های_مالی');
}
