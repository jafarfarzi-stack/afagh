'use server';

import { db } from '@/db';
import { eq, and, sql } from 'drizzle-orm';
import { pos_terminals, pos_transactions, students, users, financial_terms, academic_terms, student_ledger } from '@/db/schema';
import { requireRole, getSessionUser } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { safeRials } from '@/lib/money';
import { recordLedgerAction, recordReversalAction } from '@/app/admin/finance/actions/ledger';

const POS_ROLES: string[] = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE', 'CASHIER'];

export async function getPosTerminals() {
  await requireRole(POS_ROLES);
  const uni = await getCurrentUniversity();
  if (!uni) return [];

  return db.select().from(pos_terminals)
    .where(and(eq(pos_terminals.universityId, uni.id), eq(pos_terminals.isActive, 1)))
    .orderBy(pos_terminals.sortOrder);
}

export async function getPosTerminal(terminalCode: string) {
  await requireRole(POS_ROLES);
  const uni = await getCurrentUniversity();
  if (!uni) return null;

  return db.select().from(pos_terminals)
    .where(and(
      eq(pos_terminals.universityId, uni.id),
      eq(pos_terminals.code, terminalCode),
      eq(pos_terminals.isActive, 1)
    ))
    .limit(1)
    .then(r => r[0] ?? null);
}

interface PosSaleInput {
  terminalCode: string;
  studentCode: string;
  amount: number;
  stan: string;
  rrn?: string;
  entryMode: 'CHIP' | 'CONTACTLESS' | 'MAGSTRIPE' | 'FALLBACK' | 'MANUAL';
  cardPan: string;
  cardholderName?: string;
  description?: string;
  // 🔒 نوع تراکنش از کلاینت پذیرفته نمی‌شود (حفرهٔ mutation): فروش همیشه SALE
  // است؛ REFUND/VOID فقط از مسیر voidPosTransaction با پیوند به اصل.
}

/** ترجمهٔ خطای یکتایی (رقابت همزمان) به پیام فارسی تمیز */
function toPosTxError(e: unknown, fallback: string): Error {
  const code = (e as { code?: string })?.code;
  const msg = String((e as Error)?.message ?? e);
  if (code === '23505' || msg.includes('uq_pos_txn_terminal_stan') || msg.toLowerCase().includes('duplicate key')) {
    return new Error('تراکنش تکراری است؛ این STAN روی این ترمینال قبلاً ثبت شده است');
  }
  return e instanceof Error ? e : new Error(fallback);
}

