import 'server-only';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  financial_clearances, financial_terms, student_ledger,
} from '@/db/schema';
import { getSetting } from '@/lib/settings';
import { ledgerBalance } from '@/lib/ledger-balance';

type LedgerRow = { transactionType: string | null; amount: number | string | null };

/** ترم مرجع تسویه‌حساب: ترم مالی فعال اگر به ترم تحصیلی وصل باشد، وگرنه خودِ ترم ارائه. */
async function resolveClearanceTermId(termId: number, universityId: number | null): Promise<number> {
  try {
    const finTerms = await db
      .select()
      .from(financial_terms)
      .where(and(
        eq(financial_terms.universityId, universityId ?? 0),
        eq(financial_terms.isActive, 1),
      ))
      .orderBy(sql`"sortOrder" ASC NULLS LAST`);
    if (finTerms.length > 0) return finTerms[0].academicTermId ?? termId;
  } catch {
    // نبودِ جدول/دسترسی ⇒ همان ترم ارائه
  }
  return termId;
}

async function debtThreshold(): Promise<number> {
  const raw = await getSetting('ENROLLMENT_DEBT_THRESHOLD').catch(() => '0');
  return Math.max(0, Number(raw ?? 0) || 0);
}

/**
 * گیت تسویهٔ مالی — همان قاعده‌ای که مسیر «ثبت نهایی» دانشجو اعمال می‌کند.
 *
 * چرا لازم شد: ثبت‌نام دستی/دسته‌جمعی کارشناس آموزش هیچ بررسی مالی نداشت،
 * پس یک مسیر کاملاً بی‌دردسر برای دور زدن گیت بدهی بود (ثبت با
 * enrollOverride=0 در حالی که دانشجو بدهکار بود — رکورد «چیزی نقض نشده» می‌گفت).
 */
export async function assertFinancialClearance(
  studentId: number,
  termId: number,
  universityId: number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const clearanceTermId = await resolveClearanceTermId(termId, universityId);

  const [fin] = await db
    .select()
    .from(financial_clearances)
    .where(and(
      eq(financial_clearances.studentId, studentId),
      eq(financial_clearances.termId, clearanceTermId),
    ))
    .limit(1);

  if (!fin || !fin.isCleared) {
    return { ok: false, error: 'تسویه‌حساب مالی این ترم ثبت نشده است. برای انتخاب واحد باید بدهکاری‌تان تسویه شود.' };
  }

  const threshold = await debtThreshold();

  const rows = await db
    .select({ transactionType: student_ledger.transactionType, amount: student_ledger.amount })
    .from(student_ledger)
    .where(eq(student_ledger.studentId, studentId));

  const balance = ledgerBalance(rows as LedgerRow[]);
  if (balance > threshold) {
    return {
      ok: false,
      error: `مانده بدهکاری (${balance.toLocaleString('fa-IR')} ریال) بیش از حد مجاز (${threshold.toLocaleString('fa-IR')} ریال) است. ابتدا بدهکاری را کاهش دهید.`,
    };
  }

  return { ok: true };
}

/**
 * نسخهٔ دسته‌ای گیت تسویهٔ مالی — برای ثبت‌نام دسته‌جمعی.
 * یک کوئری برای تسویه‌ها و یک کوئری برای دفتر، سپس فیلتر در حافظه.
 * @returns مجموعهٔ شناسهٔ دانشجویانی که از نظر مالی مجازند.
 */
export async function clearedStudentIds(
  studentIds: number[],
  termId: number,
  universityId: number | null,
): Promise<Set<number>> {
  if (!studentIds.length) return new Set();

  const clearanceTermId = await resolveClearanceTermId(termId, universityId);

  const cleared = await db
    .select({ studentId: financial_clearances.studentId })
    .from(financial_clearances)
    .where(and(
      eq(financial_clearances.termId, clearanceTermId),
      eq(financial_clearances.isCleared, 1),
      inArray(financial_clearances.studentId, studentIds),
    ));

  const clearedSet = new Set(cleared.map(r => r.studentId));
  if (!clearedSet.size) return new Set();

  const threshold = await debtThreshold();

  const rows = await db
    .select({
      studentId: student_ledger.studentId,
      transactionType: student_ledger.transactionType,
      amount: student_ledger.amount,
    })
    .from(student_ledger)
    .where(inArray(student_ledger.studentId, [...clearedSet]));

  const byStudent = new Map<number, LedgerRow[]>();
  for (const r of rows) {
    const arr = byStudent.get(r.studentId) ?? [];
    arr.push({ transactionType: r.transactionType, amount: r.amount });
    byStudent.set(r.studentId, arr);
  }

  const out = new Set<number>();
  for (const sid of clearedSet) {
    if (ledgerBalance(byStudent.get(sid) ?? []) <= threshold) out.add(sid);
  }
  return out;
}
