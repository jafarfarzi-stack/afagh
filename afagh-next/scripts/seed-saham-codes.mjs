#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════
 *  سید «کد واحد/دانشکدهٔ سهام» (IRPHE) — idempotent
 *
 *  چرا جدا از مهاجرت است؟
 *  ──────────────────────
 *  پیش‌تر این سید داخل `drizzle/0046_saham_export_fields.sql` بود و
 *  `facultyId`ها را **ثابت** (1، 2، 4) می‌نوشت. هیچ مهاجرتی جدول
 *  `faculties` را نمی‌سازد (فقط `scripts/seed-base.mjs`، که بعد از
 *  مهاجرت اجرا می‌شود) و آن idها هم مربوط به داده‌ای بودند که فقط در
 *  دیتابیس توسعه‌دهنده وجود داشت. نتیجه روی هر دیتابیس تازه:
 *
 *    insert or update on table "saham_institute_codes" violates
 *    foreign key constraint "saham_institute_codes_facultyId_fkey"
 *    detail: Key (facultyId)=(2) is not present in table "faculties".
 *
 *  و چون drizzle همهٔ مهاجرت‌ها را در یک تراکنش می‌بندد، **کل زنجیرهٔ
 *  مهاجرت** rollback می‌شد (۰ جدول، ۰ ردیف در دفتر مهاجرت) → استقرار
 *  تازه در گام ۱ شکست می‌خورد.
 *
 *  این اسکریپت همان هشت ردیف را می‌کارد، ولی با **کد** به‌جای id:
 *   • دانشگاه با `universities.code` (AFAGH/ZARINE/ALLAME/SHAMS/NAZHAND
 *     که مهاجرت ۰۰۰۵ می‌سازد) حل می‌شود؛
 *   • دانشکدهٔ آفاق با ترکیب `universityId` + `facultyCode` حل می‌شود
 *     (کدهای ۲۰ و ۳۰ مطابق STRUCTURE در `seed-base.mjs`)؛
 *   • اگر دانشکده هنوز ساخته نشده باشد، ردیف با `facultyId = NULL`
 *     («کل مؤسسه») درج می‌شود — بی‌صدا سقوط نمی‌کنیم و هشدار می‌دهیم.
 *   • در اجرای مجدد، کد/عنوان به‌روز و ردیف فعال می‌شود (بی‌خطر و تکرارپذیر).
 *
 *  ترتیب اجرا در استقرار تازه:
 *    ۱) node scripts/migrate-db.mjs        (اسکیما)
 *    ۲) node scripts/seed-base.mjs         (دانشگاه/دانشکده/گروه/رشته/مقاطع)
 *    ۳) node scripts/seed-saham-codes.mjs  ← همین فایل
 *
 *  استفاده:
 *    DATABASE_URL=postgres://afagh:afagh@localhost:5432/afagh_db \
 *      node scripts/seed-saham-codes.mjs
 * ══════════════════════════════════════════════════════════════════
 */
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db',
  max: 2,
});

const q = async (text, params = []) => (await pool.query(text, params)).rows;

/**
 * کدهای رسمی سهام از فایل Higher_Education_Institute_Code.xlsx
 * (۱۲ رقمی؛ استان/شهر همه آذربایجان غربی = ۱۲؛ ارومیه = ۱۱، خوی = ۱۵).
 *
 * uniCode    : universities.code
 * facultyCode: faculties.facultyCode داخل همان دانشگاه — null یعنی «کل مؤسسه»
 *              (مؤسسه‌های تک‌واحدی زرینه/شمس/نژند/علامه، و «حوزهٔ ستادی» آفاق).
 *
 * دربارهٔ «علامه»: کدی به همین نام در فهرست سهام نیست (وزارت «علامه
 * امینی/خویی/حلی/…» را دارد) → طبق تصمیم مالک، کد آفاق زده می‌شود.
 * منطق fallback در کد export هم هست: هر دانشگاهی که ردیف فعال نداشته
 * باشد، کد «حوزهٔ ستادی آفاق» را می‌گیرد.
 */