export async function recordPosSale(input: PosSaleInput) {
  await requireRole(POS_ROLES);
  const uni = await getCurrentUniversity();
  if (!uni) throw new Error('دانشگاه فعال یافت نشد');

  // Get current user ID from session
  const sessionUser = await getSessionUser();
  const operatorId = sessionUser?.id ?? null;

  // اعتبارسنجی مبلغ در مرز ورودی: فقط ریال صحیح مثبت (نه NaN/منفی/اعشاری)
  const amount = safeRials(input.amount);
  if (amount === null || amount <= 0) throw new Error('مبلغ نامعتبر است؛ مبلغ باید عدد صحیح مثبت (ریال) باشد');
  const stan = String(input.stan ?? '').trim();
  if (!stan) throw new Error('STAN تراکنش الزامی است');

  // Find terminal
  const terminal = await getPosTerminal(input.terminalCode);
  if (!terminal) throw new Error('ترمینال POS یافت نشد یا غیرفعال است');

  // Find student
  const [stu] = await db.select().from(students)
    .where(and(eq(students.studentCode, input.studentCode), eq(students.universityId, uni.id)))
    .limit(1);
  if (!stu) throw new Error('دانشجو با این شماره دانشجویی یافت نشد');

  // Get current financial term
  const finTerms = await db.select().from(financial_terms)
    .where(and(eq(financial_terms.universityId, uni.id), eq(financial_terms.isActive, 1)))
    .orderBy(sql`"sortOrder" ASC NULLS LAST`);
  const financialTermId = finTerms[0]?.id ?? null;

  // Get current academic term
  const [acadTerm] = await db.select().from(academic_terms)
    .where(and(eq(academic_terms.universityId, uni.id), eq(academic_terms.isCurrent, 1)))
    .limit(1);
  const termId = acadTerm?.id ?? null;

  // درج POS + دفتر مالی + پیوند، در یک تراکنش اتمیک واحد
  try {
    return await db.transaction(async (tx) => {
      // Check for duplicate STAN on this terminal
      const [existing] = await tx.select().from(pos_transactions)
        .where(and(eq(pos_transactions.terminalId, terminal.id), eq(pos_transactions.stan, stan)))
        .limit(1);
      if (existing) throw new Error(`تراکنش با STAN ${stan} روی این ترمینال قبلاً ثبت شده`);

      // Create POS transaction
      const [posTxn] = await tx.insert(pos_transactions).values({
        universityId: uni.id,
        studentId: stu.id,
        termId,
        financialTermId,
        terminalId: terminal.id,
        stan,
        rrn: input.rrn ?? null,
        amount: String(amount),
        // 🔒 همیشه SALE — ورودی کلاینت نادیده گرفته می‌شود.
        txnType: 'SALE',
        entryMode: input.entryMode,
        status: 'APPROVED',
        responseCode: '00',
        responseMessage: 'APPROVED',
        cardPan: maskPan(input.cardPan),
        cardholderName: input.cardholderName ?? null,
        operatorId,
        description: input.description ?? `پرداخت POS - ${terminal.title}`,
      }).returning();

      // Record in student ledger — در همان تراکنش؛ شکست = rollback کامل
      const led = await recordLedgerAction({
        studentId: stu.id,
        termId: termId ?? null,
        financialTermId: financialTermId ?? null,
        transactionType: 'POS_PAYMENT',
        amount,
        description: `پرداخت کارت‌خوان ${terminal.title} - STAN:${stan}${input.rrn ? ` RRN:${input.rrn}` : ''}`,
        referenceId: posTxn.id,
      }, { tx });
      if (!led.ok || !led.ledgerId) throw new Error(led.error ?? 'خطا در ثبت دفتر مالی؛ تراکنش برگشت داده شد');

      // Update POS transaction with the REAL ledger row id
      await tx.update(pos_transactions)
        .set({ ledgerTxnId: led.ledgerId })
        .where(eq(pos_transactions.id, posTxn.id));

      return { ok: true, posTxn };
    });
  } catch (e) {
    throw toPosTxError(e, 'خطا در ثبت پرداخت POS');
  }
}

function maskPan(pan: string): string {
  const digits = pan.replace(/\D/g, '');
  if (digits.length < 10) return '****';
  return digits.slice(0, 6) + '******' + digits.slice(-4);
}

/** پنجرهٔ زمانی مجاز ویدی POS پس از تراکنش اصلی (۲۴ ساعت) */
const POS_VOID_WINDOW_MS = 24 * 60 * 60 * 1000;
/** نقش‌های ارشد مالی که می‌توانند ویدی را به‌تنهایی (تأیید دوم) انجام دهند */
const POS_VOID_SENIOR_ROLES = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'];

