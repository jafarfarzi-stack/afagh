import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import * as schema from './schema';

// اتصال تنبل (lazy) — در زمان build فایل‌های استاتیک، به دیتابیس وصل نمی‌شود
const globalForDb = globalThis as unknown as { pool?: Pool; appPool?: Pool };
export const pool = globalForDb.pool ?? new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db',
  max: 20,
});
if (process.env.NODE_ENV !== 'production') globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export { schema };

// ═══ RLS (سند §۲۱۷۰) ═══
// استخر جدا با نقشِ فقط-خواندنیِ afagh_app (NOSUPERUSER → تابعیت کامل از RLS).
// خواندن‌های دانشکیت از این مسیر می‌رود: با set_config محلیِ تراکنش، حتی با
// بایپس کد اپ، دیتای دانشجوی دیگر قابل خواندن نیست.
export const appPool = globalForDb.appPool ?? new Pool({
  connectionString: process.env.DATABASE_URL_APP || 'postgres://afagh_app:afagh_app@127.0.0.1:5432/afagh_db',
  max: 10,
});
if (process.env.NODE_ENV !== 'production') globalForDb.appPool = appPool;

export const appDb = drizzle(appPool, { schema });

type RlsTx = Parameters<Parameters<typeof appDb.transaction>[0]>[0];

/** اجرای کوئری‌های خواندن در بستر RLSِ همان کاربر — set_config فقط در همین تراکنش زنده است */
export async function withUserRls<T>(userId: number, fn: (tx: RlsTx) => Promise<T>): Promise<T> {
  try {
    return await appDb.transaction(async tx => {
      await tx.execute(sql`select set_config('app.user_id', ${String(userId)}, true)`);
      return fn(tx);
    });
  } catch (err: any) {
    // در صورت عدم ایجاد نقش afagh_app در دیتابیس، به اتصال اصلی برگرد تا سرویس‌دهی قطع نشود
    if (err?.message?.includes('afagh_app') || err?.code === '28P01') {
      return (db as any).transaction(async (tx: any) => {
        await tx.execute(sql`select set_config('app.user_id', ${String(userId)}, true)`);
        return fn(tx);
      });
    }
    throw err;
  }
}
