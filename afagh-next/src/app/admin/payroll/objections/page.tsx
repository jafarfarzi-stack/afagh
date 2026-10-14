import { requireRole, getSessionUser } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { db } from '@/db';
import { and, desc, eq } from 'drizzle-orm';
import { academic_terms, payroll_statements, staff, users } from '@/db/schema';
import { payroll_objections } from '@/db/schema-payroll-plus';
import {
  OBJECTION_STATUS_FA,
  listOpenObjections,
  reviewObjection,
} from '@/lib/payroll-objections';
import ObjectionsClient from './ObjectionsClient';

export const dynamic = 'force-dynamic';

export default async function ObjectionsPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU', 'FINANCE']);
  const uni = await getCurrentUniversity().catch(() => null);
  const universityId = uni?.id ?? null;

  const open = await listOpenObjections(universityId);

  const historyRows = await db
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
      staffCode: staff.staffCode,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(payroll_objections)
    .innerJoin(payroll_statements, eq(payroll_statements.id, payroll_objections.statementId))
    .innerJoin(academic_terms, eq(academic_terms.id, payroll_objections.termId))
    .innerJoin(staff, eq(staff.id, payroll_objections.staffId))
    .innerJoin(users, eq(users.id, staff.userId))
    .where(universityId != null ? eq(payroll_objections.universityId, universityId) : undefined)
    .orderBy(desc(payroll_objections.createdAt))
    .limit(100);

  async function reviewAction(id: number, decision: 'RESOLVED' | 'REJECTED', reviewNote: string, reopen: boolean) {
    'use server';
    try {
      await requireRole(['ADMIN', 'EDU_EXPERT', 'FINANCE']);
      const user = await getSessionUser();
      if (!user) return { ok: false as const, error: 'وارد شوید.' };
      const res = await reviewObjection({ id, decision, reviewNote, reopen, reviewerUserId: user.id });
      return res.ok
        ? { ok: true as const }
        : { ok: false as const, error: res.error };
    } catch (err) {
      return { ok: false as const, error: (err as Error)?.message || 'خطای ناشناخته' };
    }
  }

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <ObjectionsClient
        initialOpen={open.map(o => ({
          ...o,
          createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : null,
          grossAmount: o.grossAmount ?? null,
        }))}
        initialHistory={historyRows.map(h => ({
          ...h,
          reopenedStatement: Number(h.reopenedStatement ?? 0),
          createdAt: h.createdAt ? new Date(h.createdAt).toISOString() : null,
          staffName: `${h.firstName ?? ''} ${h.lastName ?? ''}`.trim() || '—',
        }))}
        statusFa={OBJECTION_STATUS_FA}
        actions={{ reviewAction }}
      />
    </div>
  );
}
