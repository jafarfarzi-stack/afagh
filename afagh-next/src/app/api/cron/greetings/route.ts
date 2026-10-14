import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSetting } from '@/lib/settings';
import { assertSameOrigin } from '@/lib/security';
import { runGreetingScans } from '@/lib/greetings';
import { createLogger } from '@/lib/logger';
import { clientIp, guardedRateLimit } from '@/lib/rateLimit';
import { db } from '@/db';
import { appendAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'cron.greetings' });
const ACTION = 'CRON_GREETINGS';

// تبریک‌های خودکار: تولد روزانه + شروع ترم انبوه.
// فراخوانی فقط ماشین‌به‌ماشین: هدر x-cron-secret برابر GREETINGS_CRON_SECRET.
// GET فقط وضعیت است (بدون هیچ اثر جانبی)؛ اجرای واقعی فقط با POST.
// مقایسهٔ هدر با کلید ثابت‌زمان است (الگوی checkWebhookSecret در /api/telegram/webhook).
function secretMatches(header: string | null, expected: string): boolean {
  const provided = header?.trim() ?? '';
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

async function authorize(req: NextRequest): Promise<{ ok: true; actorUserId: number | null } | { ok: false; res: NextResponse }> {
  const rl = await guardedRateLimit(`cron:greet:${await clientIp()}`, 30, 60);
  if (!rl.ok) return { ok: false, res: NextResponse.json({ ok: false, error: rl.error }, { status: 429 }) };
  const secret = (await getSetting('GREETINGS_CRON_SECRET')).trim();
  if (!secret) {
    log.warn('cron_secret_missing', { action: ACTION, hint: 'GREETINGS_CRON_SECRET تنظیم نشده (fail-closed).' });
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
    const result = await runGreetingScans();
    const durationMs = Date.now() - started;
    log.info('cron_greetings', { ...result, durationMs });
    await auditCron(auth.actorUserId, { durationMs, ...result });
    return NextResponse.json({ ok: true, durationMs, ...result });
  } catch (e) {
    log.error('cron_greetings_failed', { error: (e as Error)?.message });
    return NextResponse.json({ ok: false, error: 'اجرای تبریک‌های خودکار ناموفق بود؛ دوباره تلاش کنید.' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;
  const auth = await authorize(req);
  if (!auth.ok) return auth.res;
  // فقط وضعیت — هیچ تبریکی ارسال/ثبت نمی‌شود.
  log.info('cron_greetings_status', { dryRun: true });
  return NextResponse.json({
    ok: true,
    dryRun: true,
    status: 'آماده',
    hint: 'اجرای واقعی تبریک‌ها فقط با POST انجام می‌شود.',
  });
}
