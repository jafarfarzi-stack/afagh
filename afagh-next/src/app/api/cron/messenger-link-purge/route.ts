import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getSetting } from '@/lib/settings';
import { assertSameOrigin } from '@/lib/security';
import { purgeExpiredLinkTokens } from '@/lib/messenger-link-tokens';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'cron.link-purge' });

// پاکسازی روزانهٔ توکن‌های اتصال پیام‌رسان (مصرف‌شده یا منقضی بیش از یک روز).
// دو راه فراخوانی: هدر x-cron-secret برابر تنظیم MSG_LINK_CRON_SECRET
// (با fallback به GRAD_CRON_SECRET برای سازگاری)، یا نشست ادمین.
// نمونهٔ crontab:  30 3 * * * curl -fsS -X POST -H "x-cron-secret: ***" http://localhost:8080/api/cron/messenger-link-purge
export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;
  const [ownSecret, gradSecret] = await Promise.all([getSetting('MSG_LINK_CRON_SECRET'), getSetting('GRAD_CRON_SECRET')]);
  const provided = req.headers.get('x-cron-secret')?.trim() ?? '';
  let authorized = !!provided && (provided === ownSecret.trim() || (!!gradSecret.trim() && provided === gradSecret.trim()));

  if (!authorized) {
    const user = await getSessionUser();
    authorized = !!user?.roles.includes('ADMIN');
  }
  if (!authorized) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const started = Date.now();
  const result = await purgeExpiredLinkTokens();
  log.info('cron_link_purge_done', { ...result, durationMs: Date.now() - started });
  return NextResponse.json({ ok: true, durationMs: Date.now() - started, ...result });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
