import { requireRole, getSessionUser } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { db } from '@/db';
import { desc, eq, like, or } from 'drizzle-orm';
import { academic_terms, staff, users } from '@/db/schema';
import {
  addDraw,
  createSupervision,
  deleteDraw,
  deleteSupervision,
  listDraws,
  listSupervisions,
  setSupervisionStatus,
} from '@/lib/thesis-ledger';
import ThesisClient from './ThesisClient';

export const dynamic = 'force-dynamic';

const READ = ['ADMIN', 'EDU_EXPERT', 'VICE_EDU', 'FINANCE'];
const WRITE = ['ADMIN', 'EDU_EXPERT'];

export default async function ThesisPage() {
  await requireRole([...READ]);
  const uni = await getCurrentUniversity().catch(() => null);
  const universityId = uni?.id ?? null;

  const supervisions = await listSupervisions(universityId);
  const terms = await db
    .select({ id: academic_terms.id, title: academic_terms.title, isCurrent: academic_terms.isCurrent })
    .from(academic_terms)
    .where(universityId == null ? undefined : eq(academic_terms.universityId, universityId))
    .orderBy(desc(academic_terms.sortOrder))
    .limit(20);
  const currentTermId = terms.find(t => Number(t.isCurrent) === 1)?.id ?? terms[0]?.id ?? null;

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

  async function createAction(input: {
    staffId: number; studentId: number | null; studentNameManual: string | null;
    title: string; totalUnits: number; role: string; startTermId: number | null;
  }) {
    'use server';
    try {
      await requireRole([...WRITE]);
      const user = await getSessionUser();
      const u = await getCurrentUniversity().catch(() => null);
      const res = await createSupervision({
        ...input,
        createdBy: user?.id ?? null,
        universityId: u?.id ?? null,
      });
      return res.ok
        ? { ok: true as const, id: res.id }
        : { ok: false as const, error: res.error };
    } catch (err) {
      return { ok: false as const, error: (err as Error)?.message || 'خطای ناشناخته' };
    }
  }

  async function statusAction(id: number, status: string) {
    'use server';
    try {
      await requireRole([...WRITE]);
      const res = await setSupervisionStatus(id, status);
      return res.ok
        ? { ok: true as const }
        : { ok: false as const, error: res.error };
    } catch (err) {
      return { ok: false as const, error: (err as Error)?.message || 'خطای ناشناخته' };
    }
  }

  async function deleteAction(id: number) {
    'use server';
    try {
      await requireRole([...WRITE]);
      const res = await deleteSupervision(id);
      return res.ok
        ? { ok: true as const }
        : { ok: false as const, error: res.error };
    } catch (err) {
      return { ok: false as const, error: (err as Error)?.message || 'خطای ناشناخته' };
    }
  }

  async function drawsAction(supervisionId: number) {
    'use server';
    await requireRole([...READ]);
    const draws = await listDraws(supervisionId);
    return {
      ok: true as const,
      draws: draws.map(d => ({ ...d, createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null })),
    };
  }

  async function addDrawAction(supervisionId: number, termId: number, units: number, note: string | null) {
    'use server';
    try {
      await requireRole([...WRITE]);
      const user = await getSessionUser();
      const u = await getCurrentUniversity().catch(() => null);
      const res = await addDraw({
        supervisionId, termId, units, note,
        createdBy: user?.id ?? null,
        universityId: u?.id ?? null,
      });
      return res.ok
        ? { ok: true as const, id: res.id }
        : { ok: false as const, error: res.error };
    } catch (err) {
      return { ok: false as const, error: (err as Error)?.message || 'خطای ناشناخته' };
    }
  }

  async function deleteDrawAction(id: number) {
    'use server';
    try {
      await requireRole([...WRITE]);
      const res = await deleteDraw(id);
      return res.ok
        ? { ok: true as const }
        : { ok: false as const, error: res.error };
    } catch (err) {
      return { ok: false as const, error: (err as Error)?.message || 'خطای ناشناخته' };
    }
  }

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <ThesisClient
        initial={supervisions.map(s => ({ ...s, createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : null }))}
        terms={terms.map(t => ({ id: t.id, title: t.title, isCurrent: Number(t.isCurrent ?? 0) === 1 }))}
        currentTermId={currentTermId}
        actions={{
          searchStaffAction, createAction, statusAction, deleteAction,
          drawsAction, addDrawAction, deleteDrawAction,
        }}
      />
    </div>
  );
}
