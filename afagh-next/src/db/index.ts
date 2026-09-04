import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import * as schema from './schema';

// ── گارد production: در پروداکشن متغیرهای زیرساخت باید تعیین شوند، نه با پیش‌فرض ──
// (NEXT_PHASE یعنی در حال build هستیم؛ اتصال ایجاد نمی‌شود)
const isBuilding = !!process.env.NEXT_PHASE;
const requireEnvInProd = (name: string, url: string) => {
  if (!isBuilding && process.env.NODE_ENV === 'production' && !process.env[name]) {
    // ⚠ به‌جای اتصال با پیش‌فرض ضعیف، جریان شروع را متوقف می‌کنیم (fail-fast)
    throw new Error(`[db] در production متغیر ${name} اجباری است (پیش‌فرض توسعه‌ای «${url}» پذیرفته نمی‌شود).`);
  }
  return process.env[name] || url;
};

// اتصال تنبل (lazy) — در زمان build فایل‌های استاتیک، به دیتابیس وصل نمی‌شود
const globalForDb = globalThis as unknown as { pool?: Pool; appPool?: Pool };
export const pool = globalForDb.pool ?? new Pool({
  connectionString: requireEnvInProd('DATABASE_URL', 'postgres://afagh:afagh@localhost:5432/afagh_db'),
  max: 20,
});
if (process.env.NODE_ENV !== 'production') globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export { schema };

// ═══ پچ‌های اسکیما (Schema Patches) ═══
// ⚠ سیاست مهاجرت امن (مطابق بررسی مهندسی): اجرای اصلی پچ‌ها وظیفهٔ «migrator»
//   است (Dockerfile: drizzle-kit push → apply-patches → seed-base → hardening)
//   و پیش از استارت اپ انجام می‌شود. در runtime پروداکشن این خودترمیمی
//   غیرفعال است؛ فقط در توسعه (جایی که ممکن است DB محلی قدیمی باشد) به‌عنوان
//   راحتی اجرا می‌شود. متن کامل پچ‌ها خارج از کد: src/db/patches.sql
let schemaEnsured = false;
export async function ensureDbSchemaPatches() {
  if (schemaEnsured) return;
  schemaEnsured = true;
  if (process.env.NODE_ENV === 'production') {
    console.warn('[db] پچ‌های اسکیما باید توسط migrator پیش از استارت اپ اجرا شده باشند — خودترمیمی runtime در production غیرفعال است.');
    return;
  }
  try {
    // در dev، cwd ریشهٔ پروژه است (src/db/patches.sql). در باندل Next ممکن است
    // __dirname به .next/server اشاره کند و فایل آن‌جا نباشد — چند مسیر امتحان می‌شود.
    const candidates = [
      path.join(process.cwd(), 'src', 'db', 'patches.sql'),
      path.join(__dirname, 'patches.sql'),
      path.join(process.cwd(), 'patches.sql'),
    ];
    let patchSql: string | null = null;
    for (const p of candidates) {
      try {
        patchSql = fs.readFileSync(p, 'utf8');
        break;
      } catch { /* مسیر بعدی */ }
    }
    if (patchSql == null) throw new Error('patches.sql در هیچ مسیری پیدا نشد');
    await pool.query(patchSql);
  } catch (err: any) {
    console.error('[db] پچ اسکیما ناموفق (توسعه):', err?.message);
  }
}

// ═══ RLS (سند §۲۱۷۰) ═══
// استخر جدا با نقشِ فقط-خواندنیِ afagh_app (NOSUPERUSER → تابعیت کامل از RLS).
// خواندن‌های دانشکیت از این مسیر می‌رود: با set_config محلیِ تراکنش، حتی با
// بایپس کد اپ، دیتای دانشجوی دیگر قابل خواندن نیست.
export const appPool = globalForDb.appPool ?? new Pool({
  connectionString: requireEnvInProd('DATABASE_URL_APP', 'postgres://afagh_app:afagh_app@127.0.0.1:5432/afagh_db'),
  max: 10,
});
if (process.env.NODE_ENV !== 'production') globalForDb.appPool = appPool;

export const appDb = drizzle(appPool, { schema });

type RlsTx = Parameters<Parameters<typeof appDb.transaction>[0]>[0];

/**
 * اجرای کوئری‌های دانشجو/استاد در بستر RLSِ همان کاربر — set_config فقط در همین تراکنش زنده است.
 *
 * 🔴 سیاست FAIL-CLOSED (بررسی مهندسی — P0-1):
 * اگر زیرساخت RLS (نقش afagh_app، grantها یا پچ‌های RLS) از دست برود، هرگز به
 * اتصال مالک (BYPASSRLS) برگردانده نمی‌شود — چون در آن صورت عملاً کل عایق
 * امنیتی سطری دور زده می‌شود. رفتار:
 *   • production: خطای امنیتی کنترل‌شده + لاگ — **بدون هیچ escape hatch** (بازبینی بند ۶)
 *   • توسعه: fallback مجاز با هشدار بلند (برای دباگ بدون afagh_app محلی)
 */
export async function withUserRls<T>(userId: number, fn: (tx: RlsTx) => Promise<T>): Promise<T> {
  try {
    return await appDb.transaction(async tx => {
      await tx.execute(sql`select set_config('app.user_id', ${String(userId)}, true)`);
      return fn(tx);
    });
  } catch (err: any) {
    const msg = String(err?.message ?? '');
    const rlsInfraProblem =
      err?.code === '28P01' || // password/authentication
      err?.code === '42501' || // permission denied
      err?.code === '42P01' || // undefined table
      err?.code === '3D000' || // database does not exist
      err?.code === '28000' || // invalid authorization
      err?.code === '25006' || // read-only transaction (نقش فقط-خواندنی)
      msg.includes('afagh_app') ||
      msg.includes('permission denied') ||
      msg.includes('does not exist') ||
      msg.includes('connection');
    if (!rlsInfraProblem) throw err;

    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
      // 🔴 production: NEVER fallback (بازبینی — بند ۶). هیچ ENV عمومی‌ای نمی‌تواند
      // مسیر privileged را باز کند؛ در صورت نیاز دسترسی اضطراری، بازیابی از پشتیبان/
      // کنسول مستقیم DBA انجام می‌شود، نه از طریق اپ.
      console.error(`[rls] ⛔ زیرساخت RLS از دست رفت (${err?.code ?? '?'}): ${msg} — درخواست رد شد (fail-closed مطلق).`);
      throw new Error('خطای امنیتی زیرساخت (RLS). با مدیر سامانه تماس بگیرید.');
    }
    // فقط توسعه (برای دباگ بدون afagh_app محلی): fallback با لاگ هشدار
    console.warn('[rls] fallback توسعه‌ای به اتصال مالک فعال شد — این مسیر در production ممنوع است.');
    return (db as any).transaction(async (tx: any) => {
      await tx.execute(sql`select set_config('app.user_id', ${String(userId)}, true)`);
      return fn(tx);
    });
  }
}
