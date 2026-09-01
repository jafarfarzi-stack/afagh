import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { db } from '@/db';
import { migration_runs } from '@/db/schema';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getSessionUser();
  if (!user || !user.roles.includes('ADMIN')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const rows = await db.select().from(migration_runs).orderBy(desc(migration_runs.id)).limit(30);
  return NextResponse.json(rows.map(r => ({
    id: r.id, entity: r.entity, fileName: r.fileName, mode: r.mode, status: r.status,
    total: r.totalRows, inserted: r.inserted, existing: r.skippedExisting, invalid: r.invalid,
    at: r.executedAt,
  })));
}
