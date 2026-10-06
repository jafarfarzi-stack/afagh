import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/db';
import { equivalence_clusters } from '@/db/schema';
import { asc, eq, or, isNull } from 'drizzle-orm';
import { getCurrentUniversity } from '@/lib/university-scope';

const ALLOWED = ['ADMIN', 'EDU_EXPERT', 'VICE_EDU'];

export async function GET() {
  const user = await getSessionUser();
  if (!user || !user.roles.some(r => ALLOWED.includes(r))) {
    return NextResponse.json({ clusters: [] }, { status: 403 });
  }
  const uni = await getCurrentUniversity().catch(() => null);
  const uw = uni ? or(eq(equivalence_clusters.universityId, uni.id), isNull(equivalence_clusters.universityId)) : undefined;
  const rows = await db
    .select({ id: equivalence_clusters.id, clusterTitle: equivalence_clusters.clusterTitle })
    .from(equivalence_clusters)
    .where(uw)
    .orderBy(asc(equivalence_clusters.clusterTitle));
  return NextResponse.json({ clusters: rows });
}
