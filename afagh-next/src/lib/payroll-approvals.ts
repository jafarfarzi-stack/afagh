import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '@/db';
import {
  audit_logs, payroll_statements, professor_term_contracts, staff,
} from '@/db/schema';
import { payroll_approvals } from '@/lib/payroll-approvals-schema';
import { getSessionUser, getStaffByUser, requireRole, type SessionUser } from '@/lib/auth';
import { headedDepartments } from '@/lib/group-manager';
import { currentTerm, getOverview, settleFinal } from '@/lib/payroll-engine';
import { notifyUserMultichannel } from '@/lib/messaging';
import { createLogger } from '@/lib/logger';
import { getCurrentUniversity } from '@/lib/university-scope';

// ══════════════════════════════════════════════════════════════════════
//  زنجیرهٔ تأیید فیش حق‌التدریس — منطق سرورساید
//
//  ماشین وضعیت (روی payroll_statements.status — ستون varchar بدون CHECK):
//    DRAFT ─┬─→ MID_TERM_PAID ─────────────┬─→ DEPT_HEAD_APPROVED
//           │  (علی‌الحساب؛ ADMIN مستقیم،     │
//           │   بیرون از زنجیره — موتور)     │
//           └─→ DEPT_HEAD_APPROVED ──────────┘  (مدیر گروه)
//                 → DEAN_APPROVED (معاونت آموزشی)
//                 → FINAL_SETTLED (تسویهٔ مالی — موتور، با پیش‌شرط)
//    DEPT_HEAD_APPROVED|DEAN_APPROVED ─(RETURN)→ DRAFT یا MID_TERM_PAID
//    * ─(REJECT)→ REJECTED (پایانی)
//
//  درزها (seam) با مالکیت‌های دیگر — دست‌نخورده رها شده‌اند:
//   ۱) settleFinal در payroll-engine.ts است (مالک: موتور). پیش‌شرط
//      DEAN_APPROVED در لایهٔ ما (settleApproved) پیش از فراخوانی چک
//      می‌شود، نه داخل تراکنش موتور؛ پنجرهٔ رقابت کوچک ولی واقعی است.
//      اتمی‌شدن کامل = انتقال چک به داخل settleFinal (کارِ مالک موتور).
//   ۲) writeAudit موتور private است؛ الگوی زنجیرهٔ هش (همان فرمول
//      sha256 روی prevHash|action|entityType|entityId|details) در اینجا
//      بازپیاده شده تا همان زنجیرهٔ audit_logs ادامه یابد.
//   ۳) محاسبهٔ مجدد ترم (computeTermPayroll) مرحلهٔ تأییدِ در جریان را
//      ریست نمی‌کند (فقط مبالغ را به‌روز می‌کند) ولی FINAL_SETTLED را
//      دست نمی‌زند؛ REJECTED با محاسبهٔ مجدد به DRAFT برمی‌گردد چون
//      موتور وضعیت را نگه می‌دارد و رکورد موجود را فقط به‌روز می‌کند؟
//      نه — موتور status را در updates نمی‌نویسد، پس REJECTED می‌ماند تا
//      کسی عمداً بازمحاسبه/بازگشت بزند. تاریخچه در payroll_approvals هست.
// ══════════════════════════════════════════════════════════════════════

const log = createLogger({ mod: 'payroll-approvals' });

export type ApprovalOp = 'approve-dept' | 'approve-dean' | 'return' | 'reject' | 'settle';

export type ApprovalResult =
  | { ok: true; info?: string; amount?: number }
  | { ok: false; error: string };

/** نقش‌های مجاز هر گام (ADMIN از داخل requireRole همیشه عبور می‌کند) */
const DEPT_ROLES = ['DEP_HEAD'];
const DEAN_ROLES = ['VICE_EDU', 'EDU_EXPERT'];
const RETURN_ROLES = ['DEP_HEAD', 'VICE_EDU', 'EDU_EXPERT'];
const FINANCE_ROLES = ['ADMIN'];

type StatementCtx = {
  id: number;
  status: string;
  staffId: number;
  departmentId: number | null;
  professorUserId: number | null;
  midtermPaid: number;
};

