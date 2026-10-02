import 'server-only';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms, degree_level_configs, loan_products, majors, payment_cheques,
  student_discounts, student_ledger, student_loans, student_sponsorships, students,
  tuition_discount_types, tuition_sponsors, users,
} from '@/db/schema';
import {
  buildTranscript, computeTermAdjustments, toNum, transcriptTotals,
  type ChequeRow, type LoanRow, type TermCharge, type TermStatement,
} from '../finance-rules';

// ══════════════════════════════════════════════════════════════════════
//  تخفیف، بنیاد، چک و وام یک دانشجو
// ══════════════════════════════════════════════════════════════════════

export interface StudentFinanceDetail {
  student: {
    studentId: number;
    userId: number;
    studentCode: string | null;
    fullName: string;
    nationalCode: string | null;
    majorTitle: string | null;
    degreeTitle: string | null;
    entryYear: number | null;
    status: string | null;
  };
  terms: { id: number; termCode: string; termTitle: string; isCurrent: number | null }[];
  discounts: (typeof student_discounts.$inferSelect & { typeTitle: string | null; typeCode: string | null })[];
  sponsorships: (typeof student_sponsorships.$inferSelect & { sponsorTitle: string | null })[];
  cheques: (typeof payment_cheques.$inferSelect)[];
  loans: (typeof student_loans.$inferSelect & { productTitle: string | null })[];
  discountTypes: (typeof tuition_discount_types.$inferSelect)[];
  sponsors: (typeof tuition_sponsors.$inferSelect)[];
  loanProducts: (typeof loan_products.$inferSelect)[];
  transcript: TermStatement[];
  totals: ReturnType<typeof transcriptTotals>;
}

