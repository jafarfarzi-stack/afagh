import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms,
  payroll_statements,
  professor_term_contracts,
  staff,
  users,
} from '@/db/schema';
import { payroll_objections } from '@/db/schema-payroll-plus';
import { notifyUserMultichannel } from '@/lib/messaging';
import { createLogger } from '@/lib/logger';
import { returnStatement } from '@/lib/payroll-approvals';

const log = createLogger({ mod: 'payroll-objections' });

export const OBJECTION_STATUSES = ['OPEN', 'RESOLVED', 'REJECTED'] as const;
export type ObjectionStatus = (typeof OBJECTION_STATUSES)[number];

export const OBJECTION_STATUS_FA: Record<string, string> = {
  OPEN: 'باز',
  RESOLVED: 'رسیدگی شد',
  REJECTED: 'وارد نیست',
};

export type ObjectionResult = { ok: true; id: number } | { ok: false; error: string };

async function notifyStaff(staffId: number, eventCode: string, text: string) {
  try {
    const [row] = await db
      .select({ userId: staff.userId })
      .from(staff)
      .where(eq(staff.id, staffId))
      .limit(1);
    if (row?.userId) await notifyUserMultichannel({ userId: row.userId, eventCode, text });
  } catch (err) {
    log.warn('objection_notify_failed', { staffId, eventCode, err: (err as Error).message });
  }
}

/** ثبت اعتراض استاد به فیش — فقط فیشِ خود استاد، بدون تکرار باز */
export async function createObjection(input: {
  statementId: number;
  staffId: number;
  text: string;
  createdBy: number;
  universityId?: number | null;
}): Promise<ObjectionResult> {
  const text = (input.text ?? '').trim();
  if (text.length < 5) return { ok: false, error: 'متن اعتراض حداقل ۵ حرف باشد.' };
  if (text.length > 4000) return { ok: false, error: 'متن اعتراض حداکثر ۴۰۰۰ حرف.' };

  const [st] = await db
    .select({
      id: payroll_statements.id,
      status: payroll_statements.status,
      staffId: professor_term_contracts.staffId,
      termId: professor_term_contracts.termId,
    })
    .from(payroll_statements)
    .innerJoin(professor_term_contracts, eq(professor_term_contracts.id, payroll_statements.contractId))
    .where(eq(payroll_statements.id, input.statementId))
    .limit(1);
  if (!st) return { ok: false, error: 'فیش یافت نشد.' };
  if (st.staffId !== input.staffId) return { ok: false, error: 'این فیش متعلق به شما نیست.' };
  if (st.status === 'FINAL_SETTLED') {
    return { ok: false, error: 'فیش تسویهٔ نهایی شده است؛ اعتراض فقط از طریق واحد مالی.' };
  }
  const [dup] = await db
    .select({ id: payroll_objections.id })
    .from(payroll_objections)
    .where(and(eq(payroll_objections.statementId, input.statementId), eq(payroll_objections.status, 'OPEN')))
    .limit(1);
  if (dup) return { ok: false, error: 'برای این فیش یک اعتراض باز وجود دارد.' };

  const [row] = await db
    .insert(payroll_objections)
    .values({
      statementId: input.statementId,
      staffId: input.staffId,
      termId: st.termId,
      text,
      status: 'OPEN',
      createdBy: input.createdBy,
      universityId: input.universityId ?? null,
    })
    .returning({ id: payroll_objections.id });
  return { ok: true, id: row.id };
}

export type StaffObjection = {
  id: number;
  statementId: number;
  termTitle: string | null;
  statementStatus: string | null;
  text: string;
  status: string;
  reviewNote: string | null;
  reopenedStatement: number;
  createdAt: Date | null;
};

/** اعتراض‌های یک استاد (نمایش در کارنامهٔ حقوقی) */
export async function listObjectionsForStaff(staffId: number, termId?: number | null): Promise<StaffObjection[]> {
  const rows = await db
    .select({
      id: payroll_objections.id,
      statementId: payroll_objections.statementId,
      termTitle: academic_terms.title,
      statementStatus: payroll_statements.status,
      text: payroll_objections.text,
      status: payroll_objections.status,
      reviewNote: payroll_objections.reviewNote,
      reopenedStatement: payroll_objections.reopenedStatement,
      createdAt: payroll_objections.createdAt,
    })
    .from(payroll_objections)
    .innerJoin(payroll_statements, eq(payroll_statements.id, payroll_objections.statementId))
    .innerJoin(academic_terms, eq(academic_terms.id, payroll_objections.termId))
    .where(
      termId != null
        ? and(eq(payroll_objections.staffId, staffId), eq(payroll_objections.termId, termId))
        : eq(payroll_objections.staffId, staffId),
    )
    .orderBy(desc(payroll_objections.createdAt));
  return rows.map(r => ({ ...r, reopenedStatement: Number(r.reopenedStatement ?? 0) }));
}

