'use server';

import { db } from '@/db';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { student_ledger, students, users, financial_terms, academic_terms, financial_clearances } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { toNum } from '@/lib/finance-rules';

const ROLES: string[] = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE', 'CASHIER'];

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

  // Get all financial terms for this university
  const finTerms = await db.select().from(financial_terms)
    .where(and(eq(financial_terms.universityId, uni.id), eq(financial_terms.isActive, 1)))
    .orderBy(financial_terms.sortOrder);

  const termIds = finTerms.map(t => t.id);
  if (termIds.length === 0) return Response.json({ rows: [] });

  // Get all ledger entries for this student across all financial terms
  const ledgerRows = await db.select().from(student_ledger)
    .where(and(
      eq(student_ledger.studentId, studentId),
      inArray(student_ledger.financialTermId, termIds)
    ));

  // Get student info
  const [user] = await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, stu.userId)).limit(1);

  // Aggregate by financial term
  const agg = new Map<number, {
    tuitionFixed: number;
    tuitionVariable: number;
    discountFixed: number;
    discountVariable: number;
    subjectAdditive: number;
    subjectDeductive: number;
    sponsorship: number;
    payments: number;
    posPayments: number;
    loans: number;
  }>();

  for (const row of ledgerRows) {
    const termId = row.financialTermId!;
    const type = row.transactionType as string;
    const amount = toNum(row.amount);
    if (!agg.has(termId)) {
      agg.set(termId, { tuitionFixed: 0, tuitionVariable: 0, discountFixed: 0, discountVariable: 0, subjectAdditive: 0, subjectDeductive: 0, sponsorship: 0, payments: 0, posPayments: 0, loans: 0 });
    }
    const a = agg.get(termId)!;
    switch (type) {
      case 'TUITION_FIXED': a.tuitionFixed += amount; break;
      case 'TUITION_VARIABLE': a.tuitionVariable += amount; break;
      case 'DISCOUNT_FIXED': a.discountFixed += amount; break;
      case 'DISCOUNT_VARIABLE': a.discountVariable += amount; break;
      case 'SUBJECT_ADDITIVE': a.subjectAdditive += amount; break;
      case 'SUBJECT_DEDUCTIVE': a.subjectDeductive += amount; break;
      case 'SPONSORSHIP': a.sponsorship += amount; break;
      case 'PAYMENT': a.payments += amount; break;
      case 'POS_PAYMENT': a.posPayments += amount; break;
      case 'LOAN': a.loans += amount; break;
    }
  }

  // Build response rows
  const rows = finTerms.map(t => {
    const a = agg.get(t.id) || { tuitionFixed: 0, tuitionVariable: 0, discountFixed: 0, discountVariable: 0, subjectAdditive: 0, subjectDeductive: 0, sponsorship: 0, payments: 0, posPayments: 0, loans: 0 };
    const balance = a.tuitionFixed + a.tuitionVariable + a.subjectAdditive
      - a.discountFixed - a.discountVariable - a.subjectDeductive - a.sponsorship
      - a.payments - a.posPayments - a.loans;
    return {
      termId: t.id,
      termCode: t.termCode,
      termTitle: t.title,
      tuitionFixed: a.tuitionFixed,
      tuitionVariable: a.tuitionVariable,
      discountFixed: a.discountFixed,
      discountVariable: a.discountVariable,
      subjectAdditive: a.subjectAdditive,
      subjectDeductive: a.subjectDeductive,
      sponsorship: a.sponsorship,
      payments: a.payments,
      posPayments: a.posPayments,
      loans: a.loans,
      balance,
    };
  });

  return Response.json({ rows, student: { name: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim(), code: stu.studentCode } });
}