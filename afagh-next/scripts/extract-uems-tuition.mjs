#!/usr/bin/env node
/**
 * استخراج تعرفهٔ شهریه از دیتابیس کهنِ uems (SQL Server) → TSV
 * ───────────────────────────────────────────────────────────
 * منبع: جدول‌های تعرفهٔ سامانهٔ سما:
 *   ▸ TermPrice     — (نیمسال، نیمسالِ ورود، رشته) → کدِ قیمتِ واحد + کدِ قیمتِ ثابت
 *   ▸ UnitS_Price   — (کدِ قیمتِ واحد، زیرگروه، نوع درس) → قیمت هر واحد نظری/عملی
 *   ▸ FixPrice      — (کدِ قیمتِ ثابت، حالت) → شهریهٔ ثابت
 *
 * خروجی: یک ردیف به‌ازای هر (رشته، سالِ ورود) — جدیدترین تعرفه‌ای که برای آن
 * گروه در سامانهٔ مبدأ اعمال شده است (یعنی تعرفهٔ جاریِ آن گروه).
 *
 * درون‌ریزی با:  node scripts/import-uems-tuition.mjs --in <file.tsv> --apply
 *
 * اجرا:
 *   node scripts/extract-uems-tuition.mjs --server "localhost\AFAGH" --user sa --pass "..." --db uems --out D:\farzi\git\backup\uems_rates
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
 * تعرفهٔ جاری هر (رشته، سالِ ورود).
 *   ▸ pick  : برای هر (کد قیمت، نوع درس) ردیفِ SusCode=0 را ترجیح می‌دهد.
 *   ▸ agg   : نرخ نظری/عملی/عمومی را از نوع‌های درسِ رایج برمی‌دارد
 *             (تخصصی ۳ → پایه ۲ → اصلی ۴ → عمومی ۱).
 *   ▸ latest: جدیدترین نیمسالِ اعمال‌شده برای هر (رشته، نیمسالِ ورود).
 */
const SQL = `
SET NOCOUNT ON;
WITH pick AS (
  SELECT s.UPrice_Code, s.UnitType, s.Th_Price, s.OP_Price,
         ROW_NUMBER() OVER (
           PARTITION BY s.UPrice_Code, s.UnitType
           ORDER BY CASE WHEN s.SusCode = 0 THEN 0 ELSE 1 END, ABS(s.SusCode), s.UnitS_PriceId
         ) AS rn
  FROM UnitS_Price s
  WHERE (s.Th_Price <> 0 OR s.OP_Price <> 0)
),
u AS (SELECT * FROM pick WHERE rn = 1),
agg AS (
  SELECT UPrice_Code,
         MAX(CASE WHEN UnitType = 3 THEN Th_Price END) AS th3,
         MAX(CASE WHEN UnitType = 3 THEN OP_Price END) AS op3,
         MAX(CASE WHEN UnitType = 2 THEN Th_Price END) AS th2,
         MAX(CASE WHEN UnitType = 2 THEN OP_Price END) AS op2,
         MAX(CASE WHEN UnitType = 4 THEN Th_Price END) AS th4,
         MAX(CASE WHEN UnitType = 4 THEN OP_Price END) AS op4,
         MAX(CASE WHEN UnitType = 1 THEN Th_Price END) AS th1,
         COUNT(*) AS types
  FROM u GROUP BY UPrice_Code
),
latest AS (
  SELECT p.Reshte, p.TermEnter, p.Termcode, p.UPrice_code, p.FPrice_code, p.COURSETYPE,
         ROW_NUMBER() OVER (
           PARTITION BY p.Reshte, LEFT(p.TermEnter, 4)
           ORDER BY p.Termcode DESC, p.TermEnter ASC, p.TermPriceId ASC
         ) AS rn
  FROM TermPrice p
),
fp AS (
  SELECT FPrice_Code, AVG(FixPrice) AS fix, COUNT(*) AS states
  FROM FixPrice GROUP BY FPrice_Code
)
SELECT
  CAST(l.Reshte AS varchar(20))      AS majorCode,
  LEFT(l.TermEnter, 4)               AS entryYear,
  l.Termcode                         AS srcTerm,
  l.TermEnter                        AS srcEntryTerm,
  l.COURSETYPE                       AS srcCourseType,
  CAST(l.UPrice_code AS varchar(20)) AS srcUPriceCode,
  CAST(l.FPrice_code AS varchar(20)) AS srcFPriceCode,
  CAST(COALESCE(NULLIF(a.th3,0), NULLIF(a.th2,0), NULLIF(a.th4,0), NULLIF(a.th1,0), 0) AS decimal(18,2)) AS theory,
  CAST(COALESCE(NULLIF(a.op3,0), NULLIF(a.op2,0), NULLIF(a.op4,0), 0) AS decimal(18,2))                  AS practical,
  CAST(COALESCE(NULLIF(a.th1,0), NULLIF(a.th3,0), NULLIF(a.th2,0), NULLIF(a.th4,0), 0) AS decimal(18,2)) AS general,
  CAST(COALESCE(f.fix, 0) AS decimal(18,2)) AS fixed
FROM latest l
LEFT JOIN agg a ON a.UPrice_Code = l.UPrice_code
LEFT JOIN fp  f ON f.FPrice_Code = l.FPrice_code
WHERE l.rn = 1
ORDER BY l.Reshte, LEFT(l.TermEnter, 4), l.Termcode;
`;

function main() {
  const r = spawnSync(
    SQLCMD,
    ['-S', SERVER, '-U', USER, '-P', PASS, '-d', DB, '-Q', SQL, '-W', '-s', '\t', '-h', '-1'],
    { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 * 64 },
  );
  if (r.status !== 0) {
    console.error('sqlcmd failed:\n' + String(r.stderr || r.stdout).slice(0, 2000));
    process.exit(1);
  }
  const tsv = r.stdout.replace(/^\uFEFF/, '');
  const header =
    'majorCode\tentryYear\tsrcTerm\tsrcEntryTerm\tsrcCourseType\tsrcUPriceCode\tsrcFPriceCode\ttheory\tpractical\tgeneral\tfixed';
  const body = [header, ...tsv.split(/\r?\n/).filter((l) => l.trim() !== '')].join('\n') + '\n';
  const file = join(OUT, 'uems_tuition_rules.tsv');
  writeFileSync(file, body, 'utf8');
  const rows = body.split('\n').filter((l) => l.trim() !== '').length - 1;
  console.log(`uems_tuition_rules.tsv  ${rows} rows -> ${file}`);
}

main();
