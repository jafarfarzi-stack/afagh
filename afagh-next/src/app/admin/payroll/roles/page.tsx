import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { db } from '@/db';
import { academic_terms, professor_term_contracts, staff, users } from '@/db/schema';
import { and, desc, eq, like, or } from 'drizzle-orm';
import {
  assignStaffTermRole,
  computeEffectiveDuty,
  createDutyRole,
  deleteDutyRole,
  listDutyRoles,
  listStaffTermRoles,
  unassignStaffTermRole,
  updateDutyRole,
} from '@/lib/payroll-roles';
import RolesClient from './RolesClient';

export const dynamic = 'force-dynamic';

/**
 * مدیریت سمت‌های موظفی + انتساب ترمی (مهاجرت 0056).
 * اعداد موظفی/کسر پیش‌فرض‌اند — مدیر مالی باید با تأیید مالی دانشگاه اصلاحشان کند.
 */
export default async function PayrollRolesPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'FINANCE_EXPERT', 'FINANCE']);
  const currentUniversity = await getCurrentUniversity();
  const universityId = currentUniversity?.id ?? null;

  const terms = await db
    .select({
      id: academic_terms.id,
      title: academic_terms.title,
      termCode: academic_terms.termCode,
      isCurrent: academic_terms.isCurrent,
    })
    .from(academic_terms)
    .where(universityId == null ? undefined : eq(academic_terms.universityId, universityId))
    .orderBy(desc(academic_terms.sortOrder));
  const currentTermId = terms.find(t => Number(t.isCurrent) === 1)?.id ?? terms[0]?.id ?? null;
  const initialRoles = await listDutyRoles(universityId);

  async function searchStaffAction(q: string) {
    'use server';
    await requireRole(['ADMIN', 'EDU_EXPERT', 'FINANCE_EXPERT', 'FINANCE']);
    const needle = `%${q.trim()}%`;
    if (q.trim().length < 2) return { ok: false as const, error: 'حداقل ۲ نویسه جست‌وجو کنید.' };
    const rows = await db
      .select({
        id: staff.id,
        staffCode: staff.staffCode,
        academicRank: staff.academicRank,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(staff)
      .innerJoin(users, eq(users.id, staff.userId))
      .where(or(like(staff.staffCode, needle), like(users.firstName, needle), like(users.lastName, needle)))
      .limit(20);
    return {
      ok: true as const,
      list: rows.map(r => ({
        id: r.id,
        staffCode: r.staffCode,
        name: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim(),
        rank: r.academicRank,
      })),
    };
  }

  async function assignmentsAction(staffId: number, termId: number) {
    'use server';
    await requireRole(['ADMIN', 'EDU_EXPERT', 'FINANCE_EXPERT', 'FINANCE']);
    const assigned = await listStaffTermRoles(staffId, termId);
    const [contract] = await db.select({ baseDutyUnits: professor_term_contracts.baseDutyUnits })
      .from(professor_term_contracts)
      .where(and(
        eq(professor_term_contracts.staffId, staffId),
        eq(professor_term_contracts.termId, termId),
      )).limit(1);
    return {
      ok: true as const,
      assigned,
      effectiveDuty: computeEffectiveDuty(assigned),
      fallbackDuty: contract?.baseDutyUnits == null ? 0 : Number(contract.baseDutyUnits),
    };
  }

  async function createRoleAction(input: {
    code: string; title: string; dutyUnits: number | null;
    reductionUnits: number; isTeaching: boolean; sortOrder: number;
  }) {
    'use server';
    try {
      await requireRole(['ADMIN']);
      const uni = await getCurrentUniversity();
      const row = await createDutyRole({ ...input, universityId: uni?.id ?? null });
      return {
        ok: true as const,
        role: {
          id: row.id, code: row.code, title: row.title,
          dutyUnits: row.dutyUnits == null ? null : Number(row.dutyUnits),
          reductionUnits: Number(row.reductionUnits ?? 0),
          isTeaching: Number(row.isTeaching ?? 0) === 1,
          sortOrder: Number(row.sortOrder ?? 0),
        },
      };
    } catch (err) {
      return { ok: false as const, error: (err as Error)?.message || 'خطای ناشناخته' };
    }
  }

  async function updateRoleAction(
    id: number,
    patch: { title: string; dutyUnits: number | null; reductionUnits: number; isTeaching: boolean; sortOrder: number },
  ) {
    'use server';
    try {
      await requireRole(['ADMIN']);
      const uni = await getCurrentUniversity();
      await updateDutyRole(id, uni?.id ?? null, patch);
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: (err as Error)?.message || 'خطای ناشناخته' };
    }
  }

  async function deleteRoleAction(id: number) {
    'use server';
    try {
      await requireRole(['ADMIN']);
      const uni = await getCurrentUniversity();
      await deleteDutyRole(id, uni?.id ?? null);
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: (err as Error)?.message || 'خطای ناشناخته' };
    }
  }

  async function assignRoleAction(staffId: number, termId: number, roleId: number, isPrimary: boolean) {
    'use server';
    try {
      await requireRole(['ADMIN', 'EDU_EXPERT']);
      await assignStaffTermRole(staffId, termId, roleId, isPrimary);
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: (err as Error)?.message || 'خطای ناشناخته' };
    }
  }

  async function unassignRoleAction(assignmentId: number) {
    'use server';
    try {
      await requireRole(['ADMIN', 'EDU_EXPERT']);
      await unassignStaffTermRole(assignmentId);
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: (err as Error)?.message || 'خطای ناشناخته' };
    }
  }

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <RolesClient
        initialRoles={initialRoles.map(r => ({
          id: r.id,
          code: r.code,
          title: r.title,
          dutyUnits: r.dutyUnits == null ? null : Number(r.dutyUnits),
          reductionUnits: Number(r.reductionUnits ?? 0),
          isTeaching: Number(r.isTeaching ?? 0) === 1,
          sortOrder: Number(r.sortOrder ?? 0),
        }))}
        terms={terms.map(t => ({
          id: t.id,
          title: t.title,
          termCode: t.termCode,
          isCurrent: Number(t.isCurrent ?? 0) === 1,
        }))}
        currentTermId={currentTermId}
        actions={{
          searchStaffAction,
          assignmentsAction,
          createRoleAction,
          updateRoleAction,
          deleteRoleAction,
          assignRoleAction,
          unassignRoleAction,
        }}
      />
    </div>
  );
}
