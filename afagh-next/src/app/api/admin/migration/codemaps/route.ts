import { NextRequest, NextResponse } from 'next/server';
import { listMaps, mappingStats, targetOptions, type MapDomain } from '@/lib/migration/codemap';
import { requireMigrationAdmin } from '@/lib/migration/http';

export const dynamic = 'force-dynamic';

/** فهرست نگاشت‌های یک دامنه + گزینه‌های مقصد + آمار کلی */
export async function GET(req: NextRequest) {
  const auth = await requireMigrationAdmin();
  if ('res' in auth) return auth.res;

  const q = req.nextUrl.searchParams;
  const sourceCode = (q.get('sourceCode') || 'LEGACY').toUpperCase();
  const domain = (q.get('domain') || 'MAJOR') as MapDomain;

  const [maps, options, stats] = await Promise.all([
    listMaps(sourceCode, domain),
    targetOptions(domain),
    mappingStats(sourceCode),
  ]);
  return NextResponse.json({ maps, options, stats });
}
