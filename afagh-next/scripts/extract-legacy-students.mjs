#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  extract-legacy-students — استخراج هفتگی master دانشجویان UEMS → TSV
 *
 *  شکافی که این اسکریپت میبندد: `extract-legacy-education.mjs` هر هفته
 *  `MAININFO_students.tsv` و `People_identity.tsv` را استخراج میکرد، ولی هیچ
 *  گامی آنها را نمیخواند ⇒ students.status و students.samaStatusCode روی لایو
 *  از همان مهاجرت اولیه باقی مانده بودند (۲۷۱ وضعیت اشتباه و کد خام سما برای
 *  همهٔ ۳۹٬۹۴۶ دانشجو خالی). خط لولهٔ هفتگی اکنون یک استخراج کوچک و مستقل
 *  (دو پرسوجو، ≈۵MB) دارد تا گام `migrate-legacy-students.mjs` روی دادهٔ تازه
 *  اجرا شود، بیآنکه وابسته به استخراج ۳۳۳MB آموزشی باشد.
 *
 *  قرارداد خروجی — سرستونها عیناً همان `MAININFO_students.tsv` قدیمیاند،
 *  بنابراین موتور همگامسازی میتواند هم پوشهٔ تازه و هم `uems_edu` قدیمی
 *  (پس از تبدیل UTF-16LE→UTF-8 توسط اورکستراتور) را بخواند:
 *    MAININFO_students.tsv  32 ستون — STNO/STATUS/NAME/IDNO/…
 *    People_identity.tsv    13 ستون — هویت تکمیلی (تشخیصی/گزارش)
 *    _manifest.json         زمان استخراج، شمارشها، توزیع STATUS، SHA256 فایلها
 *
 *  نکات فنی (همان درسهای استخراج مالی/آموزشی):
 *    ▸ sqlcmd `-u -o` خروجی UTF-16LE میدهد؛ جریانی با قطعههای **زوج** به
 *      UTF-8 برمیگردانیم تا اسامی فارسی موژیبیک نشوند.
 *    ▸ `-h -1` سرستون sqlcmd را حذف میکند و سرستون صریح مینویسیم ⇒ قرارداد
 *      پایدار است حتی اگر ترتیب ستونها در SQL Server عوض شود.
 *    ▸ `ISNULL(...,'')` جلوی لیترال «NULL» را میگیرد (نسخهٔ قدیمی ۴ ردیف
 *      `STATUS=NULL` بهصورت رشتهٔ «NULL» مینوشت). ستونهای nvarchar بدون
 *      CONVERT میمانند تا یونیکد از دست نرود.
 *    ▸ `-b` + اسکن متن خطا + تطبیق شمارش فایل با `COUNT(*)` منبع ⇒ fail-closed.
 *    ▸ کد تکراری/تهی در STNO همانجا استخراج را متوقف میکند.
 *    ▸ `--mirror <dir>` پیش از بازنویسی از فایلهای قبلی بکاپ `.bak-<stamp>`
 *      میگیرد؛ هیچ چیز بیبکاپ پاک نمیشود.
 *
 *  اجرا:
 *    node scripts/extract-legacy-students.mjs --trusted \
 *      --server "127.0.0.1,62133" --db uems --out D:\backups\students_export_live
 *    node scripts/extract-legacy-students.mjs --trusted --server "..." --db uems \
 *      --out <work-dir>\students_export --mirror D:\backups\students_export
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

