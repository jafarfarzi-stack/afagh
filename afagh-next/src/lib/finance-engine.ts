import 'server-only';
import { and, asc, desc, eq, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms, course_offerings, courses, enrollments, majors,
  degree_level_configs, payment_cheques, student_discounts, student_ledger,
  student_loans, student_sponsorships, students, tuition_discount_types,
  tuition_formulas, tuition_sponsors, users,
} from '@/db/schema';
import { computeTermTuition } from './tuition-engine';
import { getSetting } from './settings';
import { notifyUserMultichannel } from './messaging';
import {
  applyDiscounts, applySponsorships, bucketCourseUnits, buildTranscript,
  buildChequeReminderText, chequeNeedsReminder,
  toNum, totalBuckets, transcriptTotals, tuitionFromFormula, pickFormula,
  type AppliedAmount, type ChequeRow, type LoanRow, type TermStatement,
} from './finance-rules';

// ══════════════════════════════════════════════════════════════════════
//  موتور مالی دانشجویان — لایهٔ دسترسی به دیتابیس
//
//  منطق محاسبه در finance-rules.ts است (خالص و آزموده). اینجا فقط
//  خواندن/نوشتن دیتابیس و اتصال آن به همان منطق انجام می‌شود.
// ══════════════════════════════════════════════════════════════════════

/** وضعیت‌هایی که یک دانشجو را «فعال» می‌شمارند */
const ACTIVE_STUDENT_STATUSES = ['ACTIVE', 'ENROLLED', 'STUDYING'] as const;

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
  payments: number;
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
}

/**
 * فهرست دانشجویان برای کارتابل کارشناس مالی.
 *
 * مانده از دفتر مالی جمع زده می‌شود: بدهی − پرداخت. چک وصول‌نشده
 * «پرداخت» شمرده نمی‌شود، ولی در ستون جداگانه نشان داده می‌شود تا
 * کارشناس بداند چه مبلغی در راه است.
 */
export async function listFinanceStudents(
  filters: FinanceListFilters = {}
): Promise<FinanceStudentRow[]> {
  const where: unknown[] = [];
  if (filters.majorId) where.push(eq(students.majorId, filters.majorId));
  if (filters.degreeLevelId) where.push(eq(students.degreeLevelId, filters.degreeLevelId));
  if (filters.entryYear) where.push(eq(students.entryYear, filters.entryYear));

  if (filters.search && filters.search.trim()) {
    const needle = `%${filters.search.trim()}%`;
    where.push(or(
      sql`${users.firstName} ILIKE ${needle}`,
      sql`${users.lastName} ILIKE ${needle}`,
      sql`${users.nationalCode} ILIKE ${needle}`,
      sql`${students.studentCode} ILIKE ${needle}`
    ));
  }

  const whereSql = where.length ? sql`WHERE ${sql.join(where as never[], sql` AND `)}` : sql``;

  const limit = Math.min(Math.max(filters.limit ?? 500, 1), 2000);

  const rows = await db.execute(sql`
    SELECT
      s."id"            AS "studentId",
      s."userId"        AS "userId",
      s."studentCode"   AS "studentCode",
      u."firstName"     AS "firstName",
      u."lastName"      AS "lastName",
      u."nationalCode"  AS "nationalCode",
      m."name"          AS "majorTitle",
      d."title"         AS "degreeTitle",
      s."entryYear"     AS "entryYear",
      s."status"        AS "status",
      COALESCE(ch.total, 0) AS charges,
      COALESCE(pa.total, 0) AS payments,
      COALESCE(ch.total, 0) - COALESCE(pa.total, 0) AS balance,
      COALESCE(pc.pending, 0) AS "pendingCheques"
    FROM students s
    JOIN users u ON u."id" = s."userId"
    LEFT JOIN majors m ON m."id" = s."majorId"
    LEFT JOIN degree_level_configs d ON d."id" = s."degreeLevelId"
    LEFT JOIN (
      SELECT "studentId", SUM("amount") AS total
      FROM student_ledger
      WHERE "transactionType" IN ('CHARGE','TUITION_CHARGE')
      GROUP BY "studentId"
    ) ch ON ch."studentId" = s."id"
    LEFT JOIN (
      SELECT "studentId", SUM("amount") AS total
      FROM student_ledger
      WHERE "transactionType" IN ('PAYMENT','CREDIT')
      GROUP BY "studentId"
    ) pa ON pa."studentId" = s."id"
    LEFT JOIN (
      SELECT "studentId", SUM("amount") AS pending
      FROM payment_cheques
      WHERE "status" = 'PENDING'
      GROUP BY "studentId"
    ) pc ON pc."studentId" = s."id"
    ${whereSql}
    ORDER BY (COALESCE(ch.total,0) - COALESCE(pa.total,0)) DESC, s."studentCode" ASC
    LIMIT ${limit}
  `);

  const list = (rows as unknown as { rows: FinanceStudentRow[] }).rows.map((r) => ({
    ...r,
    charges: toNum(r.charges),
    payments: toNum(r.payments),
    balance: toNum(r.balance),
    pendingCheques: toNum(r.pendingCheques),
  }));

  return filters.onlyDebtors ? list.filter((r) => r.balance > 0) : list;
}

