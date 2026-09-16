import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/db';
import { degree_level_configs } from '@/db/schema';
import { asc } from 'drizzle-orm';

const ALLOWED = ['ADMIN', 'EDU_EXPERT', 'VICE_EDU'];

export async function GET() {
  const user = await getSessionUser();
  if (!user || !user.roles.some(r => ALLOWED.includes(r))) {
    return NextResponse.json({ degreeLevels: [] }, { status: 403 });
  }
  const rows = await db
    .select({ id: degree_level_configs.id, title: degree_level_configs.title })
    .from(degree_level_configs)
    .orderBy(asc(degree_level_configs.title));
  return NextResponse.json({ degreeLevels: rows });
}
