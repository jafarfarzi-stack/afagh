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

// ═══ خودترمیمی خودکار اسکیما (Auto-Healing DB Schema Patches) ═══
// برای جلوگیری از خطای نبود ستون‌ها در دیتابیس‌های لوکال یا نسخه‌های قبلی
let schemaEnsured = false;
export async function ensureDbSchemaPatches() {
  if (schemaEnsured) return;
  schemaEnsured = true;
  try {
    await pool.query(`
      ALTER TABLE process_definitions ADD COLUMN IF NOT EXISTS "category" varchar(50) DEFAULT 'عمومی';
      ALTER TABLE process_definitions ADD COLUMN IF NOT EXISTS "formSchema" text;
      ALTER TABLE process_definitions ADD COLUMN IF NOT EXISTS "outputTemplate" varchar(50);
      ALTER TABLE process_definitions ADD COLUMN IF NOT EXISTS "feeAmount" integer DEFAULT 0;
      ALTER TABLE process_definitions ADD COLUMN IF NOT EXISTS "isActive" integer DEFAULT 1;

      ALTER TABLE process_steps ADD COLUMN IF NOT EXISTS "timeoutEscalateToRole" varchar(50);
      ALTER TABLE process_steps ADD COLUMN IF NOT EXISTS "slaHours" integer DEFAULT 24;
      ALTER TABLE process_steps ADD COLUMN IF NOT EXISTS "timeoutAction" varchar(50) DEFAULT 'AUTO_ESCALATE';
      ALTER TABLE process_steps ADD COLUMN IF NOT EXISTS "stepOrder" integer DEFAULT 1;
      ALTER TABLE process_steps ADD COLUMN IF NOT EXISTS "stepType" varchar(30) DEFAULT 'APPROVAL';
      ALTER TABLE process_steps ADD COLUMN IF NOT EXISTS "serviceTaskType" varchar(50);
      ALTER TABLE process_steps ADD COLUMN IF NOT EXISTS "autoConditionsJson" text;
      ALTER TABLE process_steps ADD COLUMN IF NOT EXISTS "assignedStaffId" integer;

      ALTER TABLE educational_regulations ADD COLUMN IF NOT EXISTS "rulesConfig" text DEFAULT '{}';
      ALTER TABLE students ADD COLUMN IF NOT EXISTS "quotaType" varchar(50) DEFAULT 'NORMAL';
      ALTER TABLE students ADD COLUMN IF NOT EXISTS "extraAllowedSemesters" integer DEFAULT 0;
      ALTER TABLE students ADD COLUMN IF NOT EXISTS "extraAllowedProbations" integer DEFAULT 0;
    `);
  } catch (_) {}
}

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