// ── تعریف ستونها: سرستون و SELECT از یک لیست ساخته میشوند ⇒ عدم واگرایی ────
// kind V = رشتهای (ISNULL ساده، یونیکد حفظ میشود) / N = عددی (CONVERT لازم است)
const MAININFO_COLUMNS = [
  ['STNO', 'V'], ['OLDSTNO', 'V'], ['NAME', 'V'], ['SEX', 'N'], ['STATUS', 'N'],
  ['TERMCODE', 'V'], ['COURSTYPE', 'N'], ['MAGHTA', 'N'], ['RESHTE', 'N'],
  ['DANESHKADEH', 'N'], ['NAMEP', 'V'], ['DAV', 'V'], ['IDNO', 'V'],
  ['BIRTHDATE', 'V'], ['MADRAKSTAT', 'N'], ['MOADEL', 'N'], ['Startdate', 'V'],
  ['Stopdate', 'V'], ['TotalAvg', 'N'], ['PunitCount', 'N'], ['SUnitCount', 'N'],
  ['RUnitCount', 'N'], ['TotalPoint', 'N'], ['FareghMaghta', 'N'],
  ['CurrentMaghta', 'N'], ['TraningMethodId', 'N'], ['MajorSpecID', 'N'],
  ['GroupCode', 'N'], ['BranchCode', 'N'], ['IsActive', 'N'], ['Grade', 'N'],
  ['TDIP', 'V'],
];
const PEOPLE_COLUMNS = [
  ['PersonId', 'N'], ['LastName', 'V'], ['FirstName', 'V'], ['FatherName', 'V'],
  ['GenderId', 'N'], ['IdentificationNumber', 'V'], ['BirthDate', 'V'],
  ['NationalCode', 'V'], ['Phone', 'V'], ['Mobile', 'V'], ['PostalCode', 'V'],
  ['Address', 'V'], ['eMail', 'V'],
];

/** سرستون صریح (قرارداد موتور همگامسازی). */
export const STUDENT_HEADERS = Object.freeze({
  MAININFO_students: MAININFO_COLUMNS.map(([n]) => n).join('\t'),
  People_identity: PEOPLE_COLUMNS.map(([n]) => n).join('\t'),
});
export const STUDENT_FILES = ['MAININFO_students.tsv', 'People_identity.tsv'];

const V = (c) => `ISNULL(${c},'')`;
const N = (c) => `ISNULL(CONVERT(varchar(60),${c}),'')`;
const selectList = (cols) => cols.map(([n, k]) => `${k === 'N' ? N(n) : V(n)} AS ${n}`).join(',\n       ');

const Q_MAININFO = `SET NOCOUNT ON;
SELECT ${selectList(MAININFO_COLUMNS)}
FROM dbo.MAININFO
ORDER BY STNO;`;

const Q_PEOPLE = `SET NOCOUNT ON;
SELECT ${selectList(PEOPLE_COLUMNS)}
FROM dbo.People
ORDER BY PersonId;`;

const Q_STATS = `SET NOCOUNT ON;
SELECT (SELECT COUNT(*) FROM dbo.MAININFO),
       (SELECT COUNT(DISTINCT STNO) FROM dbo.MAININFO),
       (SELECT COUNT(*) FROM dbo.People),
       (SELECT COUNT(*) FROM dbo.MAININFO WHERE STATUS IS NULL);`;

const Q_STATUS_DIST = `SET NOCOUNT ON;
SELECT ISNULL(CONVERT(varchar(20),STATUS),'NULL') AS st, COUNT(*) AS n
FROM dbo.MAININFO GROUP BY STATUS ORDER BY STATUS;`;

