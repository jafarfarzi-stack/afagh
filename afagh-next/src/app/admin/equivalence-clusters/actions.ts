'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, isNull, ne, notInArray, or } from 'drizzle-orm';
import { db } from '@/db';
import { courses, equivalence_clusters } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { auditChain } from '@/lib/audit-chain';
import { getCurrentUniversity } from '@/lib/university-scope';

const ROLES = ['ADMIN', 'EDU_EXPERT', 'VICE_EDU'];
const PATH = '/admin/equivalence-clusters';
const ok = <T,>(data: T) => ({ ok: true as const, data });
const fail = (error: string) => ({ ok: false as const, error });

async function currentUniversityId(): Promise<number | null> {
  const university = await getCurrentUniversity().catch(() => null);
  return university?.id ?? null;
}

function visibleTo(universityId: number | null, scopeUniversityId: number | null): boolean {
  return universityId == null || scopeUniversityId == null || universityId === scopeUniversityId;
}

function parseTitle(raw: unknown): string | null {
  const title = typeof raw === 'string' ? raw.trim() : '';
  return title.length > 0 && title.length <= 100 ? title : null;
}

export async function createEquivalenceClusterAction(input: { clusterTitle: string; isGeneralService?: boolean }) {
  const me = await requireRole(ROLES);
  const universityId = await currentUniversityId();
  const clusterTitle = parseTitle(input.clusterTitle);
  if (!clusterTitle) return fail('عنوان خوشه الزامی است (حداکثر ۱۰۰ نویسه).');

  const scope = universityId == null
    ? isNull(equivalence_clusters.universityId)
    : or(eq(equivalence_clusters.universityId, universityId), isNull(equivalence_clusters.universityId));
  const [dup] = await db
    .select({ id: equivalence_clusters.id })
    .from(equivalence_clusters)
    .where(and(eq(equivalence_clusters.clusterTitle, clusterTitle), scope))
    .limit(1);
  if (dup) return fail('خوشه‌ای با همین عنوان از قبل وجود دارد.');

  const id = await db.transaction(async tx => {
    const [row] = await tx
      .insert(equivalence_clusters)
      .values({ clusterTitle, isGeneralService: input.isGeneralService ? 1 : 0, universityId })
      .returning({ id: equivalence_clusters.id });
    await auditChain(tx, me.id, 'EQUIV_CLUSTER_CREATED', 'equivalence_clusters', row.id, { clusterTitle });
    return row.id;
  });
  revalidatePath(PATH);
  revalidatePath('/admin/grade-status-codes');
  return ok({ id });
}

export async function updateEquivalenceClusterAction(
  id: number,
  input: { clusterTitle?: string; isGeneralService?: boolean },
) {
  const me = await requireRole(ROLES);
  const universityId = await currentUniversityId();
  const [cluster] = await db.select().from(equivalence_clusters).where(eq(equivalence_clusters.id, id)).limit(1);
  if (!cluster) return fail('خوشه یافت نشد.');
  if (!visibleTo(universityId, cluster.universityId)) return fail('این خوشه در دامنهٔ دانشگاه شما نیست.');

  const patch: { clusterTitle?: string; isGeneralService?: number } = {};
  if (input.clusterTitle !== undefined) {
    const clusterTitle = parseTitle(input.clusterTitle);
    if (!clusterTitle) return fail('عنوان خوشه الزامی است (حداکثر ۱۰۰ نویسه).');
    patch.clusterTitle = clusterTitle;
  }
  if (input.isGeneralService !== undefined) patch.isGeneralService = input.isGeneralService ? 1 : 0;
  if (Object.keys(patch).length === 0) return ok({ id });

  if (patch.clusterTitle) {
    const scope = universityId == null
      ? isNull(equivalence_clusters.universityId)
      : or(eq(equivalence_clusters.universityId, universityId), isNull(equivalence_clusters.universityId));
    const [dup] = await db
      .select({ id: equivalence_clusters.id })
      .from(equivalence_clusters)
      .where(and(eq(equivalence_clusters.clusterTitle, patch.clusterTitle), ne(equivalence_clusters.id, id), scope))
      .limit(1);
    if (dup) return fail('خوشه‌ای با همین عنوان از قبل وجود دارد.');
  }

  await db.transaction(async tx => {
    await tx.update(equivalence_clusters).set(patch).where(eq(equivalence_clusters.id, id));
    await auditChain(tx, me.id, 'EQUIV_CLUSTER_UPDATED', 'equivalence_clusters', id, patch);
  });
  revalidatePath(PATH);
  revalidatePath('/admin/grade-status-codes');
  return ok({ id });
}

export async function deleteEquivalenceClusterAction(id: number) {
  const me = await requireRole(ROLES);
  const universityId = await currentUniversityId();
  const [cluster] = await db.select().from(equivalence_clusters).where(eq(equivalence_clusters.id, id)).limit(1);
  if (!cluster) return fail('خوشه یافت نشد.');
  if (!visibleTo(universityId, cluster.universityId)) return fail('این خوشه در دامنهٔ دانشگاه شما نیست.');

  const detached = await db.transaction(async tx => {
    const removed = await tx
      .update(courses)
      .set({ clusterId: null })
      .where(eq(courses.clusterId, id))
      .returning({ id: courses.id });
    await tx.delete(equivalence_clusters).where(eq(equivalence_clusters.id, id));
    await auditChain(tx, me.id, 'EQUIV_CLUSTER_DELETED', 'equivalence_clusters', id, {
      clusterTitle: cluster.clusterTitle,
      detached: removed.length,
    });
    return removed.length;
  });
  revalidatePath(PATH);
  revalidatePath('/admin/grade-status-codes');
  return ok({ detached });
}

export async function setClusterMembersAction(clusterId: number, courseIds: number[]) {
  const me = await requireRole(ROLES);
  const universityId = await currentUniversityId();
  const [cluster] = await db
    .select({ id: equivalence_clusters.id, universityId: equivalence_clusters.universityId })
    .from(equivalence_clusters)
    .where(eq(equivalence_clusters.id, clusterId))
    .limit(1);
  if (!cluster) return fail('خوشه یافت نشد.');
  if (!visibleTo(universityId, cluster.universityId)) return fail('این خوشه در دامنهٔ دانشگاه شما نیست.');

  const ids = [...new Set(courseIds)].filter(n => Number.isInteger(n) && n > 0);
  if (ids.length > 0) {
    const where = universityId == null
      ? inArray(courses.id, ids)
      : and(inArray(courses.id, ids), eq(courses.universityId, universityId));
    const found = await db.select({ id: courses.id }).from(courses).where(where);
    if (found.length !== ids.length) return fail('برخی دروس انتخاب‌شده در دامنهٔ دانشگاه شما نیستند.');
  }

  await db.transaction(async tx => {
    const detachWhere = ids.length > 0
      ? and(eq(courses.clusterId, clusterId), notInArray(courses.id, ids))
      : eq(courses.clusterId, clusterId);
    await tx.update(courses).set({ clusterId: null }).where(
      universityId == null ? detachWhere : and(detachWhere, eq(courses.universityId, universityId)),
    );
    if (ids.length > 0) {
      await tx.update(courses).set({ clusterId }).where(inArray(courses.id, ids));
    }
    await auditChain(tx, me.id, 'EQUIV_CLUSTER_MEMBERS_SET', 'equivalence_clusters', clusterId, { courseIds: ids });
  });
  revalidatePath(PATH);
  revalidatePath('/admin/grade-status-codes');
  return ok({ count: ids.length });
}
