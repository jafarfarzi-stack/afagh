#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  extract-legacy-master — استخراج هفتگی master رشته/استاد UEMS → TSV
 *
 *  درخواست کاربر: «از این به بعد اگر ردیف دانشجو یا استاد یا درس یا رشتهٔ
 *  جدید ایجاد شده بود، هم به همراه کلیهٔ اطلاعات وارد گردد.» منابع UEMS:
 *    ▸ LT66   (Code/Title/Maghta/Daneshkadeh/GroupA)  → majors
 *    ▸ DONBIN (Code/Title/GroupCode/Daneshkadeh/Degree/isActive/…) → staff
 *  درس از `LT7_lessons.tsv` استخراجگر آموزشی و دانشجو از
 *  `MAININFO_students.tsv` استخراجگر دانشجو میآید — اینجا دوباره گرفته
 *  نمیشوند تا یک منبع یگانه برای هر TSV باقی بماند.
 *
 *  قرارداد خروجی:
 *    LT66_majors.tsv       5 ستون — Code/Title/Maghta/Daneshkadeh/GroupA
 *    DONBIN_professors.tsv 12 ستون — Code/Title/GroupCode/Daneshkadeh/Degree/
 *                            EmploymentStatus/isActive/madrak/EmploymentDate/
 *                            ActiveTerm/RESHTE/NAMEP
 *    _manifest.json        زمان استخراج، شمارشها، SHA256 فایلها
 *
 *  نکتهٔ DONBIN: این جدول دو ستون بی نام (فاصله و «-») دارد؛ SELECT ستاره
 *  میشکند — فقط ستونهای صریحِ همین قرارداد خوانده میشوند.
 *
 *  نکات فنی: همان درسهای استخراج دانشجو — sqlcmd `-u -o` یونیکد، دیکد
 *  استریمی UTF-16LE با قطعههای زوج، هدر صریح، ISNULL، `-b` + اسکن خطا،
 *  تطبیق شمارش فایل با COUNT(*)، `--mirror` با بکاپ `.bak-<stamp>`.
 *
 *  پرچمها: --server / --user / --pass / --trusted / --db / --out / --mirror
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

const LT66_COLUMNS = [
  ['Code', 'N'], ['Title', 'V'], ['Maghta', 'N'],
  ['Daneshkadeh', 'N'], ['GroupA', 'N'],
];
const DONBIN_COLUMNS = [
  ['Code', 'N'], ['Title', 'V'], ['GroupCode', 'N'], ['Daneshkadeh', 'N'],
  ['Degree', 'N'], ['EmploymentStatus', 'N'], ['isActive', 'N'], ['madrak', 'N'],
  ['EmploymentDate', 'V'], ['ActiveTerm', 'N'], ['RESHTE', 'N'], ['NAMEP', 'V'],
];

export const MASTER_HEADERS = Object.freeze({
  LT66_majors: LT66_COLUMNS.map(([n]) => n).join('\t'),
  DONBIN_professors: DONBIN_COLUMNS.map(([n]) => n).join('\t'),
});
export const MASTER_FILES = ['LT66_majors.tsv', 'DONBIN_professors.tsv'];

const V = (c) => `ISNULL(${c},'')`;
const N = (c) => `ISNULL(CONVERT(varchar(60),${c}),'')`;
const selectList = (cols) => cols.map(([n, k]) => `${k === 'N' ? N(n) : V(n)} AS ${n}`).join(',\n       ');

const Q_LT66 = `SET NOCOUNT ON;
SELECT ${selectList(LT66_COLUMNS)}
FROM dbo.LT66
ORDER BY Code;`;

const Q_DONBIN = `SET NOCOUNT ON;
SELECT ${selectList(DONBIN_COLUMNS)}
FROM dbo.DONBIN
ORDER BY Code;`;

const Q_STATS = `SET NOCOUNT ON;
SELECT (SELECT COUNT(*) FROM dbo.LT66),
       (SELECT COUNT(*) FROM dbo.DONBIN),
       (SELECT COUNT(*) FROM dbo.DONBIN WHERE ISNULL(isActive,0) = 1),
       (SELECT COUNT(*) FROM dbo.LT66 WHERE ISNULL(Maghta,-1) < 0);`;

const EXPORTS = [
  { label: 'LT66_majors', header: MASTER_HEADERS.LT66_majors, sql: Q_LT66 },
  { label: 'DONBIN_professors', header: MASTER_HEADERS.DONBIN_professors, sql: Q_DONBIN },
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
const OUT = A.out || 'D:\\backups\\master_export_live';
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
  const CH = 2 * 1024 * 1024;
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
  const [lt66, donbin, donbinActive, lt66NoMaghta] = line.split('\t').map(Number);
  return { lt66, donbin, donbinActive, lt66NoMaghta };
}

/** کدهای ستون اول فایل — برای fail-closed روی تهی/تکراری. */
function readCodes(file) {
  const lines = readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  return lines.slice(1).map((l) => l.split('\t')[0].trim());
}

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
  for (const f of [...MASTER_FILES, '_manifest.json']) copyFileSync(join(OUT, f), join(dir, f));
  console.log('  آینهٔ پوشه بروز شد: ' + dir);
}

function main() {
  mkdirSync(OUT, { recursive: true });
  backupExisting(OUT);

  console.log('════ Extract legacy master (LT66 رشته + DONBIN استاد) uems → TSV ════');
  console.log('server:', SERVER, 'db:', DB, 'out:', OUT, 'auth:', TRUSTED ? 'windows' : 'sql');
  const stats = readStats();
  console.log('source counts:', JSON.stringify(stats));

  const files = EXPORTS.map(runQuery);

  const byName = Object.fromEntries(files.map((f) => [f.name, f.rows]));
  const checks = [
    ['LT66_majors.tsv', stats.lt66],
    ['DONBIN_professors.tsv', stats.donbin],
  ];
  for (const [name, want] of checks) {
    if (byName[name] !== want) {
      console.error(`FAIL ${name}: ${byName[name]} ردیف استخراج شد ولی منبع ${want} ردیف دارد`);
      process.exit(1);
    }
  }
  for (const [name, distinct] of [['LT66_majors.tsv', stats.lt66], ['DONBIN_professors.tsv', stats.donbin]]) {
    const codes = readCodes(join(OUT, name));
    const uniq = new Set(codes);
    if (!codes.every(Boolean) || uniq.size !== codes.length || uniq.size !== distinct) {
      console.error(`FAIL ${name}: کد تهی/تکراری (rows=${codes.length}, uniq=${uniq.size}, source=${distinct})`);
      process.exit(1);
    }
  }
  console.log('  ✓ کدها یکتا و بیتازهایاند');

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: { server: SERVER, database: DB, auth: TRUSTED ? 'windows-integrated' : 'sql-user', tables: ['dbo.LT66', 'dbo.DONBIN'] },
    stats,
    files,
  };
  writeFileSync(join(OUT, '_manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log('  _manifest.json نوشته شد');
  if (MIRROR && MIRROR !== OUT) mirrorTo(MIRROR);
  console.log('✓ استخراج master کامل شد — ' + files.length + ' فایل، ' +
    files.reduce((n, f) => n + f.rows, 0).toLocaleString('en-US') + ' ردیف');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