const EXPORTS = [
  { label: 'MAININFO_students', header: STUDENT_HEADERS.MAININFO_students, sql: Q_MAININFO },
  { label: 'People_identity', header: STUDENT_HEADERS.People_identity, sql: Q_PEOPLE },
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
const OUT = A.out || 'D:\\backups\\students_export_live';
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

/** پرسوجوی یونیکد → TSV با سرستون صریح و UTF-8 (تبدیل جریانی UTF-16LE). */
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
  writeSync(fd, Buffer.from(spec.header + '\n', 'utf8'));

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

/** آمار/توزیع وضعیت منبع — فقط اعداد ASCII، نیازی به خروجی Unicode نیست. */
function readStats() {
  const run = (sql) => {
    const r = spawnSync(SQLCMD, [
      '-S', SERVER, ...AUTH, '-d', DB,
      '-Q', sql, '-W', '-s', '\t', '-h', '-1', '-b',
    ], { encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
    if (r.status !== 0) {
      console.error('FAIL stats (exit ' + r.status + ')\n' + String(r.stderr || r.stdout).slice(0, 1000));
      process.exit(1);
    }
    return String(r.stdout || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  };
  const line = run(Q_STATS).find((l) => /^\d+\t\d+/.test(l));
  if (!line) { console.error('FAIL stats: خروجی قابل پارس نبود'); process.exit(1); }
  const [maininfo, distinctStno, people, nullStatus] = line.split('\t').map(Number);
  const statusDistribution = {};
  for (const l of run(Q_STATUS_DIST)) {
    const m = l.match(/^(\S+)\t(\d+)$/);
    if (m) statusDistribution[m[1]] = Number(m[2]);
  }
  return { maininfo, distinctStno, people, nullStatus, statusDistribution };
}

/** کدهای STNO فایل استخراجشده — برای fail-closed روی تکراری/تهی. */
function readCodes(file) {
  const lines = readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  return lines.slice(1).map((l) => l.split('\t')[0].trim());
}

/** پیش از بازنویسی، از فایلهای موجود نسخهٔ پشتیبان میگیریم. */
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
  for (const f of [...STUDENT_FILES, '_manifest.json']) copyFileSync(join(OUT, f), join(dir, f));
  console.log('  آینهٔ پوشه بروز شد: ' + dir);
}

function main() {
  mkdirSync(OUT, { recursive: true });
  backupExisting(OUT);

  console.log('════ Extract legacy students uems → TSV ════');
  console.log('server:', SERVER, 'db:', DB, 'out:', OUT, 'auth:', TRUSTED ? 'windows' : 'sql');
  const stats = readStats();
  console.log('source counts:', JSON.stringify({ ...stats, statusDistribution: undefined }));
  console.log('STATUS distribution:', JSON.stringify(stats.statusDistribution));

  const files = EXPORTS.map(runQuery);

  // fail-closed: شمارش فایل استخراجشده باید با شمارش منبع یکی باشد
  const byName = Object.fromEntries(files.map((f) => [f.name, f.rows]));
  const checks = [
    ['MAININFO_students.tsv', stats.maininfo],
    ['People_identity.tsv', stats.people],
  ];
  for (const [name, want] of checks) {
    if (byName[name] !== want) {
      console.error(`FAIL ${name}: ${byName[name]} ردیف استخراج شد ولی منبع ${want} ردیف دارد`);
      process.exit(1);
    }
  }
  const codes = readCodes(join(OUT, 'MAININFO_students.tsv'));
  const uniq = new Set(codes);
  if (!codes.every(Boolean) || uniq.size !== codes.length || uniq.size !== stats.distinctStno) {
    console.error(`FAIL MAININFO_students.tsv: کد تهی/تکراری یا ناهماهنگی DISTINCT (rows=${codes.length}, uniq=${uniq.size}, source=${stats.distinctStno})`);
    process.exit(1);
  }
  console.log('  ✓ کدها یکتا و بیتازهایاند: ' + uniq.size.toLocaleString('en-US'));

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: { server: SERVER, database: DB, auth: TRUSTED ? 'windows-integrated' : 'sql-user', tables: ['dbo.MAININFO', 'dbo.People'] },
    stats,
    files,
  };
  writeFileSync(join(OUT, '_manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log('  _manifest.json نوشته شد');
  if (MIRROR && MIRROR !== OUT) mirrorTo(MIRROR);
  console.log('✓ استخراج دانشجویان کامل شد — ' + files.length + ' فایل، ' +
    files.reduce((n, f) => n + f.rows, 0).toLocaleString('en-US') + ' ردیف');
}

// فقط وقتی مستقیماً اجرا شود؛ import توسط تستها نباید اثر جانبی داشته باشد.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
