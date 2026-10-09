import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { deleteMessengerWebhook, handleMessengerUpdate } from '@/lib/messenger-bot';
import { getPublicBaseUrl } from '@/lib/settings';
import { assertSameOrigin } from '@/lib/security';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'messenger.webhook' });

// وب‌هوک تلگرام — حالت فقط-ارسال.
// POST فقط وقتی پردازش می‌شود که TELEGRAM_BOT_ENABLED صریحاً روشن باشد
// (پیش‌فرض خاموش). GET ?setup=1 فقط برای ادمین (نشست + هم‌مبدأ).

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    await handleMessengerUpdate('TELEGRAM', body);
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
