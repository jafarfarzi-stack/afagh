#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════
 *  ادغامِ امنِ کاربران تکراری (PERSON MERGE) — خشک‌اجرا به‌صورت پیش‌فرض
 *
 *  ══ چرا این ابزار وجود دارد؟ ══
 *  برای زرینه، «نوشتنِ کدِ ملیِ درست» غیرممکن است: کدِ واقعی از قبل در
 *  `users`ِ دانشگاهِ دیگر نشسته (همان آدم در دو دانشگاه ثبت‌نام شده و واردکننده
 *  برای هر بار یک ردیف کاربر ساخته). پس راه‌حل «نوشتن کد» نیست، «ادغامِ دو
 *  ردیفِ یک آدم» است:
 *
 *      orphan user (کدِ مصنوعی S… یا شمارهٔ شناسنامه)
 *          │  students.userId
 *          ▼
 *      target user (دارندهٔ کدِ ملیِ واقعی و معتبر)
 *
 *  عملیات: `students.userId` از یتیم به هدف بازمی‌گردد، سپس ردیف یتیم حذف می‌شود.
 *
 *  ══ نامِ فایل چرا `merge-` است و نه `fix-` ؟ ══
 *  در این مخزن پیشوند `fix-` (۱۱۵ اسکریپت) برای «ترمیمِ مقدارِ یک ستون در
 *  جای خودش» رزرو شده — و این ابزار دقیقاً آن کار را *نمی‌کند*: هیچ کدِ ملیِ
 *  نوشته نمی‌شود، بلکه دو ردیف از یک انسان در یک ردیف ادغام می‌شوند. ادعای
 *  «ترمیم» در اینجا گمراه‌کننده بود. محل و پسوند هم دقیقاً هم‌ساختارِ
 *  `fix-student-nc-v2.mjs` است (رابط خط فرمان در `scripts/`، منطق خالص در
 *  `scripts/lib/`) تا دو ابزارِ هم‌خانواده کنار هم دیده شوند.
 *
 *  ══ کشفِ نامزدها ══
 *  ورودی، «نگاشتِ برخورد» است — همان چیزی که `fix-student-nc-v2.mjs` در
 *  حالت خشک با `--no-staging --report <csv>` می‌نویسد. این ابزار به‌طور پیش‌فرض
 *  خودش آن را اجرا می‌کند و سطرهایی را که
 *  `reason = PROPOSED_CODE_OWNED_BY_USER_<id>` دارند برمی‌دارد.
 *  هیچ شناسهٔ کاربری هارکد نمی‌شود.
 *
 *  ══ بازرسیِ ایمنیِ پیش از پرواز (قلبِ همین ابزار) ══
 *  برای هر نامزد، پیش از پیشنهادِ ادغام، شمرده می‌شود که «چه چیز دیگری به
 *  کاربرِ یتیم اشاره می‌کند». فهرستِ ارجاع‌ها دو بخش است و هر دو باید کامل باشند:
 *    ۱) کاتالوگِ واقعی پایگاه‌داده: همهٔ FKهایی که به users.id اشاره می‌کنند
 *       (به‌صورت پویا کشف می‌شوند تا با کاتالوگِ هر دیتابیس بخواند).
 *    ۲) فهرستِ اعلام‌شده در scripts/lib/duplicate-user-merge.mjs برای ستون‌هایی
 *       که «کاربری» نام‌گذاری شده‌اند ولی FK ندارند (مثل audit_logs."actorUserId").
 *  اگر ستونِ عددیِ ناشناخته‌ای پیدا شود که در هیچ‌کدام نباشد → خطای سخت و خروج.
 *  نتیجه برای هر نامزد یکی از سه سطل است:
 *      MERGE_SAFE                  — هیچ ارجاعِ معناداری جز ردیف‌های students نیست
 *      MERGE_WITH_DATA_MIGRATION   — ارجاع‌هایی هست که با اطمینان منتقل می‌شوند
 *      BLOCKED                     — ارجاعِ تغییرناپذیر / زنجیره / ناسازگاری / ریسک یکتایی
 *
 *  ── گزینه‌ها ────────────────────────────────────────────────────────────
 *    --university <code>   تکرارپذیر؛ پیش‌فرض: همهٔ دانشگاه‌ها
 *    --report <path.csv>   گزارش per-student ادغام
 *    --from-report <csv>   به‌جای اجرای v2، از گزارشِ آمادهٔ آن بخوان
 *    --data-root <path>    پیش‌فرض /root
 *    --dry-run             پیش‌فرض؛ هیچ نوشتنی (جز جدول صحنه، مگر --no-staging)
 *    --apply               نوشتنِ واقعی (یک تراکنش)
 *    --run <runId>         کدام اجرای صحنه اعمال شود (پیش‌فرض: آخرین)
 *    --no-staging          هیچ نوشتنی در دیتابیس — برای prod
 *    --skip-blocked        به‌جای توقفِ کامل، ردیف‌های BLOCKED را رد کن
 *    --only-clean          فقط MERGE_SAFE اعمال شود (مرزِ ایمنِ راستی‌آزما)
 *    --simulate-fault <pt> آزمونِ خرابی: after-students | after-migrate | before-delete
 *    --db <url>            پیش‌فرض DATABASE_URL یا localhost
 *    --self-test           اجرای طبقه‌بند روی جفت‌های ساختگی و خروج
 *
 *  مثال:
 *    node scripts/merge-duplicate-users.mjs --university ZARINE --report /tmp/m.csv
 *    node scripts/merge-duplicate-users.mjs --university ZARINE --apply --run <id>
 *    node scripts/merge-duplicate-users.mjs --university ZARINE --apply --skip-blocked --only-clean
 * ════════════════════════════════════════════════════════════════════════
 */
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  UNIVERSITY_DATA_DIRS,
  VERDICTS,
  isValidIranianNationalCode,
} from './lib/student-nc-repair.mjs';
import {
  MERGE_CLASSES,
  BLOCK_REASONS,
  USER_REFERENCE_POLICY,
  IGNORED_REFERENCE_COLUMNS,
  isBackupTable,
  parseCollisionOwnerId,
  pickMergeCandidates,
  detectMergeChains,
  classifyMerge,
  groupIntoMergeOperations,
  summarizeMergeClasses,
  formatReferenceEvidence,
} from './lib/duplicate-user-merge.mjs';

const { Pool } = pg;
const HERE = dirname(fileURLToPath(import.meta.url));

// ── آرگومان‌ها (همان قرارداد fix-student-nc-v2.mjs) ────────────────────────
const raw = process.argv.slice(2);
const repeatable = (flagName) => {
  const out = [];
  const long = `--${flagName}`;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === long && raw[i + 1] && !raw[i + 1].startsWith('--')) out.push(raw[++i]);
    else if (raw[i].startsWith(long + '=')) out.push(raw[i].slice(long.length + 1));
  }
  return out;
};
const args = {};
for (let i = 0; i < raw.length; i++) {
  if (raw[i].startsWith('--')) {
    const key = raw[i].slice(2);
    args[key] = raw[i + 1] && !raw[i + 1].startsWith('--') ? raw[++i] : 'true';
  }
}
const flag = (n) => args[n] === 'true' || args[n] === true;
const opt = (n, d) => (args[n] !== undefined && args[n] !== 'true' ? String(args[n]) : d);