/** گزینه‌های فیلتر کارتابل — رشته، مقطع و ورودی‌های موجود در دیتابیس */
export async function listFinanceFilterOptions(): Promise<{
  majors: { id: number; title: string }[];
  degrees: { id: number; title: string }[];
  entryYears: number[];
}> {
  const [majorRows, degreeRows, yearRows] = await Promise.all([
    db.select({ id: majors.id, title: majors.name }).from(majors).orderBy(asc(majors.name)),
    db.select({ id: degree_level_configs.id, title: degree_level_configs.title })
      .from(degree_level_configs).orderBy(asc(degree_level_configs.title)),
    db.selectDistinct({ entryYear: students.entryYear }).from(students),
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
  loans: (typeof student_loans.$inferSelect)[];
  discountTypes: (typeof tuition_discount_types.$inferSelect)[];
  sponsors: (typeof tuition_sponsors.$inferSelect)[];
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

  const [terms, ledger, discounts, sponsorships, cheques, loans, discountTypes, sponsors] =
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

      db.select().from(student_loans)
        .where(eq(student_loans.studentId, studentId))
        .orderBy(desc(student_loans.id)),

      db.select().from(tuition_discount_types)
        .where(eq(tuition_discount_types.isActive, 1))
        .orderBy(asc(tuition_discount_types.title)),

      db.select().from(tuition_sponsors)
        .where(eq(tuition_sponsors.isActive, 1))
        .orderBy(asc(tuition_sponsors.title)),
    ]);

  const termTitles: Record<string, string> = {};
  for (const t of terms) termTitles[String(t.id)] = t.termTitle || t.termCode;

  // تخفیف‌ها و پوشش بنیادها ترم‌به‌ترم روی شهریهٔ همان ترم اعمال می‌شوند.
  // تخفیف با termId تهی روی همهٔ ترم‌ها اثر دارد.
  const NO_TERM = 0;
  const discountApplied: (AppliedAmount & { termId: number })[] = [];
  const sponsorApplied: (AppliedAmount & { termId: number })[] = [];

  const ledgerByTerm = new Map<number, typeof ledger>();
  for (const txn of ledger) {
    const key = txn.termId ?? NO_TERM;
    const arr = ledgerByTerm.get(key) || [];
    arr.push(txn);
    ledgerByTerm.set(key, arr);
  }

  const termIdsForStudent = new Set<number>(ledgerByTerm.keys());
  for (const c of cheques) termIdsForStudent.add(c.termId ?? NO_TERM);
  for (const l of loans) termIdsForStudent.add(l.termId ?? NO_TERM);

  for (const termId of termIdsForStudent) {
    const termLedger = ledgerByTerm.get(termId) || [];
    const charges = termLedger
      .filter((t) => ['CHARGE', 'TUITION_CHARGE'].includes(String(t.transactionType).toUpperCase()))
      .reduce((a, t) => a + toNum(t.amount), 0);

    if (charges <= 0 && termId === NO_TERM) continue;

    const activeDiscounts = discounts.filter((d) =>
      d.row.status === 'APPROVED' && (d.row.termId === null || d.row.termId === termId));
    const activeSponsors = sponsorships.filter((s) =>
      ['CONFIRMED', 'PAID'].includes(s.row.status) && (s.row.termId === null || s.row.termId === termId));

    const disc = applyDiscounts(
      activeDiscounts.map((d) => ({
        id: d.row.id,
        kind: d.row.kind,
        percent: d.row.percent,
        amount: d.row.amount,
        appliesTo: d.row.appliesTo,
        title: d.typeTitle,
      })),
      charges, 0
    );
    for (const a of disc.applied) discountApplied.push({ ...a, termId });

    const spon = applySponsorships(
      activeSponsors.map((s) => ({
        id: s.row.id,
        coverageKind: s.row.coverageKind,
        percent: s.row.percent,
        amount: s.row.amount,
        title: s.sponsorTitle,
      })),
      disc.net
    );
    for (const a of spon.applied) sponsorApplied.push({ ...a, termId });
  }

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
    loans: loans as LoanRow[],
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
    loans,
    discountTypes,
    sponsors,
    transcript,
    totals: transcriptTotals(transcript),
  };
}

