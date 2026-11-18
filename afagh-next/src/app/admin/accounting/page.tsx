import Link from 'next/link';
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms,
  gl_accounts,
  gl_periods,
  gl_posting_rules,
  gl_voucher_lines,
  gl_vouchers,
  persons,
  students,
} from '@/db/schema';
import { getSessionUser, requireRole } from '@/lib/auth';
import { getCurrentUniversity, isRealUniversityId } from '@/lib/university-scope';
import { ensureDefaultChart } from '@/lib/accounting/accounts';
import { ensureDefaultRules } from '@/lib/accounting/rules';
import { glReconciliation } from '@/lib/accounting/backfill';
import { trialBalance } from '@/lib/accounting/posting';
import AccountingClient, { type VoucherRow } from './AccountingClient';

export const dynamic = 'force-dynamic';

/**
 * «حسابداری و دفتر کل» — صفحهٔ سرور.
 *
 * همهٔ داده در همین درخواست و با تعدادِ ثابتی کوئری خوانده می‌شود
 * (هیچ N+1 و هیچ fetch کلاینتی). کدینگ و قواعدِ پیش‌فرض یک‌بار seed می‌شوند
 * تا صفحه روی دانشگاهِ تازه هم کامل کار کند.
 */
export default async function AdminAccountingPage() {
  await requireRole(['ADMIN', 'FINANCE_EXPERT', 'FINANCE']);

  const uni = await getCurrentUniversity().catch(() => null);
  const universityId = uni?.id ?? null;

  // 🔒 fail-closed: بدون دانشگاهِ واقعی هیچ داده‌ای خوانده/نوشته نمی‌شود.
  if (!isRealUniversityId(universityId)) {
    return (
      <div dir="rtl" className="mx-auto max-w-xl">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center shadow-sm">
          <div className="text-3xl" aria-hidden>
            🔒
          </div>
          <h1 className="mt-2 text-sm font-black text-rose-900">دانشگاه فعال مشخص نیست</h1>
          <p className="mt-2 text-2xs leading-6 text-rose-800">
            برای ورود به حسابداری، ابتدا باید یک دانشگاهِ واقعی در دامنهٔ دسترسیِ شما انتخاب شود. تا آن زمان هیچ
            دادهٔ مالی خوانده یا نوشته نمی‌شود.
          </p>
          <Link
            href="/admin"
            prefetch={false}
            className="mt-4 inline-block rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-800"
          >
            بازگشت به داشبورد
          </Link>
        </div>
      </div>
    );
  }

  // کدینگ و قواعدِ پیش‌فرض — idempotent؛ شکستشان نباید کل صفحه را ۵۰۰ کند.
  await ensureDefaultChart(universityId).catch(() => {});
  await ensureDefaultRules(universityId).catch(() => {});

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const mm = String(month).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayIso = `${year}-${mm}-${day}`;
  const monthStart = `${year}-${mm}-01`;
  const monthEnd = `${year}-${mm}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;

  const [accountsRaw, periodsRaw, vouchersRaw, rulesRaw, reconciliation, user, openingRows] = await Promise.all([
    db
      .select({
        id: gl_accounts.id,
        code: gl_accounts.code,
        name: gl_accounts.name,
        type: gl_accounts.type,
        normalSide: gl_accounts.normalSide,
        parentId: gl_accounts.parentId,
        level: gl_accounts.level,
        isActive: gl_accounts.isActive,
        isPostable: gl_accounts.isPostable,
      })
      .from(gl_accounts)
      .where(eq(gl_accounts.universityId, universityId))
      .orderBy(asc(gl_accounts.code)),
    db
      .select({
        id: gl_periods.id,
        title: gl_periods.title,
        startDate: gl_periods.startDate,
        endDate: gl_periods.endDate,
        status: gl_periods.status,
        closedAt: gl_periods.closedAt,
      })
      .from(gl_periods)
      .where(eq(gl_periods.universityId, universityId))
      .orderBy(desc(gl_periods.startDate))
      .limit(36),
    db
      .select({
        id: gl_vouchers.id,
        voucherNo: gl_vouchers.voucherNo,
        voucherDate: gl_vouchers.voucherDate,
        description: gl_vouchers.description,
        status: gl_vouchers.status,
        source: gl_vouchers.source,
        totalDebit: gl_vouchers.totalDebit,
        totalCredit: gl_vouchers.totalCredit,
        lineCount: sql<number>`COUNT(${gl_voucher_lines.id})::int`,
      })
      .from(gl_vouchers)
      .leftJoin(gl_voucher_lines, eq(gl_voucher_lines.voucherId, gl_vouchers.id))
      .where(eq(gl_vouchers.universityId, universityId))
      .groupBy(gl_vouchers.id)
      .orderBy(desc(gl_vouchers.voucherDate), desc(gl_vouchers.voucherNo))
      .limit(100),
    db
      .select({
        eventKey: gl_posting_rules.eventKey,
        debitAccountCode: gl_posting_rules.debitAccountCode,
        creditAccountCode: gl_posting_rules.creditAccountCode,
        isActive: gl_posting_rules.isActive,
      })
      .from(gl_posting_rules)
      .where(eq(gl_posting_rules.universityId, universityId))
      .orderBy(asc(gl_posting_rules.eventKey)),
    glReconciliation(universityId).catch(() => null),
    getSessionUser().catch(() => null),
    db
      .select({ id: gl_vouchers.id })
      .from(gl_vouchers)
      .where(
        and(
          eq(gl_vouchers.universityId, universityId),
          eq(gl_vouchers.source, 'OPENING'),
          ne(gl_vouchers.status, 'REVERSED'),
          gte(gl_vouchers.voucherDate, monthStart),
          lte(gl_vouchers.voucherDate, monthEnd),
        ),
      )
      .limit(1),
  ]);

  const accounts = accountsRaw.map((a) => ({
    id: Number(a.id),
    code: String(a.code),
    name: String(a.name),
    type: String(a.type),
    normalSide: String(a.normalSide),
    parentId: a.parentId == null ? null : Number(a.parentId),
    level: Number(a.level ?? 1),
    isActive: Number(a.isActive) === 1,
    isPostable: Number(a.isPostable) === 1,
  }));

  const accountByCode = new Map(accounts.map((a) => [a.code, a]));

  const periods = periodsRaw.map((p) => ({
    id: Number(p.id),
    title: String(p.title),
    startDate: String(p.startDate),
    endDate: String(p.endDate),
    status: (String(p.status) === 'CLOSED' ? 'CLOSED' : 'OPEN') as 'OPEN' | 'CLOSED',
    closedAt: p.closedAt ? new Date(p.closedAt).toISOString() : null,
  }));

  const voucherIds = vouchersRaw.map((v) => Number(v.id));
  const linesRaw = voucherIds.length
    ? await db
        .select({
          id: gl_voucher_lines.id,
          voucherId: gl_voucher_lines.voucherId,
          accountCode: gl_accounts.code,
          accountName: gl_accounts.name,
          debit: gl_voucher_lines.debit,
          credit: gl_voucher_lines.credit,
          description: gl_voucher_lines.description,
          studentCode: students.studentCode,
          firstName: persons.canonicalFirstName,
          lastName: persons.canonicalLastName,
          termCode: academic_terms.termCode,
        })
        .from(gl_voucher_lines)
        .innerJoin(gl_accounts, eq(gl_accounts.id, gl_voucher_lines.accountId))
        .leftJoin(students, eq(students.id, gl_voucher_lines.studentId))
        .leftJoin(persons, eq(persons.id, students.personId))
        .leftJoin(academic_terms, eq(academic_terms.id, gl_voucher_lines.termId))
        .where(inArray(gl_voucher_lines.voucherId, voucherIds))
        .orderBy(asc(gl_voucher_lines.voucherId), asc(gl_voucher_lines.id))
    : [];

  const linesByVoucher = new Map<number, VoucherRow['lines']>();
  for (const l of linesRaw) {
    const vid = Number(l.voucherId);
    const bin = linesByVoucher.get(vid) ?? [];
    const name = [l.firstName, l.lastName].filter(Boolean).join(' ').trim();
    const studentLabel = l.studentCode ? `${name || '—'} (${l.studentCode})` : null;
    bin.push({
      id: Number(l.id),
      accountCode: String(l.accountCode),
      accountName: String(l.accountName),
      debit: Number(l.debit ?? 0),
      credit: Number(l.credit ?? 0),
      description: l.description ? String(l.description) : null,
      studentLabel,
      termCode: l.termCode ? String(l.termCode) : null,
    });
    linesByVoucher.set(vid, bin);
  }

  const vouchers: VoucherRow[] = vouchersRaw.map((v) => ({
    id: Number(v.id),
    voucherNo: Number(v.voucherNo),
    voucherDate: String(v.voucherDate),
    description: v.description ? String(v.description) : null,
    status: String(v.status),
    source: String(v.source),
    totalDebit: Number(v.totalDebit ?? 0),
    totalCredit: Number(v.totalCredit ?? 0),
    lineCount: Number(v.lineCount ?? 0),
    lines: linesByVoucher.get(Number(v.id)) ?? [],
  }));

  const rules = rulesRaw.map((r) => ({
    eventKey: String(r.eventKey),
    debitAccountCode: String(r.debitAccountCode),
    creditAccountCode: String(r.creditAccountCode),
    debitName: accountByCode.get(String(r.debitAccountCode))?.name ?? null,
    creditName: accountByCode.get(String(r.creditAccountCode))?.name ?? null,
    isActive: Number(r.isActive) === 1,
  }));

  // دورهٔ شاملِ امروز؛ اگر نبود، تازه‌ترین دوره.
  const currentPeriod =
    periods.find((p) => p.startDate <= todayIso && p.endDate >= todayIso) ?? periods[0] ?? null;

  const trialRows = currentPeriod
    ? await trialBalance({ universityId, from: currentPeriod.startDate, to: currentPeriod.endDate }).catch(() => [])
    : [];

  const trialDebit = trialRows.reduce((s, r) => s + Number(r.debit ?? 0), 0);
  const trialCredit = trialRows.reduce((s, r) => s + Number(r.credit ?? 0), 0);
  const trialTop = [...trialRows]
    .sort((a, b) => Math.abs(Number(b.balance ?? 0)) - Math.abs(Number(a.balance ?? 0)))
    .slice(0, 8)
    .map((r) => ({
      code: String(r.code ?? ''),
      name: String(r.name ?? ''),
      type: String(r.type ?? ''),
      debit: Number(r.debit ?? 0),
      credit: Number(r.credit ?? 0),
      balance: Number(r.balance ?? 0),
    }));

  return (
    <AccountingClient
      universityTitle={uni?.title ?? '—'}
      todayIso={todayIso}
      canReopen={Boolean(user?.roles?.includes('ADMIN'))}
      openingThisMonth={openingRows.length > 0}
      accounts={accounts}
      periods={periods}
      vouchers={vouchers}
      rules={rules}
      reconciliation={
        reconciliation
          ? {
              ledgerRows: Number(reconciliation.ledgerRows ?? 0),
              postedVouchers: Number(reconciliation.postedVouchers ?? 0),
              unmatchedLedgerRows: Number(reconciliation.unmatchedLedgerRows ?? 0),
              unbalancedVouchers: Number(reconciliation.unbalancedVouchers ?? 0),
              closedPeriodViolations: Number(reconciliation.closedPeriodViolations ?? 0),
              duplicateSourceRefs: Number(reconciliation.duplicateSourceRefs ?? 0),
            }
          : null
      }
      trial={{
        periodTitle: currentPeriod?.title ?? null,
        from: currentPeriod?.startDate ?? null,
        to: currentPeriod?.endDate ?? null,
        debit: trialDebit,
        credit: trialCredit,
        accountCount: trialRows.length,
        rows: trialTop,
      }}
    />
  );
}
