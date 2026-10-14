import crypto from 'node:crypto';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
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
//
//  INVARIANT (امنیتی): این تابع فقط یک «سرنخِ تأییدنشده» (pendingChatId)
//  روی ردیف توکن می‌نویسد — هرگز مقصد تحویل اعلان (notification_channels)
//  را نمی‌سازد یا تغییر نمی‌دهد. مقصد تحویل فقط در confirmLinkToken و فقط
//  با نشست احرازهویتیِ پورتال + دانستن رمز خامِ پیوندخورده به همان userId
//  ثبت می‌شود. پس chatId ادعاشده در بدنهٔ وب‌هوک به‌تنهایی هیچ اشتراکی را
//  جابه‌جا نمی‌کند؛ بدترین اثر جعلِ آن، یک pendingChatId اشتباه است که
//  قربانی هنگام تأیید می‌تواند نادیده بگیرد/بازنویسی کند.

export async function handlePairingText(
  channel: MessengerChannel, chatId: string, text: string,
  opts?: { limiterKey?: string },
): Promise<string | null> {
  // سقف تلاش جفت‌سازی — پیش‌فرض سطل (کانال، چت) برای poll (مبدأ مطمئن:
  // chatId را خودِ API پلتفرم با توکن بات داده). فراخوانِ وب‌هوک باید
  // limiterKey = IPِ مورداعتماد پروکسی بدهد، چون chatId در بدنهٔ وب‌هوک
  // مهاجم‌کنترل‌شده است و سطلِ per-chatId یعنی سطل تازه به‌ازای هر شناسهٔ
  // جعلی و دورزدن brute-force.
  const bucket = opts?.limiterKey
    ? `msg-link-pair:ip:${opts.limiterKey}`
    : `msg-link-pair:${channel}:${chatId}`;
  const rl = await rateLimit(bucket, 20, 600);
  if (!rl.ok) return LINK_GENERIC_ERROR;

  const m = text.match(/^\/start(?:@\S+)?\s*(\S+)?\s*$/);
  // بله گاهی فقط /start را تحویل می‌دهد یا کاربر فقط کد خالی می‌فرستد —
  // کد ۸ رقمی تکی هم پذیرفته می‌شود.
  const bare = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(text.trim()) ? text.trim() : '';
  const param = ((m && m[1]) || bare || '').trim();
  if (!param) {
    return 'برای اتصال حساب، از داخل پورتال «کد اتصال» بگیرید و اینجا ارسال کنید:\n/start CODE';
  }

  const digest = sha256hex(param);
  const now = new Date();
  // جست‌وجوی نمایه‌شده روی ستون‌های هش (به‌جای اسکن حافظه‌ای limit(50) که
  // کدهای معتبرِ فراتر از ۵۰ توکنِ باز را جا می‌انداخت). tokenHash ایندکس
  // دارد (ix_messenger_link_tokens_token)؛ codeHash ایندکس ندارد و افزودنش
  // مهاجرت DB می‌خواهد (خارج از scope این تغییر) — درستیِ تطبیق حفظ است.
  const rows = await db.select().from(messenger_link_tokens).where(and(
    eq(messenger_link_tokens.channel, channel),
    isNull(messenger_link_tokens.usedAt),
    gt(messenger_link_tokens.expiresAt, now),
    or(
      eq(messenger_link_tokens.tokenHash, digest),
      eq(messenger_link_tokens.codeHash, digest),
    ),
  )).limit(1);

  // مقایسهٔ ثابت‌زمان روی هر دو ستون هش (دفاع در عمق — WHERE بالا هم دقیق است)
  const hit = rows[0] && (
    timingEqHex(rows[0].tokenHash, digest) || timingEqHex(rows[0].codeHash, digest)
  ) ? rows[0] : undefined;
  if (!hit) {
    // تطبیق ناموفق: ردیفی برای سوزاندن attempts وجود ندارد — attempts فقط
    // در شکست‌های confirm (منتسب به ردیف مشخص) می‌سوزد، نه اینجا.
    log.warn('pairing_no_match', { channel, paramHash: digest.slice(0, 12) });
    return LINK_GENERIC_ERROR;
  }

  // تطبیق موفق: فقط سرنخ pending ثبت می‌شود — attempts سوزانده نمی‌شود تا
  // ارسالِ دوبارهٔ کد درست (یا replay) کاربر را قفل نکند (رگرسیون قبلی).
  await db.update(messenger_link_tokens)
    .set({ pendingChatId: chatId })
    .where(eq(messenger_link_tokens.id, hit.id));
  log.info('pairing_recorded', { channel, tokenId: hit.id, tokenHash: hit.tokenHash.slice(0, 12) });
  return 'کد دریافت شد. ✅\nبه پورتال برگردید — اتصال به‌صورت خودکار تأیید می‌شود.';
}