export async function voidPosTransaction(terminalCode: string, stan: string, reason: string) {
  await requireRole(POS_ROLES);
  const uni = await getCurrentUniversity();
  if (!uni) throw new Error('دانشگاه فعال یافت نشد');
  const actor = await getSessionUser();

  const cleanReason = String(reason ?? '').trim();
  if (!cleanReason) throw new Error('دلیل ویدی الزامی است');

  const terminal = await getPosTerminal(terminalCode);
  if (!terminal) throw new Error('ترمینال POS یافت نشد');

  // کل مسیر (قفل ردیف اصلی → درج ویدی → برگشتی دفتر → ویدکردن اصلی)
  // در یک تراکنش واحد؛ شکست هر گام = rollback کامل.
  try {
    return await db.transaction(async (tx) => {
      const [posTxn] = await tx.select().from(pos_transactions)
        .where(and(
          eq(pos_transactions.terminalId, terminal.id),
          eq(pos_transactions.stan, stan),
          eq(pos_transactions.status, 'APPROVED')
        ))
        .limit(1)
        .for('update');
      if (!posTxn) throw new Error('تراکنش اصلی یافت نشد یا قبلاً وید شده');

      // 🔒 تفکیک وظایف ویدی: همان صندوق‌دارِ عامل به‌تنهایی (فقط نقش CASHIER)
      // نمی‌تواند ویدی کند — تأیید دوم لازم است (کاربر متفاوت یا نقش مالی ارشد).
      const actorRoles = actor?.roles ?? [];
      const isSameOperator = posTxn.operatorId != null && actor?.id != null && posTxn.operatorId === actor.id;
      const hasSeniorRole = actorRoles.some(r => POS_VOID_SENIOR_ROLES.includes(r));
      if (isSameOperator && !hasSeniorRole) {
        throw new Error('ویدی توسط همان صندوق‌دارِ عامل به‌تنهایی مجاز نیست؛ تأیید دوم (کاربر دیگر یا نقش مالی ارشد) لازم است');
      }

      // 🔒 پنجرهٔ زمانی ویدی: پس از ۲۴ ساعت فقط نقش ارشد مالی.
      const createdMs = posTxn.createdAt instanceof Date ? posTxn.createdAt.getTime() : Date.parse(String(posTxn.createdAt ?? ''));
      if (Number.isFinite(createdMs) && Date.now() - (createdMs as number) > POS_VOID_WINDOW_MS && !hasSeniorRole) {
        throw new Error('مهلت ویدی (۲۴ ساعت) گذشته است؛ ویدی دیرهنگام فقط با نقش مالی ارشد ممکن است');
      }

      const origAmount = safeRials(posTxn.amount);
      if (origAmount === null || origAmount <= 0) throw new Error('مبلغ تراکنش اصلی نامعتبر است؛ ویدی ممکن نیست');

      // Create void transaction (STAN یکتا و حداکثر ۲۰ کاراکتر)
      const voidStan = `${stan}V${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`.slice(0, 20);
      const [voidTxn] = await tx.insert(pos_transactions).values({
        universityId: uni.id,
        studentId: posTxn.studentId,
        termId: posTxn.termId,
        financialTermId: posTxn.financialTermId,
        terminalId: terminal.id,
        stan: voidStan,
        rrn: posTxn.rrn,
        amount: String(origAmount),
        txnType: 'VOID',
        entryMode: posTxn.entryMode,
        status: 'APPROVED',
        responseCode: '00',
        responseMessage: 'VOIDED',
        cardPan: posTxn.cardPan,
        cardholderName: posTxn.cardholderName,
        // عامل ویدی (تأییدکنندهٔ دوم) ثبت می‌شود، نه عامل تراکنش اصلی.
        operatorId: actor?.id ?? posTxn.operatorId,
        description: `ویدی تراکنش ${stan} - ${cleanReason}`,
      }).returning();

      // شناسهٔ ردیف اصلی دفتر مالی: نخست ledgerTxnId (از زمان اصلاح، شناسهٔ واقعی است)،
      // وگرنه جست‌وجو با referenceId برای ردیف‌های قدیمی
      let originalLedgerId: number | null = null;
      if (posTxn.ledgerTxnId) {
        const [lr] = await tx.select({ id: student_ledger.id }).from(student_ledger)
          .where(and(eq(student_ledger.id, posTxn.ledgerTxnId), eq(student_ledger.studentId, posTxn.studentId)))
          .limit(1);
        if (lr) originalLedgerId = lr.id;
      }
      if (originalLedgerId === null) {
        const [lr] = await tx.select({ id: student_ledger.id }).from(student_ledger)
          .where(and(
            eq(student_ledger.referenceId, posTxn.id),
            eq(student_ledger.transactionType, 'POS_PAYMENT'),
            eq(student_ledger.studentId, posTxn.studentId),
          ))
          .limit(1);
        if (lr) originalLedgerId = lr.id;
      }

      // 🔒 برگشتی بدون پیوند به ردیف اصلی ممنوع است (fail-closed).
      if (originalLedgerId === null) {
        throw new Error('ردیف اصلی دفتر مالی برای این تراکنش یافت نشد؛ ویدی ممکن نیست');
      }

      // Reverse in ledger — در همان تراکنش؛ نتیجه بررسی می‌شود و شکست = rollback
      const rev = await recordReversalAction({
        studentId: posTxn.studentId,
        termId: posTxn.termId,
        financialTermId: posTxn.financialTermId,
        originalLedgerId,
        transactionType: 'POS_PAYMENT',
        amount: origAmount,
        reason: `ویدی پرداخت POS - تراکنش اصلی STAN:${stan} - ${cleanReason}`,
      }, { tx });
      if (!rev.ok || !rev.ledgerId) throw new Error(rev.error ?? 'خطا در برگشتی دفتر مالی؛ ویدی برگشت داده شد');

      // Mark original as voided + link void row to the reversal ledger row
      await tx.update(pos_transactions)
        .set({ status: 'VOIDED', description: `${posTxn.description} | VOIDED: ${cleanReason}` })
        .where(eq(pos_transactions.id, posTxn.id));
      await tx.update(pos_transactions)
        .set({ ledgerTxnId: rev.ledgerId })
        .where(eq(pos_transactions.id, voidTxn.id));

      return { ok: true, voidTxn };
    });
  } catch (e) {
    throw toPosTxError(e, 'خطا در ویدی تراکنش POS');
  }
}

