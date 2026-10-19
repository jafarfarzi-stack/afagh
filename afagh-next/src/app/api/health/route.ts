import { NextResponse } from 'next/server';
import Redis from 'ioredis';
import { pool } from '@/db';

export const dynamic = 'force-dynamic';
// pg/ioredis/minio فقط روی Node runtime کار می‌کنند.
export const runtime = 'nodejs';

/**
 * بررسی سلامت سرویس برای load-balancer / monitoring.
 *
 * سه زیرساخت بررسی می‌شود:
 *   • db    → همیشه (`select 1`)
 *   • redis → فقط اگر `REDIS_URL` تنظیم باشد (`PING`)
 *   • minio → فقط اگر `S3_ENDPOINT`/`S3_BUCKET` تنظیم باشد (bucketExists)
 *
 * هیچ دادهٔ حساسی (رشتهٔ اتصال، رمز، پیام خطای خام) برنمی‌گرداند؛ فقط وضعیت
 * هر جزء و نسخهٔ سامانه. وضعیت‌های ممکن هر جزء: ok | down | skipped.
 */

type Check = 'ok' | 'down' | 'skipped';

/** مهلت هر بررسی تا health زیر بار LB سریع جواب دهد و معلق نماند. */
const CHECK_TIMEOUT_MS = 3000;

const withTimeout = <T>(p: Promise<T>, ms = CHECK_TIMEOUT_MS): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([p, guard]).finally(() => { if (timer) clearTimeout(timer); });
};

async function checkDb(): Promise<Check> {
  try {
    await withTimeout(pool.query('select 1'));
    return 'ok';
  } catch {
    return 'down';
  }
}

// نمونهٔ Redis مخصوص health: برخلاف کلاینت‌های rateLimit/session-lock که خودشان
// بازآزمایی و fallback دارند، این‌جا «فقط یک تلاش سریع» کافی است و شکست = down.
const gHealth = globalThis as unknown as { __afaghHealthRedis?: Redis };

function healthRedis(url: string): Redis {
  if (gHealth.__afaghHealthRedis) return gHealth.__afaghHealthRedis;
  const client = new Redis(url, {
    lazyConnect: true,
    // enableOfflineQueue پیش‌فرض (true) می‌ماند: با lazyConnect، نخستین PING
    // باید تا برقراری اتصال در صف بماند؛ غیرفعال‌کردنش، حتی در اتصال سالم هم
    // خطای «Stream isn't writeable» می‌دهد. کرانِ زمانی با connectTimeout و
    // commandTimeout و بستهٔ withTimeout تأمین می‌شود.
    connectTimeout: 1500,
    commandTimeout: CHECK_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
    // health نباید پشت‌سرهم تلاش کند؛ درخواست بعدی یک اتصال تازه می‌سازد.
    retryStrategy: () => null,
  });
  client.on('error', () => { /* خاموش — خودِ بررسی وضعیت را گزارش می‌کند */ });
  // اگر اتصال برای همیشه بسته شد، نمونهٔ کش‌شده را دور بریز تا درخواست بعدی تازه وصل شود.
  client.on('end', () => { if (gHealth.__afaghHealthRedis === client) delete gHealth.__afaghHealthRedis; });
  gHealth.__afaghHealthRedis = client;
  return client;
}

async function checkRedis(): Promise<Check> {
  const url = String(process.env.REDIS_URL || '').trim();
  if (!url) return 'skipped';
  try {
    const pong = await withTimeout(healthRedis(url).ping());
    return pong === 'PONG' ? 'ok' : 'down';
  } catch {
    return 'down';
  }
}

async function checkMinio(): Promise<Check> {
  const endpoint = String(process.env.S3_ENDPOINT || '').trim();
  const bucket = String(process.env.S3_BUCKET || '').trim();
  if (!endpoint && !bucket) return 'skipped';
  try {
    // import پویا تا نبودِ/نامعتبر بودن کلیدهای S3 در production، خودِ این route را
    // از کار نیندازد (objectStore هنگام import در production ممکن است throw کند).
    const { S3, ARCHIVE_BUCKET } = await import('@/lib/objectStore');
    const exists = await withTimeout(S3.bucketExists(ARCHIVE_BUCKET));
    return exists ? 'ok' : 'down';
  } catch {
    return 'down';
  }
}

const appVersion = (): string =>
  process.env.AFAGH_VERSION || process.env.APP_VERSION || process.env.npm_package_version || 'dev';

export async function GET() {
  const [db, redis, minio] = await Promise.all([checkDb(), checkRedis(), checkMinio()]);
  const checks = { db, redis, minio };
  // redis/minio «skipped» یعنی پیکربندی نشده‌اند و در قضاوت سلامت دخالتی ندارند.
  const ok = db === 'ok' && redis !== 'down' && minio !== 'down';
  return NextResponse.json(
    { ok, checks, version: appVersion() },
    { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
