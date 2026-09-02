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
      CREATE TABLE IF NOT EXISTS api_audit_logs (
        id SERIAL PRIMARY KEY,
        service_name VARCHAR(50),
        endpoint VARCHAR(255),
        request_body TEXT,
        response_body TEXT,
        status_code INTEGER,
        response_time_ms INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notification_templates (
        id SERIAL PRIMARY KEY,
        event_code VARCHAR(50),
        title VARCHAR(255),
        channel VARCHAR(50),
        template_text TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE process_definitions ADD COLUMN IF NOT EXISTS "description" text;
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

      -- کش گزارش‌های هوش تجاری (bi-engine)؛ همان تعریف schema.ts، idempotent
      CREATE TABLE IF NOT EXISTS analytics_snapshots (
        id SERIAL PRIMARY KEY,
        "cacheKey" VARCHAR(160) NOT NULL UNIQUE,
        "reportType" VARCHAR(60) NOT NULL,
        payload TEXT NOT NULL,
        "rowCount" INTEGER,
        "durationMs" INTEGER,
        "computedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMP
      );

      -- ایندکس‌های کوئری‌های تجمیعی BI (بخش ⑦ pg-hardening.sql)
      CREATE INDEX IF NOT EXISTS "idx_eval_resp_period_offering" ON evaluation_responses ("periodId", "offeringId");
      CREATE INDEX IF NOT EXISTS "idx_eval_resp_question"        ON evaluation_responses ("questionId");
      CREATE INDEX IF NOT EXISTS "idx_eval_resp_offering"        ON evaluation_responses ("offeringId");
      CREATE INDEX IF NOT EXISTS "idx_eval_q_form_axis"          ON evaluation_questions ("formId", "axisLabel");
      CREATE INDEX IF NOT EXISTS "idx_schedules_room_type"       ON schedules ("roomId", "scheduleType");
      CREATE INDEX IF NOT EXISTS "idx_offering_prof_role"        ON offering_professors ("role", "staffId");
      CREATE INDEX IF NOT EXISTS "idx_analytics_snapshots_type"  ON analytics_snapshots ("reportType");
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
