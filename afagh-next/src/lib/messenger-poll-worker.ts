import 'server-only';
import Redis from 'ioredis';
import { db } from '@/db';
import { messenger_poll_offsets } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getConfig, POLL_CHANNELS, sendMessage, type MessengerChannel } from '@/lib/messenger-bot';
import { getPublicBaseUrl } from '@/lib/settings';
import { handlePairingText } from '@/lib/messenger-link-tokens';
import { createLogger } from '@/lib/logger';

const log = createLogger({ mod: 'messenger-poll' });

// ═══════════════════════════════════════════════════════════════
//  Poll worker جفت‌سازی توکن — فقط BALE و EITAA
//
//  وب‌هوک inbound حذف شده؛ این worker با getUpdates (long-poll ۲۵ ثانیه)
//  فقط پیام‌های /start <token> را می‌خواند و chatId را PENDING ثبت می‌کند.
//  به هر پیام دیگری، پاسخ آموزشی ثابت (send-only) می‌دهد.
//
//  اجرا (سرویس زمان‌بند داخلی وجود ندارد — cronها بیرونی‌اند):
//    tsx -e "import('./src/lib/messenger-poll-worker').then(m => m.startAllPolling())"
//  یا به‌صورت فرایند جدا (PM2/systemd) کنار Next. قفل Redis تک‌نمونه‌ای
//  بودن را تضمین می‌کند؛ اجرای هم‌زمان چند نمونه امن است (بقیه خارج می‌شوند).
// ═══════════════════════════════════════════════════════════════

const LONG_POLL_SEC = 25;
const LOCK_TTL_SEC = 25;
const HEARTBEAT_MS = 10_000;
const BACKOFF_CAP_MS = 60_000;

const g = globalThis as unknown as {
  __afaghPollRedis?: Redis;
  __afaghPollRunning?: Map<string, { stop: () => void }>;
};
const redis: Redis =
  g.__afaghPollRedis ??
  new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: 2,
    retryStrategy: (t) => Math.min(t * 200, 2000),
    lazyConnect: false,
    enableOfflineQueue: false,
    connectTimeout: 1000,
  });
redis.on('error', () => { /* خاموش — خطا در حلقه با backoff مدیریت می‌شود */ });
if (process.env.NODE_ENV !== 'production') g.__afaghPollRedis = redis;

const running: Map<string, { stop: () => void }> =
  g.__afaghPollRunning ?? new Map();
if (process.env.NODE_ENV !== 'production') g.__afaghPollRunning = running;

type Update = {
  update_id: number;
  message?: { chat?: { id?: number | string; type?: string }; text?: string };
};

async function loadOffset(channel: MessengerChannel): Promise<number> {
  const [row] = await db.select().from(messenger_poll_offsets)
    .where(eq(messenger_poll_offsets.channel, channel)).limit(1);
  return row?.offset ?? 0;
}

async function saveOffset(channel: MessengerChannel, offset: number): Promise<void> {
  await db.insert(messenger_poll_offsets).values({ channel, offset })
    .onConflictDoUpdate({ target: messenger_poll_offsets.channel, set: { offset } });
}

async function fetchUpdates(
  channel: MessengerChannel, offset: number,
): Promise<{ updates: Update[]; ok: boolean }> {
  const { token, base, style } = await getConfig(channel);
  if (!token) return { updates: [], ok: false };
  const url = style === 'EITAA' ? `${base}/${token}/getUpdates` : `${base}/bot${token}/getUpdates`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), (LONG_POLL_SEC + 10) * 1000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ offset, timeout: LONG_POLL_SEC, allowed_updates: ['message'] }),
      signal: ctrl.signal,
    });
    if (!r.ok) return { updates: [], ok: false };
    const data = (await r.json()) as { ok?: boolean; result?: Update[] };
    return { updates: Array.isArray(data.result) ? data.result : [], ok: data.ok !== false };
  } catch {
    return { updates: [], ok: false };
  } finally {
    clearTimeout(t);
  }
}

async function handleOne(channel: MessengerChannel, u: Update): Promise<void> {
  const msg = u.message;
  const chat = msg?.chat;
  if (!chat || chat.type !== 'private' || chat.id === undefined) return;
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
    (portal ? `\nبرای اتصال حساب و پیگیری امور، به پورتال مراجعه کنید:\n${portal}` : '')
  );
}

