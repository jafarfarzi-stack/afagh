#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  extract-legacy-finance — استخراج هفتگی دادهٔ مالی UEMS (SQL Server) → TSV
 *
 *  پیش از این `D:\backups\fin_export` یک عکس ایستا (۲۰۲۶-۱۱-۰۸) بود و سینک
 *  هفتگی همان فایلها را دوباره میخواند؛ یعنی «بروزرسانی مالی» عملاً بیتازهای
 *  نبود. این اسکریپت همان پنج فایل را هر بار مستقیماً از UEMS میگیرد تا
 *  migrate-legacy-finance.mjs روی دادهٔ تازه اجرا شود.
 *
 *  قرارداد خروجی (سرستونها دقیقاً همان چیزی است که مهاجرت مالی میخواند):
 *    TermAms.tsv   20 ستون — سند شهریهٔ هر ترم  → student_ledger
 *    StdPays.tsv    6 ستون — فیشهای پرداخت     → student_ledger PAYMENT
 *    paytype.tsv    2 ستون — لوکاپ نوع پرداخت   → شرح سطرهای PAYMENT
 *    TermPrice.tsv  7 ستون — کدهای قیمت (تشخیصی/همخوانی با استخراج نرخها)
 *    _t.tsv         3 ردیف بدون سرستون — واترمارک آخرین TermAmsId
 *    _manifest.json زمان استخراج، شمارشها، maxId و SHA256 هر فایل
 *
 *  نکات فنی:
 *    ▸ sqlcmd `-u -o` خروجی UTF-16LE میدهد؛ آن را جریانی به UTF-8 برمیگردانیم
 *      تا عنوانهای فارسی paytype موژیبیک نشوند (فایل ایستا U+FFFD داشت).
 *    ▸ `-h -1` سرستون sqlcmd را حذف میکند و سرستون صریح مینویسیم ⇒ قرارداد
 *      پایدار است حتی اگر نام ستون در SQL Server تغییر کند.
 *    ▸ `ISNULL(...,'')` جلوی نوشتن لیترال «NULL» بهجای مقدار تهی را میگیرد.
 *    ▸ `-b` باعث exit≠0 روی خطای SQL میشود؛ علاوه بر آن متن خطا اسکن میشود.
 *    ▸ `--mirror <dir>` فایلهای تازه را در پوشهٔ ایستا هم مینویسد، ولی نخست
 *      از محتوای قبلی آن پوشه نسخهٔ پشتیبان میگیرد (هیچ چیز بیبکاپ پاک نمیشود).
 *
 *  اجرا:
 *    node scripts/extract-legacy-finance.mjs --trusted \
 *      --server "127.0.0.1,62133" --db uems --out D:\backups\fin_export_live
 *    node scripts/extract-legacy-finance.mjs --trusted --server "..." --db uems \
 *      --out <work>/fin_export --mirror D:\backups\fin_export
 *
 *  پرچمها: --server / --user / --pass / --trusted / --db / --out / --mirror
 *           SQLCMD (متغیر محیطی) = مسیر sqlcmd.exe
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync,
  openSync, writeSync, closeSync, readdirSync, copyFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextDecoder } from 'node:util';

// ── سرستونها (قرارداد؛ migrate-legacy-finance.mjs با نام ستون کار میکند) ────
export const FINANCE_HEADERS = {
  TermAms: 'Stno\tTermCode\tTermPays\tFix_Price\tUnits_Price\tFix_Bates\tUnits_Bates\tMab_Bates\tTermAcc\tFinallAcc\tTMabIncDec\tTFix_PriceIncDec\tTUnits_PriceIncDec\tTSUMMab_Subject\tTMab_Support\tTMandehBes\tTermMaliStatus\tSettleDate\tLastPayDate\tTermAmsId',
  StdPays: 'Stno\tTermCode\tMab\tFish_no\tpay_type\tStdPaysId',
  paytype: 'code\ttitle',
  TermPrice: 'Termcode\tTermEnter\tReshte\tCOURSETYPE\tUPrice_code\tFPrice_code\tMabSubject_code',
};
export const FINANCE_FILES = ['TermAms.tsv', 'StdPays.tsv', 'paytype.tsv', 'TermPrice.tsv', '_t.tsv'];