/** زنجیرهٔ هش ممیزی — همان الگوی payroll-engine.ts:773-793 (فقط-خواندنی) */
async function writeApprovalAudit(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  actorUserId: number | null,
  action: string,
  entityId: number | null,
  details: Record<string, unknown>,
) {
  const [last] = await tx
    .select({ hash: audit_logs.hash })
    .from(audit_logs)
    .orderBy(sql`${audit_logs.id} desc`)
    .limit(1)
    .for('update');
  const prevHash = last?.hash ?? '';
  const hash = crypto
    .createHash('sha256')
    .update(`${prevHash}|${action}|payroll_statement|${entityId ?? ''}|${JSON.stringify(details)}`)
    .digest('hex');
  await tx.insert(audit_logs).values({
    actorUserId, action, entityType: 'payroll_statement', entityId,
    details: JSON.stringify(details), prevHash, hash,
  });
}

/** اطلاع‌رسانی به استاد — همان الگوی safeNotify موتور (چندکاناله، بی‌صدا در خطا) */
async function notifyProfessor(userId: number | null, eventCode: string, text: string) {
  if (!userId) return;
  try {
    await notifyUserMultichannel({ userId, eventCode, text });
  } catch (err) {
    log.warn('payroll_approval_notify_failed', { userId, eventCode, err: (err as Error).message });
  }
}

function actingRole(user: SessionUser, candidates: string[]): string {
  if (user.roles.includes('ADMIN')) return 'ADMIN';
  const hit = candidates.find(r => user.roles.includes(r));
  return hit ?? user.roles[0] ?? 'UNKNOWN';
}

async function loadStatementTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  statementId: number,
): Promise<StatementCtx | null> {
  const [row] = await tx
    .select({
      id: payroll_statements.id,
      status: payroll_statements.status,
      midtermPaidAmount: payroll_statements.midtermPaidAmount,
      staffId: professor_term_contracts.staffId,
      departmentId: staff.departmentId,
      professorUserId: staff.userId,
    })
    .from(payroll_statements)
    .innerJoin(professor_term_contracts, eq(professor_term_contracts.id, payroll_statements.contractId))
    .innerJoin(staff, eq(staff.id, professor_term_contracts.staffId))
    .where(eq(payroll_statements.id, statementId))
    .for('update');
  if (!row) return null;
  return {
    id: row.id,
    status: row.status ?? 'DRAFT',
    staffId: row.staffId,
    departmentId: row.departmentId,
    professorUserId: row.professorUserId,
    midtermPaid: Number(row.midtermPaidAmount ?? 0),
  };
}

/** دامنهٔ مدیر گروه: فیش باید متعلق به گروه زیر نظرش باشد (ADMIN معاف) */
async function assertDeptScope(user: SessionUser, ctx: StatementCtx) {
  if (user.roles.includes('ADMIN')) return;
  const actorStaff = await getStaffByUser(user.id);
  if (!actorStaff) throw new Error('پروندهٔ کارمندی شما یافت نشد؛ تأیید ممکن نیست.');
  if (ctx.departmentId == null) throw new Error('گروه آموزشی استاد مشخص نیست؛ تأیید مدیر گروه ممکن نیست.');
  const depts = await headedDepartments(actorStaff.id, actorStaff.departmentId ?? null);
  if (!depts.some(d => d.id === ctx.departmentId)) {
    throw new Error('این فیش متعلق به گروه آموزشی شما نیست.');
  }
}

async function recordApprovalTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  statementId: number,
  stage: 'DEPT_HEAD' | 'DEAN' | 'FINANCE',
  user: SessionUser,
  role: string,
  action: 'APPROVE' | 'REJECT' | 'RETURN',
  from: string,
  to: string,
  note?: string | null,
) {
  await tx.insert(payroll_approvals).values({
    statementId, stage, actorUserId: user.id, actorRole: role, action, note: note ?? null,
  });
  await writeApprovalAudit(tx, user.id, `PAYROLL_${action}_${stage}`, statementId, {
    actorRole: role, from, to, note: note ?? null,
  });
}