const CODES = [
  { uniCode: 'AFAGH',   facultyCode: null, title: 'حوزه ستادی',                    code: '060500519999', provinceCode: '12', cityCode: '11', isDefault: 1 },
  { uniCode: 'AFAGH',   facultyCode: '30', title: 'دانشکده اقتصاد و علوم انسانی',  code: '060500510010', provinceCode: '12', cityCode: '11', isDefault: 0 },
  { uniCode: 'AFAGH',   facultyCode: '20', title: 'دانشکده فنی و مهندسی',          code: '060500510020', provinceCode: '12', cityCode: '11', isDefault: 0 },
  { uniCode: 'AFAGH',   facultyCode: null, title: 'دانشکده کشاورزی و منابع طبیعی', code: '060500510030', provinceCode: '12', cityCode: '11', isDefault: 0 },
  { uniCode: 'ZARINE',  facultyCode: null, title: 'موسسه آموزش عالی زرینه',        code: '060501540000', provinceCode: '12', cityCode: '15', isDefault: 1 },
  { uniCode: 'ALLAME',  facultyCode: null, title: 'موسسه آموزش عالی علامه',        code: '060500519999', provinceCode: '12', cityCode: '11', isDefault: 1 },
  { uniCode: 'SHAMS',   facultyCode: null, title: 'موسسه آموزش عالی شمس',          code: '060501820000', provinceCode: '12', cityCode: '15', isDefault: 1 },
  { uniCode: 'NAZHAND', facultyCode: null, title: 'موسسه آموزش عالی نژند',         code: '060503070000', provinceCode: '12', cityCode: '15', isDefault: 1 },
];

try {
  const exists = await q(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='saham_institute_codes' LIMIT 1`);
  if (!exists.length) {
    console.error('❌ جدول saham_institute_codes وجود ندارد — اول `node scripts/migrate-db.mjs` را اجرا کنید.');
    process.exit(1);
  }

  let inserted = 0, updated = 0, skipped = 0;
  for (const row of CODES) {
    const [uni] = await q('SELECT id FROM universities WHERE code = $1 LIMIT 1', [row.uniCode]);
    if (!uni) {
      console.warn(`⚠ دانشگاه «${row.uniCode}» یافت نشد — ردیف «${row.title}» رد شد.`);
      skipped++;
      continue;
    }

    // دانشکده با کد (نه id ثابت). نبودنش خطا نیست: NULL = کل مؤسسه.
    let facultyId = null;
    if (row.facultyCode) {
      const [fac] = await q(
        'SELECT id FROM faculties WHERE "universityId" = $1 AND "facultyCode" = $2 ORDER BY id LIMIT 1',
        [uni.id, row.facultyCode]);
      if (!fac) {
        console.warn(`⚠ دانشکدهٔ «${row.facultyCode}» در دانشگاه ${row.uniCode} نیست — «${row.title}» با facultyId=NULL (کل مؤسسه) درج می‌شود.`);
      } else {
        facultyId = fac.id;
      }
    }

    const res = await q(
      `INSERT INTO saham_institute_codes
         ("universityId","facultyId","title","code","provinceCode","cityCode","isDefault","isActive")
       VALUES ($1,$2,$3,$4,$5,$6,$7,1)
       ON CONFLICT ("universityId","code") DO UPDATE
         SET "title" = EXCLUDED."title",
             "facultyId" = EXCLUDED."facultyId",
             "provinceCode" = EXCLUDED."provinceCode",
             "cityCode" = EXCLUDED."cityCode",
             "isDefault" = EXCLUDED."isDefault",
             "isActive" = 1
       RETURNING (xmax = 0) AS inserted`,
      [uni.id, facultyId, row.title, row.code, row.provinceCode, row.cityCode, row.isDefault]);
    if (res[0]?.inserted) inserted++; else updated++;
    console.log(`  ✓ ${row.uniCode}/${row.facultyCode ?? '—'} → ${row.code} (${row.title})`);
  }

  console.log(`✅ کدهای سهام: ${inserted} درج، ${updated} به‌روزرسانی، ${skipped} رد‌شده.`);
} catch (err) {
  console.error('❌ خطا در سید کدهای سهام:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