/**
 * شروع long-poll برای یک کانال (BALE/EITAA).
 * قفل Redis تک‌نمونه‌ای: اگر نمونهٔ دیگری زنده باشد، این فراخوانی بی‌درنگ برمی‌گردد.
 */
export function startPolling(channel: MessengerChannel): { ok: boolean; error?: string } {
  if (!POLL_CHANNELS.includes(channel)) {
    return { ok: false, error: `poll برای ${channel} پشتیبانی نمی‌شود (فقط BALE و EITAA).` };
  }
  if (running.has(channel)) return { ok: true };

  const instanceId = `${process.pid}:${Date.now()}`;
  const lockKey = `poll:lock:${channel}`;
  let stopped = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stop = () => {
    stopped = true;
    if (heartbeat) clearInterval(heartbeat);
    running.delete(channel);
    redis.get(lockKey).then((v) => { if (v === instanceId) redis.del(lockKey).catch(() => {}); }).catch(() => {});
  };
  running.set(channel, { stop });

  heartbeat = setInterval(async () => {
    try {
      const v = await redis.get(lockKey);
      if (v === instanceId) await redis.expire(lockKey, LOCK_TTL_SEC);
      else if (!stopped) {
        log.warn('poll_lock_lost', { channel });
        stop();
      }
    } catch { /* ضربان بعدی تلاش می‌کند */ }
  }, HEARTBEAT_MS);

  (async () => {
    // قفل ممکن است از پروسهٔ قبلیِ مرده مانده باشد (TTL تا ۲۵ ثانیه)؛
    // تسلیم نمی‌شویم — تا آزاد شدن، هر ۵ ثانیه retry می‌کنیم.
    let acquired: string | null = null;
    while (!stopped) {
      acquired = await redis.set(lockKey, instanceId, 'EX', LOCK_TTL_SEC, 'NX').catch(() => null);
      if (acquired === 'OK') break;
      log.info('poll_lock_wait', { channel });
      await new Promise((r) => setTimeout(r, 5_000));
    }
    if (stopped || acquired !== 'OK') {
      if (heartbeat) clearInterval(heartbeat);
      running.delete(channel);
      return;
    }

    let offset = await loadOffset(channel).catch(() => 0);
    let backoffMs = 1000;
    log.info('poll_started', { channel, offset });

    while (!stopped) {
      try {
        const owner = await redis.get(lockKey).catch(() => instanceId);
        if (owner !== instanceId) { log.warn('poll_lock_lost', { channel }); break; }

        const { updates, ok } = await fetchUpdates(channel, offset);
        if (!ok) throw new Error('getUpdates_failed');

        for (const u of updates) {
          try {
            await handleOne(channel, u);
          } catch (e) {
            log.error('poll_update_failed', { channel, error: (e as Error).message });
          }
          offset = Math.max(offset, u.update_id + 1);
        }
        if (updates.length) await saveOffset(channel, offset).catch((e) => log.error('poll_offset_save_failed', { channel, error: (e as Error).message }));
        backoffMs = 1000; // موفقیت → ریست
      } catch (e) {
        log.warn('poll_backoff', { channel, waitMs: backoffMs, error: (e as Error).message });
        await new Promise((r) => setTimeout(r, backoffMs));
        backoffMs = Math.min(backoffMs * 2, BACKOFF_CAP_MS);
      }
    }

    if (heartbeat) clearInterval(heartbeat);
    running.delete(channel);
    redis.get(lockKey).then((v) => { if (v === instanceId) redis.del(lockKey).catch(() => {}); }).catch(() => {});
    log.info('poll_stopped', { channel });
  })();

  return { ok: true };
}

export function stopPolling(channel: MessengerChannel): void {
  running.get(channel)?.stop();
}

/** شروع هر دو کانال poll (BALE + EITAA) — نقطهٔ ورود فرایند worker. */
export function startAllPolling(): void {
  for (const ch of POLL_CHANNELS) {
    const r = startPolling(ch);
    if (!r.ok) log.warn('poll_start_rejected', { channel: ch, error: r.error });
  }
}
