#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════
 *  تولید `scripts/seed-permissions.sql` از کاتالوگ مرجع
 *
 *  چرا؟ روی سرورِ در حال کار، برای پرکردن جدول‌های permissions و
 *  role_permissions نباید مجبور به بیلد مجدد ایمیج migrator شد.
 *  خروجی این تولیدکننده یک فایل SQL خالص است که مستقیم به psql داده می‌شود:
 *
 *    docker compose exec -T postgres psql -U afagh -d afagh_db \
 *      < afagh-next/scripts/seed-permissions.sql
 *
 *  هر بار که `src/lib/permissions-catalog.json` را تغییر دادید، این را
 *  دوباره اجرا کنید تا SQL همگام بماند:
 *
 *    node scripts/gen-permissions-sql.mjs
 * ══════════════════════════════════════════════════════════════════
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const catalog = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'src', 'lib', 'permissions-catalog.json'), 'utf8'));
const OUT = path.join(HERE, 'seed-permissions.sql');

const esc = (s) => String(s).replace(/'/g, "''");
const allCodes = catalog.permissions.map((p) => p.code);

const pairs = [];
for (const [roleCode, codes] of Object.entries(catalog.roleDefaults)) {
  for (const permCode of codes === '*' ? allCodes : codes) {
    pairs.push(`  ('${esc(roleCode)}', '${esc(permCode)}')`);
  }
}

const sql = `-- ══════════════════════════════════════════════════════════════════
--  Seed کاتالوگ مجوزها + نگاشت پیش‌فرض نقش→مجوز — SQL خالص
--
--  چرا SQL؟ تا برای فعال‌کردن صفحهٔ «ماتریس دسترسی‌ها» مجبور نباشید
--  ایمیج migrator را دوباره بیلد کنید. مستقیم روی کانتینر postgres:
--
--    docker compose exec -T postgres psql -U afagh -d afagh_db \\
--      < afagh-next/scripts/seed-permissions.sql
--
--  ⚠ این فایل تولیدشده از src/lib/permissions-catalog.json است.
--    دستی ویرایشش نکنید؛ منبع را عوض کنید و دوباره بسازید:
--      node scripts/gen-permissions-sql.mjs
--
--  idempotent است: هر چند بار اجرا شود بی‌خطر است و تخصیص‌های سفارشی
--  مدیر را پاک نمی‌کند (نقشی که از قبل مجوز دارد اصلاً دست نمی‌خورد).
-- ══════════════════════════════════════════════════════════════════
BEGIN;

-- ۱) کاتالوگ ${catalog.permissions.length} مجوزه
INSERT INTO permissions (code, title, category, description) VALUES
${catalog.permissions.map((p) => `  ('${esc(p.code)}', '${esc(p.title)}', '${esc(p.category)}', '${esc(p.description)}')`).join(',\n')}
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title, category = EXCLUDED.category, description = EXCLUDED.description;

-- ۲) نگاشت پیش‌فرض — فقط برای نقش‌هایی که هنوز هیچ مجوزی ندارند
WITH defaults(role_code, perm_code) AS (VALUES
${pairs.join(',\n')}
)
INSERT INTO role_permissions ("roleId", "permissionId")
SELECT r.id, p.id
  FROM defaults d
  JOIN roles r ON r.code = d.role_code
  JOIN permissions p ON p.code = d.perm_code
 WHERE NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp."roleId" = r.id)
ON CONFLICT DO NOTHING;

COMMIT;

-- بررسی نتیجه
\\echo '— مجوزها / تخصیص‌ها —'
SELECT (SELECT count(*) FROM permissions) AS permissions,
       (SELECT count(*) FROM role_permissions) AS grants,
       (SELECT count(*) FROM roles) AS roles;
`;

fs.writeFileSync(OUT, sql);
console.log(`✓ ${path.relative(process.cwd(), OUT)} — ${catalog.permissions.length} مجوز، ${pairs.length} تخصیص پیش‌فرض`);
