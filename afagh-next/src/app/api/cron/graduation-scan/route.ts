import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getSetting } from '@/lib/settings';
import { runGraduationScan } from '@/lib/graduation-engine';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'cron.graduation' });

// پویش زمان‌بندی‌شدهٔ فارغ‌التحصیلی.
// دو راه فراخوانی: هدر x-cron-secret برابر تنظیم GRAD_CRON_SECRET، یا نشست ادمین.
// نمونهٔ crontab:  0 3 * * * curl -fsS -X POST -H "x-cron-secret: ***" http://localhost:8080/api/cron/graduation-scan
export async function POST(req: NextRequest) {
  const secret = (await getSetting('GRAD_CRON_SECRET')).trim();
  const provided = req.headers.get('x-cron-secret')?.trim() ?? '';
  let authorized = !!secret && provided === secret;

  if (!authorized) {
    const user = await getSessionUser();
    authorized = !!user?.roles.includes('ADMIN');
  }
  if (!authorized) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const started = Date.now();
  const result = await runGraduationScan({ force: req.nextUrl.searchParams.get('force') === '1' });
  log.info('cron_scan_done', { ...result, durationMs: Date.now() - started });
  return NextResponse.json({ ok: true, durationMs: Date.now() - started, ...result });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
