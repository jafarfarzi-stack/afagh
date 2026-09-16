import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/db';
import { equivalence_clusters } from '@/db/schema';
import { asc } from 'drizzle-orm';

const ALLOWED = ['ADMIN', 'EDU_EXPERT', 'VICE_EDU'];

export async function GET() {
  const user = await getSessionUser();
  if (!user || !user.roles.some(r => ALLOWED.includes(r))) {
    return NextResponse.json({ clusters: [] }, { status: 403 });
  }
  const rows = await db
    .select({ id: equivalence_clusters.id, clusterTitle: equivalence_clusters.clusterTitle })
    .from(equivalence_clusters)
    .orderBy(asc(equivalence_clusters.clusterTitle));
  return NextResponse.json({ clusters: rows });
}