const APPLY_RAW = flag('apply');
const DRY_RUN = flag('dry-run');

const DATA_ROOT = opt('data-root', '/root');
const REPORT_CSV = opt('report', null);
const FROM_REPORT = opt('from-report', null);
const DB_URL = opt('db', process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db');
const NO_STAGING = flag('no-staging');
const SELFTEST = flag('self-test');
const SKIP_BLOCKED = flag('skip-blocked');
const ONLY_CLEAN = flag('only-clean');
const RUN_ID_ARG = opt('run', null);
const SIMULATE_FAULT = opt('simulate-fault', null);
const UNI_FILTERS = repeatable('university').flatMap((v) => String(v).split(',')).map((s) => s.trim()).filter(Boolean);

const redact = (u) => String(u).replace(/:[^:@/]*@/, ':***@');
const die = (msg, code = 2) => { console.error(`\n✗ ${msg}`); process.exit(code); };

// پیش‌فرض، خشک‌اجراست. --dry-run فقط صراحتِ همان پیش‌فرض است.
if (APPLY_RAW && DRY_RUN) die('--dry-run و --apply با هم سازگار نیستند (یکی را انتخاب کنید).');
const APPLY = APPLY_RAW && !DRY_RUN;

// ═══════════════════════════════════════════════════════════════════════
//  جدول صحنهٔ ادغام (idempotent — داخلِ اسکریپت، نه مهاجرتِ drizzle)
// ═══════════════════════════════════════════════════════════════════════
//  چرا جدولِ تازه و نه national_code_repair_staging ؟
//   ۱) دانه (grain) فرق دارد: آن جدول «به ازای هر ردیفِ دانشجو» است، این یکی
//      «به ازای هر عملیاتِ ادغامِ کاربر» (که چند ردیف دانشجو را با هم می‌برد).
//   ۲) آن جدول ایندکسِ یکتای (runId, studentId) دارد؛ عملیاتِ ادغام studentId
//      ندارد و جا دادنش آنجا شکستِ قید می‌داد.
//   ۳) ادغام چرخهٔ عمرِ دیگری دارد: reviewStatus، appliedAt، شمارشِ ارجاع‌ها.
//   و مهم‌تر: fix-student-nc-v2.mjs را اصلاً دست نمی‌زنیم (تغییرِ دیگری در آن
//   در جریان است) و رفتارش نمی‌شکند.
const STAGING_DDL = `
CREATE TABLE IF NOT EXISTS user_merge_staging (
  id                  serial PRIMARY KEY,
  "runId"             varchar(64)  NOT NULL,
  "universityCode"    varchar(30),
  "universityId"      integer,
  "orphanUserId"      integer      NOT NULL,
  "orphanCode"        varchar(10),
  "orphanClass"       varchar(60),
  "orphanUniversityId" integer,
  "targetUserId"      integer      NOT NULL,
  "targetCode"        varchar(10),
  "targetUniversityId" integer,
  "studentIds"        text         NOT NULL,
  "studentCodes"      text         NOT NULL,
  "studentCount"      integer      NOT NULL,
  "mergeClass"        varchar(32)  NOT NULL,
  "blockedBy"         varchar(120),
  reasons             text,
  "refEvidence"       text,
  "refSnapshot"       text,
  reviewStatus        varchar(20)  NOT NULL DEFAULT 'MACHINE_SAFE',
  "createdAt"         timestamptz  NOT NULL DEFAULT now(),
  "appliedAt"         timestamptz,
  "appliedStudentCount" integer
);
CREATE INDEX IF NOT EXISTS user_merge_staging_run_idx ON user_merge_staging ("runId");
CREATE INDEX IF NOT EXISTS user_merge_staging_class_idx ON user_merge_staging ("runId", "mergeClass");
CREATE UNIQUE INDEX IF NOT EXISTS user_merge_staging_run_orphan_idx
  ON user_merge_staging ("runId", "orphanUserId");
`;

async function ensureStaging(client) {
  await client.query(STAGING_DDL);
}

// ═══════════════════════════════════════════════════════════════════════
//  کشفِ پویای ارجاع‌ها به users.id
// ═══════════════════════════════════════════════════════════════════════

/** همهٔ ستون‌هایی که در کاتالوگِ پایگاه‌داده FK به users.id دارند. */
async function discoverHardReferenceColumns(client) {
  const { rows } = await client.query(`
    SELECT kcu.table_name AS "table", kcu.column_name AS "column"
      FROM information_schema.key_column_usage kcu
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = kcu.constraint_name
       AND ccu.constraint_schema = kcu.constraint_schema
      JOIN information_schema.table_constraints tc
        ON tc.constraint_name = kcu.constraint_name
       AND tc.constraint_schema = kcu.constraint_schema
     WHERE ccu.table_name = 'users'
       AND tc.constraint_type = 'FOREIGN KEY'
       AND kcu.table_schema = 'public'
     ORDER BY 1,2`);
  return rows.map((r) => ({ table: r.table, column: r.column, hard: true }));
}

/**
 * هر ستونِ عددی در public که نامش «بوی کاربر» می‌دهد — حتی اگر FK نداشته باشد.
 * این پرسش «کارهایی که ممکن است از قلم افتاده باشند» را مکانیکی می‌کند؛
 * تطبیق‌اش با فهرست‌های اعلام‌شده در ماژولِ خالص، دروازهٔ ایمنیِ ابزار است.
 */
const USERISH_COLUMN_PROBE = `
  SELECT table_name AS "table", column_name AS "column"
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND data_type = 'integer'
     AND (
       column_name ~* '(user|actor|operator|approver|reviewer|issuer|owner|approved|reviewed|issued|created|updated|triggered|proposal)'
       OR column_name ~* 'person'
     )
   ORDER BY 1,2`;

/**
 * بازبینیِ کامل‌بودنِ فهرستِ ارجاع‌ها.
 * @returns {{ unknown: string[], hardOnly: string[], policyOnly: string[], backups: string[] }}
 */
function auditReferenceCoverage({ probeRows, hardColumns }) {
  const hardKeys = new Set(hardColumns.map((r) => `${r.table}.${r.column}`));
  const unknown = [];
  const hardOnly = [];
  const backups = [];
  for (const r of probeRows) {
    const key = `${r.table}.${r.column}`;
    if (key === 'users.id' || key === 'user_roles.userId') continue;
    if (isBackupTable(r.table)) { backups.push(key); continue; }
    if (IGNORED_REFERENCE_COLUMNS[key]) continue;
    if (!USER_REFERENCE_POLICY[key]) { unknown.push(key); continue; }
    if (hardKeys.has(key)) hardOnly.push(key);
  }
  // برعکس: هر FK واقعی که در سیاست نیامده ⇒ هم ناشناخته است
  for (const r of hardColumns) {
    const key = `${r.table}.${r.column}`;
    if (key === 'user_roles.userId' || key === 'students.userId') continue;
    if (!USER_REFERENCE_POLICY[key]) unknown.push(key);
  }
  return { unknown: [...new Set(unknown)].sort(), hardOnly: [...new Set(hardOnly)].sort(), backups: [...new Set(backups)].sort() };
}

/**
 * شمارشِ ارجاع‌ها به‌ازای هر کاربر، جدول‌به‌جدول.
 *
 * نکتهٔ حیاتی: شمارش باید «به ازای هر کاربر» باشد نه «جمعِ همه». یک پرسش
 * سادهٔ `count(*) WHERE col = ANY(...)` فقط جمعِ کل را می‌دهد و آن جمع ناگهان
 * به تک‌تکِ کاربرها نسبت داده می‌شود — یعنی «یک کاربرِ سالم، یتیمِ آلوده
 * معرفی می‌شود». به همین دلیل GROUP BY روی خودِ ستونِ کاربر اجباری است.
 *
 * @param {import('pg').PoolClient} client
 * @param {number[]} userIds
 * @param {Array<{table:string,column:string}>} columns
 * @returns {Promise<Map<string, Map<number, number>>>} کلیدِ ستون → (userId → شمارش)
 */
async function countReferences(client, userIds, columns) {
  const out = new Map();
  for (const c of columns) {
    const key = `${c.table}.${c.column}`;
    // نامِ جدول و ستون از کاتالوگ/فهرستِ اعلام‌شده می‌آید و در برابر تزریق مصون است
    if (!/^[a-z_][a-z0-9_]*$/i.test(c.table)) throw new Error(`نامِ جدولِ نامعتبر: ${c.table}`);
    if (!/^[a-z_][a-z0-9_]*$/i.test(c.column)) throw new Error(`نامِ ستونِ نامعتبر: ${c.column}`);
    const { rows } = await client.query(
      `SELECT "${c.column}"::int AS uid, count(*)::int AS n
         FROM ${c.table} WHERE "${c.column}" = ANY($1::int[])
        GROUP BY 1`,
      [userIds],
    );
    const perUser = new Map();
    for (const r of rows) perUser.set(Number(r.uid), Number(r.n));
    out.set(key, perUser);
  }
  return out;
}

/** خواندنِ شمارشِ یک ستون برای یک کاربر (۰ یعنی «هیچ ارجاعی»). */
const refCount = (table, orphanUserId) => table.get(orphanUserId) ?? 0;

/** آیا این جدول ایندکسِ یکتایی دارد که شاملِ ستونِ کاربر باشد؟ */
async function tablesWithUniqueIndexOn(client, columns) {
  const byTable = new Map();
  for (const c of columns) if (!byTable.has(c.table)) byTable.set(c.table, []), byTable.get(c.table).push(c.column);
  const out = new Set();
  for (const [table, cols] of byTable) {
    const { rows } = await client.query(
      `SELECT i.indrelid::regclass::text AS tbl, i.indisunique, pg_get_indexdef(i.indexrelid) AS def
         FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname='public' AND c.relname=$1 AND i.indisunique`,
      [table],
    );
    for (const r of rows) {
      for (const col of cols) if (new RegExp(`"${col}"`).test(r.def)) out.add(`${table}.${col}`);
    }
  }
  return out;
}

// ── خواندنِ CSV گزارشِ v2 ─────────────────────────────────────────────────
function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l !== '');
  if (!lines.length) return [];
  const split = (line) => {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const head = split(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = split(l);
    const o = {};
    head.forEach((h, i) => { o[h] = cells[i] === undefined ? '' : cells[i]; });
    return o;
  });
}

