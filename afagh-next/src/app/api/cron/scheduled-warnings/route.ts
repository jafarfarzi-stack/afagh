import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSetting } from '@/lib/settings';
import { assertSameOrigin } from '@/lib/security';
import { runPendingWarnings } from '@/lib/scheduled-warnings';
import { createLogger } from '@/lib/logger';
import { clientIp, guardedRateLimit } from '@/lib/rateLimit';
import { db } from '@/db';
import { appendAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'cron.scheduled-warnings' });
const ACTION = 'CRON_SCHED_WARNINGS';

// ارسال هشدارهای زمان‌بندی‌شدهٔ دانشجو در موعد مقرر — روی همهٔ کانال‌های
// فعال (داخل‌پورتال، پیامک، تلگرام/بله/ایتا/سروش/ای‌گپ).
// فراخوانی فقط ماشین‌به‌ماشین: هدر x-cron-secret برابر SCHED_WARN_CRON_SECRET.
// GET فقط وضعیت است (بدون اثر جانبی)؛ اجرای واقعی فقط با POST.
// مقایسهٔ هدر با کلید ثابت‌زمان است (الگوی checkWebhookSecret در /api/telegram/webhook).
function secretMatches(header: string | null, expected: string): boolean {
  const provided = header?.trim() ?? '';
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

async function authorize(req: NextRequest): Promise<{ ok: true; actorUserId: number | null } | { ok: false; res: NextResponse }> {
  const rl = await guardedRateLimit(`cron:schedwarn:${await clientIp()}`, 30, 60);
  if (!rl.ok) return { ok: false, res: NextResponse.json({ ok: false, error: rl.error }, { status: 429 }) };
  const secret = (await getSetting('SCHED_WARN_CRON_SECRET')).trim();
  if (!secret) {
    log.warn('cron_secret_missing', { action: ACTION, hint: 'SCHED_WARN_CRON_SECRET تنظیم نشده (fail-closed).' });
    return { ok: false, res: NextResponse.json({ ok: false, error: 'دسترسی غیرمجاز است. کلید کرون معتبر نیست.' }, { status: 401 }) };
  }
  if (!secretMatches(req.headers.get('x-cron-secret'), secret)) {
    return { ok: false, res: NextResponse.json({ ok: false, error: 'دسترسی غیرمجاز است. کلید کرون معتبر نیست.' }, { status: 401 }) };
  }
  return { ok: true, actorUserId: null };
}

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
    const result = await runPendingWarnings();
    const durationMs = Date.now() - started;
    log.info('cron_sched_warnings', { ...result, durationMs });
    await auditCron(auth.actorUserId, { durationMs, ...result });
    return NextResponse.json({ ok: true, durationMs, ...result });
  } catch (e) {
    log.error('cron_sched_warnings_failed', { error: (e as Error)?.message });
    return NextResponse.json({ ok: false, error: 'ارسال هشدارهای زمان‌بندی‌شده ناموفق بود؛ دوباره تلاش کنید.' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;
  const auth = await authorize(req);
  if (!auth.ok) return auth.res;
  log.info('cron_sched_warnings_status', { dryRun: true });
  return NextResponse.json({
    ok: true,
    dryRun: true,
    status: 'آماده',
    hint: 'اجرای واقعی ارسال هشدارها فقط با POST انجام می‌شود.',
  });
}