// ══════════════════════════════════════════════════════════════════════
//  فرمول تخصیص
// ══════════════════════════════════════════════════════════════════════

export interface FormulaTuition {
  formula: (typeof tuition_formulas.$inferSelect) | null;
  buckets: { theory: number; practical: number; general: number };
  fixed: number;
  variable: number;
  total: number;
}

/**
 * محاسبهٔ شهریهٔ یک ترم از فرمول تخصیص.
 *
 * اگر هیچ فرمولی با مقطع/رشته/ورودی دانشجو نخواند، null برمی‌گردد —
 * کارشناس مالی باید فرمول بسازد، نه اینکه سامانه عددی از خود بسازد.
 */
export async function computeFormulaTuition(
  studentId: number,
  termId: number
): Promise<FormulaTuition> {
  const [student] = await db.select({
    degreeLevelId: students.degreeLevelId,
    majorId: students.majorId,
    entryYear: students.entryYear,
  }).from(students).where(eq(students.id, studentId)).limit(1);

  const empty: FormulaTuition = {
    formula: null,
    buckets: { theory: 0, practical: 0, general: 0 },
    fixed: 0, variable: 0, total: 0,
  };
  if (!student) return empty;

  const formulas = await db.select().from(tuition_formulas)
    .where(eq(tuition_formulas.isActive, 1));

  const formula = pickFormula(formulas, {
    degreeLevelId: student.degreeLevelId,
    majorId: student.majorId,
    entryYear: student.entryYear,
  });
  if (!formula) return empty;

  const offerings = await db.select({
    units: courses.units,
    theoreticalUnits: courses.theoreticalUnits,
    practicalUnits: courses.practicalUnits,
    courseType: courses.courseType,
  }).from(enrollments)
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(and(eq(enrollments.studentId, studentId), eq(course_offerings.termId, termId)));

  const buckets = totalBuckets(offerings.map((o) => bucketCourseUnits(o)));
  const { fixed, variable, total } = tuitionFromFormula(formula, buckets);

  return { formula, buckets, fixed, variable, total };
}

export async function listFormulas() {
  return db.select().from(tuition_formulas).orderBy(asc(tuition_formulas.priority), asc(tuition_formulas.id));
}

// ══════════════════════════════════════════════════════════════════════
//  ثبت پرداخت و وصول چک در دفتر مالی
// ══════════════════════════════════════════════════════════════════════

/** ثبت یک پرداخت قطعی در دفتر مالی */
export async function recordPayment(input: {
  studentId: number;
  termId: number | null;
  amount: number;
  description?: string;
}): Promise<number> {
  const amount = Math.round(toNum(input.amount));
  if (amount <= 0) throw new Error('مبلغ پرداخت باید بزرگ‌تر از صفر باشد');

  const [ins] = await db.insert(student_ledger).values({
    studentId: input.studentId,
    termId: input.termId,
    transactionType: 'PAYMENT',
    amount: String(amount),
    description: input.description || 'پرداخت شهریه',
  }).returning({ id: student_ledger.id });

  return ins.id;
}

/**
 * وصول چک — مبلغ را در دفتر مالی ثبت و وضعیت چک را CLEARED می‌کند.
 *
 * اگر چک پیش‌تر وصول شده باشد کاری نمی‌کند؛ وگرنه هر بار اجرا یک پرداخت
 * تکراری در دفتر مالی می‌ساخت.
 */