const NUM = (c) => `ISNULL(CONVERT(varchar(30),${c}),'')`;

const Q_TERM_AMS = `SET NOCOUNT ON;
SELECT ISNULL(Stno,'') AS Stno, TermCode,
       ${NUM('TermPays')} AS TermPays,
       ${NUM('Fix_Price')} AS Fix_Price,
       ${NUM('Units_Price')} AS Units_Price,
       ${NUM('Fix_Bates')} AS Fix_Bates,
       ${NUM('Units_Bates')} AS Units_Bates,
       ${NUM('Mab_Bates')} AS Mab_Bates,
       ${NUM('TermAcc')} AS TermAcc,
       ${NUM('FinallAcc')} AS FinallAcc,
       ${NUM('TMabIncDec')} AS TMabIncDec,
       ${NUM('TFix_PriceIncDec')} AS TFix_PriceIncDec,
       ${NUM('TUnits_PriceIncDec')} AS TUnits_PriceIncDec,
       ${NUM('TSUMMab_Subject')} AS TSUMMab_Subject,
       ${NUM('TMab_Support')} AS TMab_Support,
       ${NUM('TMandehBes')} AS TMandehBes,
       TermMaliStatus,
       ISNULL(SettleDate,'') AS SettleDate,
       ISNULL(LastPayDate,'') AS LastPayDate,
       TermAmsId
FROM TermAms
ORDER BY Stno, TermCode, TermAmsId;`;

const Q_STD_PAYS = `SET NOCOUNT ON;
SELECT ISNULL(Stno,'') AS Stno, TermCode, Mab, Fish_no, pay_type, stdpaysId AS StdPaysId
FROM StdPays
ORDER BY Stno, TermCode, stdpaysId;`;

const Q_PAYTYPE = `SET NOCOUNT ON;
SELECT code, ISNULL(title,'') AS title
FROM paytype
ORDER BY code;`;

const Q_TERM_PRICE = `SET NOCOUNT ON;
SELECT Termcode, TermEnter, Reshte, COURSETYPE,
       ISNULL(CONVERT(varchar(20),UPrice_code),'') AS UPrice_code,
       ISNULL(CONVERT(varchar(20),FPrice_code),'') AS FPrice_code,
       ISNULL(CONVERT(varchar(20),MabSubject_code),'') AS MabSubject_code
FROM TermPrice
ORDER BY Termcode, TermEnter, Reshte, COURSETYPE, TermPriceId;`;

const Q_WATERMARK = `SET NOCOUNT ON;
SELECT TOP 3 ISNULL(Stno,'') AS Stno, TermCode, TermAmsId
FROM TermAms
ORDER BY TermAmsId DESC;`;

const Q_STATS = `SET NOCOUNT ON;
SELECT (SELECT COUNT(*) FROM TermAms), (SELECT ISNULL(MAX(TermAmsId),0) FROM TermAms),
       (SELECT COUNT(*) FROM StdPays), (SELECT ISNULL(MAX(stdpaysId),0) FROM StdPays),
       (SELECT COUNT(*) FROM paytype), (SELECT COUNT(*) FROM TermPrice),
       (SELECT ISNULL(MAX(TermPriceId),0) FROM TermPrice);`;

const EXPORTS = [
  { label: 'TermAms', header: FINANCE_HEADERS.TermAms, sql: Q_TERM_AMS },
  { label: 'StdPays', header: FINANCE_HEADERS.StdPays, sql: Q_STD_PAYS },
  { label: 'paytype', header: FINANCE_HEADERS.paytype, sql: Q_PAYTYPE },
  { label: 'TermPrice', header: FINANCE_HEADERS.TermPrice, sql: Q_TERM_PRICE },
  { label: '_t', header: null, sql: Q_WATERMARK },
];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      out[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    }
  }
  return out;
}