/** گام ۱ — تأیید مدیر گروه (DEP_HEAD در دامنهٔ گروه خودش؛ ADMIN معاف از دامنه) */
export async function approveDeptHead(statementId: number, note?: string): Promise<ApprovalResult> {
  try {
    const user = await requireRole(DEPT_ROLES);
    const role = actingRole(user, DEPT_ROLES);
    const out = await db.transaction(async tx => {
      const ctx = await loadStatementTx(tx, statementId);
      if (!ctx) throw new Error('فیش یافت نشد.');
      await assertDeptScope(user, ctx);
      // idempotent: تأیید تکراری خطا نیست
      if (['DEPT_HEAD_APPROVED', 'DEAN_APPROVED', 'FINAL_SETTLED'].includes(ctx.status)) {
        return { noop: true };
      }
      if (ctx.status === 'REJECTED') throw new Error('این فیش ردّ نهایی شده است؛ تأیید ممکن نیست.');
      if (!['DRAFT', 'MID_TERM_PAID'].includes(ctx.status)) {
        throw new Error(`وضعیت «${ctx.status}» قابل تأیید مدیر گروه نیست.`);
      }
      await tx.update(payroll_statements).set({ status: 'DEPT_HEAD_APPROVED' }).where(eq(payroll_statements.id, ctx.id));
      await recordApprovalTx(tx, ctx.id, 'DEPT_HEAD', user, role, 'APPROVE', ctx.status, 'DEPT_HEAD_APPROVED', note);
      return { noop: false, to: 'DEPT_HEAD_APPROVED' as const, professorUserId: ctx.professorUserId };
    });
    if (out.noop) return { ok: true, info: 'این فیش قبلاً در همین مرحله یا مراحل بعد تأیید شده است.' };
    if (!out.noop && out.professorUserId) {
      await notifyProfessor(out.professorUserId, 'PAYROLL_DEPT_APPROVED', 'فیش حق‌التدریس شما به تأیید مدیر گروه رسید.');
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'خطای ناشناخته' };
  }
}

/** گام ۲ — تأیید معاونت آموزشی (VICE_EDU یا EDU_EXPERT؛ ADMIN هم) */
export async function approveDean(statementId: number, note?: string): Promise<ApprovalResult> {
  try {
    const user = await requireRole(DEAN_ROLES);
    const role = actingRole(user, DEAN_ROLES);
    const out = await db.transaction(async tx => {
      const ctx = await loadStatementTx(tx, statementId);
      if (!ctx) throw new Error('فیش یافت نشد.');
      if (['DEAN_APPROVED', 'FINAL_SETTLED'].includes(ctx.status)) {
        return { noop: true };
      }
      if (ctx.status === 'REJECTED') throw new Error('این فیش ردّ نهایی شده است؛ تأیید ممکن نیست.');
      if (ctx.status === 'DEPT_HEAD_APPROVED') {
        await tx.update(payroll_statements).set({ status: 'DEAN_APPROVED' }).where(eq(payroll_statements.id, ctx.id));
        await recordApprovalTx(tx, ctx.id, 'DEAN', user, role, 'APPROVE', ctx.status, 'DEAN_APPROVED', note);
        return { noop: false, professorUserId: ctx.professorUserId };
      }
      throw new Error('پیش از تأیید معاونت آموزشی، مدیر گروه باید فیش را تأیید کند.');
    });
    if (out.noop) return { ok: true, info: 'این فیش قبلاً به تأیید معاونت آموزشی رسیده است.' };
    if (!out.noop && out.professorUserId) {
      await notifyProfessor(out.professorUserId, 'PAYROLL_DEAN_APPROVED', 'فیش حق‌التدریس شما به تأیید معاونت آموزشی رسید و آمادهٔ تسویهٔ مالی است.');
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'خطای ناشناخته' };
  }
}

/**
 * بازگشت برای اصلاح — یادداشت الزامی است.
 * مقصد: اگر علی‌الحساب پرداخت شده MID_TERM_PAID (تا گارد DRAFT-only موتور
 * برای پرداخت تکراری نشکند)، وگرنه DRAFT. استاد از طریق safeNotify باخبر می‌شود.
 */
