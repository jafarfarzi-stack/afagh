import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { notification_channels } from '@/db/schema';
import { getBool, getPublicBaseUrl, getSetting } from '@/lib/settings';
import { handlePairingText } from '@/lib/messenger-link-tokens';
import { createLogger } from '@/lib/logger';

const log = createLogger({ mod: 'messenger-bot' });

// ═══════════════════════════════════════════════════════════════
//  بات پیام‌رسان‌ها — حالت «فقط-ارسال» (SEND-ONLY)
//
//  همهٔ کانال‌ها فقط اعلان خودکار می‌فرستند؛ هیچ دستور تعاملی
//  (/status /grades /enrollment …) و هیچ جریان رمزی در چت وجود
//  ندارد. اتصال حساب فقط با توکن از داخل پورتال (messenger-link-tokens).
//  دریافت inbound پیش‌فرض خاموش است و با پرچم *_BOT_ENABLED (پیش‌فرض
//  خاموش، fail-closed) گیت می‌شود.
// ═══════════════════════════════════════════════════════════════

export type MessengerChannel = 'TELEGRAM' | 'BALE' | 'SOROUSH' | 'EITAA' | 'IGAP';

export const POLL_CHANNELS: MessengerChannel[] = ['BALE', 'EITAA', 'SOROUSH'];

export const LINKABLE_CHANNELS: MessengerChannel[] = ['TELEGRAM', 'BALE', 'EITAA', 'SOROUSH'];
// ای‌گپ: poll اثبات‌نشده — اتصال جدید فریز است (متن صادقانه در actions).

// ──────── پیکربندی API هر پیام‌رسان ────────

interface MessengerConfig {
  tokenKey: string;
  baseKey: string;
  defaultBase: string;
  style: 'BOT' | 'EITAA';
  enabledKey: string;
  /** پیشوند دیپ‌لینک بات (نام‌کاربری بات از تنظیمات جدا خوانده می‌شود) */
  deepLinkPrefix: string;
  usernameKey: string;
}

export const MESSENGER_CONFIGS: Record<MessengerChannel, MessengerConfig> = {
  TELEGRAM: { tokenKey: 'TELEGRAM_TOKEN', baseKey: 'TELEGRAM_API_BASE', defaultBase: 'https://api.telegram.org', style: 'BOT', enabledKey: 'TELEGRAM_BOT_ENABLED', deepLinkPrefix: 'https://t.me/', usernameKey: 'TELEGRAM_BOT_USERNAME' },
  BALE:     { tokenKey: 'BALE_TOKEN',     baseKey: 'BALE_API_BASE',     defaultBase: 'https://tapi.bale.ai',      style: 'BOT', enabledKey: 'BALE_BOT_ENABLED',     deepLinkPrefix: 'https://ble.ir/', usernameKey: 'BALE_BOT_USERNAME' },
  SOROUSH:  { tokenKey: 'SOROUSH_TOKEN',  baseKey: 'SOROUSH_API_BASE',  defaultBase: 'https://api.splus.ir',      style: 'BOT', enabledKey: 'SOROUSH_BOT_ENABLED',  deepLinkPrefix: '', usernameKey: '' },
  EITAA:    { tokenKey: 'EITAA_TOKEN',    baseKey: 'EITAA_API_BASE',    defaultBase: 'https://eitaayar.ir/api',    style: 'EITAA', enabledKey: 'EITAA_BOT_ENABLED', deepLinkPrefix: 'https://eitaa.com/', usernameKey: 'EITAA_BOT_USERNAME' },
  IGAP:     { tokenKey: 'IGAP_TOKEN',     baseKey: 'IGAP_API_BASE',     defaultBase: 'https://igap.ai/api',        style: 'BOT', enabledKey: 'IGAP_BOT_ENABLED',     deepLinkPrefix: '', usernameKey: '' },
};

export async function getConfig(channel: MessengerChannel) {
  const cfg = MESSENGER_CONFIGS[channel];
  const token = (await getSetting(cfg.tokenKey)).trim();
  const base = ((await getSetting(cfg.baseKey)) || cfg.defaultBase).replace(/\/+$/, '');
  return { token, base, style: cfg.style };
}

/** inbound این کانال مجاز است؟ — fail-closed: هر خطا/نبود پرچم = خاموش. */
export async function isInboundEnabled(channel: MessengerChannel): Promise<boolean> {
  try {
    return await getBool(MESSENGER_CONFIGS[channel].enabledKey);
  } catch {
    return false;
  }
}

