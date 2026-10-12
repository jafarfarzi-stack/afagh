import { NextRequest, NextResponse } from 'next/server';
import { getSetting } from '@/lib/settings';
import { assertSameOrigin } from '@/lib/security';
import { runChequeReminderScan } from '@/lib/finance-engine';
import { createLogger } from '@/lib/logger';
import { clientIp, guardedRateLimit } from '@/lib/rateLimit';
import { db } from '@/db';
import { appendAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'cron.cheques' });
const ACTION = 'CRON_CHEQUE_REMINDERS';

// پویش زمان‌بندی‌شدهٔ یادآوری چک — پیش از سررسید به دانشجو پیام می‌رود.
// فراخوانی فقط ماشین‌به‌ماشین: هدر x-cron-secret برابر تنظیم FINANCE_CRON_SECRET.
// نمونهٔ crontab:  0 8 * * * curl -fsS -X POST -H "x-cron-secret: ***" http://localhost:8080/api/cron/cheque-reminders
// GET فقط وضعیت است (بدون هیچ اثر جانبی)؛ اجرای واقعی فقط با POST.
async function authorize(req: NextRequest): Promise<{ ok: true; actorUserId: number | null } | { ok: false; res: NextResponse }> {
  const rl = await guardedRateLimit(`cron:cheque:${await clientIp()}`, 30, 60);
  if (!rl.ok) return { ok: false, res: NextResponse.json({ ok: false, error: rl.error }, { status: 429 }) };
  const secret = (await getSetting('FINANCE_CRON_SECRET')).trim();
  if (!secret) {
    log.warn('cron_secret_missing', { action: ACTION, hint: 'FINANCE_CRON_SECRET تنظیم نشده (fail-closed).' });
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
    const result = await runChequeReminderScan({ dryRun: req.nextUrl.searchParams.get('dryRun') === '1' });
    const durationMs = Date.now() - started;
    log.info('cron_cheque_reminders', { ...result, durationMs });
    await auditCron(auth.actorUserId, { durationMs, ...result });
    return NextResponse.json({ ok: true, durationMs, ...result });
  } catch (e) {
    log.error('cron_cheque_reminders_failed', { error: (e as Error)?.message });
    return NextResponse.json({ ok: false, error: 'اجرای یادآوری چک ناموفق بود؛ دوباره تلاش کنید.' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;
  const auth = await authorize(req);
  if (!auth.ok) return auth.res;
  // فقط وضعیت — هیچ فراخوانی به موتور، هیچ پیام، هیچ نوشتن در DB.
  log.info('cron_cheque_reminders_status', { dryRun: true });
  return NextResponse.json({
    ok: true,
    dryRun: true,
    status: 'آماده',
    hint: 'اجرای واقعی فقط با POST انجام می‌شود (پارامتر dryRun=1 برای اجرای آزمایشی).',
  });
}