export async function returnStatement(statementId: number, note: string): Promise<ApprovalResult> {
  try {
    if (!note || !note.trim()) return { ok: false, error: 'برای بازگشت، درج یادداشت اصلاح الزامی است.' };
    const user = await requireRole(RETURN_ROLES);
    const role = actingRole(user, RETURN_ROLES);
    const out = await db.transaction(async tx => {
      const ctx = await loadStatementTx(tx, statementId);
      if (!ctx) throw new Error('فیش یافت نشد.');
      if (role === 'DEP_HEAD' || (role !== 'ADMIN' && user.roles.includes('DEP_HEAD'))) {
        await assertDeptScope(user, ctx);
      }
      if (!['DEPT_HEAD_APPROVED', 'DEAN_APPROVED'].includes(ctx.status)) {
        throw new Error('فقط فیشِ تأییدشده (مدیر گروه/معاونت) قابل بازگشت برای اصلاح است.');
      }
      const to = ctx.midtermPaid > 0 ? 'MID_TERM_PAID' : 'DRAFT';
      const stage = ctx.status === 'DEAN_APPROVED' ? 'DEAN' as const : 'DEPT_HEAD' as const;
      await tx.update(payroll_statements).set({ status: to }).where(eq(payroll_statements.id, ctx.id));
      await recordApprovalTx(tx, ctx.id, stage, user, role, 'RETURN', ctx.status, to, note.trim());
      return { to, professorUserId: ctx.professorUserId };
    });
    await notifyProfessor(out.professorUserId, 'PAYROLL_RETURNED', `فیش حق‌التدریس برای اصلاح بازگردانده شد: ${note.trim()}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'خطای ناشناخته' };
  }
}

/** ردّ نهایی — پایانی (REJECTED). یادداشت الزامی؛ استاد باخبر می‌شود. */
export async function rejectStatement(statementId: number, note: string): Promise<ApprovalResult> {
  try {
    if (!note || !note.trim()) return { ok: false, error: 'برای ردّ نهایی، درج دلیل الزامی است.' };
    const user = await requireRole(RETURN_ROLES);
    const role = actingRole(user, RETURN_ROLES);
    const out = await db.transaction(async tx => {
      const ctx = await loadStatementTx(tx, statementId);
      if (!ctx) throw new Error('فیش یافت نشد.');
      if (role === 'DEP_HEAD' || (role !== 'ADMIN' && user.roles.includes('DEP_HEAD'))) {
        await assertDeptScope(user, ctx);
      }
      if (ctx.status === 'FINAL_SETTLED') throw new Error('فیش تسویه‌شده را نمی‌توان رد کرد.');
      if (ctx.status === 'REJECTED') return { noop: true, professorUserId: ctx.professorUserId };
      const stage = ctx.status === 'DEAN_APPROVED' ? 'DEAN' as const : 'DEPT_HEAD' as const;
      await tx.update(payroll_statements).set({ status: 'REJECTED' }).where(eq(payroll_statements.id, ctx.id));
      await recordApprovalTx(tx, ctx.id, stage, user, role, 'REJECT', ctx.status, 'REJECTED', note.trim());
      return { noop: false, professorUserId: ctx.professorUserId };
    });
    if (out.noop) return { ok: true, info: 'این فیش قبلاً رد شده است.' };
    await notifyProfessor(out.professorUserId, 'PAYROLL_REJECTED', `فیش حق‌التدریس رد شد: ${note.trim()}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'خطای ناشناخته' };
  }
}

/**
 * گام ۳ — تسویهٔ مالی با پیش‌شرط مرحله.
 * خودِ پرداخت همان settleFinal موتور است (فورک نشده)؛ گلوگاه‌های نمره/سند
 * و قفل سطری داخل موتور می‌ماند. پیش‌شرط DEAN_APPROVED این‌جا (بیرون از
 * تراکنش موتور) چک می‌شود — درز اتمی (seam ۱ در سربرگ فایل).
 */
