import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { notification_channels, notification_deliveries, notifications, users } from '@/db/schema';
import { getBool, getNumber, getSetting } from '@/lib/settings';
import { createLogger } from '@/lib/logger';

// ═══════════════════════════════════════════════════════════════
//  ارسال اعلان چندکاناله: پیام درون‌سامانه‌ای + پیامک + پیام‌رسان
//
//  هیچ نشانی/کلیدی سخت‌کد نیست: سرویس‌دهندهٔ پیامک، نشانی سرویس، توکن
//  ربات‌ها و حتی فهرست کانال‌های فعال از تنظیمات (پنل مدیر → ENV → پیش‌فرض)
//  خوانده می‌شود. هر تلاش ارسال در notification_deliveries ثبت می‌شود تا
//  کارشناس بداند پیام به دست دانشجو رسیده یا نه.
// ═══════════════════════════════════════════════════════════════

const log = createLogger({ mod: 'messaging' });

export const CHANNELS = ['INAPP', 'SMS', 'TELEGRAM', 'BALE', 'EITAA'] as const;
export type Channel = typeof CHANNELS[number];

export const CHANNEL_LABEL: Record<string, string> = {
  INAPP: 'پیام درون‌سامانه', SMS: 'پیامک', TELEGRAM: 'تلگرام', BALE: 'بله', EITAA: 'ایتا',
};

export type DeliveryResult = {
  channel: Channel; target: string | null; status: 'SENT' | 'FAILED' | 'SKIPPED';
  error?: string; providerRef?: string; durationMs?: number;
};

async function timeoutMs() {
  return (await getNumber('API_TIMEOUT_SECONDS', 10)) * 1000;
}

