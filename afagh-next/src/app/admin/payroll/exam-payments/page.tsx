import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { db } from '@/db';
import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { academic_terms, staff, users } from '@/db/schema';
import { pickEffectiveTerm } from '@/lib/term-scope';
import { exam_payments } from '@/db/schema-payroll-plus';
import ExamPaymentsClient from './ExamPaymentsClient';

export const dynamic = 'force-dynamic';

const READ = ['ADMIN', 'EDU_EXPERT', 'VICE_EDU', 'FINANCE'];
const WRITE = ['ADMIN', 'EDU_EXPERT'];

type NotReadyRow = { staffId: number; staffCode: string | null; name: string; pending: number; payments: number };

/**
 * استادانی که اوراقشان به بایگانی برنگشته (شرط پرداخت حقالزحمهٔ تصحیح برقرار نیست)
 * بههمراه تعداد پرداختهای ثبتشدهٔ همان ترم، برای هشدار آمادگی پرداخت.
 */
async function notReadyForTerm(termId: number): Promise<NotReadyRow[]> {
  const res = await db.execute(sql`
    select st.id as "staffId", st."staffCode", (u."firstName" || ' ' || u."lastName") as name,
           count(*)::int as pending,
           coalesce((select count(*) from exam_payments ep where ep."staffId" = st.id and ep."termId" = ${termId}), 0)::int as payments
      from instructor_deliveries d
      join course_offerings o on o.id = d."courseOfferingId"
      join staff st on st.id = d."instructorId"
      left join users u on u.id = st."userId"
     where o."termId" = ${termId}
       and coalesce(d."papersReturnedToArchive", 0) = 0
     group by st.id, st."staffCode", u."firstName", u."lastName"
     order by pending desc
     limit 20
  `);
  return (res.rows ?? []) as unknown as NotReadyRow[];
}