// ──────── ارسال پیام ────────

export async function sendMessage(channel: MessengerChannel, chatId: string, text: string): Promise<boolean> {
  const { token, base, style } = await getConfig(channel);
  if (!token) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const url = style === 'EITAA' ? `${base}/${token}/sendMessage` : `${base}/bot${token}/sendMessage`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return r.ok;
  } catch (e) {
    log.error('messenger_send_failed', { channel, chatId, error: (e as Error).message });
    return false;
  }
}

// ──────── حذف وب‌هوک (مهاجرت به send-only / polling) ────────
//
//  فقط یک بار توسط مجری استقرار اجرا می‌شود (scripts/messenger-delete-webhooks.mjs).
//  هرگز خطا پرتاب نمی‌کند: اگر API در دسترس نباشد، لاگ + ادامه.

export async function deleteMessengerWebhook(channel: MessengerChannel): Promise<{ ok: boolean; error?: string }> {
  const { token, base, style } = await getConfig(channel);
  if (!token) return { ok: false, error: 'token_missing' };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    const url = style === 'EITAA' ? `${base}/${token}/deleteWebhook` : `${base}/bot${token}/deleteWebhook`;
    const r = await fetch(url, { method: 'POST', signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) {
      log.warn('webhook_delete_http', { channel, status: r.status });
      return { ok: false, error: `HTTP ${r.status}` };
    }
    log.info('webhook_deleted', { channel });
    return { ok: true };
  } catch (e) {
    log.warn('webhook_delete_unreachable', { channel, error: (e as Error).message });
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteAllMessengerWebhooks(): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  const channels: MessengerChannel[] = ['TELEGRAM', 'BALE', 'SOROUSH', 'EITAA', 'IGAP'];
  for (const ch of channels) {
    try {
      out[ch] = (await deleteMessengerWebhook(ch)).ok;
    } catch {
      out[ch] = false;
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
//  پردازش آپدیت دریافتی — فقط-ارسال
//
//  inbound پیش‌فرض خاموش است (پرچم *_BOT_ENABLED، fail-closed).
//  در صورت روشن‌بودن صریح پرچم، فقط جفت‌سازی توکن (/start <token>)
//  پذیرفته می‌شود؛ هر پیام دیگری پاسخ آموزشی ثابت می‌گیرد.
//  هیچ دستور تعاملی، هیچ رمزی، هیچ وضعیت مکالمه‌ای.
// ═══════════════════════════════════════════════════════════════

export async function handleMessengerUpdate(channel: MessengerChannel, body: Record<string, unknown>): Promise<void> {
  if (!(await isInboundEnabled(channel))) return;

  const msg = body.message as Record<string, unknown> | undefined;
  if (!msg) return;
  const chat = msg.chat as Record<string, unknown> | undefined;
  if (!chat || chat.type !== 'private') return;

  const chatId = String(chat.id);
  const text = String(msg.text ?? '').trim();
  if (!text) return;

  const reply = await handlePairingText(channel, chatId, text);
  if (reply) {
    await sendMessage(channel, chatId, reply);
    return;
  }

  const portal = await getPublicBaseUrl().catch(() => '');
  await sendMessage(channel, chatId,
    'این بات فقط اعلان خودکار می‌فرستد و به پیام‌ها پاسخ نمی‌دهد.' +
    (portal ? `\nبرای پیگیری امور آموزشی به پورتال مراجعه کنید:\n${portal}` : '')
  );
}

// ═══════════════════ ارسال خودکار ═══════════════════

/** ارسال پیام به یک کاربر */
export async function sendToUser(channel: MessengerChannel, userId: number, text: string): Promise<boolean> {
  const [ch] = await db.select().from(notification_channels)
    .where(and(
      eq(notification_channels.userId, userId),
      eq(notification_channels.channel, channel),
      eq(notification_channels.isActive, 1),
    )).limit(1);
  if (!ch?.address) return false;
  return sendMessage(channel, ch.address, text);
}

// ═══════════════════ سازگاری با کدهای قبلی ═══════════════════

/** @deprecated از sendToUser استفاده کنید */
export const sendTelegramToUser = sendToUser;

/** @deprecated inbound پیش‌فرض خاموش است؛ از handleMessengerUpdate استفاده کنید */
export const handleTelegramUpdate = (body: Record<string, unknown>) => handleMessengerUpdate('TELEGRAM', body);
