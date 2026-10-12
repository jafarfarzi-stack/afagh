import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
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
// فراخوانی: هدر x-cron-secret برابر GREETINGS_CRON_SECRET، یا نشست ادمین.
// GET فقط وضعیت است (بدون هیچ اثر جانبی)؛ اجرای واقعی فقط با POST.
async function authorize(req: NextRequest): Promise<{ ok: true; actorUserId: number | null } | { ok: false; res: NextResponse }> {
  const rl = await guardedRateLimit(`cron:greet:${await clientIp()}`, 30, 60);
  if (!rl.ok) return { ok: false, res: NextResponse.json({ ok: false, error: rl.error }, { status: 429 }) };
  const secret = (await getSetting('GREETINGS_CRON_SECRET')).trim();
  const provided = req.headers.get('x-cron-secret')?.trim() ?? '';
  if (secret && provided === secret) return { ok: true, actorUserId: null };
  const user = await getSessionUser();
  if (user?.roles.includes('ADMIN')) return { ok: true, actorUserId: user.id };
  if (!secret) log.warn('cron_secret_missing', { action: ACTION, hint: 'GREETINGS_CRON_SECRET تنظیم نشده؛ فقط نشست ادمین مجاز است.' });
  return { ok: false, res: NextResponse.json({ ok: false, error: 'دسترسی غیرمجاز است. کلید کرون معتبر نیست.' }, { status: 401 }) };
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
