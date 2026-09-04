#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════
 *  ساخت دادهٔ پایهٔ مرجع (Reference Data) — idempotent
 *
 *  چرا لازم است؟ روی نصب تازه (Docker)، migrator فقط جدول‌ها را می‌سازد
 *  (drizzle-kit push) و هیچ داده‌ای seed نمی‌کند؛ بنابراین:
 *   • degree_level_configs / educational_regulations خالی‌اند
 *   • حساب دموی دانشجو ساخته می‌شود ولی ردیف students نه
 *   → پورتال دانشجوی نمونه: «پروندهٔ دانشجویی یافت نشد.»
 *
 *  این اسکریپت همان دادهٔ پایهٔ seed فاز صفر را در PostgreSQL می‌سازد
 *  (نقش‌ها، مقاطع، آیین‌نامه‌ها، دانشکده/گروه/رشته). اجرای مجدد بی‌خطر است.
 *
 *  استفاده (در سرور):
 *    docker compose run --rm migrator node scripts/seed-base.mjs
 *  یا مستقیم با یک DATABASE_URL:
 *    DATABASE_URL=postgres://afagh:afagh@localhost:5432/afagh_db node scripts/seed-base.mjs
 * ══════════════════════════════════════════════════════════════════
 */
import pg from 'pg';
import { createRequire } from 'node:module';

const { Pool } = pg;
// برای import داینامیک ماژول‌های node در انتهای اسکریپت (بخش secrets)
const nodeRequire = createRequire(import.meta.url);
const fs = nodeRequire('node:fs');
const path = nodeRequire('node:path');
const crypto = nodeRequire('node:crypto');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db',
  max: 5,
});

const q = async (text, params = []) => (await pool.query(text, params)).rows;
const q1 = async (text, params = []) => (await q(text, params))[0];

const ROLES = [
  ['STUDENT', 'دانشجو'], ['PROFESSOR', 'استاد'], ['DEP_HEAD', 'مدیر گروه'],
  ['EDU_EXPERT', 'کارشناس آموزش'], ['VICE_EDU', 'معاون آموزشی'],
  ['FINANCE_EXPERT', 'کارشناس مالی'], ['ADMIN', 'مدیر سامانه'],
  ['ARCHIVE_EXPERT', 'کارشناس بایگانی'], ['MILITARY_OFFICER', 'کارشناس نظام وظیفه'],
  ['PROCTOR', 'مراقب امتحان'], ['VAULT_MANAGER', 'مسئول مخزن مدارک'],
];

const DEGREES = [
  ['کارشناسی پیوسته', 'BS', '10.00', '12.00', 20],
  ['کارشناسی ارشد', 'MS', '12.00', '14.00', 12],
  ['کاردانی پیوسته', 'AD', '10.00', '12.00', 18],
  ['دکتری حرفه‌ای', 'PHD', '14.00', '16.00', 12],
];

const REGULATION = {
  regular_term_rules: { minUnits: 12, maxUnits: 20, probationMaxUnits: 14, gpaA_MaxUnits: 24 },
  summer_term_rules: { defaultMaxUnits: 6, graduatingMaxUnits: 8 },
  graduating_term_rules: { canTakeWithProbation: true, maxUnits: 24 },
  quota_overrides: { SHAHED_ISARGAR: { summer_term_rules: { defaultMaxUnits: 8 }, probationMaxUnits: 14 } },
  failed_course_gpa_policy: 'EXCLUDE_IF_PASSED',
  unexcused_absence_policy: 'ZERO',
  probation_gpa_threshold: 12, max_allowed_probations: 3, max_study_semesters: 8, gpaA_threshold: 17,
};

