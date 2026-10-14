import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { deleteMessengerWebhook, handleMessengerUpdate } from '@/lib/messenger-bot';
import { getPublicBaseUrl } from '@/lib/settings';
import { assertSameOrigin } from '@/lib/security';
import { createLogger } from '@/lib/logger';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'messenger.webhook' });

// وب‌هوک تلگرام — حالت فقط-ارسال.
// POST فقط وقتی پردازش می‌شود که TELEGRAM_BOT_ENABLED صریحاً روشن باشد
// (پیش‌فرض خاموش). GET ?setup=1 فقط برای ادمین (نشست + هم‌مبدأ).
//
// احراز وب‌هوک (fail-closed): TELEGRAM_WEBHOOK_SECRET باید تنظیم باشد و هدر
// X-Telegram-Bot-Api-Secret-Token با مقایسهٔ ثابت‌زمان الزامی است؛ بدون راز
// یا با راز نادرست، 401 و هرگز پردازش نمی‌شود (تا فرستندهٔ جعلی تأیید نگیرد).
//
// ضدتکرار: هر update_id فقط یک‌بار پردازش می‌شود (شمارندهٔ rateLimit با سقف ۱
// در پنجرهٔ ۷روزه — Redis وگرنه fallback حافظه‌ایِ محدود). تکراری‌ها {ok:true}
// می‌گیرند بدون پردازش، تا بدنهٔ ضبط‌شده برای همیشه قابل replay نباشد.
//
// INVARIANT: این مسیر inbound به‌تنهایی هیچ اشتراک تحویلی برقرار نمی‌کند —
// فقط سرنخ pendingChatId از راه جریان توکن ثبت می‌شود و مقصد نهایی فقط با
// تأیید احرازهویتیِ پورتال (confirmLinkToken) نوشته می‌شود. سقف تلاش‌ها روی
// IP مورداعتماد پروکسی است، نه chatId ادعاشده در بدنه.

function checkWebhookSecret(req: NextRequest): boolean {
  const expected = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  if (!expected) return false; // راز تنظیم نشده — fail-closed: هرگز پردازش نکن
  const provided = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

// پنجرهٔ نگهداشت update_idهای دیده‌شده (ثانیه) — replay دیرهنگام هم پوشش داده شود.
const UPDATE_DEDUPE_WINDOW_SEC = 7 * 24 * 3600;

export async function POST(req: NextRequest) {
  if (!checkWebhookSecret(req)) {
    log.warn('webhook_unauthorized', { messenger: 'TELEGRAM' });
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const ip = await clientIp();
  const rl = await rateLimit(`tg-webhook:${ip}`, 60, 60);
  if (!rl.ok) {
    return NextResponse.json({ error: 'too_many_requests' }, { status: 429 });
  }
  try {
    const body = await req.json();
    const updateId = (body as { update_id?: unknown })?.update_id;
    if (typeof updateId === 'number' && Number.isSafeInteger(updateId)) {
      const seen = await rateLimit(`tg-update:${updateId}`, 1, UPDATE_DEDUPE_WINDOW_SEC);
      if (!seen.ok) return NextResponse.json({ ok: true }); // تکراری — بدون پردازش
    }
    await handleMessengerUpdate('TELEGRAM', body, { limiterKey: ip });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error('webhook_error', { messenger: 'TELEGRAM', error: (e as Error).message });
    return NextResponse.json({ ok: true }); // همیشه 200 تا webhook حذف نشود
  }
}

export async function GET(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const user = await getSessionUser();
  if (!user?.roles.includes('ADMIN')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const setup = req.nextUrl.searchParams.get('setup');
  if (setup === '1') {
    // مبنای نشانی فقط از تنظیمات — هرگز fallback به Host درخواست.
    const baseUrl = await getPublicBaseUrl();
    const webhookUrl = `${baseUrl}/api/telegram/webhook`;
    // در حالت فقط-ارسال، setup یعنی حذف وب‌هوک (قطع inbound).
    const result = await deleteMessengerWebhook('TELEGRAM');
    log.info('webhook_setup', { messenger: 'TELEGRAM', url: webhookUrl, ...result });
    return NextResponse.json({ setup: true, messenger: 'TELEGRAM', url: webhookUrl, ...result });
  }

  return NextResponse.json({ status: 'ok', messenger: 'TELEGRAM', mode: 'send-only' });
}