/** همهٔ اقلام مالی یک دانشجو + کارنامهٔ ترم‌به‌ترم */
export async function getStudentFinance(studentId: number): Promise<StudentFinanceDetail | null> {
  const [studentRow] = await db.select({
    studentId: students.id,
    userId: students.userId,
    studentCode: students.studentCode,
    firstName: users.firstName,
    lastName: users.lastName,
    nationalCode: users.nationalCode,
    majorTitle: majors.name,
    degreeTitle: degree_level_configs.title,
    entryYear: students.entryYear,
    status: students.status,
  }).from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(majors, eq(majors.id, students.majorId))
    .leftJoin(degree_level_configs, eq(degree_level_configs.id, students.degreeLevelId))
    .where(eq(students.id, studentId))
    .limit(1);

  if (!studentRow) return null;

  const [terms, ledger, discounts, sponsorships, cheques, loans, discountTypes, sponsors, loanProductRows] =
    await Promise.all([
      db.select({
        id: academic_terms.id,
        termCode: academic_terms.termCode,
        termTitle: academic_terms.title,
        isCurrent: academic_terms.isCurrent,
      }).from(academic_terms).orderBy(desc(academic_terms.id)),

      db.select().from(student_ledger)
        .where(eq(student_ledger.studentId, studentId))
        .orderBy(asc(student_ledger.createdAt)),

      db.select({
        row: student_discounts,
        typeTitle: tuition_discount_types.title,
        typeCode: tuition_discount_types.code,
      }).from(student_discounts)
        .leftJoin(tuition_discount_types, eq(tuition_discount_types.id, student_discounts.discountTypeId))
        .where(eq(student_discounts.studentId, studentId))
        .orderBy(desc(student_discounts.id)),

      db.select({
        row: student_sponsorships,
        sponsorTitle: tuition_sponsors.title,
      }).from(student_sponsorships)
        .leftJoin(tuition_sponsors, eq(tuition_sponsors.id, student_sponsorships.sponsorId))
        .where(eq(student_sponsorships.studentId, studentId))
        .orderBy(desc(student_sponsorships.id)),

      db.select().from(payment_cheques)
        .where(eq(payment_cheques.studentId, studentId))
        .orderBy(desc(payment_cheques.dueDate)),

      db.select({
        row: student_loans,
        productTitle: loan_products.title,
      }).from(student_loans)
        .leftJoin(loan_products, eq(loan_products.id, student_loans.loanProductId))
        .where(eq(student_loans.studentId, studentId))
        .orderBy(desc(student_loans.id)),

      db.select().from(tuition_discount_types)
        .where(eq(tuition_discount_types.isActive, 1))
        .orderBy(asc(tuition_discount_types.title)),

      db.select().from(tuition_sponsors)
        .where(eq(tuition_sponsors.isActive, 1))
        .orderBy(asc(tuition_sponsors.title)),

      db.select().from(loan_products)
        .where(eq(loan_products.isActive, 1))
        .orderBy(asc(loan_products.title)),
    ]);

  const termTitles: Record<string, string> = {};
  for (const t of terms) termTitles[String(t.id)] = t.termTitle || t.termCode;

  // تخفیف‌ها و پوشش بنیادها از computeTermAdjustments می‌آیند — همان تابعی
  // که کارتابل هم صدایش می‌زند. دو پیاده‌سازی جدا یعنی دو عدد متفاوت برای
  // یک دانشجو؛ این اشتراک، سازگاری را ساختاری تضمین می‌کند.
  const NO_TERM = 0;

  const ledgerByTerm = new Map<number, typeof ledger>();
  for (const txn of ledger) {
    const key = txn.termId ?? NO_TERM;
    const arr = ledgerByTerm.get(key) || [];
    arr.push(txn);
    ledgerByTerm.set(key, arr);
  }

  const termCharges: TermCharge[] = [];
  for (const [termId, termLedger] of ledgerByTerm.entries()) {
    const charges = termLedger
      .filter((t) => ['CHARGE', 'TUITION_CHARGE'].includes(String(t.transactionType).toUpperCase()))
      .reduce((a, t) => a + toNum(t.amount), 0);
    termCharges.push({ termId, charges });
  }

  const adjustments = computeTermAdjustments({
    termCharges,
    discounts: discounts
      .filter((d) => d.row.status === 'APPROVED')
      .map((d) => ({
        id: d.row.id, termId: d.row.termId, kind: d.row.kind,
        percent: d.row.percent, amount: d.row.amount, title: d.typeTitle,
      })),
    sponsorships: sponsorships
      .filter((sp) => ['CONFIRMED', 'PAID'].includes(sp.row.status))
      .map((sp) => ({
        id: sp.row.id, termId: sp.row.termId, coverageKind: sp.row.coverageKind,
        percent: Math.max(toNum(sp.row.fixedPercent), toNum(sp.row.variablePercent)),
        amount: sp.row.amount, title: sp.sponsorTitle,
      })),
  });

  const discountApplied = adjustments.flatMap((a) =>
    a.discountLines.map((l) => ({ ...l, termId: a.termId })));
  const sponsorApplied = adjustments.flatMap((a) =>
    a.sponsorLines.map((l) => ({ ...l, termId: a.termId })));

  const transcript = buildTranscript({
    ledger: ledger.map((t) => ({
      id: t.id,
      termId: t.termId,
      transactionType: t.transactionType,
      amount: t.amount,
      description: t.description,
      createdAt: t.createdAt,
    })),
    discounts: discountApplied,
    sponsorships: sponsorApplied,
    cheques: cheques as ChequeRow[],
    loans: loans.map((l) => l.row) as LoanRow[],
    termTitles,
  });

  return {
    student: {
      studentId: studentRow.studentId,
      userId: studentRow.userId,
      studentCode: studentRow.studentCode,
      fullName: `${studentRow.firstName || ''} ${studentRow.lastName || ''}`.trim(),
      nationalCode: studentRow.nationalCode,
      majorTitle: studentRow.majorTitle,
      degreeTitle: studentRow.degreeTitle,
      entryYear: studentRow.entryYear,
      status: studentRow.status,
    },
    terms,
    discounts: discounts.map((d) => ({ ...d.row, typeTitle: d.typeTitle, typeCode: d.typeCode })),
    sponsorships: sponsorships.map((s) => ({ ...s.row, sponsorTitle: s.sponsorTitle })),
    cheques,
    loans: loans.map((l) => ({ ...l.row, productTitle: l.productTitle })),
    discountTypes,
    sponsors,
    loanProducts: loanProductRows,
    transcript,
    totals: transcriptTotals(transcript),
  };
}