const STRUCTURE = [
  // [دانشکده, کد, گروه, کدگروه, [[نامرشته, کدرشته, کدمقطع]...]]
  ['دانشکده فنی و مهندسی', '20', 'گروه مهندسی کامپیوتر', '1', [
    ['مهندسی نرم‌افزار', '412', 'BS'],
    ['مهندسی نرم‌افزار — انتقالی (تکمیل دوره)', '413', 'BS'],
    ['مهندسی کامپیوتر — هوش مصنوعی', '414', 'BS'],
    ['مهندسی کامپیوتر — ارشد', '113', 'MS'],
  ]],
  ['دانشکده فنی و مهندسی', '20', 'گروه مهندسی برق', '2', [
    ['مهندسی برق — مخابرات', '310', 'BS'],
  ]],
  ['دانشکده فنی و مهندسی', '20', 'گروه علوم کامپیوتر', '3', [
    ['علوم کامپیوتر', '201', 'BS'],
  ]],
  ['دانشکده اقتصاد و علوم انسانی', '30', 'گروه مدیریت', '4', [
    ['مدیریت کسب و کار (MBA)', '601', 'MS'],
  ]],
];

try {
  console.log('🌱 ساخت دادهٔ پایه…');

  // نقش‌ها
  for (const [code, title] of ROLES) {
    await q(`INSERT INTO roles (code, title, "isSystem") VALUES ($1,$2,1) ON CONFLICT (code) DO NOTHING`, [code, title]);
  }
  console.log(`  ✓ نقش‌ها (${ROLES.length})`);

  // مقاطع
  const degreeIds = {};
  for (const [title, code, passing, gpa, maxUnits] of DEGREES) {
    const [row] = await q(
      `INSERT INTO degree_level_configs (title, code, "defaultPassingGrade", "conditionalGpaThreshold", "maxUnitsPerTerm")
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title RETURNING id`, [title, code, passing, gpa, maxUnits]);
    degreeIds[code] = row.id;
  }
  console.log(`  ✓ مقاطع (${DEGREES.length})`);

  // آیین‌نامه‌ها — یک ردیف برای هر مقطع
  for (const [title, code] of DEGREES) {
    const regTitle = `آیین‌نامهٔ آموزشی مصوب ۱۴۰۳ — ${title}`;
    const [existing] = await q(`SELECT id FROM educational_regulations WHERE title = $1 LIMIT 1`, [regTitle]);
    if (!existing) {
      await q(
        `INSERT INTO educational_regulations (title, "degreeLevelId", "effectiveFromYear", "rulesConfig")
         VALUES ($1,$2,1403,$3)`,
        [regTitle, degreeIds[code], JSON.stringify(REGULATION)]);
    }
  }
  console.log(`  ✓ آیین‌نامه‌ها (${DEGREES.length})`);

  // دانشکده/گروه/رشته
  for (const [facName, facCode, depName, depCode, majors] of STRUCTURE) {
    let [fac] = await q(`SELECT id FROM faculties WHERE "facultyCode" = $1 LIMIT 1`, [facCode]);
    if (!fac) {
      [fac] = await q(`INSERT INTO faculties (name, "facultyCode") VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id`, [facName, facCode]);
      if (!fac) [fac] = await q1(`SELECT id FROM faculties WHERE "facultyCode" = $1 LIMIT 1`, [facCode]);
    }
    if (!fac) throw new Error(`ساخت دانشکده «${facName}» ممکن نشد`);

    let [dep] = await q(`SELECT id FROM departments WHERE "facultyId" = $1 AND "departmentCode" = $2 LIMIT 1`, [fac.id, depCode]);
    if (!dep) {
      [dep] = await q(`INSERT INTO departments (name, "facultyId", "departmentCode") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id`, [depName, fac.id, depCode]);
      if (!dep) [dep] = await q1(`SELECT id FROM departments WHERE "facultyId" = $1 AND "departmentCode" = $2 LIMIT 1`, [fac.id, depCode]);
    }
    if (!dep) throw new Error(`ساخت گروه «${depName}» ممکن نشد`);

    for (const [majName, majCode, degreeCode] of majors) {
      const levelId = degreeIds[degreeCode];
      if (!levelId) continue;
      await q(
        `INSERT INTO majors (name, "degreeLevelId", "departmentId", "facultyId", "majorCode", "isActive")
         VALUES ($1,$2,$3,$4,$5,1) ON CONFLICT ("majorCode") DO UPDATE SET name = EXCLUDED.name`,
        [majName, levelId, dep.id, fac.id, majCode]);
    }
  }
  console.log(`  ✓ دانشکده/گروه/رشته (${STRUCTURE.length} دانشکده)`);

  // ═══ M-2: تضمین کلیدهای محرمانهٔ پویش‌های زمان‌بندی‌شده ═══
  // بدون این، scheduler هیچ پویشی را فراخوانی نمی‌کرد (خاموشی بی‌صدا):
  //   FINANCE_CRON_SECRET → یادآوری چک
  //   GRAD_CRON_SECRET    → فارغ‌التحصیلی + BI + گردش کار
  // رفتار:
  //   • DB منبع حقیقت برای اپ است (getSetting اول DB را می‌خواند)؛
  //   • scheduler از فایل secrets.env در volume مشترک می‌خواند؛
  //   • این دو همیشه با هم همگام می‌شوند تا هر دو طرف یک کلید را ببینند.
  //   • اگر env ست شده → همان در DB ثبت می‌شود؛ اگر هیچ‌کس ست نکرده →
  //     یک کلید تصادفی ۴۸-کاراکتری تولید و در DB + فایل ثبت می‌شود.
  try {
    const CRON_SECRETS = [
      { key: 'FINANCE_CRON_SECRET', env: process.env.FINANCE_CRON_SECRET }, // یادآوری چک
      { key: 'GRAD_CRON_SECRET', env: process.env.GRAD_CRON_SECRET },       // فارغ‌التحصیلی + گردش کار
      { key: 'BI_CRON_SECRET', env: process.env.BI_CRON_SECRET },           // تازه‌سازی BI (M-3: مستقل از GRAD)
    ];
    const secretsDir = '/secrets';
    const secretsFile = path.join(secretsDir, 'cron.env');
    const writeable = fs.existsSync(secretsDir) ? secretsFile : null;

    const outLines = [];
    let prevValue = ''; // برای همارز اولیهٔ BI (سازگاری با نصب‌های قدیمی)
    for (const { key, env } of CRON_SECRETS) {
      const [row] = await q(`SELECT value FROM system_settings WHERE key = $1`, [key]);
      let value = (row?.value || '').trim();
      const envVal = (env || '').trim();
      if (!value && envVal) value = envVal;
      if (!value) value = key === 'BI_CRON_SECRET' && prevValue ? prevValue : crypto.randomBytes(24).toString('hex');
      await q(
        `INSERT INTO system_settings (key, value) VALUES ($1,$2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, value],
      );
      if (writeable) outLines.push(`${key}=${value}`);
      console.log(`  ✓ ${key} ${envVal ? '(از ENV)' : '(تصادفی جدید — در DB و فایل secrets ثبت شد)'}`);
      prevValue = value;
    }
    if (writeable) {
      fs.writeFileSync(secretsFile, outLines.join('\n') + '\n', { mode: 0o600 });
      console.log(`  ✓ فایل کلیدها برای scheduler: ${secretsFile}`);
    }
  } catch (err) {
    // شکست در secrets نباید نصب را متوقف کند؛ فقط هشدار واضح
    console.error('⚠️  هشدار (ساخت کلیدهای پویش):', err.message);
  }

  console.log('\n🎉 دادهٔ پایه آماده است — اکنون با حساب دمو (مثلاً 1010101010) دوباره وارد شوید؛ پروندهٔ دانشجویی خودکار ساخته می‌شود.');
} catch (err) {
  console.error('❌ خطا:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
