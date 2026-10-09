import crypto from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { messenger_link_tokens, notification_channels } from '@/db/schema';
import { getSetting } from '@/lib/settings';
import { LINKABLE_CHANNELS, MESSENGER_CONFIGS, type MessengerChannel } from '@/lib/messenger-bot';
import { rateLimit } from '@/lib/rateLimit';
import { createLogger } from '@/lib/logger';

const log = createLogger({ mod: 'messenger-link' });

export const LINK_TTL_MIN = 10;
export const LINK_MAX_ATTEMPTS = 5;

// الفبای بدون ابهام (بدون 0/O و 1/I) برای کد انسانی
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LEN = 8;

function sha256hex(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function randomCode(): string {
  const buf = crypto.randomBytes(CODE_LEN);
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  return out;
}

function timingEqHex(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, 'hex');
  const b = Buffer.from(bHex, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** پیام خطای واحد و عمومی برای همهٔ شکست‌های توکن (ضد شمارش). */
export const LINK_GENERIC_ERROR = 'کد اتصال نامعتبر است یا منقضی شده. از پورتال یک کد تازه بگیرید.';

function freezeMessage(channel: MessengerChannel): string {
  return `اتصال جدید ${channel} در حال حاضر فعال نیست. اعلان‌ها را از پیامک یا پیام‌رسان دیگری دنبال کنید.`;
}

export function isLinkable(channel: string): channel is MessengerChannel {
  return (LINKABLE_CHANNELS as string[]).includes(channel);
}

// ──────── صدور توکن ────────

export async function mintLinkTokenFor(userId: number, channel: MessengerChannel): Promise<{
  ok: true; code: string; token: string; deepLink: string | null; pairingText: string; expiresAt: Date;
} | { ok: false; error: string }> {
  if (!isLinkable(channel)) {
    return { ok: false, error: freezeMessage(channel) };
  }

  const rl = await rateLimit(`msg-link-mint:${userId}`, 5, 3600);
  if (!rl.ok) {
    return { ok: false, error: 'تعداد درخواست کد اتصال بیش از حد مجاز است. ساعتی دیگر دوباره تلاش کنید.' };
  }

  const token = crypto.randomBytes(24).toString('hex'); // ۴۸ رقم
  const code = randomCode();
  const expiresAt = new Date(Date.now() + LINK_TTL_MIN * 60_000);

  await db.insert(messenger_link_tokens).values({
    userId, channel,
    tokenHash: sha256hex(token),
    codeHash: sha256hex(code),
    pendingChatId: null,
    expiresAt, usedAt: null, attempts: 0,
  });

  // دیپ‌لینک فقط وقتی نام‌کاربری بات تنظیم شده؛ وگرنه دستور متنی.
  const cfg = MESSENGER_CONFIGS[channel];
  let deepLink: string | null = null;
  try {
    const username = cfg.usernameKey ? (await getSetting(cfg.usernameKey)).trim().replace(/^@/, '') : '';
    if (username && cfg.deepLinkPrefix) deepLink = `${cfg.deepLinkPrefix}${username}?start=${token}`;
  } catch { /* بدون نام‌کاربری — فقط دستور متنی */ }
  const pairingText = `/start ${code}`;

  log.info('link_token_minted', { channel, userId, tokenHash: sha256hex(token).slice(0, 12) });
  return { ok: true, code, token, deepLink, pairingText, expiresAt };
}

// ──────── ثبت پیام جفت‌سازی (/start <param> از بات) ────────
//
//  param بلند (>۱۲ رقم) = توکن کامل دیپ‌لینک؛ کوتاه = کد انسانی.
//  فقط هش‌ها لاگ می‌شوند، هرگز مقدار خام.

export async function handlePairingText(
  channel: MessengerChannel, chatId: string, text: string,
): Promise<string | null> {
  const m = text.match(/^\/start(?:@\S+)?\s*(\S+)?\s*$/);
  if (!m) return null;
  const param = (m[1] ?? '').trim();
  if (!param) {
    return 'برای اتصال حساب، از داخل پورتال «کد اتصال» بگیرید و اینجا ارسال کنید:\n/start CODE';
  }

  const digest = sha256hex(param);
  const now = new Date();
  const rows = await db.select().from(messenger_link_tokens).where(and(
    eq(messenger_link_tokens.channel, channel),
    isNull(messenger_link_tokens.usedAt),
    gt(messenger_link_tokens.expiresAt, now),
  )).limit(50);

  // مقایسهٔ ثابت‌زمان روی هر دو ستون هش
  const hit = rows.find(r =>
    timingEqHex(r.tokenHash, digest) || timingEqHex(r.codeHash, digest)
  );
  if (!hit) {
    log.warn('pairing_no_match', { channel, paramHash: digest.slice(0, 12) });
    return LINK_GENERIC_ERROR;
  }

  await db.update(messenger_link_tokens)
    .set({ pendingChatId: chatId })
    .where(eq(messenger_link_tokens.id, hit.id));
  log.info('pairing_recorded', { channel, tokenId: hit.id, tokenHash: hit.tokenHash.slice(0, 12) });
  return 'کد دریافت شد. ✅\nبه پورتال برگردید و دکمهٔ «تأیید اتصال» را بزنید تا اعلان‌ها فعال شود.';
}

// ──────── تأیید نهایی از پورتال ────────

export async function confirmLinkToken(userId: number, rawTokenOrCode: string): Promise<{
  ok: true; channel: string;
} | { ok: false; error: string }> {
  const param = String(rawTokenOrCode ?? '').trim();
  if (!param) return { ok: false, error: LINK_GENERIC_ERROR };

  const rl = await rateLimit(`msg-link-confirm:${userId}`, 10, 600);
  if (!rl.ok) return { ok: false, error: LINK_GENERIC_ERROR };

  const digest = sha256hex(param);
  const rows = await db.select().from(messenger_link_tokens)
    .where(eq(messenger_link_tokens.userId, userId)).limit(50);
  const hit = rows.find(r =>
    timingEqHex(r.tokenHash, digest) || timingEqHex(r.codeHash, digest)
  );

  const fail = async (why: string, rowId?: number) => {
    if (rowId !== undefined) {
      await db.update(messenger_link_tokens)
        .set({ attempts: (rows.find(r => r.id === rowId)?.attempts ?? 0) + 1 })
        .where(eq(messenger_link_tokens.id, rowId));
    }
    log.warn('link_confirm_failed', { userId, why, tokenHash: digest.slice(0, 12) });
    return { ok: false as const, error: LINK_GENERIC_ERROR };
  };

  if (!hit) return fail('no_match');
  if (hit.usedAt) return fail('reused', hit.id);
  if (hit.expiresAt <= new Date()) return fail('expired', hit.id);
  if ((hit.attempts ?? 0) >= LINK_MAX_ATTEMPTS) return fail('attempts', hit.id);
  if (!hit.pendingChatId) {
    // هنوز پیام /start از بات نرسیده — شمارش تلاش منظور می‌شود.
    return fail('no_pairing', hit.id);
  }

  const chatId = hit.pendingChatId;
  const now = new Date();
  await db.update(messenger_link_tokens)
    .set({ usedAt: now })
    .where(eq(messenger_link_tokens.id, hit.id));

  const values = {
    userId, channel: hit.channel, address: chatId, isActive: 1, verifiedAt: now,
  };
  await db.insert(notification_channels).values(values)
    .onConflictDoUpdate({
      target: [notification_channels.userId, notification_channels.channel],
      set: { address: chatId, isActive: 1, verifiedAt: now },
    });

  log.info('link_confirmed', { channel: hit.channel, userId, tokenHash: hit.tokenHash.slice(0, 12) });
  return { ok: true, channel: hit.channel };
}
