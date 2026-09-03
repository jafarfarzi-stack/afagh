import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getSetting } from '@/lib/settings';
import { assertSameOrigin } from '@/lib/security';
import { runChequeReminderScan } from '@/lib/finance-engine';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'cron.cheques' });

// پویش زمان‌بندی‌شدهٔ یادآوری چک — پیش از سررسید به دانشجو پیام می‌رود.
// دو راه فراخوانی: هدر x-cron-secret برابر تنظیم FINANCE_CRON_SECRET، یا نشست ادمین.
// نمونهٔ crontab:  0 8 * * * curl -fsS -X POST -H "x-cron-secret: ***" http://localhost:8080/api/cron/cheque-reminders
export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;
  const secret = (await getSetting('FINANCE_CRON_SECRET')).trim();
  const provided = req.headers.get('x-cron-secret')?.trim() ?? '';
  let authorized = !!secret && provided === secret;

  if (!authorized) {
    const user = await getSessionUser();
    authorized = !!user?.roles.includes('ADMIN');
  }
  if (!authorized) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const started = Date.now();
  const result = await runChequeReminderScan({ dryRun: req.nextUrl.searchParams.get('dryRun') === '1' });
  log.info('cron_cheque_reminders', { ...result, durationMs: Date.now() - started });
  return NextResponse.json({ ok: true, durationMs: Date.now() - started, ...result });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
