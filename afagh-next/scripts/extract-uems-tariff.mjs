#!/usr/bin/env node
/**
 * استخراج «تعرفهٔ تفصیلی شهریهٔ سما» (SQL Server) → دو TSV
 * ─────────────────────────────────────────────────────────────
 * سامانهٔ سما شهریهٔ متغیر هر درس را این‌گونه می‌سازد:
 *
 *     مبلغ درس = واحدهای نظری × Th_Price + واحدهای عملی × OP_Price
 *
 * که Th/OP از «نوع درس مالی» (Mali_type) همان درس در همان نیمسال/رشته/ورودی
 * می‌آید. برای بازتولید دقیق کارنامهٔ قدیم، هر سه جزء لازم است:
 *
 *   ۱) TermPrice     — (نیمسال، نیمسالِ ورود، رشته) → کدِ قیمتِ واحد
 *   ۲) UnitS_Price   — (کدِ قیمت، نوع درس مالی)      → Th_Price / OP_Price
 *   ۳) LT7           — کدِ درس                       → Mali_type
 *
 * خروجی:
 *   uems_term_tariff.tsv   termCode, majorCode, entryYear, maliType, th, op, uPriceCode
 *   uems_lesson_types.tsv  lessonCode, maliType, unit, th, oh
 *
 * درون‌ریزی با: node scripts/import-uems-tariff.mjs --tariff <a.tsv> --lessons <b.tsv>
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const raw = process.argv.slice(2);
const args = {};
for (let i = 0; i < raw.length; i++) {
  if (raw[i].startsWith('--')) {
    const k = raw[i].slice(2);
    args[k] = raw[i + 1] && !raw[i + 1].startsWith('--') ? raw[++i] : 'true';
  }
}
const SERVER = args.server || 'localhost\\AFAGH';
const USER = args.user || 'sa';
const PASS = args.pass || '';
const DB = args.db || 'uems';
const OUT = args.out || 'D:\\farzi\\git\\backup\\uems_rates';
const SQLCMD =
  process.env.SQLCMD ||
  'C:\\Program Files\\Microsoft SQL Server\\Client SDK\\ODBC\\170\\Tools\\Binn\\sqlcmd.exe';

mkdirSync(OUT, { recursive: true });

/**
 * برای هر (کدِ قیمت، نوع درس) یک ردیف قیمت برمی‌دارد:
 *   ▸ اول SusCode=0، بعد زیرگروه‌هایی که قیمت صفر ندارند، بعد کوچک‌ترین زیرگروه.
 *   (زیرگروه‌های «صفر» در سما یعنی بی‌تعرفه و نباید برداشته شوند.)
 *
 * ⚠️ تعرفهٔ سما «سالانه» است: کدِ قیمت سال را در خود دارد و برای همهٔ نیمسال‌های
 * آن سال (مهر/بهمن/تابستان) یکسان به کار می‌رود. جدول TermPrice فقط برای بعضی
 * نیمسال‌ها ردیف دارد (مثلاً 14031 ولی نه 14032)، پس کلید درست «سال» است نه کد
 * نیمسال؛ به همین دلیل ستون termYear هم بیرون داده می‌شود.
 */
const SQL_TARIFF = `
SET NOCOUNT ON;
WITH pick AS (
  SELECT s.UPrice_Code, s.UnitType, s.Th_Price, s.OP_Price,
         ROW_NUMBER() OVER (
           PARTITION BY s.UPrice_Code, s.UnitType
           ORDER BY CASE WHEN s.SusCode = 0 THEN 0 ELSE 1 END,
                    CASE WHEN s.Th_Price <> 0 OR s.OP_Price <> 0 THEN 0 ELSE 1 END,
                    ABS(s.SusCode), s.UnitS_PriceId
         ) AS rn
  FROM UnitS_Price s
),
u AS (SELECT * FROM pick WHERE rn = 1),
tp AS (
  SELECT DISTINCT p.Termcode, LEFT(p.Termcode, 4) AS termYear, p.TermEnter, p.Reshte, p.UPrice_code,
         ROW_NUMBER() OVER (
           PARTITION BY LEFT(p.Termcode, 4), LEFT(p.TermEnter, 4), p.Reshte
           ORDER BY p.Termcode ASC, p.TermPriceId ASC
         ) AS rn
  FROM TermPrice p
)
SELECT
  tp.termYear                        AS termYear,
  tp.Termcode                        AS srcTermCode,
  CAST(tp.Reshte AS varchar(20))     AS majorCode,
  LEFT(tp.TermEnter, 4)              AS entryYear,
  CAST(u.UnitType AS varchar(10))    AS maliType,
  CAST(u.Th_Price AS decimal(18,2))  AS th,
  CAST(u.OP_Price AS decimal(18,2))  AS op,
  CAST(tp.UPrice_code AS varchar(20)) AS uPriceCode
FROM tp
JOIN u ON u.UPrice_Code = tp.UPrice_code
WHERE tp.rn = 1 AND (u.Th_Price <> 0 OR u.OP_Price <> 0)
ORDER BY tp.termYear, tp.Reshte, LEFT(tp.TermEnter, 4), u.UnitType;
`;

const SQL_LESSONS = `
SET NOCOUNT ON;
SELECT CAST(Code AS varchar(20)) AS lessonCode,
       CAST(Mali_type AS varchar(10)) AS maliType,
       CAST(Unit AS varchar(20)) AS unit,
       CAST(Th AS varchar(20)) AS th,
       CAST(Oh AS varchar(20)) AS oh
FROM LT7
WHERE Code IS NOT NULL
ORDER BY Code;
`;

function run(label, sql, file) {
  const r = spawnSync(
    SQLCMD,
    ['-S', SERVER, '-U', USER, '-P', PASS, '-d', DB, '-Q', sql, '-W', '-s', '\t', '-h', '-1'],
    { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 * 256 },
  );
  if (r.status !== 0) {
    console.error(`${label}: sqlcmd failed\n` + String(r.stderr || r.stdout).slice(0, 1500));
    process.exit(1);
  }
  const tsv = r.stdout.replace(/^\uFEFF/, '');
  const lines = tsv.split(/\r?\n/).filter((l) => l.trim() !== '');
  const path = join(OUT, file);
  writeFileSync(path, lines.join('\n') + '\n', 'utf8');
  console.log(`${file}  ${lines.length} rows -> ${path}`);
}

run('tariff', SQL_TARIFF, 'uems_term_tariff.tsv');
run('lessons', SQL_LESSONS, 'uems_lesson_types.tsv');