export async function clearCheque(chequeId: number): Promise<{ ok: boolean; reason?: string }> {
  const [cheque] = await db.select().from(payment_cheques).where(eq(payment_cheques.id, chequeId)).limit(1);
  if (!cheque) return { ok: false, reason: 'چک یافت نشد' };
  if (cheque.status === 'CLEARED') return { ok: false, reason: 'این چک پیش‌تر وصول شده است' };
  if (cheque.status === 'CANCELLED') return { ok: false, reason: 'چک باطل‌شده قابل وصول نیست' };

  const [ins] = await db.insert(student_ledger).values({
    studentId: cheque.studentId,
    termId: cheque.termId,
    transactionType: 'PAYMENT',
    amount: cheque.amount,
    description: `وصول چک ${cheque.chequeNo || ''}`.trim(),
  }).returning({ id: student_ledger.id });

  await db.update(payment_cheques)
    .set({ status: 'CLEARED', clearedAt: new Date(), ledgerTxnId: ins.id })
    .where(eq(payment_cheques.id, chequeId));

  return { ok: true };
}

/** وضعیت دانشجو را برای کارتابل برمی‌گرداند (فعال/غیرفعال) */
export function isActiveStudent(status: string | null): boolean {
  return ACTIVE_STUDENT_STATUSES.includes(String(status || '').toUpperCase() as typeof ACTIVE_STUDENT_STATUSES[number]);
}

// ══════════════════════════════════════════════════════════════════════
//  پویش یادآوری چک پیش از سررسید
// ══════════════════════════════════════════════════════════════════════

export interface ChequeScanResult {
  scanned: number;
  reminded: number;
  failed: number;
  skipped: number;
  dryRun: boolean;
  items: { chequeId: number; studentId: number; daysLeft: number | null; overdue: boolean; sent: boolean }[];
}

/**
 * پویش چک‌های در انتظار وصول و ارسال پیام یادآوری به دانشجو.
 *
 * افق یادآوری از تنظیم CHEQUE_REMIND_DAYS می‌آید، نه از کد. اگر
 * CHEQUE_REMIND_ENABLED صفر باشد یا dryRun داده شود، فهرست آماده می‌شود
 * ولی پیامی فرستاده نمی‌شود — تا کارشناس مالی بتواند پیش از فعال‌سازی
 * خروجی را ببیند.
 *
 * هر چک تنها یک بار یادآوری می‌شود (remindedAt ثبت می‌شود)؛ وگرنه هر
 * اجرای پویش یک پیام تکراری به دانشجو می‌فرستاد.
 */
export async function runChequeReminderScan(opts: { dryRun?: boolean } = {}): Promise<ChequeScanResult> {
  const remindDaysRaw = await getSetting('CHEQUE_REMIND_DAYS');
  const enabledRaw = await getSetting('CHEQUE_REMIND_ENABLED');
  const remindDays = Math.max(0, Math.round(toNum(remindDaysRaw) || 0));
  const enabled = String(enabledRaw || '1').trim() !== '0';
  const dryRun = !!opts.dryRun || !enabled;

  const pending = await db.select({
    id: payment_cheques.id,
    studentId: payment_cheques.studentId,
    userId: students.userId,
    chequeNo: payment_cheques.chequeNo,
    bankName: payment_cheques.bankName,
    amount: payment_cheques.amount,
    dueDate: payment_cheques.dueDate,
    status: payment_cheques.status,
    remindedAt: payment_cheques.remindedAt,
  }).from(payment_cheques)
    .innerJoin(students, eq(students.id, payment_cheques.studentId))
    .where(eq(payment_cheques.status, 'PENDING'));

  const nowMs = Date.now();
  const result: ChequeScanResult = {
    scanned: pending.length, reminded: 0, failed: 0, skipped: 0, dryRun, items: [],
  };

  for (const c of pending) {
    const decision = chequeNeedsReminder(c, nowMs, remindDays);
    if (!decision.remind) { result.skipped++; continue; }

    let sent = false;
    if (!dryRun && c.userId) {
      const text = buildChequeReminderText(
        { chequeNo: c.chequeNo, amount: c.amount, dueDate: c.dueDate, bankName: c.bankName },
        decision.daysLeft,
        decision.overdue
      );
      try {
        await notifyUserMultichannel({ userId: c.userId, eventCode: 'FINANCE_CHEQUE_DUE', text });
        await db.update(payment_cheques)
          .set({ remindedAt: new Date() })
          .where(eq(payment_cheques.id, c.id));
        sent = true;
        result.reminded++;
      } catch {
        result.failed++;
      }
    } else {
      result.skipped++;
    }

    result.items.push({
      chequeId: c.id,
      studentId: c.studentId,
      daysLeft: decision.daysLeft,
      overdue: decision.overdue,
      sent,
    });
  }

  return result;
}

export { computeTermTuition };