/** اجرای fix-student-nc-v2.mjs در حالت خشک و برگرداندنِ سطرهای گزارش. */
function runUpstreamRepair(dbUrl, universities) {
  const dir = mkdtempSync(join(tmpdir(), 'nc-merge-'));
  const csvPath = join(dir, 'upstream-report.csv');
  const args2 = [
    join(HERE, 'fix-student-nc-v2.mjs'),
    '--no-staging',
    '--report', csvPath,
    '--data-root', DATA_ROOT,
    '--db', dbUrl,
  ];
  for (const u of universities) args2.push('--university', u);
  console.log(`\n── اجرای ابزارِ بالادستی (خشک‌اجرا) ──`);
  console.log(`  node scripts/fix-student-nc-v2.mjs --no-staging --report <tmp> ${args2.slice(5, -2).join(' ')}`);
  const out = execFileSync(process.execPath, args2, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  console.log(out.split('\n').filter((l) => /— همه —|AUTO_FIX|خلاصهٔ سطل/.test(l)).map((l) => `  ${l}`).join('\n'));
  return { csvPath, rows: parseCsv(readFileSync(csvPath, 'utf8')) };
}

// ═══════════════════════════════════════════════════════════════════════
//  برنامه‌ریزی
// ═══════════════════════════════════════════════════════════════════════
async function plan(client) {
  // ── ۱) نامزدها ──
  let upstreamRows;
  let upstreamPath = FROM_REPORT;
  if (FROM_REPORT) {
    console.log(`\n── نامزدها از گزارشِ آماده ──\n  ${FROM_REPORT}`);
    upstreamRows = parseCsv(readFileSync(FROM_REPORT, 'utf8'));
  } else {
    const r = runUpstreamRepair(DB_URL, UNI_FILTERS.length ? UNI_FILTERS : Object.keys(UNIVERSITY_DATA_DIRS));
    upstreamRows = r.rows;
    upstreamPath = r.csvPath;
  }
  const allCollisions = upstreamRows.filter((r) => r.verdict === VERDICTS.COLLISION);
  const candidates = pickMergeCandidates(upstreamRows);
  const uniFilterSet = new Set(UNI_FILTERS.map((s) => s.toUpperCase()));
  const uniById = new Map(
    (await client.query(`SELECT id, code FROM universities`)).rows.map((r) => [Number(r.id), String(r.code)]),
  );
  const candidatesInScope = candidates.filter(
    (c) => !uniFilterSet.size || uniFilterSet.has(String(c.universityCode || '').toUpperCase()),
  );

  console.log(`\n── نگاشتِ برخورد ──`);
  console.log(`  سطرهای گزارشِ بالادستی        : ${upstreamRows.length}`);
  console.log(`  حکمِ COLLISION                  : ${allCollisions.length}`);
  console.log(`  با دلیلِ PROPOSED_CODE_OWNED_BY_USER_<id>: ${candidates.length}`);
  console.log(`  پس از فیلترِ --university      : ${candidatesInScope.length}`);
  console.log(`  ${uniFilterSet.size ? '(فیلتر فعال)' : '(بدون فیلتر — همهٔ دانشگاه‌ها)'}`);

  // ── ۲) فهرستِ کاملِ ارجاع‌ها ──
  const hardColumns = await discoverHardReferenceColumns(client);
  const probeRows = (await client.query(USERISH_COLUMN_PROBE)).rows.map((r) => ({ table: r.table, column: r.column }));
  const coverage = auditReferenceCoverage({ probeRows, hardColumns });
  console.log(`\n── پوششِ ارجاع‌ها به users.id ──`);
  console.log(`  FK واقعی کشف‌شده در کاتالوگ      : ${hardColumns.length} ستون`);
  console.log(`  ستونِ «کاربریِ» عددیِ کشف‌شده    : ${probeRows.length} ستون (شامل ${coverage.backups.length} ستونِ جدولِ پشتیبان که عمداً نادیده گرفته شد)`);
  console.log(`  ناشناخته (نه در سیاست، نه در فهرستِ نادیده‌گرفته‌ها): ${coverage.unknown.length}`);
  if (coverage.unknown.length) {
    for (const k of coverage.unknown) console.log(`      ✗ ${k}`);
    die('فهرستِ ارجاع‌ها ناقص است — ابزار اجازه ندارد حدس بزند چه ستون‌هایی به users.id اشاره می‌کنند.');
  }
  if (coverage.backups.length) console.log(`  جدول‌های پشتیبان (نادیده‌گرفته‌شده): ${coverage.backups.join(', ')}`);

  // ستون‌هایی که واقعاً شمرده می‌شوند: همهٔ سیاست + هر FK که سیاست دارد
  const refColumns = Object.keys(USER_REFERENCE_POLICY).map((k) => {
    const [table, column] = k.split('.');
    return { table, column, hard: hardColumns.some((h) => h.table === table && h.column === column) };
  });

  // ── ۳) عملیات (به ازای هر کاربرِ یتیم، نه هر ردیف دانشجو) ──
  const { operations } = groupIntoMergeOperations(candidatesInScope);
  const chains = detectMergeChains(candidatesInScope);
  const orphanIds = operations.map((o) => o.orphanUserId);
  const targetIds = [...new Set(operations.map((o) => o.targetUserId).filter(Boolean))];

  // ── ۴) دادهٔ کاربران و ردیف‌های دانشجو ──
  const userRows = (
    await client.query(
      `SELECT id, "personId", "nationalCode", "universityId" FROM users WHERE id = ANY($1::int[])`,
      [[...new Set([...orphanIds, ...targetIds])]],
    )
  ).rows;
  const userById = new Map(userRows.map((r) => [Number(r.id), r]));

  const studentRows = (
    await client.query(
      `SELECT id, "userId", "studentCode", "universityId" FROM students WHERE "userId" = ANY($1::int[])`,
      [orphanIds],
    )
  ).rows;
  const studentsByOrphan = new Map();
  for (const s of studentRows) {
    if (!studentsByOrphan.has(Number(s.userId))) studentsByOrphan.set(Number(s.userId), []);
    studentsByOrphan.get(Number(s.userId)).push(s);
  }

  // ── ۵) شمارش ارجاع‌ها ──
  const orphanInRange = orphanIds.filter((id) => userById.has(id));
  const refCounts = await countReferences(client, orphanInRange, refColumns);
  const uniqueOn = await tablesWithUniqueIndexOn(client, refColumns);
  // ریسک یکتایی: آیا کاربرِ هدف در همان جدول سطری دارد؟
  const targetHasRow = new Map();
  for (const c of refColumns) {
    const key = `${c.table}.${c.column}`;
    if (!uniqueOn.has(key) || !targetIds.length) continue;
    if (!/^[a-z_][a-z0-9_]*$/i.test(c.table)) continue;
    const idents = `"${c.column}"`;
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM ${c.table} WHERE ${idents} = ANY($1::int[])`,
      [targetIds],
    );
    targetHasRow.set(key, rows[0].n);
  }

  // ── ۶) طبقه‌بندی ──
  const evaluated = operations.map((op) => {
    const orphan = userById.get(op.orphanUserId) || null;
    const target = op.targetUserId ? userById.get(op.targetUserId) || null : null;
    const allStudents = studentsByOrphan.get(op.orphanUserId) || [];
    const references = refColumns.map((c) => {
      const key = `${c.table}.${c.column}`;
      return {
        table: c.table,
        column: c.column,
        count: refCount(refCounts.get(key), op.orphanUserId),
        hard: c.hard,
        uniqueRisk: uniqueOn.has(key) && (targetHasRow.get(key) || 0) > 0,
      };
    });
    const cls = classifyMerge({
      orphanUserId: op.orphanUserId,
      targetUserId: op.targetUserId,
      orphan,
      target,
      plannedStudentIds: op.studentIds,
      orphanStudentCount: allStudents.length,
      references,
      targetIsOrphan: op.targetUserId ? chains.orphanIds.has(op.targetUserId) : false,
      inCycle: chains.cycles.some((c) => c.cycle.includes(op.orphanUserId)),
      unknownReferenceColumn: coverage.unknown.length > 0,
      isValidCode: isValidIranianNationalCode,
    });
    return {
      ...op,
      orphan,
      target,
      allStudents,
      plannedStudents: allStudents.filter((s) => op.studentIds.includes(Number(s.id))),
      references,
      ...cls,
      universityCode: candidatesInScope.find((c) => c.orphanUserId === op.orphanUserId)?.universityCode || null,
    };
  });

  return { candidates, candidatesInScope, upstreamRows, upstreamPath, operations, chains, evaluated, refColumns, coverage, uniById };
}

// ═══════════════════════════════════════════════════════════════════════
//  گزارش
// ═══════════════════════════════════════════════════════════════════════
function printReport({ evaluated, chains, refColumns, coverage, uniById }) {
  const uniName = (id) => (id === null || id === undefined ? 'NULL' : uniById.get(Number(id)) || `#${id}`);
  console.log(`\n════════ گزارشِ ادغام ════════`);

  console.log(`\n── سطل‌های ایمنی ──`);
  const s = summarizeMergeClasses(evaluated);
  for (const k of [MERGE_CLASSES.SAFE, MERGE_CLASSES.MIGRATE, MERGE_CLASSES.BLOCKED]) {
    console.log(`  ${k.padEnd(26)} : ${String(s[k]).padStart(5)} عملیات (کاربرِ یتیم)`);
  }
  const studentsTotal = evaluated.length;
  const studSafe = evaluated.filter((e) => e.mergeClass === MERGE_CLASSES.SAFE).reduce((a, e) => a + e.studentIds.length, 0);
  const studMig = evaluated.filter((e) => e.mergeClass === MERGE_CLASSES.MIGRATE).reduce((a, e) => a + e.studentIds.length, 0);
  const studBlk = evaluated.filter((e) => e.mergeClass === MERGE_CLASSES.BLOCKED).reduce((a, e) => a + e.studentIds.length, 0);
  console.log(`  ${'— به ازای ردیف دانشجو —'.padEnd(26)} : ${String(studentsTotal).padStart(5)} نامزد`);
  console.log(`  ${MERGE_CLASSES.SAFE.padEnd(26)} : ${String(studSafe).padStart(5)} ردیف`);
  console.log(`  ${MERGE_CLASSES.MIGRATE.padEnd(26)} : ${String(studMig).padStart(5)} ردیف`);
  console.log(`  ${MERGE_CLASSES.BLOCKED.padEnd(26)} : ${String(studBlk).padStart(5)} ردیف`);

  console.log(`\n── زنجیره / چرخه / هم‌گرایی ──`);
  console.log(`  زنجیره (هدفِ یک ادغام، خودش یتیمِ ادغامِ دیگری است): ${chains.chains.length}`);
  for (const c of chains.chains.slice(0, 10)) console.log(`      ${c.chain.join(' → ')}`);
  console.log(`  چرخه: ${chains.cycles.length}`);
  for (const c of chains.cycles.slice(0, 10)) console.log(`      ${c.cycle.join(' → ')}`);
  console.log(`  یتیم با بیش از یک هدف: ${chains.multipleTargets.length}`);
  for (const m of chains.multipleTargets.slice(0, 10)) console.log(`      یتیم ${m.orphanUserId} → ${m.targets.join(' , ')}`);
  console.log(`  هدفِ مشترک (هم‌گرا): ${chains.fanIn.length} هدف، بیشترین=${chains.fanIn.length ? Math.max(...chains.fanIn.map((f) => f.count)) : 0} یتیم`);

  console.log(`\n── شواهدِ ارجاع (شمارشِ واقعی به کاربرِ یتیم، به‌جز students) ──`);
  const agg = new Map();
  for (const e of evaluated) {
    for (const r of e.references) {
      if (r.table === 'students') continue;
      if (!agg.has(`${r.table}.${r.column}`)) agg.set(`${r.table}.${r.column}`, { n: 0, max: 0, hard: r.hard });
      const a = agg.get(`${r.table}.${r.column}`);
      a.n += r.count; a.max = Math.max(a.max, r.count);
    }
  }
  const w = Math.max(24, ...[...agg.keys()].map((k) => k.length));
  for (const [k, a] of [...agg.entries()].sort((x, y) => y[1].n - x[1].n || x[0].localeCompare(y[0]))) {
    const pol = USER_REFERENCE_POLICY[k];
    const role = pol.role === 'planned' ? 'عملیات' : pol.role === 'immutable' ? 'تغییرناپذیر⇒BLOCK' : 'قابل‌انتقال';
    console.log(`  ${k.padEnd(w)}  جمع=${String(a.n).padStart(6)} · بیشینه=${String(a.max).padStart(4)} · ${a.hard ? 'FK' : 'soft'} · ${role}`);
  }
  console.log(`  (شمارش روی ${evaluated.length} کاربرِ یتیم انجام شد؛ صفر یعنی «هیچ ارجاعی» نه «بررسی‌نشده»)`);
  console.log(`  ستون‌های نادیده‌گرفته‌شدهٔ اعلام‌شده: ${Object.keys(IGNORED_REFERENCE_COLUMNS).length} · FK واقعی: ${refColumns.filter((c) => c.hard).length} · ناشناخته: ${coverage.unknown.length}`);

  console.log(`\n── دانشگاهِ کاربرِ یتیم در برابر هدف ──`);
  const byPair = new Map();
  for (const e of evaluated) {
    const k = `${e.orphan?.universityId ?? 'NULL'}\u2192${e.target?.universityId ?? 'NULL'}`;
    byPair.set(k, (byPair.get(k) || 0) + 1);
  }
  for (const [k, n] of [...byPair.entries()].sort((a, b) => b[1] - a[1])) {
    const [a, b] = k.split('\u2192');
    console.log(`  یتیم=${uniName(a === 'NULL' ? null : Number(a)).padEnd(10)} هدف=${uniName(b === 'NULL' ? null : Number(b)).padEnd(10)} : ${String(n).padStart(4)} عملیات`);
  }
  console.log('  (هدف در دانشگاهِ دیگر بودن برای «تحصیل در دو دانشگاه» طبیعی است و مانع ادغام نیست؛ فقط گزارش می‌شود)');

  console.log(`\n── نمونهٔ هر سطل ──`);
  for (const k of [MERGE_CLASSES.SAFE, MERGE_CLASSES.MIGRATE, MERGE_CLASSES.BLOCKED]) {
    const rows = evaluated.filter((e) => e.mergeClass === k).slice(0, 6);
    if (!rows.length) continue;
    console.log(`  ${k}:`);
    for (const e of rows) {
      console.log(`    یتیم ${e.orphanUserId} «${e.orphan?.nationalCode ?? '—'}» (${uniName(e.orphan?.universityId ?? null)}/${e.allStudents.length} ردیف) → هدف ${e.targetUserId} «${e.target?.nationalCode ?? '—'}» (${uniName(e.target?.universityId ?? null)}) · کدهای دانشجو: ${e.studentCodes.slice(0, 3).join(',')}${e.studentCodes.length > 3 ? '…' : ''}`);
      console.log(`        ارجاع: ${formatReferenceEvidence(e.references)}`);
      if (e.reasons.length) console.log(`        دلیل: ${e.reasons.join(' | ')}`);
    }
  }

  if (evaluated.some((e) => e.mergeClass === MERGE_CLASSES.BLOCKED)) {
    console.log(`\n── دلیل‌های BLOCKED ──`);
    const byReason = new Map();
    for (const e of evaluated.filter((x) => x.mergeClass === MERGE_CLASSES.BLOCKED)) {
      for (const r of e.reasons) byReason.set(r, (byReason.get(r) || 0) + 1);
    }
    for (const [r, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${r.padEnd(48)} : ${String(n).padStart(4)}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  اعمال
// ═══════════════════════════════════════════════════════════════════════
async function apply(client, runId) {
  console.log(`\n════════ اعمال (runId=${runId}) ════════`);

  const planRows = (
    await client.query(`SELECT * FROM user_merge_staging WHERE "runId"=$1 ORDER BY "orphanUserId"`, [runId])
  ).rows;
  if (!planRows.length) die('این شناسهٔ اجرا در جدولِ صحنه نیست — اول یک خشک‌اجرا بگیرید.');

  const actionable = planRows.filter((r) => {
    if (r.mergeClass === MERGE_CLASSES.BLOCKED) return false;
    if (ONLY_CLEAN && r.mergeClass !== MERGE_CLASSES.SAFE) return false;
    return !r.appliedAt;
  });
  const blocked = planRows.filter((r) => r.mergeClass === MERGE_CLASSES.BLOCKED);
  const skippedByOnlyClean = planRows.filter((r) => r.mergeClass === MERGE_CLASSES.MIGRATE && ONLY_CLEAN);
  const alreadyApplied = planRows.filter((r) => r.appliedAt);

  console.log(`  کلِ سطرهای این اجرا : ${planRows.length}`);
  console.log(`  قابلِ اعمال         : ${actionable.length}`);
  console.log(`  BLOCKED             : ${blocked.length}${ONLY_CLEAN ? ' (به‌علاوهٔ مهجوری با --only-clean)' : ''}`);
  console.log(`  از قبل اعمال‌شده    : ${alreadyApplied.length}${alreadyApplied.length ? ' ⇒ این اجرا تکراری است (no-op)' : ''}`);
  if (skippedByOnlyClean.length) console.log(`  مهجور با --only-clean: ${skippedByOnlyClean.length} (${MERGE_CLASSES.MIGRATE})`);

  if (blocked.length && !SKIP_BLOCKED) {
    console.error(`\n✗ ${blocked.length} نامزدِ BLOCKED وجود دارد و --skip-blocked داده نشده ⇒ هیچ اعمالی انجام نشد.`);
    console.error('  برای اعمالِ بقیه، --skip-blocked بدهید (آنگاه فقط سطرهای غیربدشده اعمال می‌شوند).');
    process.exitCode = 3;
    return;
  }
  if (!actionable.length) {
    console.log('\n  چیزی برای اعمال نماند (اجرای تکراری یا فیلتر کامل). تغییری نکرد.');
    return;
  }

  const refColumns = Object.keys(USER_REFERENCE_POLICY).map((k) => { const [table, column] = k.split('.'); return { table, column }; });
  const uniqueOn = await tablesWithUniqueIndexOn(client, refColumns);

  const fault = async (point) => {
    if (SIMULATE_FAULT === point) throw new Error(`خرابیِ شبیه‌سازی‌شده در نقطهٔ «${point}» (برای اثباتِ ROLLBACK)`);
  };

  let movedStudents = 0;
  let movedRefs = 0;
  let deletedUsers = 0;
  const detail = [];

  await client.query('BEGIN');
  try {
    for (const row of actionable) {
      const orphanId = Number(row.orphanUserId);
      const targetId = Number(row.targetUserId);
      const plannedIds = row.studentIds.split(',').map(Number).filter(Boolean);

      // ── (الف) بازبینیِ لحظهٔ آخر: کاربران ──
      const us = (
        await client.query(`SELECT id, "nationalCode", "personId", "universityId" FROM users WHERE id = ANY($1::int[])`, [[orphanId, targetId]])
      ).rows;
      const orphan = us.find((r) => Number(r.id) === orphanId);
      const target = us.find((r) => Number(r.id) === targetId);
      if (!orphan) throw new Error(`سطرِ یتیم ناپدید شد: user ${orphanId}`);
      if (!target) throw new Error(`سطرِ هدف ناپدید شد: user ${targetId}`);
      if (String(orphan.nationalCode) !== String(row.orphanCode)) {
        throw new Error(`${BLOCK_REASONS.CONCURRENT_MODIFICATION}: user ${orphanId} کدملی از «${row.orphanCode}» به «${orphan.nationalCode}» تغییر کرده`);
      }
      if (String(target.nationalCode) !== String(row.targetCode)) {
        throw new Error(`${BLOCK_REASONS.CONCURRENT_MODIFICATION}: user ${targetId} دیگر کد «${row.targetCode}» را ندارد (الان «${target.nationalCode}»)`);
      }
      if (!isValidIranianNationalCode(String(target.nationalCode))) {
        throw new Error(`${BLOCK_REASONS.TARGET_CODE_INVALID}: user ${targetId} = «${target.nationalCode}»`);
      }

      // ── (ب) بازبینیِ لحظهٔ آخر: ردیف‌های دانشجو (همه باید مالِ یتیم و در طرح باشند) ──
      const st = (await client.query(`SELECT id, "userId", "universityId", "studentCode" FROM students WHERE "userId" = ANY($1::int[]) OR id = ANY($2::int[])`, [[orphanId], plannedIds])).rows;
      const mine = st.filter((r) => Number(r.userId) === orphanId);
      if (mine.length !== plannedIds.length) {
        throw new Error(`${BLOCK_REASONS.STUDENTS_OUT_OF_SCOPE}: user ${orphanId} اکنون ${mine.length} ردیفِ دانشجو دارد ولی طرح ${plannedIds.length} ردیف است`);
      }
      const plannedSet = new Set(plannedIds);
      if (mine.some((r) => !plannedSet.has(Number(r.id)))) {
        throw new Error(`${BLOCK_REASONS.STUDENTS_OUT_OF_SCOPE}: user ${orphanId} ردیفِ دانشجویی خارج از طرح دارد`);
      }

      // ── (پ) بازبینیِ لحظهٔ آخر: قیدِ یکتای (universityId, studentCode) ──
      //  ردیفِ زرینه «کدِ دانشجوییِ خودش» را نگه می‌دارد و فقط userId عوض می‌شود،
      //  پس قید uq_students_uni_code نمی‌تواند شکسته شود — ولی باز هم می‌سنجیم.
      const clash = (
        await client.query(
          `SELECT count(*)::int AS n FROM students a JOIN students b
             ON b."universityId"=a."universityId" AND b."studentCode"=a."studentCode" AND b.id<>a.id
            WHERE a.id = ANY($1::int[]) AND b."userId" = ANY($2::int[])`,
          [plannedIds, [targetId]],
        )
      ).rows[0].n;
      if (clash > 0) throw new Error(`uq_students_uni_code: ${clash} ردیف با کدِ دانشجوییِ یکسان، کاربرِ هدف را دارد ⇒ ادغام نقضِ قید یکتا می‌داد`);

      // ── (ت) بازبینیِ لحظهٔ آخر: ارجاع‌ها دوباره شمرده می‌شوند ──
      const now = await countReferences(client, [orphanId], refColumns);
      const snapshot = JSON.parse(row.refSnapshot || '{}');
      for (const [key, expected] of Object.entries(snapshot)) {
        if (key === '__migratable') continue;
        const live = refCount(now.get(key), orphanId);
        if (live !== Number(expected)) {
          throw new Error(`${BLOCK_REASONS.CONCURRENT_MODIFICATION}: ارجاعِ ${key} از ${expected} به ${live} تغییر کرده (کاربر ${orphanId})`);
        }
      }
      // ارجاعِ تغییرناپذیر که در لحظهٔ آخر پیدا شده ⇒ توقف سخت
      for (const key of Object.keys(snapshot)) {
        if (key === '__migratable') continue;
        if (refCount(now.get(key), orphanId) > 0 && USER_REFERENCE_POLICY[key]?.role === 'immutable') {
          throw new Error(`${BLOCK_REASONS.IMMUTABLE_REFERENCE}: ${key} برای کاربر ${orphanId}`);
        }
      }

      // ── ۱) جابه‌جاییِ ردیف‌های دانشجو ──
      const up = await client.query(`UPDATE students SET "userId"=$1 WHERE id = ANY($2::int[]) AND "userId"=$3`, [targetId, plannedIds, orphanId]);
      if (up.rowCount !== plannedIds.length) throw new Error(`اثرِ نام‌ناهماهنگ: students ${up.rowCount}/${plannedIds.length} (user ${orphanId})`);
      movedStudents += up.rowCount;
      await fault('after-students');

      // ── ۲) مهاجرتِ ارجاع‌ها (فقط ستون‌هایی که classifier اجازه داده) ──
      const migratableKeys = JSON.parse(row.refSnapshot || '{}').__migratable || [];
      for (const key of migratableKeys) {
        const [table, column] = key.split('.');
        if (!/^[a-z_][a-z0-9_]*$/i.test(table)) throw new Error(`نامِ جدولِ نامعتبر: ${table}`);
        const n = refCount(now.get(key), orphanId);
        if (!n) continue;
        const r = await client.query(
          `UPDATE ${table} SET "${column}"=$1 WHERE "${column}"=$2`,
          [targetId, orphanId],
        );
        if (r.rowCount !== n) throw new Error(`اثرِ نام‌ناهماهنگ: ${key} ${r.rowCount}/${n}`);
        movedRefs += r.rowCount;
      }
      await fault('after-migrate');

      // ── ۳) حذفِ کاربرِ یتیم (compare-and-delete) ──
      await fault('before-delete');
      const del = await client.query(`DELETE FROM users WHERE id=$1 AND "nationalCode"=$2`, [orphanId, row.orphanCode]);
      if (del.rowCount !== 1) throw new Error(`اثرِ نام‌ناهماهنگ: حذفِ user ${orphanId} → ${del.rowCount} سطر`);
      deletedUsers += del.rowCount;

      await client.query(
        `UPDATE user_merge_staging SET "appliedAt"=now(), "appliedStudentCount"=$1 WHERE id=$2`,
        [up.rowCount, row.id],
      );
      detail.push({ orphanId, targetId, students: up.rowCount, refs: migratableKeys.length });
    }

    console.log(`\n  ردیف‌های دانشجوی منتقل‌شده : ${movedStudents}`);
    console.log(`  ارجاع‌های منتقل‌شده        : ${movedRefs}`);
    console.log(`  کاربرانِ حذف‌شده            : ${deletedUsers}`);
    await client.query('COMMIT');
    console.log('\n  ✓ COMMIT انجام شد.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`\n  ✗ خطا: ${e.message}`);
    console.error('  ✗ ROLLBACK شد — هیچ‌یک از تغییرات این تراکنش اعمال نشده است.');
    throw e;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  main
// ═══════════════════════════════════════════════════════════════════════
function selfTest() {
  console.log('\n── خودآزمایِ طبقه‌بندیِ ادغام ──');
  const base = {
    orphanUserId: 97058,
    targetUserId: 26767,
    orphan: { nationalCode: 'SZ00031028', personId: null, universityId: 2 },
    target: { nationalCode: '2803421712', personId: null, universityId: 1 },
    plannedStudentIds: [1],
    orphanStudentCount: 1,
    references: [
      { table: 'students', column: 'userId', count: 1 },
      { table: 'user_roles', column: 'userId', count: 0 },
      { table: 'sessions', column: 'userId', count: 0 },
      { table: 'notifications', column: 'userId', count: 0 },
      { table: 'audit_logs', column: 'actorUserId', count: 0 },
    ],
    isValidCode: isValidIranianNationalCode,
  };
  const c = (over) => classifyMerge({ ...base, ...over });
  const cases = [
    ['بدون هیچ ارجاع ⇒ MERGE_SAFE', c({}).mergeClass, MERGE_CLASSES.SAFE],
    ['یتیم == هدف ⇒ BLOCKED', c({ targetUserId: 97058 }).mergeClass, MERGE_CLASSES.BLOCKED],
    ['یتیم ناپدید ⇒ BLOCKED', c({ orphan: null }).blockedBy, BLOCK_REASONS.MISSING_ORPHAN],
    ['هدف ناپدید ⇒ BLOCKED', c({ target: null }).blockedBy, BLOCK_REASONS.MISSING_TARGET],
    ['هدف خودش یتیمِ دیگری ⇒ BLOCKED', c({ targetIsOrphan: true }).blockedBy, BLOCK_REASONS.TARGET_IS_ORPHAN],
    ['چرخه ⇒ BLOCKED', c({ inCycle: true }).blockedBy, BLOCK_REASONS.CYCLE],
    ['هدف کدِ معتبر ندارد ⇒ BLOCKED', c({ target: { nationalCode: '2269' } }).blockedBy, BLOCK_REASONS.TARGET_CODE_INVALID],
    ['یتیم personId دارد ⇒ BLOCKED', c({ orphan: { ...base.orphan, personId: 9 } }).blockedBy, BLOCK_REASONS.ORPHAN_HAS_PERSON],
    ['ردیفِ دانشجو خارج از طرح ⇒ BLOCKED', c({ orphanStudentCount: 2 }).blockedBy, BLOCK_REASONS.STUDENTS_OUT_OF_SCOPE],
    ['اعلان دارد ⇒ MERGE_WITH_DATA_MIGRATION', c({ references: [...base.references, { table: 'notifications', column: 'userId', count: 3 }] }).mergeClass, MERGE_CLASSES.MIGRATE],
    ['audit_logs به‌عنوان کنشگر ⇒ BLOCKED', c({ references: [...base.references, { table: 'audit_logs', column: 'actorUserId', count: 1 }] }).blockedBy, BLOCK_REASONS.IMMUTABLE_REFERENCE],
    ['نقش دارد ⇒ MERGE_WITH_DATA_MIGRATION', c({ references: [...base.references, { table: 'user_roles', column: 'userId', count: 2 }] }).mergeClass, MERGE_CLASSES.MIGRATE],
    ['ریسک یکتایی ⇒ BLOCKED', c({ references: [...base.references, { table: 'user_roles', column: 'userId', count: 2, uniqueRisk: true }] }).blockedBy, `${BLOCK_REASONS.UNIQUE_RISK}:user_roles.userId`],
    ['ستونِ ارجاعِ ناشناخته ⇒ BLOCKED', c({ references: [...base.references, { table: 'brand_new', column: 'userId', count: 1 }] }).blockedBy, BLOCK_REASONS.UNKNOWN_REFERENCE],
    ['پرچمِ کامل‌نبودنِ فهرست ⇒ BLOCKED', c({ unknownReferenceColumn: true }).blockedBy, BLOCK_REASONS.UNKNOWN_REFERENCE],
  ];
  let pass = 0, fail = 0;
  for (const [name, got, want] of cases) {
    const ok = got === want;
    ok ? pass++ : fail++;
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  got=${got} want=${want}`}`);
  }
  // زنجیره‌ها
  const ch = detectMergeChains([
    { orphanUserId: 1, targetUserId: 2 }, { orphanUserId: 2, targetUserId: 3 }, { orphanUserId: 4, targetUserId: 5 }, { orphanUserId: 6, targetUserId: 2 },
  ]);
  const chainCases = [
    ['زنجیرهٔ ۱→۲→۳ کشف شد', ch.chains.some((x) => x.chain.join('>') === '1>2'), true],
    ['هم‌گرایی ۲ (از ۱ و ۶)', ch.fanIn.find((f) => f.targetUserId === 2)?.count, 2],
    ['بدون زنجیره ⇒ خالی', detectMergeChains([{ orphanUserId: 1, targetUserId: 2 }]).chains.length, 0],
    ['چرخهٔ ۱→۲→۱ کشف شد', detectMergeChains([{ orphanUserId: 1, targetUserId: 2 }, { orphanUserId: 2, targetUserId: 1 }]).cycles.length > 0, true],
    ['یتیم با دو هدف', detectMergeChains([{ orphanUserId: 1, targetUserId: 2 }, { orphanUserId: 1, targetUserId: 3 }]).multipleTargets.length, 1],
  ];
  for (const [name, got, want] of chainCases) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    ok ? pass++ : fail++;
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
  }
  // گروه‌بندی
  const g = groupIntoMergeOperations([
    { orphanUserId: 1, targetUserId: 5, studentId: 10, studentCode: 'a' },
    { orphanUserId: 1, targetUserId: 5, studentId: 11, studentCode: 'b' },
  ]);
  const gCases = [
    ['دو ردیفِ یک یتیم ⇒ یک عملیات', g.operations.length, 1],
    ['هر دو ردیف در همان عملیات', g.operations[0].studentIds.length, 2],
    ['دو هدف برای یک یتیم ⇒ ناسازگار', groupIntoMergeOperations([
      { orphanUserId: 1, targetUserId: 5, studentId: 10, studentCode: 'a' },
      { orphanUserId: 1, targetUserId: 6, studentId: 11, studentCode: 'b' },
    ]).inconsistent.length, 1],
  ];
  for (const [name, got, want] of gCases) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    ok ? pass++ : fail++;
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
  }
  console.log(`  نتیجه: ${pass} موفق | ${fail} شکست`);
  if (fail) process.exitCode = 1;
  return fail === 0;
}

async function main() {
  if (SELFTEST) return void selfTest();

  const pool = new Pool({ connectionString: DB_URL, max: 4 });
  const client = await pool.connect();
  const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z') + '-' + Math.random().toString(36).slice(2, 8);

  console.log('════════════════════════════════════════════════════════════════');
  console.log(' ادغامِ کاربرانِ تکراری — خشک‌اجرا به‌صورت پیش‌فرض');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(` حالت     : ${APPLY ? '⚠ APPLY (نوشتن در users)' : 'خشک (dry-run)'}${NO_STAGING ? ' + فقط‌گزارش (بدون staging)' : ''}`);
  console.log(` دیتابیس  : ${redact(DB_URL)}`);
  if (APPLY) {
    console.log(` فیلترها  : --only-clean=${ONLY_CLEAN ? 'بله' : 'خیر'} · --skip-blocked=${SKIP_BLOCKED ? 'بله' : 'خیر'}`);
  } else console.log(` شناسهٔ اجرا: ${runId}`);

  try {
    if (APPLY) {
      await ensureStaging(client);
      const rid = RUN_ID_ARG || (await client.query(`SELECT "runId" FROM user_merge_staging GROUP BY 1 ORDER BY max(id) DESC LIMIT 1`)).rows[0]?.runId;
      if (!rid) die('هیچ اجرایی در جدولِ صحنه نیست — اول یک خشک‌اجرا بگیرید.');
      await apply(client, rid);
      return;
    }

    const result = await plan(client);
    printReport(result);

    // ── نوشتن در جدولِ صحنه ──
    if (!NO_STAGING) {
      await ensureStaging(client);
      await client.query('BEGIN');
      try {
        for (let i = 0; i < result.evaluated.length; i += 200) {
          const chunk = result.evaluated.slice(i, i + 200);
          const vals = [];
          const tuples = chunk.map((e, k) => {
            const snap = {};
            for (const r of e.references) snap[`${r.table}.${r.column}`] = r.count;
            snap.__migratable = e.migratable.map((m) => m.key);
            const cells = [
              runId,
              e.universityCode,
              e.allStudents[0]?.universityId ?? null,
              e.orphanUserId,
              e.orphan?.nationalCode ?? null,
              e.meta?.orphanClass ?? null,
              e.orphan?.universityId ?? null,
              e.targetUserId,
              e.target?.nationalCode ?? null,
              e.target?.universityId ?? null,
              e.studentIds.join(','),
              e.studentCodes.join(','),
              e.studentIds.length,
              e.mergeClass,
              e.blockedBy,
              e.reasons.join(' | '),
              formatReferenceEvidence(e.references),
              JSON.stringify(snap),
            ];
            const b = k * cells.length;
            vals.push(...cells);
            return `(${cells.map((_, c) => '$' + (b + c + 1)).join(',')})`;
          });
          await client.query(
            `INSERT INTO user_merge_staging
               ("runId","universityCode","universityId","orphanUserId","orphanCode","orphanClass","orphanUniversityId",
                "targetUserId","targetCode","targetUniversityId","studentIds","studentCodes","studentCount",
                "mergeClass","blockedBy","reasons","refEvidence","refSnapshot")
             VALUES ${tuples.join(',')}
             ON CONFLICT ("runId","orphanUserId") DO UPDATE SET
               "targetUserId"=EXCLUDED."targetUserId", "targetCode"=EXCLUDED."targetCode",
               "studentIds"=EXCLUDED."studentIds", "studentCount"=EXCLUDED."studentCount",
               "mergeClass"=EXCLUDED."mergeClass", "blockedBy"=EXCLUDED."blockedBy",
               reasons=EXCLUDED.reasons, "refEvidence"=EXCLUDED."refEvidence", "refSnapshot"=EXCLUDED."refSnapshot"`,
            vals,
          );
        }
        await client.query('COMMIT');
        console.log(`\n✓ طرح در جدولِ صحنه نوشته شد: user_merge_staging (runId=${runId}) — ${result.evaluated.length} عملیات`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    } else {
      console.log('\n(--no-staging: هیچ نوشتنی در دیتابیس انجام نشد)');
    }

    // ── CSV ──
    if (REPORT_CSV) {
      const head = ['runId', 'universityCode', 'studentId', 'studentCode', 'orphanUserId', 'orphanCode', 'orphanClass', 'orphanUniversityId', 'targetUserId', 'targetCode', 'targetUniversityId', 'mergeClass', 'blockedBy', 'reasons', 'refEvidence', 'upstream'];
      const esc = (v) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [head.join(',')];
      for (const e of result.evaluated) {
        for (const sid of e.studentIds) {
          const code = e.studentCodes[e.studentIds.indexOf(sid)];
          lines.push([
            runId, e.universityCode, sid, code, e.orphanUserId, e.orphan?.nationalCode, e.meta?.orphanClass,
            e.orphan?.universityId, e.targetUserId, e.target?.nationalCode, e.target?.universityId,
            e.mergeClass, e.blockedBy, e.reasons.join(' | '), formatReferenceEvidence(e.references), result.upstreamPath,
          ].map(esc).join(','));
        }
      }
      writeFileSync(REPORT_CSV, '\uFEFF' + lines.join('\r\n') + '\r\n', 'utf8');
      console.log(`✓ گزارش per-student نوشته شد: ${REPORT_CSV} (${lines.length - 1} ردیف)`);
    }

    console.log('\nℹ برای اعمال: --apply --run ' + (NO_STAGING ? '<runId از اجرای صحنه‌دار قبلی>' : runId));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('\n✗ خطا:', e?.message || e);
  process.exitCode = 1;
});
