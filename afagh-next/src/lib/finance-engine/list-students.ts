import 'server-only';
import { and, asc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import {
  degree_level_configs, majors, payment_cheques, student_discounts, student_ledger,
  student_sponsorships, student_loans, students, users,
} from '@/db/schema';
import { computeTermAdjustments, toNum, type TermCharge } from '../finance-rules';
import { toEnDigits } from '@/lib/persian-search';

export interface FinanceStudentRow {
  studentId: number;
  userId: number;
  studentCode: string | null;
  firstName: string | null;
  lastName: string | null;
  nationalCode: string | null;
  majorTitle: string | null;
  degreeTitle: string | null;
  entryYear: number | null;
  status: string | null;
  charges: number;
  discounts: number;
  sponsorships: number;
  payments: number;
  chequesCleared: number;
  loans: number;
  balance: number;
  pendingCheques: number;
}

export interface FinanceListFilters {
  majorId?: number | null;
  degreeLevelId?: number | null;
  entryYear?: number | null;
  search?: string | null;
  /** فقط دانشجویان بدهکار */
  onlyDebtors?: boolean;
  limit?: number;
  universityId?: number | null;
}

/**
 * فهرست دانشجویان برای کارتابل کارشناس مالی.
 *
 * مانده از دفتر مالی جمع زده می‌شود: بدهی − پرداخت. چک وصول‌نشده
 * «پرداخت» شمرده نمی‌شود، ولی در ستون جداگانه نشان داده می‌شود تا
 * کارشناس بداند چه مبلغی در راه است.
 */
export async function listFinanceStudents(
  filters: FinanceListFilters = {}, universityId?: number
): Promise<FinanceStudentRow[]> {
  const where: SQL[] = [];
  if (filters.majorId) where.push(eq(students.majorId, filters.majorId));
  if (filters.degreeLevelId) where.push(eq(students.degreeLevelId, filters.degreeLevelId));
  if (filters.entryYear) where.push(eq(students.entryYear, filters.entryYear));
  const effectiveUniversityId = universityId ?? filters.universityId;
  if (effectiveUniversityId) where.push(eq(students.universityId, effectiveUniversityId));

  if (filters.search && filters.search.trim()) {
    // کدهای ذخیره‌شده انگلیسی‌اند؛ ارقام فارسی ورودی نرمال می‌شود تا کدهای SA/SS هم پیدا شوند.
    const needle = `%${toEnDigits(filters.search.trim())}%`;
    const searchCond = or(
      sql`${users.firstName} ILIKE ${needle}`,
      sql`${users.lastName} ILIKE ${needle}`,
      sql`${users.nationalCode} ILIKE ${needle}`,
      sql`${students.studentCode} ILIKE ${needle}`
    );
    if (searchCond) where.push(searchCond);
  }

  const limit = Math.min(Math.max(filters.limit ?? 500, 1), 2000);

  const base = await db.select({
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
    .where(where.length ? and(...where) : undefined)
    .orderBy(asc(students.studentCode))
    .limit(limit);

  if (base.length === 0) return [];
  const ids = base.map((r) => r.studentId);

  // شش کوئری تجمیعی به‌جای حلقه به ازای هر دانشجو — هزینه مستقل از تعداد
  // دانشجویان است. مانده از همان computeTermAdjustments می‌آید که کارنامه
  // استفاده می‌کند، پس عدد کارتابل و کارنامه نمی‌تواند واگرا شود.
  const [ledgerAgg, discountRows, sponsorRows, chequeAgg, loanAgg] = await Promise.all([
    db.select({
      studentId: student_ledger.studentId,
      termId: student_ledger.termId,
      transactionType: student_ledger.transactionType,
      total: sql<number>`SUM(${student_ledger.amount})`,
    }).from(student_ledger)
      .where(inArray(student_ledger.studentId, ids))
      .groupBy(student_ledger.studentId, student_ledger.termId, student_ledger.transactionType),

    db.select({
      id: student_discounts.id,
      studentId: student_discounts.studentId,
      termId: student_discounts.termId,
      kind: student_discounts.kind,
      percent: student_discounts.percent,
      amount: student_discounts.amount,
    }).from(student_discounts)
      .where(and(inArray(student_discounts.studentId, ids), eq(student_discounts.status, 'APPROVED'))),

    db.select({
      id: student_sponsorships.id,
      studentId: student_sponsorships.studentId,
      termId: student_sponsorships.termId,
      coverageKind: student_sponsorships.coverageKind,
      percent: sql<string>`GREATEST(${student_sponsorships.fixedPercent}, ${student_sponsorships.variablePercent})`,
      amount: student_sponsorships.amount,
    }).from(student_sponsorships)
      .where(and(
        inArray(student_sponsorships.studentId, ids),
        inArray(student_sponsorships.status, ['CONFIRMED', 'PAID'])
      )),

    db.select({
      studentId: payment_cheques.studentId,
      status: payment_cheques.status,
      total: sql<number>`SUM(${payment_cheques.amount})`,
    }).from(payment_cheques)
      .where(inArray(payment_cheques.studentId, ids))
      .groupBy(payment_cheques.studentId, payment_cheques.status),

    db.select({
      studentId: student_loans.studentId,
      status: student_loans.status,
      total: sql<number>`SUM(${student_loans.amount})`,
    }).from(student_loans)
      .where(inArray(student_loans.studentId, ids))
      .groupBy(student_loans.studentId, student_loans.status),
  ]);

  const NO_TERM = 0;

  const termChargesByStudent = new Map<number, TermCharge[]>();
  const paymentsByStudent = new Map<number, number>();
  for (const r of ledgerAgg) {
    const type = String(r.transactionType).toUpperCase();
    const amount = toNum(r.total);
    if (type === 'CHARGE' || type === 'TUITION_CHARGE') {
      const arr = termChargesByStudent.get(r.studentId) || [];
      arr.push({ termId: r.termId ?? NO_TERM, charges: amount });
      termChargesByStudent.set(r.studentId, arr);
    } else if (type === 'PAYMENT' || type === 'CREDIT') {
      paymentsByStudent.set(r.studentId, (paymentsByStudent.get(r.studentId) || 0) + amount);
    }
  }

  const discountsByStudent = new Map<number, typeof discountRows>();
  for (const d of discountRows) {
    const arr = discountsByStudent.get(d.studentId) || [];
    arr.push(d);
    discountsByStudent.set(d.studentId, arr);
  }

  const sponsorsByStudent = new Map<number, typeof sponsorRows>();
  for (const sp of sponsorRows) {
    const arr = sponsorsByStudent.get(sp.studentId) || [];
    arr.push(sp);
    sponsorsByStudent.set(sp.studentId, arr);
  }

  const chequesByStudent = new Map<number, { cleared: number; pending: number }>();
  for (const c of chequeAgg) {
    const slot = chequesByStudent.get(c.studentId) || { cleared: 0, pending: 0 };
    const amount = toNum(c.total);
    const status = String(c.status).toUpperCase();
    if (status === 'CLEARED') slot.cleared += amount;
    else if (status === 'PENDING') slot.pending += amount;
    chequesByStudent.set(c.studentId, slot);
  }

  const loansByStudent = new Map<number, number>();
  for (const l of loanAgg) {
    const status = String(l.status).toUpperCase();
    if (status !== 'ACTIVE' && status !== 'SETTLED') continue;
    loansByStudent.set(l.studentId, (loansByStudent.get(l.studentId) || 0) + toNum(l.total));
  }

  const list = base.map((r) => {
    const adjustments = computeTermAdjustments({
      termCharges: termChargesByStudent.get(r.studentId) || [],
      discounts: discountsByStudent.get(r.studentId) || [],
      sponsorships: sponsorsByStudent.get(r.studentId) || [],
    });

    const charges = adjustments.reduce((a, t) => a + t.charges, 0);
    const discounts = adjustments.reduce((a, t) => a + t.discounts, 0);
    const sponsorships = adjustments.reduce((a, t) => a + t.sponsorships, 0);
    const payments = paymentsByStudent.get(r.studentId) || 0;
    const cheques = chequesByStudent.get(r.studentId) || { cleared: 0, pending: 0 };
    const loans = loansByStudent.get(r.studentId) || 0;

    return {
      studentId: r.studentId,
      userId: r.userId,
      studentCode: r.studentCode,
      firstName: r.firstName,
      lastName: r.lastName,
      nationalCode: r.nationalCode,
      majorTitle: r.majorTitle,
      degreeTitle: r.degreeTitle,
      entryYear: r.entryYear,
      status: r.status,
      charges,
      discounts,
      sponsorships,
      payments,
      chequesCleared: cheques.cleared,
      loans,
      balance: charges - discounts - sponsorships - payments - cheques.cleared - loans,
      pendingCheques: cheques.pending,
    };
  });

  list.sort((a, b) => b.balance - a.balance || String(a.studentCode).localeCompare(String(b.studentCode)));

  return filters.onlyDebtors ? list.filter((r) => r.balance > 0) : list;
}

/** گزینه‌های فیلتر کارتابل — رشته، مقطع و ورودی‌های موجود در دیتابیس */
export async function listFinanceFilterOptions({ universityId }: { universityId?: number } = {}): Promise<{
  majors: { id: number; title: string }[];
  degrees: { id: number; title: string }[];
  entryYears: number[];
}> {
  const [majorRows, degreeRows, yearRows] = await Promise.all([
    db.select({ id: majors.id, title: majors.name }).from(majors).orderBy(asc(majors.name)),
    db.select({ id: degree_level_configs.id, title: degree_level_configs.title })
      .from(degree_level_configs).orderBy(asc(degree_level_configs.title)),
    db.selectDistinct({ entryYear: students.entryYear }).from(students)
      .where(universityId ? eq(students.universityId, universityId) : undefined),
  ]);

  const entryYears = yearRows
    .map((r) => r.entryYear)
    .filter((y): y is number => y !== null && y !== undefined)
    .sort((a, b) => b - a);

  return {
    majors: majorRows.map((r) => ({ id: r.id, title: r.title })),
    degrees: degreeRows.map((r) => ({ id: r.id, title: r.title })),
    entryYears,
  };
}
