import { NextRequest, NextResponse } from 'next/server';
import { handleTelegramUpdate, setTelegramWebhook } from '@/lib/telegram-bot';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'telegram.webhook' });

/**
 * وب‌هوک تلگرام — دریافت پیام‌های کاربران
 *
 * تنظیم وب‌هوک:
 *   POST /api/telegram/webhook?setup=YOUR_BOT_TOKEN
 *   یا از محیط: TELEGRAM_WEBHOOK_SECRET
 *
 * نمونه crontab برای تنظیم خودکار وب‌هوک:
 *   0 0 * * * curl -fsS -X POST "https://YOUR_DOMAIN/api/telegram/webhook?setup=1"
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    await handleTelegramUpdate(body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error('webhook_error', { error: (e as Error).message });
    return NextResponse.json({ ok: true }); // همیشه 200 به تلگرام برگردان تا webhook حذف نشود
  }
}

/** GET — راه‌اندازی وب‌هوک یا بررسی وضعیت */
export async function GET(req: NextRequest) {
  const setup = req.nextUrl.searchParams.get('setup');
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  // اگر setup=1 باشد، وب‌هوک تنظیم می‌شود
  if (setup === '1') {
    const baseUrl = (process.env.PUBLIC_BASE_URL || req.nextUrl.origin).replace(/\/+$/, '');
    const webhookUrl = `${baseUrl}/api/telegram/webhook`;
    const result = await setTelegramWebhook(webhookUrl);
    log.info('webhook_setup', { url: webhookUrl, ...result });
    return NextResponse.json({ setup: true, url: webhookUrl, ...result });
  }

  // بررسی ساده وضعیت
  return NextResponse.json({ status: 'ok', message: 'وب‌هوک تلگرام فعال است.' });
}
