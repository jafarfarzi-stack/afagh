import { requireRole, getSessionUser } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { db } from '@/db';
import { desc, eq, like, or } from 'drizzle-orm';
import { academic_terms, staff, users } from '@/db/schema';
import {
  DECREE_STATUS_FA,
  deleteDraftDecree,
  finalizeDecree,
  getDecreeDetail,
  issueDecree,
  listDecrees,
} from '@/lib/payroll-decrees';
import DecreesClient from './DecreesClient';

export const dynamic = 'force-dynamic';

const READ = ['ADMIN', 'EDU_EXPERT', 'VICE_EDU', 'FINANCE'];
const WRITE = ['ADMIN', 'EDU_EXPERT'];

export default async function DecreesPage() {
  await requireRole([...READ]);
  const uni = await getCurrentUniversity().catch(() => null);
  const universityId = uni?.id ?? null;

  const terms = await db
    .select({ id: academic_terms.id, title: academic_terms.title, isCurrent: academic_terms.isCurrent })
    .from(academic_terms)
    .where(universityId == null ? undefined : eq(academic_terms.universityId, universityId))
    .orderBy(desc(academic_terms.sortOrder))
    .limit(20);
  const currentTermId = terms.find(t => Number(t.isCurrent) === 1)?.id ?? terms[0]?.id ?? null;

  const initial = currentTermId == null ? [] : await listDecrees(currentTermId, universityId);

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
    const list = await listDecrees(termId, u?.id ?? null);
    return {
      ok: true as const,
      list: list.map(d => ({
        ...d,
        issuedAt: d.issuedAt ? new Date(d.issuedAt).toISOString() : null,
        createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
      })),
    };
  }

  async function issueAction(staffId: number, termId: number, signers: { title: string; name: string }[]) {
    'use server';
    try {
      await requireRole([...WRITE]);
      const u = await getCurrentUniversity().catch(() => null);
      if (u?.id == null) return { ok: false as const, error: 'دانشگاه فعال مشخص نیست.' };
      const res = await issueDecree({ staffId, termId, universityId: u.id, signers });
      return res.ok
        ? { ok: true as const, id: res.id }
        : { ok: false as const, error: res.error };
    } catch (err) {
      return { ok: false as const, error: (err as Error)?.message || 'خطای ناشناخته' };
    }
  }

  async function detailAction(id: number) {
    'use server';
    await requireRole([...READ]);
    const d = await getDecreeDetail(id);
    if (!d) return { ok: false as const, error: 'ابلاغ یافت نشد.' };
    return {
      ok: true as const,
      decree: {
        ...d,
        issuedAt: d.issuedAt ? new Date(d.issuedAt).toISOString() : null,
        createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
      },
    };
  }

  async function finalizeAction(id: number) {
    'use server';
    try {
      await requireRole([...WRITE]);
      const res = await finalizeDecree(id);
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
      const res = await deleteDraftDecree(id);
      return res.ok
        ? { ok: true as const }
        : { ok: false as const, error: res.error };
    } catch (err) {
      return { ok: false as const, error: (err as Error)?.message || 'خطای ناشناخته' };
    }
  }

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <DecreesClient
        initial={initial.map(d => ({
          ...d,
          issuedAt: d.issuedAt ? new Date(d.issuedAt).toISOString() : null,
          createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
        }))}
        terms={terms.map(t => ({ id: t.id, title: t.title, isCurrent: Number(t.isCurrent ?? 0) === 1 }))}
        currentTermId={currentTermId}
        statusFa={DECREE_STATUS_FA}
        actions={{ searchStaffAction, listAction, issueAction, detailAction, finalizeAction, deleteAction }}
      />
    </div>
  );
}