export type OpenObjection = StaffObjection & {
  staffName: string;
  staffCode: string | null;
  grossAmount: string | null;
};

/** کارتابل اعتراض‌های باز برای کارشناس */
export async function listOpenObjections(universityId?: number | null): Promise<OpenObjection[]> {
  const rows = await db
    .select({
      id: payroll_objections.id,
      statementId: payroll_objections.statementId,
      termTitle: academic_terms.title,
      statementStatus: payroll_statements.status,
      grossAmount: payroll_statements.grossAmount,
      text: payroll_objections.text,
      status: payroll_objections.status,
      reviewNote: payroll_objections.reviewNote,
      reopenedStatement: payroll_objections.reopenedStatement,
      createdAt: payroll_objections.createdAt,
      staffCode: staff.staffCode,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(payroll_objections)
    .innerJoin(payroll_statements, eq(payroll_statements.id, payroll_objections.statementId))
    .innerJoin(academic_terms, eq(academic_terms.id, payroll_objections.termId))
    .innerJoin(staff, eq(staff.id, payroll_objections.staffId))
    .innerJoin(users, eq(users.id, staff.userId))
    .where(
      universityId != null
        ? and(eq(payroll_objections.status, 'OPEN'), eq(payroll_objections.universityId, universityId))
        : eq(payroll_objections.status, 'OPEN'),
    )
    .orderBy(desc(payroll_objections.createdAt))
    .limit(100);
  return rows.map(r => ({
    id: r.id,
    statementId: r.statementId,
    termTitle: r.termTitle,
    statementStatus: r.statementStatus,
    text: r.text,
    status: r.status,
    reviewNote: r.reviewNote,
    reopenedStatement: Number(r.reopenedStatement ?? 0),
    createdAt: r.createdAt,
    staffName: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || '—',
    staffCode: r.staffCode,
    grossAmount: r.grossAmount,
  }));
}

/** بررسی کارشناس: رسیدگی/رد + بازگشایی اختیاری فیش */
export async function reviewObjection(input: {
  id: number;
  decision: 'RESOLVED' | 'REJECTED';
  reviewNote: string;
  reopen: boolean;
  reviewerUserId: number;
}): Promise<ObjectionResult> {
  const note = (input.reviewNote ?? '').trim();
  if (note.length < 3) return { ok: false, error: 'یادداشت بررسی الزامی است.' };

  const [ob] = await db
    .select()
    .from(payroll_objections)
    .where(eq(payroll_objections.id, input.id))
    .limit(1);
  if (!ob) return { ok: false, error: 'اعتراض یافت نشد.' };
  if (ob.status !== 'OPEN') return { ok: false, error: 'این اعتراض قبلاً بررسی شده است.' };

  let reopened = 0;
  if (input.reopen) {
    // بازگشایی فقط برای فیش تأییدشده معنا دارد (DRAFT/MID_TERM_PAID از قبل باز است)
    const res = await returnStatement(ob.statementId, `بازگشایی از اعتراض #${ob.id}: ${note}`);
    if (!res.ok) return { ok: false, error: res.error };
    reopened = 1;
  }

  await db
    .update(payroll_objections)
    .set({
      status: input.decision,
      reviewNote: note,
      reviewedBy: input.reviewerUserId,
      reviewedAt: new Date(),
      reopenedStatement: reopened,
    })
    .where(eq(payroll_objections.id, input.id));

  await notifyStaff(
    ob.staffId,
    input.decision === 'RESOLVED' ? 'PAYROLL_OBJECTION_RESOLVED' : 'PAYROLL_OBJECTION_REJECTED',
    input.decision === 'RESOLVED'
      ? `اعتراض شما به فیش بررسی و ${reopened ? 'فیش برای اصلاح بازگشایی شد' : 'ثبت شد'}: ${note}`
      : `اعتراض شما به فیش وارد تشخیص داده نشد: ${note}`,
  );
  return { ok: true, id: ob.id };
}
