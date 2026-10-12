'use server';

import { db } from '@/db';
import { and, eq } from 'drizzle-orm';
import { student_ledger, students } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { getStudentFinance } from '@/lib/finance-engine';
import { ledgerBalance } from '@/lib/ledger-balance';
import { toNum } from '@/lib/finance-rules';

const ROLES: string[] = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE', 'CASHIER'];

/**
 * صورت‌حساب مالی دانشجو — همهٔ اعداد از مسیر کانونی می‌آیند و هیچ
 * جمعِ دستیِ موازی اینجا نیست تا با کارنامه/کارتابل واگرا نشود:
 *   • سطرها و جمع‌ها از getStudentFinance (سازندهٔ کارنامه) — مثبت = بدهی.
 *   • ماندهٔ کلی از ledgerBalance روی کل دفتر (همهٔ ترم‌ها — نه فقط
 *     ردیف‌های دارای financialTermId که پیش‌تر ردیف‌های termId-محورِ
 *     موتور شهریه را گم می‌کرد).
 * تفکیک ستون‌های سما فقط «نمایشی» است (نگاشت ۱:۱ از نوع خام)؛ ماندهٔ
 * هر سطر از کارنامه می‌آید.
 */
export async function GET(request: Request) {
  await requireRole(ROLES);
  const uni = await getCurrentUniversity();
  if (!uni) return Response.json({ error: 'دانشگاه فعال یافت نشد' }, { status: 400 });

  const url = new URL(request.url);
  const studentId = Number(url.searchParams.get('studentId') ?? 0);
  if (!studentId) return Response.json({ error: 'شناسه دانشجو الزامی است' }, { status: 400 });

  // Verify student belongs to university
  const [stu] = await db.select().from(students).where(and(eq(students.id, studentId), eq(students.universityId, uni.id))).limit(1);
  if (!stu) return Response.json({ error: 'دانشجو یافت نشد' }, { status: 404 });

  // مسیر کانونی: کارنامهٔ ترم‌به‌ترم + جمع‌ها (همان که صفحات مالی نشان می‌دهند)
  const fin = await getStudentFinance(studentId, { universityId: uni.id });
  if (!fin) return Response.json({ error: 'دانشجو یافت نشد' }, { status: 404 });

  // کل دفتر (همهٔ ترم‌ها) — برای تفکیک نمایشی و ماندهٔ کانونیِ سبکِ گیت
  const ledgerRows = await db.select({
    termId: student_ledger.termId,
    transactionType: student_ledger.transactionType,
    amount: student_ledger.amount,
  }).from(student_ledger).where(eq(student_ledger.studentId, studentId));

  // ماندهٔ کانونی روی کل دفتر (مثبت = بدهی) — همان ریاضیِ گیت انتخاب واحد
  const balance = ledgerBalance(ledgerRows);

  // جمعِ خام هر نوع تراکنش به‌تفکیک ترم تحصیلی (بدون منطق مالی — فقط نمایش)
  const NO_TERM = 0;
  const byTermType = new Map<number, Map<string, number>>();
  for (const r of ledgerRows) {
    const key = r.termId ?? NO_TERM;
    const t = String(r.transactionType ?? '').trim().toUpperCase();
    const slot = byTermType.get(key) || new Map<string, number>();
    slot.set(t, (slot.get(t) || 0) + toNum(r.amount));
    byTermType.set(key, slot);
  }

  const termCodeById = new Map(fin.terms.map((t) => [t.id, t.termCode]));
  const rows = fin.transcript.map((s) => {
    const byType = byTermType.get(s.termId) || new Map<string, number>();
    const get = (t: string) => byType.get(t) || 0;
    return {
      termId: s.termId,
      termCode: termCodeById.get(s.termId) ?? '',
      termTitle: s.termTitle,
      // تفکیک سما (نمایشی — از ردیف‌های خام همان ترم تحصیلی)
      tuitionFixed: get('TUITION_FIXED'),
      tuitionVariable: get('TUITION_VARIABLE'),
      discountFixed: get('DISCOUNT_FIXED'),
      discountVariable: get('DISCOUNT_VARIABLE'),
      subjectAdditive: get('SUBJECT_ADDITIVE'),
      subjectDeductive: get('SUBJECT_DEDUCTIVE'),
      sponsorship: get('SPONSORSHIP'),
      payments: get('PAYMENT'),
      posPayments: get('POS_PAYMENT'),
      loans: get('LOAN'),
      // اعداد کانونی (برابر با getStudentFinance — مثبت = بدهی)
      charges: s.charges,
      discounts: s.discounts,
      sponsorships: s.sponsorships,
      canonicalPayments: s.payments,
      chequesCleared: s.chequesCleared,
      chequesPending: s.chequesPending,
      chequesBounced: s.chequesBounced,
      canonicalLoans: s.loans,
      netPayable: s.netPayable,
      balance: s.balance,
    };
  });

  return Response.json({
    rows,
    totals: fin.totals,
    balance,
    student: { name: fin.student.fullName, code: fin.student.studentCode },
  });
}
