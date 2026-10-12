import { NextRequest, NextResponse } from 'next/server';
import { getSetting } from '@/lib/settings';
import { assertSameOrigin } from '@/lib/security';
import { purgeExpiredLinkTokens } from '@/lib/messenger-link-tokens';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'cron.link-purge' });
const SECRET_NAME = 'MSG_LINK_CRON_SECRET';

// پاکسازی روزانهٔ توکن‌های اتصال پیام‌رسان (مصرف‌شده یا منقضی بیش از یک روز).
// احراز هویت فقط با MSG_LINK_CRON_SECRET (ماشین‌به‌ماشین، بدون fallback).
// نمونهٔ crontab:  30 3 * * * curl -fsS -X POST -H "x-cron-secret: ***" http://localhost:8080/api/cron/messenger-link-purge
async function authorize(req: NextRequest): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  const secret = (await getSetting(SECRET_NAME)).trim();
  if (!secret) {
    log.warn('cron_secret_missing', { action: 'CRON_LINK_PURGE', hint: `${SECRET_NAME} تنظیم نشده (fail-closed).` });
    return { ok: false, res: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  }
  const provided = req.headers.get('x-cron-secret')?.trim() ?? '';
  if (provided === secret) return { ok: true };
  return { ok: false, res: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
}

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;
  const auth = await authorize(req);
  if (!auth.ok) return auth.res;

  const started = Date.now();
  const result = await purgeExpiredLinkTokens();
  log.info('cron_link_purge_done', { ...result, durationMs: Date.now() - started });
  return NextResponse.json({ ok: true, durationMs: Date.now() - started, ...result });
}

export async function GET(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;
  const auth = await authorize(req);
  if (!auth.ok) return auth.res;
  // فقط وضعیت — بدون هیچ پاکسازی یا نوشتن.
  return NextResponse.json({
    ok: true,
    dryRun: true,
    status: 'آماده',
    hint: 'اجرای واقعی پاکسازی فقط با POST انجام می‌شود.',
  });
}