const A = parseArgs(process.argv.slice(2));
const SERVER = A.server || 'localhost\\AFAGH';
const USER = A.user || 'sa';
const PASS = A.pass || '';
const TRUSTED = A.trusted === 'true';
const AUTH = TRUSTED ? ['-E'] : ['-U', USER, '-P', PASS];
const DB = A.db || 'uems';
const OUT = A.out || 'D:\\backups\\fin_export_live';
const MIRROR = A.mirror && A.mirror !== 'true' ? A.mirror : '';
const SQLCMD = process.env.SQLCMD ||
  'C:\\Program Files\\Microsoft SQL Server\\Client SDK\\ODBC\\170\\Tools\\Binn\\sqlcmd.exe';

const stamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const isSqlError = (l) =>
  /^Msg\s+\d+,\s*Level\s+\d+/i.test(l) ||
  /Invalid (column|object) name/i.test(l) ||
  /^Sqlcmd:/i.test(l) ||
  /Cannot open database/i.test(l) ||
  /Login failed/i.test(l);

/** یک پرسوجو → فایل TSV با سرستون صریح و UTF-8 (تبدیل جریانی UTF-16LE). */
function runQuery(spec) {
  const tmp = join(OUT, spec.label + '.__u16.tmp');
  const r = spawnSync(SQLCMD, [
    '-S', SERVER, ...AUTH, '-d', DB,
    '-Q', spec.sql,
    '-W', '-s', '\t', '-h', '-1', '-u', '-o', tmp, '-b',
  ], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const tail = String(r.stderr || '') + String(r.stdout || '');
  if (r.status !== 0 || tail.split(/\r?\n/).some(isSqlError)) {
    console.error('FAIL ' + spec.label + ' (exit ' + r.status + ')\n' + tail.slice(0, 2000));
    try { unlinkSync(tmp); } catch { /* ignore */ }
    process.exit(1);
  }
  if (!existsSync(tmp)) {
    console.error('FAIL ' + spec.label + ': خروجی sqlcmd ساخته نشد');
    process.exit(1);
  }
  const buf = readFileSync(tmp);
  unlinkSync(tmp);
  const file = join(OUT, spec.label + '.tsv');
  const fd = openSync(file, 'w');
  if (spec.header) writeSync(fd, Buffer.from(spec.header + '\n', 'utf8'));

  const dec = new TextDecoder('utf-16le');
  const CH = 2 * 1024 * 1024; // زوج: جفتهای UTF-16 نبرند
  let carry = '', rows = 0;
  const errors = [];
  const emit = (line) => {
    const l = line.replace(/^\uFEFF/, '').replace(/\r$/, '');
    if (!l.trim()) return;
    if (isSqlError(l)) { errors.push(l.slice(0, 200)); return; }
    writeSync(fd, Buffer.from(l + '\n', 'utf8'));
    rows++;
  };
  for (let off = 0; off < buf.length; off += CH) {
    const text = dec.decode(buf.subarray(off, Math.min(off + CH, buf.length)), { stream: true });
    const lines = (carry + text).split(/\r?\n/);
    carry = lines.pop();
    for (const l of lines) emit(l);
  }
  for (const l of (carry + dec.decode()).split(/\r?\n/)) emit(l);
  closeSync(fd);

  if (errors.length || rows === 0) {
    console.error('FAIL ' + spec.label + ': ' + (errors[0] || 'خروجی صفر ردیف — استخراج نامعتبر است'));
    process.exit(1);
  }
  const bytes = readFileSync(file);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  console.log(`  ${spec.label}.tsv  ${rows.toLocaleString('en-US')} rows  ${bytes.length.toLocaleString('en-US')} bytes  sha256=${sha256.slice(0, 12)}…`);
  return { name: spec.label + '.tsv', rows, bytes: bytes.length, sha256 };
}

/** آمار/واترمارک منبع — فقط اعداد ASCII، نیازی به خروجی Unicode نیست. */
function readStats() {
  const r = spawnSync(SQLCMD, [
    '-S', SERVER, ...AUTH, '-d', DB,
    '-Q', Q_STATS, '-W', '-s', '\t', '-h', '-1', '-b',
  ], { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 });
  if (r.status !== 0) {
    console.error('FAIL stats (exit ' + r.status + ')\n' + String(r.stderr || r.stdout).slice(0, 1000));
    process.exit(1);
  }
  const line = String(r.stdout || '').split(/\r?\n/).find((l) => /^\d+\t\d+/.test(l.trim()));
  if (!line) { console.error('FAIL stats: خروجی قابل پارس نبود'); process.exit(1); }
  const [termAms, maxTermAmsId, stdPays, maxStdPaysId, paytype, termPrice, maxTermPriceId] =
    line.trim().split('\t').map(Number);
  return { termAms, maxTermAmsId, stdPays, maxStdPaysId, paytype, termPrice, maxTermPriceId };
}

/** پیش از بازنویسی، از فایلهای TSV موجود در پوشه نسخهٔ پشتیبان میگیریم. */
function backupExisting(dir) {
  if (!existsSync(dir)) return '';
  const present = readdirSync(dir).filter((f) => f.endsWith('.tsv') || f === '_manifest.json');
  if (!present.length) return '';
  const bak = dir + '.bak-' + stamp();
  mkdirSync(bak, { recursive: true });
  for (const f of present) copyFileSync(join(dir, f), join(bak, f));
  console.log('  پشتیبان فایلهای قبلی: ' + bak + ' (' + present.length + ' فایل)');
  return bak;
}

function mirrorTo(dir) {
  backupExisting(dir);
  mkdirSync(dir, { recursive: true });
  for (const f of [...FINANCE_FILES, '_manifest.json']) copyFileSync(join(OUT, f), join(dir, f));
  console.log('  آینهٔ پوشهٔ ایستا بروز شد: ' + dir);
}

function main() {
  mkdirSync(OUT, { recursive: true });
  backupExisting(OUT);

  console.log('════ Extract legacy finance uems → TSV ════');
  console.log('server:', SERVER, 'db:', DB, 'out:', OUT, 'auth:', TRUSTED ? 'windows' : 'sql');
  const stats = readStats();
  console.log('source counts:', JSON.stringify(stats));

  const files = EXPORTS.map(runQuery);

  // fail-closed: شمارش فایل استخراجشده باید با شمارش منبع یکی باشد
  const byName = Object.fromEntries(files.map((f) => [f.name, f.rows]));
  const checks = [
    ['TermAms.tsv', stats.termAms],
    ['StdPays.tsv', stats.stdPays],
    ['paytype.tsv', stats.paytype],
    ['TermPrice.tsv', stats.termPrice],
    ['_t.tsv', Math.min(3, stats.termAms)],
  ];
  for (const [name, want] of checks) {
    if (byName[name] !== want) {
      console.error(`FAIL ${name}: ${byName[name]} ردیف استخراج شد ولی منبع ${want} ردیف دارد`);
      process.exit(1);
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: { server: SERVER, database: DB, auth: TRUSTED ? 'windows-integrated' : 'sql-user' },
    stats,
    files,
  };
  writeFileSync(join(OUT, '_manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log('  _manifest.json نوشته شد');
  if (MIRROR && MIRROR !== OUT) mirrorTo(MIRROR);
  console.log('✓ استخراج مالی کامل شد — ' + files.length + ' فایل، ' +
    files.reduce((n, f) => n + f.rows, 0).toLocaleString('en-US') + ' ردیف');
}

// فقط وقتی مستقیماً اجرا شود؛ import توسط تستها نباید اثر جانبی داشته باشد.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
