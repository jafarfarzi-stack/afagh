'use server';

import { db } from '@/db';
import { eq, and } from 'drizzle-orm';
import { pos_terminals, pos_transactions, students, users, financial_terms, academic_terms } from '@/db/schema';
import { requireRole, getCurrentUniversity } from '@/lib/auth';
import { toNum } from '@/lib/finance-rules';
import { recordLedgerAction } from '@/app/admin/finance/actions';

const POS_ROLES = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE', 'CASHIER'] as const;

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
  txnType?: 'SALE' | 'REFUND' | 'VOID';
}

export async function recordPosSale(input: PosSaleInput) {
  await requireRole(POS_ROLES);
  const uni = await getCurrentUniversity();
  if (!uni) throw new Error('دانشگاه فعال یافت نشد');

  const operator = await requireRole(POS_ROLES).then(() => getCurrentUniversity()).catch(() => null);
  // Get current user ID from session
  const { getSession } = await import('@/lib/auth');
  const session = await getSession();
  const operatorId = session?.userId ?? null;

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
    .orderBy(sql`sort_order ASC NULLS LAST`);
  const financialTermId = finTerms[0]?.id ?? null;

  // Get current academic term
  const [acadTerm] = await db.select().from(academic_terms)
    .where(and(eq(academic_terms.universityId, uni.id), eq(academic_terms.isCurrent, 1)))
    .limit(1);
  const termId = acadTerm?.id ?? null;

  // Check for duplicate STAN on this terminal
  const [existing] = await db.select().from(pos_transactions)
    .where(and(eq(pos_transactions.terminalId, terminal.id), eq(pos_transactions.stan, input.stan)))
    .limit(1);
  if (existing) throw new Error(`تراکنش با STAN ${input.stan} روی این ترمینال قبلاً ثبت شده`);

  // Create POS transaction
  const [posTxn] = await db.insert(pos_transactions).values({
    universityId: uni.id,
    studentId: stu.id,
    termId,
    financialTermId,
    terminalId: terminal.id,
    stan: input.stan,
    rrn: input.rrn ?? null,
    amount: input.amount.toString(),
    txnType: input.txnType ?? 'SALE',
    entryMode: input.entryMode,
    status: 'APPROVED',
    responseCode: '00',
    responseMessage: 'APPROVED',
    cardPan: maskPan(input.cardPan),
    cardholderName: input.cardholderName ?? null,
    operatorId,
    description: input.description ?? `پرداخت POS - ${terminal.title}`,
  }).returning();

  // Record in student ledger
  await recordLedgerAction({
    studentId: stu.id,
    termId: termId ?? undefined,
    financialTermId: financialTermId ?? undefined,
    transactionType: 'POS_PAYMENT',
    amount: input.amount,
    description: `پرداخت کارت‌خوان ${terminal.title} - STAN:${input.stan}${input.rrn ? ` RRN:${input.rrn}` : ''}`,
    referenceId: posTxn.id,
  });

  // Update POS transaction with ledger ID
  await db.update(pos_transactions)
    .set({ ledgerTxnId: posTxn.id })
    .where(eq(pos_transactions.id, posTxn.id));

  return { ok: true, posTxn };
}

function maskPan(pan: string): string {
  const digits = pan.replace(/\D/g, '');
  if (digits.length < 10) return '****';
  return digits.slice(0, 6) + '******' + digits.slice(-4);
}

export async function voidPosTransaction(terminalCode: string, stan: string, reason: string) {
  await requireRole(POS_ROLES);
  const uni = await getCurrentUniversity();
  if (!uni) throw new Error('دانشگاه فعال یافت نشد');

  const terminal = await getPosTerminal(terminalCode);
  if (!terminal) throw new Error('ترمینال POS یافت نشد');

  const [posTxn] = await db.select().from(pos_transactions)
    .where(and(
      eq(pos_transactions.terminalId, terminal.id),
      eq(pos_transactions.stan, stan),
      eq(pos_transactions.status, 'APPROVED')
    ))
    .limit(1);
  if (!posTxn) throw new Error('تراکنش اصلی یافت نشد یا قبلاً وید شده');

  // Create void transaction
  const [voidTxn] = await db.insert(pos_transactions).values({
    universityId: uni.id,
    studentId: posTxn.studentId,
    termId: posTxn.termId,
    financialTermId: posTxn.financialTermId,
    terminalId: terminal.id,
    stan: `${stan}V${Date.now().toString().slice(-6)}`, // unique STAN for void
    rrn: posTxn.rrn,
    amount: posTxn.amount,
    txnType: 'VOID',
    entryMode: posTxn.entryMode,
    status: 'APPROVED',
    responseCode: '00',
    responseMessage: 'VOIDED',
    cardPan: posTxn.cardPan,
    cardholderName: posTxn.cardholderName,
    operatorId: posTxn.operatorId,
    description: `ویدی تراکنش ${stan} - ${reason}`,
  }).returning();

  // Reverse in ledger
  await recordLedgerAction({
    studentId: posTxn.studentId,
    termId: posTxn.termId ?? undefined,
    financialTermId: posTxn.financialTermId ?? undefined,
    transactionType: 'POS_PAYMENT',
    amount: -toNum(posTxn.amount),
    description: `ویدی پرداخت POS - تراکنش اصلی STAN:${stan} - ${reason}`,
    referenceId: voidTxn.id,
  });

  // Mark original as voided
  await db.update(pos_transactions)
    .set({ status: 'VOIDED', description: `${posTxn.description} | VOIDED: ${reason}` })
    .where(eq(pos_transactions.id, posTxn.id));

  return { ok: true, voidTxn };
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

import { sql } from 'drizzle-orm';