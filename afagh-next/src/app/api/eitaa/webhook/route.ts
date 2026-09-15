import { NextRequest, NextResponse } from 'next/server';
import { handleMessengerUpdate, setupMessengerWebhook } from '@/lib/messenger-bot';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
const log = createLogger({ mod: 'eitaa.webhook' });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    await handleMessengerUpdate('EITAA', body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error('webhook_error', { error: (e as Error).message });
    return NextResponse.json({ ok: true });
  }
}

export async function GET(req: NextRequest) {
  const setup = req.nextUrl.searchParams.get('setup');
  if (setup === '1') {
    const baseUrl = (process.env.PUBLIC_BASE_URL || process.env.AFAGH_PUBLIC_BASE_URL || req.nextUrl.origin).replace(/\/+$/, '');
    const webhookUrl = `${baseUrl}/api/eitaa/webhook`;
    const result = await setupMessengerWebhook('EITAA', webhookUrl);
    log.info('webhook_setup', { url: webhookUrl, ...result });
    return NextResponse.json({ setup: true, messenger: 'EITAA', url: webhookUrl, ...result });
  }
  return NextResponse.json({ status: 'ok', messenger: 'EITAA', message: 'وب‌هوک ایتا فعال است.' });
}