async function httpJson(url: string, init?: RequestInit) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), await timeoutMs());
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 160)}`);
    return text;
  } finally {
    clearTimeout(t);
  }
}

// ───────────────────────── پیامک ─────────────────────────

/**
 * ارسال پیامک با سرویس‌دهندهٔ انتخابی مدیر.
 * CUSTOM: هر سرویس داخلی دیگری با یک الگوی URL و جای‌گاه‌های {to} {text} {sender} {key}
 */
export async function sendSms(to: string, text: string): Promise<DeliveryResult> {
  const started = Date.now();
  const provider = (await getSetting('SMS_PROVIDER')).trim().toUpperCase();
  const key = (await getSetting('SMS_API_KEY')).trim();
  const sender = (await getSetting('SMS_SENDER')).trim();
  const base = (await getSetting('SMS_BASE_URL')).trim().replace(/\/+$/, '');

  if (!provider) return { channel: 'SMS', target: to, status: 'SKIPPED', error: 'سرویس‌دهندهٔ پیامک تنظیم نشده است.' };
  if (!to) return { channel: 'SMS', target: null, status: 'SKIPPED', error: 'شمارهٔ موبایل کاربر ثبت نشده است.' };

  try {
    let ref = '';
    if (provider === 'KAVENEGAR') {
      const root = base || 'https://api.kavenegar.com';
      const url = `${root}/v1/${encodeURIComponent(key)}/sms/send.json?receptor=${encodeURIComponent(to)}&sender=${encodeURIComponent(sender)}&message=${encodeURIComponent(text)}`;
      ref = (await httpJson(url)).slice(0, 100);
    } else if (provider === 'SMSIR') {
      const root = base || 'https://api.sms.ir';
      ref = (await httpJson(`${root}/v1/send/bulk`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, accept: 'application/json' },
        body: JSON.stringify({ lineNumber: sender, messageText: text, mobiles: [to] }),
      })).slice(0, 100);
    } else if (provider === 'FARAPAYAMAK') {
      const root = base || 'https://rest.payamak-panel.com';
      ref = (await httpJson(`${root}/api/SendSMS/SendSMS`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: sender, password: key, to, from: sender, text }),
      })).slice(0, 100);
    } else {
      // CUSTOM یا هر سرویس داخلی: الگوی نشانی از تنظیمات
      if (!base) throw new Error('برای سرویس دلخواه، «نشانی سرویس پیامک» را با جای‌گاه‌های {to} و {text} پر کنید.');
      const url = base
        .replace('{to}', encodeURIComponent(to))
        .replace('{text}', encodeURIComponent(text))
        .replace('{sender}', encodeURIComponent(sender))
        .replace('{key}', encodeURIComponent(key));
      ref = (await httpJson(url)).slice(0, 100);
    }
    return { channel: 'SMS', target: to, status: 'SENT', providerRef: ref, durationMs: Date.now() - started };
  } catch (e) {
    return { channel: 'SMS', target: to, status: 'FAILED', error: (e as Error).message, durationMs: Date.now() - started };
  }
}

// ────────────────────── پیام‌رسان‌ها ──────────────────────

async function messengerConfig(channel: Channel) {
  if (channel === 'TELEGRAM') return { token: await getSetting('TELEGRAM_TOKEN'), base: (await getSetting('TELEGRAM_API_BASE')) || 'https://api.telegram.org', style: 'BOT' as const };
  if (channel === 'BALE') return { token: await getSetting('BALE_TOKEN'), base: (await getSetting('BALE_API_BASE')) || 'https://tapi.bale.ai', style: 'BOT' as const };
  return { token: await getSetting('EITAA_TOKEN'), base: (await getSetting('EITAA_API_BASE')) || 'https://eitaayar.ir/api', style: 'EITAA' as const };
}

/** ارسال پیام به ربات تلگرام/بله (API یکسان) یا ایتا */
export async function sendMessenger(channel: Channel, chatId: string, text: string): Promise<DeliveryResult> {
  const started = Date.now();
  const { token, base, style } = await messengerConfig(channel);
  if (!token) return { channel, target: chatId, status: 'SKIPPED', error: `توکن ربات ${CHANNEL_LABEL[channel]} تنظیم نشده است.` };
  if (!chatId) return { channel, target: null, status: 'SKIPPED', error: 'شناسهٔ کاربر در این پیام‌رسان ثبت نشده است.' };

  const root = base.replace(/\/+$/, '');
  try {
    const url = style === 'EITAA' ? `${root}/${token}/sendMessage` : `${root}/bot${token}/sendMessage`;
    const ref = (await httpJson(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })).slice(0, 100);
    return { channel, target: chatId, status: 'SENT', providerRef: ref, durationMs: Date.now() - started };
  } catch (e) {
    return { channel, target: chatId, status: 'FAILED', error: (e as Error).message, durationMs: Date.now() - started };
  }
}

// ──────────────────── ثبت نشانی کاربران ────────────────────

export async function listUserChannels(userId: number) {
  return db.select().from(notification_channels).where(eq(notification_channels.userId, userId));
}

export async function saveUserChannel(userId: number, channel: Channel, address: string) {
  const value = address.trim();
  if (!value) {
    await db.delete(notification_channels)
      .where(and(eq(notification_channels.userId, userId), eq(notification_channels.channel, channel)));
    return { ok: true as const, removed: true };
  }
  if (channel === 'SMS' && !/^09\d{9}$/.test(value)) throw new Error('شمارهٔ موبایل باید ۱۱ رقم و با ۰۹ آغاز شود.');
  const values = { userId, channel, address: value, isActive: 1 };
  await db.insert(notification_channels).values(values)
    .onConflictDoUpdate({ target: [notification_channels.userId, notification_channels.channel], set: values });
  return { ok: true as const, removed: false };
}

/** نشانی کاربر در یک کانال: اول جدول اختصاصی، بعد موبایل پروفایل برای پیامک */
async function addressFor(userId: number, channel: Channel): Promise<string | null> {
  const [row] = await db.select().from(notification_channels)
    .where(and(eq(notification_channels.userId, userId), eq(notification_channels.channel, channel))).limit(1);
  if (row?.isActive === 1 && row.address) return row.address;
  if (channel === 'SMS') {
    const [u] = await db.select({ mobile: users.mobile }).from(users).where(eq(users.id, userId)).limit(1);
    return u?.mobile ?? null;
  }
  return null;
}

// ───────────────────── ارسال یکپارچه ─────────────────────

export async function activeChannels(): Promise<Channel[]> {
  const raw = (await getSetting('NOTIFY_CHANNELS')) || 'INAPP';
  const list = raw.split(',').map(c => c.trim().toUpperCase()).filter(Boolean) as Channel[];
  const valid = list.filter(c => (CHANNELS as readonly string[]).includes(c));
  return valid.length ? valid : ['INAPP'];
}

/**
 * ارسال یک رویداد به کاربر روی همهٔ کانال‌های فعال.
 * پیام درون‌سامانه‌ای همیشه ثبت می‌شود (حتی اگر ارسال بیرونی خاموش باشد) تا
 * هیچ رویدادی گم نشود.
 */
export async function notifyUserMultichannel(input: {
  userId: number; eventCode: string; text: string; channels?: Channel[];
}): Promise<{ notificationId: number | null; results: DeliveryResult[] }> {
  const signature = (await getSetting('NOTIFY_SIGNATURE')).trim();
  const body = signature ? `${input.text}\n${signature}` : input.text;

  const [ins] = await db.insert(notifications)
    .values({ userId: input.userId, eventCode: input.eventCode, payload: JSON.stringify({ text: input.text }) })
    .returning({ id: notifications.id });
  const notificationId = ins?.id ?? null;

  const results: DeliveryResult[] = [];
  const externalEnabled = await getBool('NOTIFY_ENABLED');
  const channels = (input.channels ?? (await activeChannels())).filter(c => c !== 'INAPP');

  if (externalEnabled) {
    for (const ch of channels) {
      const target = await addressFor(input.userId, ch);
      const r = target
        ? (ch === 'SMS' ? await sendSms(target, body) : await sendMessenger(ch, target, body))
        : { channel: ch, target: null, status: 'SKIPPED' as const, error: 'نشانی کاربر در این کانال ثبت نشده است.' };
      results.push(r);
    }
  }

  for (const r of results) {
    await db.insert(notification_deliveries).values({
      userId: input.userId, notificationId, eventCode: input.eventCode,
      channel: r.channel, target: r.target ?? null, status: r.status,
      providerRef: r.providerRef ?? null, error: r.error ?? null,
      body: body.slice(0, 1000), durationMs: r.durationMs ?? null,
    });
  }

  const failed = results.filter(r => r.status === 'FAILED').length;
  if (failed) log.warn('notify_partial_failure', { eventCode: input.eventCode, failed, total: results.length });
  else log.info('notify_sent', { eventCode: input.eventCode, channels: results.map(r => `${r.channel}:${r.status}`).join(',') });

  return { notificationId, results };
}

/** گزارش آخرین ارسال‌ها برای یک کاربر (نمایش در پروندهٔ پنل مدیر) */
export async function deliveriesForUser(userId: number, limit = 12) {
  const rows = await db.select().from(notification_deliveries)
    .where(eq(notification_deliveries.userId, userId))
    .orderBy(desc(notification_deliveries.id)).limit(limit);
  return rows.map(r => ({
    id: r.id, eventCode: r.eventCode, channel: r.channel,
    channelLabel: CHANNEL_LABEL[r.channel] ?? r.channel,
    target: r.target, status: r.status, error: r.error,
    createdAt: r.createdAt ? r.createdAt.toISOString() : null,
  }));
}

/** ارسال آزمایشی برای اطمینان از درستی تنظیمات (دکمهٔ «ارسال پیام آزمایشی») */
export async function sendTestMessage(userId: number, channel: Channel) {
  const text = 'پیام آزمایشی سامانهٔ جامع آموزشی — تنظیمات ارسال شما درست کار می‌کند.';
  if (channel === 'INAPP') {
    await db.insert(notifications).values({ userId, eventCode: 'TEST_NOTIFY', payload: JSON.stringify({ text }) });
    return { channel, target: null, status: 'SENT' as const };
  }
  const target = await addressFor(userId, channel);
  const r = target
    ? (channel === 'SMS' ? await sendSms(target, text) : await sendMessenger(channel, target, text))
    : { channel, target: null, status: 'SKIPPED' as const, error: 'نشانی کاربر در این کانال ثبت نشده است.' };
  await db.insert(notification_deliveries).values({
    userId, eventCode: 'TEST_NOTIFY', channel: r.channel, target: r.target ?? null,
    status: r.status, error: r.error ?? null, body: text, durationMs: r.durationMs ?? null,
  });
  return r;
}
