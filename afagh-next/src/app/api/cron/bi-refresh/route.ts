import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { refreshAllBiCaches, cacheStatus } from '@/lib/bi-engine';
import { getSetting } from '@/lib/settings';
import { assertSameOrigin } from '@/lib/security';
import { createLogger } from '@/lib/logger';
import { clientIp, guardedRateLimit } from '@/lib/rateLimit';
import { db } from '@/db';
import { appendAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'cron.bi-refresh' });
const ACTION = 'CRON_BI_REFRESH';

// تازه‌سازی آفلاین گزارش‌های هوش تجاری.
//
// محاسبهٔ داشبورد مدیریتی، تحلیل امکانات و ابر کلمات روی کل پاسخ‌های
// ارزشیابی انجام می‌شود؛ درست‌ترین زمان برای آن پایان دورهٔ ارزشیابی یا
// ساعات کم‌ترافیک شبانه است، نه لحظهٔ باز شدن داشبورد توسط مدیر. این job
// همهٔ کش‌ها را یک‌جا بازسازی می‌کند تا درخواست کاربر فقط یک SELECT باشد.
//
// crontab (پس از بسته‌شدن دورهٔ ارزشیابی، روزی یک‌بار):
//   30 2 * * * curl -fsS -X POST -H "x-cron-secret: ***" http://localhost:8080/api/cron/bi-refresh
//
// GET فقط وضعیت کش است (خواندن، بدون بازسازی)؛ اجرای واقعی فقط با POST.
// احراز هویت فقط ماشین‌به‌ماشین با BI_CRON_SECRET (fail-closed، بدون fallback).
// مقایسهٔ هدر با کلید ثابت‌زمان است تا طول/محتوای کلید از راه زمان‌سنجی لو نرود
// (الگوی checkWebhookSecret در /api/telegram/webhook).
function secretMatches(header: string | null, expected: string): boolean {
  const provided = header?.trim() ?? '';
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

async function authorize(req: NextRequest): Promise<{ ok: true; actorUserId: number | null } | { ok: false; res: NextResponse }> {
  const rl = await guardedRateLimit(`cron:bi:${await clientIp()}`, 30, 60);
  if (!rl.ok) return { ok: false, res: NextResponse.json({ ok: false, error: rl.error }, { status: 429 }) };
  const biSecret = (await getSetting('BI_CRON_SECRET')).trim();
  if (!biSecret) {
    log.warn('cron_bi_secret_missing', { action: ACTION, hint: 'BI_CRON_SECRET تنظیم نشده (fail-closed).' });
    return { ok: false, res: NextResponse.json({ ok: false, error: 'دسترسی غیرمجاز است. کلید کرون معتبر نیست.' }, { status: 401 }) };
  }
  if (!secretMatches(req.headers.get('x-cron-secret'), biSecret)) {
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

  const termIdParam = Number(req.nextUrl.searchParams.get('termId') ?? 0);
  const started = Date.now();
  try {
    const result = await refreshAllBiCaches(Number.isFinite(termIdParam) && termIdParam > 0 ? termIdParam : undefined);
    const durationMs = Date.now() - started;
    log.info('cron_bi_refresh_done', { ...result, durationMs });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    await auditCron(auth.actorUserId, { ...result, durationMs });
    return NextResponse.json({ ...result, cache: await cacheStatus(), durationMs });
  } catch (e) {
    log.error('cron_bi_refresh_failed', { error: (e as Error)?.message });
    return NextResponse.json({ ok: false, error: 'تازه‌سازی BI ناموفق بود؛ دوباره تلاش کنید.' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;
  const auth = await authorize(req);
  if (!auth.ok) return auth.res;
  // فقط وضعیت کش — خواندن، بدون بازسازی و بدون هیچ نوشتن.
  try {
    const cache = await cacheStatus();
    log.info('cron_bi_refresh_status', { dryRun: true });
    return NextResponse.json({ ok: true, dryRun: true, status: 'آماده', cache });
  } catch (e) {
    log.error('cron_bi_status_failed', { error: (e as Error)?.message });
    return NextResponse.json({ ok: false, error: 'خواندن وضعیت کش ناموفق بود؛ دوباره تلاش کنید.' }, { status: 500 });
  }
}
