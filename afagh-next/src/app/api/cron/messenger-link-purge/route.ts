import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSetting } from '@/lib/settings';
import { assertSameOrigin } from '@/lib/security';
import { purgeExpiredLinkTokens } from '@/lib/messenger-link-tokens';
import { createLogger } from '@/lib/logger';
import { clientIp, guardedRateLimit } from '@/lib/rateLimit';
import { db } from '@/db';
import { appendAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'cron.link-purge' });
const ACTION = 'CRON_LINK_PURGE';
const SECRET_NAME = 'MSG_LINK_CRON_SECRET';

// پاکسازی روزانهٔ توکن‌های اتصال پیام‌رسان (مصرف‌شده یا منقضی بیش از یک روز).
// احراز هویت فقط با MSG_LINK_CRON_SECRET (ماشین‌به‌ماشین، بدون fallback).
// نمونهٔ crontab:  30 3 * * * curl -fsS -X POST -H "x-cron-secret: ***" http://localhost:8080/api/cron/messenger-link-purge
// GET فقط وضعیت است؛ اجرای واقعی پاکسازی فقط با POST.
// مقایسهٔ هدر با کلید ثابت‌زمان است (الگوی checkWebhookSecret در /api/telegram/webhook).
function secretMatches(header: string | null, expected: string): boolean {
  const provided = header?.trim() ?? '';
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

async function authorize(req: NextRequest): Promise<{ ok: true; actorUserId: number | null } | { ok: false; res: NextResponse }> {
  const rl = await guardedRateLimit(`cron:msglinkpurge:${await clientIp()}`, 30, 60);
  if (!rl.ok) return { ok: false, res: NextResponse.json({ ok: false, error: rl.error }, { status: 429 }) };
  const secret = (await getSetting(SECRET_NAME)).trim();
  if (!secret) {
    log.warn('cron_secret_missing', { action: ACTION, hint: `${SECRET_NAME} تنظیم نشده (fail-closed).` });
    return { ok: false, res: NextResponse.json({ ok: false, error: 'دسترسی غیرمجاز است. کلید کرون معتبر نیست.' }, { status: 401 }) };
  }
  if (!secretMatches(req.headers.get('x-cron-secret'), secret)) {
    return { ok: false, res: NextResponse.json({ ok: false, error: 'دسترسی غیرمجاز است. کلید کرون معتبر نیست.' }, { status: 401 }) };
  }
  return { ok: true, actorUserId: null };
}

/** ثبت ممیزی فراخوان موفق — بهترین تلاش؛ خرابی ممیزی هرگز خودِ کرون را نمی‌خواباند. */
async function auditCron(actorUserId: number | null, details: Record<string, unknown>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await appendAudit(tx, { actorUserId, action: ACTION, entityType: 'cron', details: JSON.stringify(details) });
    });
  } catch (e) {
    log.warn('cron_audit_failed', { action: ACTION, error: (e as Error)?.message });
  }
}

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;
  const auth = await authorize(req);
  if (!auth.ok) return auth.res;

  const started = Date.now();
  try {
    const result = await purgeExpiredLinkTokens();
    const durationMs = Date.now() - started;
    log.info('cron_link_purge_done', { ...result, durationMs });
    await auditCron(auth.actorUserId, { durationMs, ...result });
    return NextResponse.json({ ok: true, durationMs, ...result });
  } catch (e) {
    log.error('cron_link_purge_failed', { error: (e as Error)?.message });
    return NextResponse.json({ ok: false, error: 'پاکسازی لینک‌های پیام‌رسان ناموفق بود؛ دوباره تلاش کنید.' }, { status: 500 });
  }
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