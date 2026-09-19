#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════
 *  Seed کاتالوگ مجوزها + نگاشت پیش‌فرض نقش→مجوز (RBAC) — idempotent
 *
 *  چرا اسکریپت جداگانه؟ `seed-base.mjs` علاوه بر این کار، کلیدهای cron را
 *  هم بازتولید می‌کند و برای سرورِ در حال کار مناسب نیست. این فایل فقط و فقط
 *  جدول‌های `permissions` و `role_permissions` را هم‌تراز می‌کند، پس روی
 *  محیط production بی‌خطر است و می‌توان هر بار پس از deploy اجرایش کرد.
 *
 *  استفاده:
 *    DATABASE_URL=postgres://… node scripts/seed-permissions.mjs
 *    npm run db:permissions
 *
 *  فلگ اختیاری:
 *    --reset-defaults   نگاشت همهٔ نقش‌ها را به حالت پیش‌فرض کاتالوگ برمی‌گرداند
 *                       (⚠ سفارشی‌سازی‌های مدیر پاک می‌شود؛ پیش‌فرض: خاموش)
 *
 *  منبع واحد داده: src/lib/permissions-catalog.json — همان فایلی که خودِ اپ
 *  در `src/lib/permissions-catalog.ts` می‌خواند، تا کاتالوگ اپ و دیتابیس
 *  هرگز از هم واگرا نشوند.
 * ══════════════════════════════════════════════════════════════════
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));

/** خواندن کاتالوگ مرجع از دیسک */
export function loadCatalog() {
  const p = path.join(HERE, '..', 'src', 'lib', 'permissions-catalog.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * هم‌ترازسازی کاتالوگ مجوزها و نگاشت پیش‌فرض نقش‌ها.
 * @param {(text: string, params?: any[]) => Promise<any[]>} q اجراکنندهٔ کوئری (rows برمی‌گرداند)
 * @param {{ resetDefaults?: boolean, log?: (msg: string) => void }} [opts]
 */
export async function seedPermissions(q, opts = {}) {
  const log = opts.log ?? (() => {});
  const catalog = loadCatalog();

  // ۱) کاتالوگ مجوزها — عنوان/دسته/شرح همیشه با فایل مرجع به‌روز می‌شود
  const permIdByCode = {};
  for (const p of catalog.permissions) {
    const [row] = await q(
      `INSERT INTO permissions (code, title, category, description) VALUES ($1,$2,$3,$4)
       ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, category = EXCLUDED.category, description = EXCLUDED.description
       RETURNING id`,
      [p.code, p.title, p.category, p.description],
    );
    permIdByCode[p.code] = row.id;
  }

  // ۲) نگاشت پیش‌فرض — فقط برای نقش‌هایی که هنوز هیچ مجوزی ندارند،
  //    وگرنه هر اجرای مجدد، تنظیمات دستی مدیر را برمی‌گرداند.
  let mapped = 0;
  let skipped = 0;
  for (const [roleCode, codes] of Object.entries(catalog.roleDefaults)) {
    const [role] = await q(`SELECT id FROM roles WHERE code = $1`, [roleCode]);
    if (!role) continue;

    const [existing] = await q(`SELECT count(*)::int AS c FROM role_permissions WHERE "roleId" = $1`, [role.id]);
    if (existing.c > 0) {
      if (!opts.resetDefaults) {
        skipped++;
        continue;
      }
      await q(`DELETE FROM role_permissions WHERE "roleId" = $1`, [role.id]);
    }

    const list = codes === '*' ? catalog.permissions.map((p) => p.code) : codes;
    for (const code of list) {
      const pid = permIdByCode[code];
      if (!pid) continue;
      await q(`INSERT INTO role_permissions ("roleId", "permissionId") VALUES ($1,$2) ON CONFLICT DO NOTHING`, [role.id, pid]);
      mapped++;
    }
  }

  log(`  ✓ مجوزها (${catalog.permissions.length}) · تخصیص پیش‌فرض جدید: ${mapped} · نقش دست‌نخورده (سفارشی): ${skipped}`);
  return { permissions: catalog.permissions.length, mapped, skipped };
}

// ── اجرای مستقیم از خط فرمان ──
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(url.fileURLToPath(import.meta.url))) {
  const pg = (await import('pg')).default;
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db',
    max: 3,
  });
  const q = async (text, params = []) => (await pool.query(text, params)).rows;
  try {
    console.log('🛡️  هم‌ترازسازی کاتالوگ مجوزها…');
    await seedPermissions(q, {
      resetDefaults: process.argv.includes('--reset-defaults'),
      log: (m) => console.log(m),
    });
    console.log('🎉 انجام شد — صفحهٔ «ماتریس دسترسی‌ها» اکنون داده دارد.');
  } catch (err) {
    console.error('❌ خطا:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