export async function getPosTransactions(filters: {
  terminalCode?: string;
  studentCode?: string;
  dateFrom?: Date;
  dateTo?: Date;
  status?: string;
  limit?: number;
}) {
  await requireRole(POS_ROLES);
  const uni = await getCurrentUniversity();
  if (!uni) return [];

  const where = [eq(pos_transactions.universityId, uni.id)];
  
  if (filters.terminalCode) {
    const terminal = await getPosTerminal(filters.terminalCode);
    if (terminal) where.push(eq(pos_transactions.terminalId, terminal.id));
  }
  
  if (filters.studentCode) {
    const [stu] = await db.select().from(students)
      .where(and(eq(students.studentCode, filters.studentCode), eq(students.universityId, uni.id)))
      .limit(1);
    if (stu) where.push(eq(pos_transactions.studentId, stu.id));
  }
  
  if (filters.dateFrom) where.push(sql`${pos_transactions.createdAt} >= ${filters.dateFrom}`);
  if (filters.dateTo) where.push(sql`${pos_transactions.createdAt} <= ${filters.dateTo}`);
  if (filters.status) where.push(eq(pos_transactions.status, filters.status));

  return db.select({
    id: pos_transactions.id,
    stan: pos_transactions.stan,
    rrn: pos_transactions.rrn,
    amount: pos_transactions.amount,
    txnType: pos_transactions.txnType,
    entryMode: pos_transactions.entryMode,
    status: pos_transactions.status,
    responseCode: pos_transactions.responseCode,
    cardPan: pos_transactions.cardPan,
    cardholderName: pos_transactions.cardholderName,
    createdAt: pos_transactions.createdAt,
    terminalCode: pos_terminals.code,
    terminalTitle: pos_terminals.title,
    studentCode: students.studentCode,
    studentName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
  })
    .from(pos_transactions)
    .innerJoin(pos_terminals, eq(pos_terminals.id, pos_transactions.terminalId))
    .innerJoin(students, eq(students.id, pos_transactions.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .where(and(...where))
    .orderBy(sql`${pos_transactions.createdAt} DESC`)
    .limit(filters.limit ?? 100);
}