// ──────── بررسی وضعیت جفت‌سازی (برای تأیید خودکار سمت کلاینت) ────────
//  فقط می‌خواند؛ شمارش تلاش را نمی‌سوزاند و حالت token را تغییر نمی‌دهد.

export async function checkPairingStatus(userId: number, rawCode: string): Promise<{
  ok: boolean; paired?: boolean; channel?: string; error?: string;
}> {
  const rl = await rateLimit(`msg-link-status:${userId}`, 30, 600);
  if (!rl.ok) return { ok: false, error: LINK_GENERIC_ERROR };
  const param = String(rawCode ?? '').trim();
  if (!param) return { ok: false, error: LINK_GENERIC_ERROR };
  const digest = sha256hex(param);
  // جست‌وجوی مستقیم روی هش‌ها (بدون اسکن limit(50) — ردیف کاربرِ پرتوکن جا نمی‌ماند).
  const rows = await db.select().from(messenger_link_tokens)
    .where(and(
      eq(messenger_link_tokens.userId, userId),
      or(
        eq(messenger_link_tokens.tokenHash, digest),
        eq(messenger_link_tokens.codeHash, digest),
      ),
    )).limit(1);
  const hit = rows[0] && (
    timingEqHex(rows[0].tokenHash, digest) || timingEqHex(rows[0].codeHash, digest)
  ) ? rows[0] : undefined;
  if (!hit) return { ok: false, error: LINK_GENERIC_ERROR };
  if (hit.usedAt) return { ok: true, paired: true, channel: hit.channel };
  if (hit.expiresAt <= new Date()) return { ok: false, error: LINK_GENERIC_ERROR };
  return { ok: true, paired: Boolean(hit.pendingChatId), channel: hit.channel };
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
  // جست‌وجوی مستقیم روی هش‌ها (بدون اسکن limit(50) — ردیف کاربرِ پرتوکن جا نمی‌ماند).
  const rows = await db.select().from(messenger_link_tokens)
    .where(and(
      eq(messenger_link_tokens.userId, userId),
      or(
        eq(messenger_link_tokens.tokenHash, digest),
        eq(messenger_link_tokens.codeHash, digest),
      ),
    )).limit(1);
  const hit = rows[0] && (
    timingEqHex(rows[0].tokenHash, digest) || timingEqHex(rows[0].codeHash, digest)
  ) ? rows[0] : undefined;

  // attempts فقط روی شکستِ منتسب به ردیف مشخص می‌سوزد — هرگز روی موفقیت،
  // تا replay کد درست پس از اتصال، کاربر را قفل نکند.
  const fail = async (why: string, row?: typeof hit) => {
    if (row) {
      await db.update(messenger_link_tokens)
        .set({ attempts: (row.attempts ?? 0) + 1 })
        .where(eq(messenger_link_tokens.id, row.id));
    }
    log.warn('link_confirm_failed', { userId, why, tokenHash: digest.slice(0, 12) });
    return { ok: false as const, error: LINK_GENERIC_ERROR };
  };

  if (!hit) return fail('no_match');
  if (hit.usedAt) return fail('reused', hit);
  if (hit.expiresAt <= new Date()) return fail('expired', hit);
  if ((hit.attempts ?? 0) >= LINK_MAX_ATTEMPTS) return fail('attempts', hit);
  if (!hit.pendingChatId) {
    // هنوز پیام /start از بات نرسیده — شمارش تلاش منظور می‌شود.
    return fail('no_pairing', hit);
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

// ──────── پاکسازی روزانهٔ توکن‌های مصرف‌شده/منقضی ────────
// حذف: usedAt NOT NULL (مصرف‌شده) یا منقضی‌شدهٔ بیش از یک روز.
// از کرون روزانه صدا زده می‌شود: /api/cron/messenger-link-purge
export async function purgeExpiredLinkTokens(): Promise<{ deleted: number }> {
  const rows = await db.delete(messenger_link_tokens)
    .where(or(
      sql`${messenger_link_tokens.usedAt} IS NOT NULL`,
      sql`${messenger_link_tokens.expiresAt} < NOW() - INTERVAL '1 day'`,
    ))
    .returning({ id: messenger_link_tokens.id });
  log.info('link_tokens_purged', { deleted: rows.length });
  return { deleted: rows.length };
}