export async function settleApproved(staffId: number): Promise<ApprovalResult> {
  try {
    const user = await requireRole(FINANCE_ROLES);
    const role = actingRole(user, FINANCE_ROLES);
    const term = await currentTerm();
    if (!term) return { ok: false, error: 'ترم جاری مشخص نیست.' };
    const [ps] = await db
      .select({ id: payroll_statements.id, status: payroll_statements.status })
      .from(payroll_statements)
      .innerJoin(professor_term_contracts, eq(professor_term_contracts.id, payroll_statements.contractId))
      .where(and(eq(professor_term_contracts.staffId, staffId), eq(professor_term_contracts.termId, term.id)))
      .limit(1);
    if (!ps) return { ok: false, error: 'ابتدا فیش ترم را محاسبه کنید.' };
    if (ps.status === 'FINAL_SETTLED') return { ok: true, info: 'این فیش قبلاً تسویه شده است.' };
    if (ps.status !== 'DEAN_APPROVED') {
      return { ok: false, error: 'تسویهٔ نهایی فقط پس از تأیید معاونت آموزشی ممکن است (وضعیت فعلی نیازمند طی زنجیرهٔ تأیید است).' };
    }
    const res = await settleFinal(staffId, user.id, term.id);
    // ثبت ردیف FINANCE در تاریخچه + ممیزی (پس از پرداخت موفق؛ جدا از تراکنش موتور)
    try {
      await db.transaction(async tx => {
        await recordApprovalTx(tx, ps.id, 'FINANCE', user, role, 'APPROVE', 'DEAN_APPROVED', 'FINAL_SETTLED', null);
      });
    } catch (err) {
      log.warn('payroll_finance_row_failed', { statementId: ps.id, err: (err as Error).message });
    }
    return { ok: true, amount: (res as { amount?: number }).amount };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'خطای ناشناخته' };
  }
}

/** تاریخچهٔ تأیید یک فیش (برای نمایش زیر فیش/دیالوگ) */
export async function getApprovalHistory(statementId: number) {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU', 'DEP_HEAD', 'FINANCE_EXPERT', 'FINANCE']);
  const rows = await db.select().from(payroll_approvals).where(eq(payroll_approvals.statementId, statementId));
  rows.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  return rows;
}

/**
 * نمای کارتابل با دامنهٔ نقش:
 *  • ADMIN/EDU_EXPERT/VICE_EDU/FINANCE* → همان getOverview موتور (کامل).
 *  • DEP_HEAD (خالص) → فقط استادان گروه‌های زیر نظرش.
 * برای page.tsx و مسیر GET همین روت استفاده می‌شود تا actions.ts دست نخورد.
 */
export async function getScopedOverview() {
  const user: SessionUser | null = await getSessionUser();
  if (!user) throw new Error('وارد شوید.');
  const allowed = ['ADMIN', 'EDU_EXPERT', 'VICE_EDU', 'FINANCE_EXPERT', 'FINANCE', 'DEP_HEAD'];
  if (!user.roles.some(r => allowed.includes(r))) throw new Error('دسترسی غیرمجاز.');
  const uni = await getCurrentUniversity().catch(() => null);
  const ov = await getOverview(undefined, uni?.id ?? undefined);
  const isDeptOnly =
    user.roles.includes('DEP_HEAD') &&
    !user.roles.some(r => r === 'ADMIN' || r === 'EDU_EXPERT' || r === 'VICE_EDU' || r === 'FINANCE' || r === 'FINANCE_EXPERT');
  if (!isDeptOnly) return { ...ov, scoped: false as const };
  const actorStaff = await getStaffByUser(user.id);
  if (!actorStaff) throw new Error('پروندهٔ کارمندی شما یافت نشد.');
  const depts = await headedDepartments(actorStaff.id, actorStaff.departmentId ?? null);
  const deptIds = new Set(depts.map(d => d.id));
  const staffIds = ov.list.map(x => x.id);
  if (!staffIds.length) return { ...ov, list: [], scoped: true as const };
  const rows = await db.select({ id: staff.id, departmentId: staff.departmentId }).from(staff).where(inArray(staff.id, staffIds));
  const deptOf = new Map(rows.map(r => [r.id, r.departmentId]));
  const list = ov.list.filter(x => {
    const d = deptOf.get(x.id);
    return d != null && deptIds.has(d);
  });
  const totals = list.reduce(
    (a, x) => ({ budget: a.budget + x.net, paid: a.paid + x.midtermPaid + x.finalPaid, remaining: a.remaining + x.remaining, staffCount: a.staffCount + 1 }),
    { budget: 0, paid: 0, remaining: 0, staffCount: 0 },
  );
  return { term: ov.term, list, totals, scoped: true as const };
}
