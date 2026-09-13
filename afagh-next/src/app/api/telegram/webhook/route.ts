import { NextRequest, NextResponse } from 'next/server';
import { handleMessengerUpdate, setupMessengerWebhook } from '@/lib/messenger-bot';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'messenger.webhook' });

/**
 * وب‌هوک یکپارچهٔ پیام‌رسان‌ها — دریافت پیام‌های کاربران
 *
 * مسیرها:
 *   /api/telegram/webhook   → تلگرام
 *   /api/bale/webhook       → بله
 *   /api/soroush/webhook    → سروش
 *   /api/eitaa/webhook      → ایتا
 *   /api/egap/webhook       → ای‌گپ
 *
 * تنظیم وب‌هوک:
 *   GET /api/{messenger}/webhook?setup=1
 */
export async function POST(req: NextRequest) {
  // تشخیص پیام‌رسان از مسیر
  const path = req.nextUrl.pathname;
  const messenger = path.includes('/bale/') ? 'BALE'
    : path.includes('/soroush/') ? 'SOROUSH'
    : path.includes('/eitaa/') ? 'EITAA'
    : path.includes('/egap/') ? 'EGAP'
    : 'TELEGRAM';

  try {
    const body = await req.json();
    await handleMessengerUpdate(messenger, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error('webhook_error', { messenger, error: (e as Error).message });
    return NextResponse.json({ ok: true }); // همیشه 200 برگردان تا webhook حذف نشود
  }
}

/** GET — راه‌اندازی وب‌هوک یا بررسی وضعیت */
export async function GET(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const messenger = path.includes('/bale/') ? 'BALE'
    : path.includes('/soroush/') ? 'SOROUSH'
    : path.includes('/eitaa/') ? 'EITAA'
    : path.includes('/egap/') ? 'EGAP'
    : 'TELEGRAM';

  const setup = req.nextUrl.searchParams.get('setup');

  if (setup === '1') {
    const baseUrl = (process.env.PUBLIC_BASE_URL || process.env.AFAGH_PUBLIC_BASE_URL || req.nextUrl.origin).replace(/\/+$/, '');
    const webhookUrl = `${baseUrl}/api/${messenger.toLowerCase()}/webhook`;
    const result = await setupMessengerWebhook(messenger, webhookUrl);
    log.info('webhook_setup', { messenger, url: webhookUrl, ...result });
    return NextResponse.json({ setup: true, messenger, url: webhookUrl, ...result });
  }

  return NextResponse.json({ status: 'ok', messenger, message: `وب‌هوک ${messenger} فعال است.` });
}