export default async function ExamPaymentsPage() {
  await requireRole([...READ]);
  const uni = await getCurrentUniversity().catch(() => null);
  const universityId = uni?.id ?? null;

  const terms = await db
    .select({
      id: academic_terms.id,
      title: academic_terms.title,
      isCurrent: academic_terms.isCurrent,
      startDate: academic_terms.startDate,
      endDate: academic_terms.endDate,
    })
    .from(academic_terms)
    .where(universityId == null ? undefined : eq(academic_terms.universityId, universityId))
    .orderBy(desc(academic_terms.sortOrder))
    .limit(30);
  // نیمسال فعال تاریخ‌محور (پرچم isCurrent ممکن است روی ترم‌های کهنه مانده باشد)
  const currentTermId = pickEffectiveTerm(terms)?.id ?? terms.find(t => Number(t.isCurrent) === 1)?.id ?? terms[0]?.id ?? null;

  const rows = currentTermId == null ? [] : await db
    .select({
      id: exam_payments.id,
      staffId: exam_payments.staffId,
      termId: exam_payments.termId,
      source: exam_payments.source,
      sessionCount: exam_payments.sessionCount,
      unitCount: exam_payments.unitCount,
      amount: exam_payments.amount,
      decreeId: exam_payments.decreeId,
      createdAt: exam_payments.createdAt,
      staffCode: staff.staffCode,
      firstName: users.firstName,
      lastName: users.lastName,
      // شرط پرداخت: همهٔ اوراق امتحان این استاد باید به بایگانی برگشته باشد.
      // (نام ستون بیرونی صریح است تا با staff."staffId" مبهم نشود.)
      archiveDeliveries: sql<number>`(select count(*) from instructor_deliveries d join course_offerings o on o.id = d."courseOfferingId" where d."instructorId" = "exam_payments"."staffId" and o."termId" = ${currentTermId})::int`,
      archivePending: sql<number>`(select count(*) from instructor_deliveries d join course_offerings o on o.id = d."courseOfferingId" where d."instructorId" = "exam_payments"."staffId" and o."termId" = ${currentTermId} and coalesce(d."papersReturnedToArchive", 0) = 0)::int`,
    })
    .from(exam_payments)
    .innerJoin(staff, eq(staff.id, exam_payments.staffId))
    .innerJoin(users, eq(users.id, staff.userId))
    .where(and(
      eq(exam_payments.termId, currentTermId),
      universityId == null ? undefined : eq(exam_payments.universityId, universityId),
    ))
    .orderBy(desc(exam_payments.createdAt))
    .limit(200);

  // استادانی که اوراقشان به بایگانی برنگشته (شرط پرداخت برقرار نیست)
  const notReady = currentTermId == null ? [] : await notReadyForTerm(currentTermId);

  async function searchStaffAction(q: string) {
    'use server';
    await requireRole([...READ]);
    const needle = `%${q.trim()}%`;
    if (q.trim().length < 2) return { ok: false as const, error: 'حداقل ۲ نویسه جست‌وجو کنید.' };
    const found = await db
      .select({ id: staff.id, staffCode: staff.staffCode, firstName: users.firstName, lastName: users.lastName })
      .from(staff)
      .innerJoin(users, eq(users.id, staff.userId))
      .where(or(like(staff.staffCode, needle), like(users.firstName, needle), like(users.lastName, needle)))
      .limit(20);
    return {
      ok: true as const,
      list: found.map(r => ({
        id: r.id, staffCode: r.staffCode,
        name: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim(),
      })),
    };
  }

  async function listAction(termId: number) {
    'use server';
    await requireRole([...READ]);
    const u = await getCurrentUniversity().catch(() => null);
    const uid = u?.id ?? null;
    const list = await db
      .select({
        id: exam_payments.id,
        staffId: exam_payments.staffId,
        termId: exam_payments.termId,
        source: exam_payments.source,
        sessionCount: exam_payments.sessionCount,
        unitCount: exam_payments.unitCount,
        amount: exam_payments.amount,
        decreeId: exam_payments.decreeId,
        createdAt: exam_payments.createdAt,
        staffCode: staff.staffCode,
        firstName: users.firstName,
        lastName: users.lastName,
        // شرط پرداخت: بازگشت اوراق به بایگانی (نام ستون بیرونی صریح تا مبهم نشود)
        archiveDeliveries: sql<number>`(select count(*) from instructor_deliveries d join course_offerings o on o.id = d."courseOfferingId" where d."instructorId" = "exam_payments"."staffId" and o."termId" = ${termId})::int`,
        archivePending: sql<number>`(select count(*) from instructor_deliveries d join course_offerings o on o.id = d."courseOfferingId" where d."instructorId" = "exam_payments"."staffId" and o."termId" = ${termId} and coalesce(d."papersReturnedToArchive", 0) = 0)::int`,
      })
      .from(exam_payments)
      .innerJoin(staff, eq(staff.id, exam_payments.staffId))
      .innerJoin(users, eq(users.id, staff.userId))
      .where(and(
        eq(exam_payments.termId, termId),
        uid == null ? undefined : eq(exam_payments.universityId, uid),
      ))
      .orderBy(desc(exam_payments.createdAt))
      .limit(200);
    return {
      ok: true as const,
      list: list.map(r => ({
        ...r,
        unitCount: Number(r.unitCount ?? 0),
        staffName: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || '—',
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      })),
      notReady: await notReadyForTerm(termId),
    };
  }

  async function createAction(input: {
    staffId: number; termId: number; source: string;
    sessionCount: number; unitCount: number; amount: number;
  }) {
    'use server';
    try {
      await requireRole([...WRITE]);
      const u = await getCurrentUniversity().catch(() => null);
      if (!['INVIGILATION', 'CORRECTION', 'EXEC'].includes(input.source)) {
        return { ok: false as const, error: 'منبع نامعتبر است.' };
      }
      if (!(input.amount >= 0)) return { ok: false as const, error: 'مبلغ نامعتبر است.' };
      const [row] = await db
        .insert(exam_payments)
        .values({
          staffId: input.staffId,
          termId: input.termId,
          source: input.source,
          sessionCount: Math.max(0, Math.round(input.sessionCount)),
          unitCount: String(Math.max(0, input.unitCount)),
          amount: Math.round(input.amount),
          universityId: u?.id ?? null,
        })
        .returning({ id: exam_payments.id });
      return { ok: true as const, id: row.id };
    } catch (err) {
      return { ok: false as const, error: (err as Error)?.message || 'خطای ناشناخته' };
    }
  }

  async function deleteAction(id: number) {
    'use server';
    try {
      await requireRole([...WRITE]);
      await db.delete(exam_payments).where(eq(exam_payments.id, id));
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: (err as Error)?.message || 'خطای ناشناخته' };
    }
  }

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <ExamPaymentsClient
        initial={rows.map(r => ({
          ...r,
          unitCount: Number(r.unitCount ?? 0),
          staffName: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || '—',
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
        }))}
        terms={terms.map(t => ({ id: t.id, title: t.title, isCurrent: Number(t.isCurrent ?? 0) === 1 }))}
        currentTermId={currentTermId}
        notReady={notReady}
        actions={{ searchStaffAction, listAction, createAction, deleteAction }}
      />
    </div>
  );
}
