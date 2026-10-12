import { NextRequest, NextResponse } from 'next/server';
import { getSetting } from '@/lib/settings';
import { assertSameOrigin } from '@/lib/security';
import { runGraduationScan } from '@/lib/graduation-engine';
import { createLogger } from '@/lib/logger';
import { clientIp, guardedRateLimit } from '@/lib/rateLimit';
import { db } from '@/db';
import { appendAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'cron.graduation' });
const ACTION = 'CRON_GRADUATION_SCAN';

// پویش زمان‌بندی‌شدهٔ فارغ‌التحصیلی.
// فراخوانی فقط ماشین‌به‌ماشین: هدر x-cron-secret برابر تنظیم GRADUATION_SCAN_CRON_SECRET.
// نمونهٔ crontab:  0 3 * * * curl -fsS -X POST -H "x-cron-secret: ***" http://localhost:8080/api/cron/graduation-scan
// GET فقط وضعیت است (بدون هیچ اثر جانبی)؛ اجرای واقعی فقط با POST.
async function authorize(req: NextRequest): Promise<{ ok: true; actorUserId: number | null } | { ok: false; res: NextResponse }> {
  const rl = await guardedRateLimit(`cron:grad:${await clientIp()}`, 30, 60);
  if (!rl.ok) return { ok: false, res: NextResponse.json({ ok: false, error: rl.error }, { status: 429 }) };
  const secret = (await getSetting('GRADUATION_SCAN_CRON_SECRET')).trim();
  if (!secret) {
    log.warn('cron_secret_missing', { action: ACTION, hint: 'GRADUATION_SCAN_CRON_SECRET تنظیم نشده (fail-closed).' });
    return { ok: false, res: NextResponse.json({ ok: false, error: 'دسترسی غیرمجاز است. کلید کرون معتبر نیست.' }, { status: 401 }) };
  }
  const provided = req.headers.get('x-cron-secret')?.trim() ?? '';
  if (provided === secret) return { ok: true, actorUserId: null };
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
    const result = await runGraduationScan({ force: req.nextUrl.searchParams.get('force') === '1' });
    const durationMs = Date.now() - started;
    log.info('cron_scan_done', { ...result, durationMs });
    await auditCron(auth.actorUserId, { durationMs, ...result });
    return NextResponse.json({ ok: true, durationMs, ...result });
  } catch (e) {
    log.error('cron_scan_failed', { error: (e as Error)?.message });
    return NextResponse.json({ ok: false, error: 'پویش فارغ‌التحصیلی ناموفق بود؛ دوباره تلاش کنید.' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;
  const auth = await authorize(req);
  if (!auth.ok) return auth.res;
  // فقط وضعیت — پویش اجرا نمی‌شود، هیچ پرونده‌ای باز/به‌روزرسانی نمی‌شود.
  log.info('cron_scan_status', { dryRun: true });
  return NextResponse.json({
    ok: true,
    dryRun: true,
    status: 'آماده',
    hint: 'اجرای واقعی پویش فقط با POST انجام می‌شود.',
  });
}
