#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════
 *  ترمیم امن «کد ملی» دانشجویان از student2.txt  (نسخهٔ ۲ — بر پایهٔ هدر)
 *
 *  چرا نسخهٔ ۲؟  نسخهٔ ۱ (scripts/fix-student-nc.mjs) سه ایراد مرگبار داشت:
 *    ۱) ایندکس ستون کد ملی را **هاردکد** گرفته بود (ستون ۷). چیدمان ستون‌ها
 *       در هر دانشگاه فرق می‌کند → برای زرینه/علامه ستون ۷ «Nationality»
 *       است (همیشه 0) و ۱۰۰٪ کدها خراب شدند.
 *    ۲) مستقیم در users می‌نوشت (بدون صحنه‌سازی/مرور انسانی) و در برخورد
 *       کلید یکتا، کد را NULL می‌کرد → از دست رفتن ردیف.
 *    ۳) اصلاً خشک‌اجرا (dry-run) نداشت.
 *  این نسخه: تفکیک ستون **فقط با نام هدر**، جدول صحنه (staging)،
 *  خشک‌اجرا به‌صورت پیش‌فرض، و هیچ نوشتنی در users مگر با --apply.
 *
 *  منبع حقیقت: information-<dir>/student2.txt  (Windows-1256، تب‌جدا)
 *    کلید الحاق: Stno ↔ students."studentCode" (در محدودهٔ همان دانشگاه)
 *
 *  ── گزینه‌ها ────────────────────────────────────────────────────────────
 *    --university <code|id>   تکرارپذیر؛ پیش‌فرض: همهٔ دانشگاه‌های یافت‌شده
 *    --data-root <path>       پیش‌فرض /root
 *    --dir <dir>              فقط یک پوشهٔ دادهٔ تک‌دانشگاهی
 *    --report <path.csv>      خروجی کامل per-student به CSV
 *    --no-staging             هیچ نوشتنی در دیتابیس (فقط گزارش) — برای prod
 *    --apply                  ارتقای سطرهای AUTO_FIX از جدول صحنه به users
 *    --run <runId>            کدام اجرای قبلی ارتقا یابد (پیش‌فرض: آخرین)
 *    --self-test             تست معیار mod-11 با کدهای شناخته‌شده و خروج
 *    --db <url>               پیش‌فرض: DATABASE_URL یا localhost
 *
 *  مثال:
 *    node scripts/fix-student-nc-v2.mjs --university ZARINE --report /tmp/zarine.csv
 *    node scripts/fix-student-nc-v2.mjs --university ZARINE --university ALLAME --report /tmp/p.csv
 *    node scripts/fix-student-nc-v2.mjs --apply --run 20260101T101500Z-abc123
 * ════════════════════════════════════════════════════════════════════════
 */
import { createReadStream, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import pg from 'pg';
import {
  UNIVERSITY_DATA_DIRS,
  VERDICTS,
  SENTINEL_CODES,
  resolveColumnsByHeader,
  classifyCurrent,
  classifySource,
  decideRepair,
  checkCollision,
  checkPlanCollision,
  isValidIranianNationalCode,
} from './lib/student-nc-repair.mjs';

const { Pool } = pg;

// ── آرگومان‌ها (همان قرارداد سایر اسکریپت‌های این مخزن) ──────────────────
//  نکته: حلقهٔ بالا آخرین مقدارِ هر کلید را نگه می‌دارد؛ پس گزینه‌های «تکرارپذیر»
//  جداگانه از روی argv جمع می‌شوند (مثلاً چند بار --university).
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

const DATA_ROOT = opt('data-root', '/root');
const REPORT_CSV = opt('report', null);
const DB_URL = opt('db', process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db');
const APPLY = flag('apply');
const NO_STAGING = flag('no-staging');
const SELFTEST = flag('self-test');
const RUN_ID_ARG = opt('run', null);
// --university تکرارپذیر است و با کاما هم می‌پذیرد: --university ZARINE --university ALLAME
const UNI_FILTERS = repeatable('university')
  .flatMap((v) => String(v).split(','))
  .map((s) => s.trim())
  .filter(Boolean);

const redact = (u) => String(u).replace(/:[^:@/]*@/, ':***@');

// ═══════════════════════════════════════════════════════════════════════
//  ۰) خودآزمای معیار mod-11  (قابل اعتماد کردن اعتبارسنج)
// ═══════════════════════════════════════════════════════════════════════
function selfTest() {
  // معتبرها: ۴ کدِ واقعی که مستقیماً از student2.txt دانشگاه‌های زرینه/شمس
  // برداشته شده‌اند + کدهای مرجعِ تست‌های همین مخزن + چند کد مرزی.
  const VALID = [
    '0010376811', '0499370899', '1270384211', '0061392571', '0084575948',
    '0790419904', '1234567891', '9876543210',
    '0383744024', '4939546942', '2802917961', '2790450846',
    ' 0010376811 ',
  ];
  const INVALID = [
    ['0010376812', 'رقم کنترل عوض شده'],
    ['1111111110', 'رقم کنترل عوض شده (رقم‌های یکسان ولی چک‌سام غلط)'],
    ['0000000000', 'بنچمارک — ارقام یکسان (چک‌سامش درست است ولی کد نیست)'],
    ['1111111111', 'بنچمارک — ارقام یکسان (چک‌سامش درست است ولی کد نیست)'],
    ['9999999999', 'ارقام یکسان'],
    ['0123456789', 'بنچمارک متداول'],
    ['1234567890', 'بنچمارک متداول'],
    ['S78001234', 'کد مصنوعی سما'],
    ['', 'خالی'],
    ['001037681', '۹ رقم'],
    ['00103768111', '۱۱ رقم'],
    ['123456789', '۹ رقم'],
    ['۰۰۱۰۳۷۶۸۱۲', 'ارقام فارسی — این تابع نرمال‌سازی نمی‌کند (کارِ normalizeDigits است)'],
    [null, 'null'],
    [undefined, 'undefined'],
  ];
  let pass = 0;
  let fail = 0;
  console.log('\n── خودآزمای اعتبارسنج mod-11 ──');
  for (const c of VALID) {
    const ok = isValidIranianNationalCode(c);
    ok ? pass++ : fail++;
    console.log(`  ${ok ? '✓' : '✗'} معتبر    ${c}`);
  }
  for (const [c, why] of INVALID) {
    const ok = !isValidIranianNationalCode(c);
    ok ? pass++ : fail++;
    console.log(`  ${ok ? '✓' : '✗'} نامعتبر  ${String(JSON.stringify(c)).padEnd(16)} — ${why}`);
  }
  // بررسی مستقل: تولید ۵۰٬۰۰۰ رقم کنترل درست و نادرست، مقایسه با مرجع مستقل
  let genOk = 0;
  let genBad = 0;
  for (let i = 0; i < 50000; i++) {
    const nine = String(i * 7919 + 100000000).padStart(9, '0').slice(0, 9);
    const sum = nine.split('').reduce((s, d, k) => s + Number(d) * (10 - k), 0);
    const r = sum % 11;
    const check = r < 2 ? r : 11 - r;
    const good = nine + String(check);
    const bad = nine + String((check + 1) % 10);
    if (isValidIranianNationalCode(good)) genOk++;
    else console.log('  ✗ تولید معتبر رد شد:', good);
    if (!isValidIranianNationalCode(bad)) genBad++;
    else console.log('  ✗ تولید نامعتبر قبول شد:', bad);
  }
  console.log(`  ✓ ۵۰۰۰۰ کد معتبرِ تولیدشده همگی قبول شدند`);
  console.log(`  ✓ ۵۰۰۰۰ کد نامعتبرِ تولیدشده (رقم کنترل دستکاری‌شده) همگی رد شدند`);
  console.log(`  نتیجه: ${pass} موفق | ${fail} شکست | تولید: ${genOk} درست، ${genBad} نادرست`);
  return fail === 0 && genOk === 50000 && genBad === 50000;
}

// ═══════════════════════════════════════════════════════════════════════
//  خواندن TSV (Windows-1256، مقاوم به بایت NUL)
// ═══════════════════════════════════════════════════════════════════════
const dec1256 = new TextDecoder('windows-1256');

/** فقط سطر اول غیرخالی را برمی‌گرداند (هدر) */
async function readHeader(path) {
  const stream = createReadStream(path, { highWaterMark: 1 << 20, start: 0, end: 65535 });
  let text = '';
  for await (const chunk of stream) {
    text += dec1256.decode(chunk);
    const nl = text.indexOf('\n');
    if (nl >= 0) {
      stream.destroy();
      return text.slice(0, nl).replace(/\r$/, '').split('\t');
    }
  }
  return text.replace(/\r$/, '').split('\t');
}

/**
 * خواندن student2.txt و ساخت نگاشت Stno → { ncRaw, rows }
 * @returns {Promise<Map<string,{ncRaw:string,rows:number}>>}
 */
async function readSourceFile(path, ncIndex, stnoIndex) {
  const map = new Map();
  const stream = createReadStream(path, { highWaterMark: 4 * 1024 * 1024 });
  let carry = Buffer.alloc(0);
  let headerDone = false;
  let dupRows = 0;
  let dupConflicts = 0;
  let skippedNonNumericStno = 0;
  let dataRows = 0;
  const ingest = (cols) => {
    const stno = (cols[stnoIndex] || '').trim();
    if (!/^[0-9]{1,14}$/.test(stno)) {
      skippedNonNumericStno++;
      return;
    }
    const ncRaw = (cols[ncIndex] || '').trim();
    const prev = map.get(stno);
    if (!prev) {
      map.set(stno, { ncRaw, rows: 1, conflict: false });
      return;
    }
    dupRows++;
    prev.rows++;
    // تعارض واقعی فقط وقتی دو مقدارِ غیرخالیِ متفاوت داشته باشند
    if (!prev.conflict && prev.ncRaw !== '' && ncRaw !== '' && prev.ncRaw !== ncRaw) {
      prev.conflict = true;
      dupConflicts++;
    } else if (prev.ncRaw === '' && ncRaw !== '') {
      prev.ncRaw = ncRaw;
    }
  };
  for await (const chunk of stream) {
    const buf = Buffer.concat([carry, chunk]);
    let start = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] !== 10) continue;
      const line = dec1256.decode(buf.subarray(start, i)).replace(/\r/g, '');
      start = i + 1;
      if (line.trim() === '') continue;
      if (!headerDone) {
        headerDone = true;
        continue;
      }
      dataRows++;
      ingest(line.split('\t'));
    }
    carry = buf.subarray(start);
  }
  if (carry.length) {
    const last = dec1256.decode(carry).replace(/\r/g, '');
    if (last.trim() !== '' && headerDone) {
      dataRows++;
      ingest(last.split('\t'));
    }
  }
  return { map, stats: { dataRows, uniqueStno: map.size, dupRows, dupConflicts, skippedNonNumericStno } };
}

// ═══════════════════════════════════════════════════════════════════════
//  جدول صحنه (idempotent — داخل خود اسکریپت، نه مهاجرت drizzle)
// ═══════════════════════════════════════════════════════════════════════
const STAGING_DDL = `
CREATE TABLE IF NOT EXISTS national_code_repair_staging (
  id                 serial PRIMARY KEY,
  "runId"            varchar(64)  NOT NULL,
  "universityId"     integer      NOT NULL,
  "universityCode"   varchar(30)  NOT NULL,
  "studentId"        integer      NOT NULL,
  "studentCode"      varchar(14)  NOT NULL,
  "userId"           integer      NOT NULL,
  "currentCode"      varchar(10)  NOT NULL,
  "currentClass"     varchar(60)  NOT NULL,
  "birthCertNo"      varchar(20),
  "equalsBirthCert"  integer      NOT NULL DEFAULT 0,
  "sourceColumn"     varchar(60),
  "sourceRaw"        varchar(80),
  "sourceState"      varchar(20)  NOT NULL,
  "sourceFrom"       varchar(30),
  "proposedCode"     varchar(10),
  verdict            varchar(30)  NOT NULL,
  reason             varchar(120) NOT NULL,
  "collisionUserId"  integer,
  "createdAt"        timestamptz  NOT NULL DEFAULT now(),
  "appliedAt"        timestamptz
);
CREATE INDEX IF NOT EXISTS national_code_repair_staging_run_verdict_idx
  ON national_code_repair_staging ("runId", verdict);
CREATE UNIQUE INDEX IF NOT EXISTS national_code_repair_staging_run_student_idx
  ON national_code_repair_staging ("runId", "studentId");
`;

async function ensureStaging(client) {
  await client.query(STAGING_DDL);
}

// ═══════════════════════════════════════════════════════════════════════
//  اجرای اصلی
// ═══════════════════════════════════════════════════════════════════════
async function main() {
  if (SELFTEST) {
    const ok = selfTest();
    console.log(ok ? '\n✓ خودآزمایی mod-11 کامل قبول شد.' : '\n✗ خودآزمایی mod-11 شکست خورد!');
    process.exitCode = ok ? 0 : 1;
    return;
  }

  const pool = new Pool({ connectionString: DB_URL, max: 4 });
  const client = await pool.connect();
  const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z') + '-' + Math.random().toString(36).slice(2, 8);

  console.log('════════════════════════════════════════════════════════════════');
  console.log(' ترمیم کد ملی دانشجویان — v2 (تفکیک ستون بر پایهٔ نام هدر)');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(` حالت       : ${APPLY ? '⚠ APPLY (نوشتن در users)' : 'خشک (dry-run) — users دست‌نخورده'}${NO_STAGING && !APPLY ? ' + فقط‌گزارش (بدون staging)' : ''}`);
  console.log(` دیتابیس    : ${redact(DB_URL)}`);
  console.log(` ریشهٔ داده  : ${DATA_ROOT}`);
  if (!APPLY) console.log(` شناسهٔ اجرا : ${runId}`);

  try {
    // ── حالت ارتقا: فقط از جدول صحنه می‌خواند و فقط AUTO_FIX را می‌نویسد.
    //    عمداً هیچ برنامه‌ریزیِ دوباره‌ای در این حالت انجام نمی‌شود تا «طرحِ
    //    دیده‌شده» با «طرحِ اعمال‌شده» یکی باشد.
    if (APPLY) {
      await ensureStaging(client);
      await promote(client, RUN_ID_ARG);
      return;
    }

    // ── ۱) دانشگاه‌ها ──
    const uniRows = (await client.query(`SELECT id, code, title FROM universities ORDER BY id`)).rows;
    const byCode = new Map(uniRows.map((u) => [u.code.toUpperCase(), u]));
    const byId = new Map(uniRows.map((u) => [Number(u.id), u]));
    const dirToCode = new Map(Object.entries(UNIVERSITY_DATA_DIRS).map(([c, d]) => [d, c]));

    const singleDir = opt('dir', null);
    let selected;
    if (singleDir) {
      const d = basename(singleDir);
      const code = dirToCode.get(d) || dirToCode.get(`${d}/`);
      const resolved = code ? byCode.get(code) : byId.get(Number(d));
      if (!resolved) {
        console.error(`\n✗ پوشهٔ «${d}» به هیچ دانشگاهی نگاشت نشد.`);
        console.error(`  نگاشت‌های معتبر: ${[...dirToCode.keys()].join(' , ')}`);
        process.exitCode = 2;
        return;
      }
      selected = [{ uni: resolved, dir: singleDir }];
    } else {
      const codes = UNI_FILTERS.length
        ? UNI_FILTERS.map((f) => (/^[0-9]+$/.test(f) ? byId.get(Number(f)) : byCode.get(f.toUpperCase())))
        : Object.keys(UNIVERSITY_DATA_DIRS).map((c) => byCode.get(c));
      selected = [];
      for (const u of codes) {
        if (!u) {
          console.error(`  ⚠ دانشگاه «${UNI_FILTERS.join(',')}» در جدول universities پیدا نشد — رد شد`);
          continue;
        }
        if (UNI_FILTERS.length) selected.push({ uni: u, dir: join(DATA_ROOT, UNIVERSITY_DATA_DIRS[u.code.toUpperCase()]) });
        else if (uniRows.some((x) => x.code.toUpperCase() === u.code.toUpperCase())) {
          const dd = join(DATA_ROOT, UNIVERSITY_DATA_DIRS[u.code.toUpperCase()]);
          selected.push({ uni: u, dir: dd });
        }
      }
      if (!UNI_FILTERS.length) selected = selected.filter((s) => s.uni);
    }

    // ── ۲) خواندن فایل‌ها و ساخت نگاشت منبع ──
    const sources = new Map(); // universityId -> { uni, dir, path, cols, map, stats, error }
    for (const { uni, dir } of selected) {
      const path = join(dir, 'student2.txt');
      const rec = { uni, dir, path, cols: null, map: null, stats: null, error: null };
      sources.set(Number(uni.id), rec);
      let header;
      try {
        header = await readHeader(path);
      } catch (e) {
        rec.error = `فایل خوانده نشد: ${e.message}`;
        continue;
      }
      const res = resolveColumnsByHeader(header);
      if (!res.ok) {
        rec.error = `${res.code}: ${res.error}`;
        rec.cols = { stnoIndex: null, nationalCodeIndex: null };
        continue;
      }
      rec.cols = res;
      const loaded = await readSourceFile(path, res.nationalCodeIndex, res.stnoIndex);
      rec.map = loaded.map;
      rec.stats = loaded.stats;
    }

    // ── ۳) دادهٔ دیتابیس ──
    const uniIds = selected.map((s) => Number(s.uni.id));
    const students = (
      await client.query(
        `SELECT s.id AS "studentId", s."studentCode", s."universityId", s."userId",
                u."nationalCode" AS "currentCode", u."birthCertNo"
           FROM students s JOIN users u ON u.id = s."userId"
          WHERE s."universityId" = ANY($1::int[])`,
        [uniIds],
      )
    ).rows;
    const codeOwners = new Map(
      (await client.query(`SELECT "nationalCode", id FROM users WHERE "nationalCode" IS NOT NULL`)).rows.map((r) => [r.nationalCode, r.id]),
    );
    // ── بازرسی سلامت قید: آیا nationalCode هنوز NOT NULL/UNIQUE است؟ ──
    const ncCol = (await client.query(`SELECT is_nullable FROM information_schema.columns WHERE table_name='users' AND column_name='nationalCode'`)).rows[0];
    const nullNc = (await client.query(`SELECT count(*)::int AS n FROM users WHERE "nationalCode" IS NULL`)).rows[0].n;
    if (ncCol && ncCol.is_nullable === 'YES') {
      console.log(`\n⚠ هشدار قید: users.nationalCode در این دیتابیس NULL-پذیر است و ${nullNc} کاربر کدِ NULL دارند.`);
      console.log('  قید NOT NULL قبلاً حذف شده (احتمالاً توسط fix-student-nc.mjs نسخهٔ ۱ که کد را NULL می‌کرد).');
    }
    const uniq = (await client.query(`SELECT count(*)::int AS n FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid WHERE c.relname='users' AND i.indisunique AND i.indisprimary = false AND pg_get_indexdef(i.indexrelid) LIKE '%nationalCode%'`)).rows[0].n;
    if (uniq < 1) console.log('\n⚠ هشدار قید: هیچ قید یکتایی روی users.nationalCode پیدا نشد — تشخیص برخورد فقط نرم‌افزاری است!');

    // ── ۴) گروه‌بندی در سطح کاربر (users.nationalCode در سطح کاربر است) ──
    const byUser = new Map();
    for (const s of students) {
      if (!byUser.has(s.userId)) byUser.set(s.userId, { userId: s.userId, currentCode: s.currentCode, birthCertNo: s.birthCertNo, students: [] });
      byUser.get(s.userId).students.push(s);
    }

    // ── ۵) ارزیابی منبع برای هر کاربر ──
    const evalByUser = new Map();
    for (const u of byUser.values()) {
      const perStudent = u.students.map((s) => {
        const src = sources.get(Number(s.universityId));
        const uni = src ? src.uni : { code: '?', id: s.universityId };
        if (!src || !src.cols || src.cols.nationalCodeIndex === null) {
          return { s, uni, source: { state: 'MISSING', value: '', raw: '', reason: src?.error ? 'UNIVERSITY_SKIPPED_NO_HEADER' : 'NO_SOURCE_FILE' }, sourceColumn: null };
        }
        const hit = src.map.get(s.studentCode);
        const source = classifySource(hit ? hit.ncRaw : null, { hasRow: !!hit, hasColumn: true, conflict: !!(hit && hit.conflict) });
        return { s, uni, source, sourceColumn: src.cols.nationalCodeName };
      });
      const usable = perStudent.filter((p) => p.source.state === 'OK' && isValidIranianNationalCode(p.source.value) && !SENTINEL_CODES.has(p.source.value));
      const validCandidates = [...new Set(usable.map((p) => p.source.value))];
      const ambiguous = validCandidates.length > 1;
      const best = usable[0] || perStudent.find((p) => p.source.state !== 'MISSING') || perStudent[0];
      const current = classifyCurrent(u.currentCode, u.birthCertNo);
      evalByUser.set(u.userId, {
        user: u,
        current,
        perStudent,
        ambiguous,
        source: ambiguous ? { state: 'MISSING', value: '', raw: '', reason: 'MULTIPLE_CANDIDATES' } : best.source,
        sourceColumn: best.sourceColumn,
        sourceFromStudentCode: best.s.studentCode,
        sourceFromUniversity: best.uni.code,
      });
    }

    // ── ۶) تصمیم مرحلهٔ اول (بدون برخورد) ──
    for (const e of evalByUser.values()) {
      e.decision = decideRepair({
        current: e.current,
        currentCode: e.user.currentCode,
        source: e.source,
        ambiguous: e.ambiguous,
      });
    }
    // ── ۷) تشخیص برخوردِ «دو ردیف پیشنهادی با هم» (کوچک‌ترین userId برنده) ──
    const proposedOwners = new Map();
    for (const uid of [...evalByUser.keys()].sort((a, b) => a - b)) {
      const e = evalByUser.get(uid);
      if (e.decision.promote && e.decision.proposedCode && !proposedOwners.has(e.decision.proposedCode)) {
        proposedOwners.set(e.decision.proposedCode, uid);
      }
    }
    // ── ۸) تصمیم نهایی با برخورد ──
    for (const uid of evalByUser.keys()) {
      const e = evalByUser.get(uid);
      if (!e.decision.promote) continue;
      const p = e.decision.proposedCode;
      const dbHit = checkCollision(codeOwners, uid, p);
      const planHit = checkPlanCollision(proposedOwners, uid, p);
      if (dbHit.collides || planHit.collides) {
        const withUserId = dbHit.collides ? dbHit.withUserId : planHit.withUserId;
        const isInPlan = planHit.collides && !dbHit.collides;
        e.decision = decideRepair({
          current: e.current,
          currentCode: e.user.currentCode,
          source: e.source,
          collidesWithOtherUser: true,
          collisionUserId: withUserId,
          collisionCode: p,
        });
        e.decision.reason = isInPlan
          ? `DUPLICATE_IN_PLAN_WITH_USER_${withUserId}`
          : e.decision.reason;
      }
    }

    // ── ۹) ساخت سطرهای گزارش (در سطح student) ──
    const plan = [];
    for (const e of evalByUser.values()) {
      for (const p of e.perStudent) {
        plan.push({
          universityId: Number(p.s.universityId),
          universityCode: p.uni.code,
          studentId: p.s.studentId,
          studentCode: p.s.studentCode,
          userId: e.user.userId,
          currentCode: e.user.currentCode,
          currentClass: e.current.klass,
          birthCertNo: e.user.birthCertNo || null,
          equalsBirthCert: e.current.equalsBirthCertNo ? 1 : 0,
          sourceColumn: p.sourceColumn,
          sourceRaw: (p.source.raw || '').slice(0, 80) || null,
          sourceState: p.source.state,
          sourceFrom: e.sourceFromUniversity ? `${e.sourceFromUniversity}/${e.sourceFromStudentCode}` : null,
          userStudentRows: e.user.students.length,
          proposedCode: e.decision.proposedCode,
          verdict: e.decision.verdict,
          reason: (e.decision.reason || '').slice(0, 120),
        });
      }
    }
    plan.sort((a, b) => a.universityCode.localeCompare(b.universityCode) || a.studentId - b.studentId);

    // ── ۱۰) نوشتن در جدول صحنه ──
    if (!NO_STAGING && !APPLY) {
      await ensureStaging(client);
      await client.query('BEGIN');
      try {
        for (let i = 0; i < plan.length; i += 500) {
          const chunk = plan.slice(i, i + 500);
          const vals = [];
          const tuples = chunk.map((r, k) => {
            const b = k * 17;
            vals.push(runId, r.universityId, r.universityCode, r.studentId, r.studentCode, r.userId, r.currentCode, r.currentClass, r.birthCertNo, r.equalsBirthCert, r.sourceColumn, r.sourceRaw, r.sourceState, r.sourceFrom, r.proposedCode, r.verdict, r.reason);
            return `(${[...Array(17)].map((_, c) => '$' + (b + c + 1)).join(',')})`;
          });
          await client.query(
            `INSERT INTO national_code_repair_staging
               ("runId","universityId","universityCode","studentId","studentCode","userId",
                "currentCode","currentClass","birthCertNo","equalsBirthCert",
                "sourceColumn","sourceRaw","sourceState","sourceFrom","proposedCode","verdict","reason")
             VALUES ${tuples.join(',')}
             ON CONFLICT ("runId","studentId") DO UPDATE SET
               verdict = EXCLUDED.verdict, reason = EXCLUDED.reason,
               "proposedCode" = EXCLUDED."proposedCode", "sourceState" = EXCLUDED."sourceState",
               "sourceRaw" = EXCLUDED."sourceRaw", "sourceColumn" = EXCLUDED."sourceColumn",
               "currentCode" = EXCLUDED."currentCode", "currentClass" = EXCLUDED."currentClass"`,
            vals,
          );
        }
        await client.query('COMMIT');
        console.log(`\n✓ طرح در جدول صحنه نوشته شد: national_code_repair_staging (runId=${runId}) — ${plan.length} سطر`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    } else if (APPLY) {
      await ensureStaging(client);
    } else {
      console.log('\n(--no-staging: هیچ نوشتنی در دیتابیس انجام نشد)');
    }

    // ── ۱۱) گزارش ──
    printReport({ plan, sources, students, selected, byUser });

    // ── ۱۲) CSV ──
    if (REPORT_CSV) {
      const head = ['runId', 'universityCode', 'universityId', 'studentId', 'studentCode', 'userId', 'currentCode', 'currentClass', 'birthCertNo', 'equalsBirthCert', 'sourceColumn', 'sourceRaw', 'sourceState', 'sourceFrom', 'userStudentRows', 'proposedCode', 'verdict', 'reason'];
      const esc = (v) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [head.join(',')];
      for (const r of plan) lines.push([runId, r.universityCode, r.universityId, r.studentId, r.studentCode, r.userId, r.currentCode, r.currentClass, r.birthCertNo ?? '', r.equalsBirthCert, r.sourceColumn ?? '', r.sourceRaw ?? '', r.sourceState, r.sourceFrom ?? '', r.userStudentRows, r.proposedCode ?? '', r.verdict, r.reason].map(esc).join(','));
      writeFileSync(REPORT_CSV, '\uFEFF' + lines.join('\r\n') + '\r\n', 'utf8');
      console.log(`\n✓ گزارش per-student نوشته شد: ${REPORT_CSV} (${plan.length} سطر)`);
    }

    // ── ۱۳) فقط راهنما (ارتقا در ابتدای اجرا و جدا از برنامه‌ریزی انجام می‌شود) ──
    console.log('\nℹ برای اعمال: پس از بازبینی گزارش/CSV، با --apply --run <runId> اجرا کنید.');
  } finally {
    client.release();
    await pool.end();
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  گزارش
// ═══════════════════════════════════════════════════════════════════════
function printReport({ plan, sources, students, selected }) {
  console.log('\n════════ گزارش ════════');

  // ── وضعیت فایل/هدر هر دانشگاه ──
  console.log('\n── منبع و تفکیک ستون ──');
  for (const { uni } of selected) {
    const s = sources.get(Number(uni.id));
    if (!s) continue;
    if (s.error) {
      console.log(`  ✗ ${s.uni.code.padEnd(8)} ${basename(s.dir)}/student2.txt — رد شد`);
      console.log(`      ${s.error}`);
      continue;
    }
    console.log(`  ✓ ${s.uni.code.padEnd(8)} ${basename(s.dir)}/student2.txt`);
    console.log(`      کلید الحاق «${s.cols.stnoName}» (اندیس ${s.cols.stnoIndex}) · کد ملی «${s.cols.nationalCodeName}» (اندیس ${s.cols.nationalCodeIndex})${s.cols.ignoredColumns.length ? ` · نادیده‌گرفته‌شده: ${s.cols.ignoredColumns.join(',')}` : ''}`);
    console.log(`      سطرهای داده=${s.stats.dataRows} · Stno یکتا=${s.stats.uniqueStno} · تکراری=${s.stats.dupRows} · تکراری با مقدار متفاوت=${s.stats.dupConflicts} · Stno غیرعددی نادیده‌گرفته‌شده=${s.stats.skippedNonNumericStno}`);
  }

  // ── سطل‌ها به تفکیک دانشگاه ──
  console.log('\n── سطل‌های حکم (در سطح ردیف دانشجو) ──');
  const codes = [...new Set(plan.map((r) => r.universityCode))].sort();
  const allVerdicts = [...new Set(plan.map((r) => r.verdict))].sort();
  const w = Math.max(10, ...allVerdicts.map((v) => v.length));
  console.log('  ' + 'دانشگاه'.padEnd(10) + 'دانشجو'.padStart(8) + allVerdicts.map((v) => v.padStart(w + 2)).join(''));
  for (const c of codes) {
    const rows = plan.filter((r) => r.universityCode === c);
    const parts = allVerdicts.map((v) => String(rows.filter((r) => r.verdict === v).length).padStart(w + 2));
    console.log('  ' + c.padEnd(10) + String(rows.length).padStart(8) + parts.join(''));
  }
  const totals = allVerdicts.map((v) => String(plan.filter((r) => r.verdict === v).length).padStart(w + 2));
  console.log('  ' + '— همه —'.padEnd(10) + String(plan.length).padStart(8) + totals.join(''));

  // ── سطل‌ها در سطح کاربر (چیزی که واقعاً نوشته می‌شود) ──
  const userLevel = new Map();
  for (const r of plan) if (!userLevel.has(r.userId)) userLevel.set(r.userId, r);
  const uv = new Map();
  for (const r of userLevel.values()) uv.set(r.verdict, (uv.get(r.verdict) || 0) + 1);

  console.log('\n── سطل‌ها در سطح کاربر، به تفکیک دانشگاه (users.nationalCode) ──');
  // هر کاربر به «همهٔ» دانشگاه‌هایی که در آن‌ها ردیف دانشجو دارد نسبت داده می‌شود
  // (یک کاربر ممکن است هم‌زمان در دو دانشگاه دانشجویی داشته باشد ⇒ جمع ستون‌ها
  //  بزرگ‌تر از «کاربر یکتا» است و این عمدی است).
  const userUnis = new Map();
  for (const r of plan) {
    if (!userUnis.has(r.userId)) userUnis.set(r.userId, new Set());
    userUnis.get(r.userId).add(r.universityCode);
  }
  const uvBy = new Map();
  for (const [userId, unis] of userUnis) {
    for (const c of unis) {
      if (!uvBy.has(c)) uvBy.set(c, new Map());
      const m = uvBy.get(c);
      const verdict = userLevel.get(userId).verdict;
      m.set(verdict, (m.get(verdict) || 0) + 1);
    }
  }
  console.log('  ' + 'دانشگاه'.padEnd(10) + 'کاربر'.padStart(7) + allVerdicts.map((v) => v.padStart(w + 2)).join(''));
  for (const c of codes) {
    const m = uvBy.get(c) || new Map();
    console.log('  ' + c.padEnd(10) + String([...m.values()].reduce((a, b) => a + b, 0)).padStart(7) + allVerdicts.map((v) => String(m.get(v) || 0).padStart(w + 2)).join(''));
  }
  console.log('  ' + '— همه —'.padEnd(10) + String(userLevel.size).padStart(7) + allVerdicts.map((v) => String(uv.get(v) || 0).padStart(w + 2)).join(''));

  console.log('\n── خلاصهٔ سطل‌ها در سطح کاربر (کل) ──');
  for (const v of [...uv.keys()].sort()) console.log(`  ${v.padEnd(w)} : ${String(uv.get(v)).padStart(7)}`);
  console.log(`  ${'کاربر یکتا'.padEnd(w)} : ${String(userLevel.size).padStart(7)}`);

  // ── وضعیت مقدار فعلی ──
  console.log('\n── دسته‌بندی مقدار فعلی users.nationalCode ──');
  const kk = new Map();
  for (const r of plan) kk.set(r.currentClass, (kk.get(r.currentClass) || 0) + 1);
  for (const [k, n] of [...kk.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(w)} : ${String(n).padStart(7)}`);
  console.log('\n  آلودگی با شمارهٔ شناسنامه به تفکیک دانشگاه (nationalCode == birthCertNo):');
  for (const c of codes) {
    const n = new Set(plan.filter((r) => r.universityCode === c && r.equalsBirthCert === 1).map((r) => r.userId)).size;
    const nd = new Set(plan.filter((r) => r.universityCode === c && /NOT_10_DIGITS/.test(r.currentClass)).map((r) => r.userId)).size;
    const cs = new Set(plan.filter((r) => r.universityCode === c && /CHECKSUM_INVALID/.test(r.currentClass)).map((r) => r.userId)).size;
    console.log(`    ${c.padEnd(10)} برابرِ birthCertNo=${String(n).padStart(6)} · غیر۱۰رقمی=${String(nd).padStart(6)} · چک‌سام‌نامعتبر=${String(cs).padStart(6)}`);
  }

  // ── وضعیت منبع ──
  console.log('\n── وضعیت ستون کد ملی در فایل ──');
  const ss = new Map();
  for (const r of plan) ss.set(r.sourceState, (ss.get(r.sourceState) || 0) + 1);
  for (const [k, n] of [...ss.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(w)} : ${String(n).padStart(7)}`);

  // ── تشخیص الحاق ۱:۱ ──
  console.log('\n── تشخیص الحاق Stno ↔ students.studentCode ──');
  for (const { uni } of selected) {
    const s = sources.get(Number(uni.id));
    const dbCodes = new Set(students.filter((x) => Number(x.universityId) === Number(uni.id)).map((x) => x.studentCode));
    if (!s || !s.map) {
      console.log(`  ${String(uni.code).padEnd(8)}: بررسی‌نشد (فایل/هدر در دسترس نبود) · دانشجوهای DB=${dbCodes.size}`);
      continue;
    }
    let common = 0;
    const dbOnly = [];
    for (const c of dbCodes) {
      if (s.map.has(c)) common++;
      else dbOnly.push(c);
    }
    const fileOnly = [...s.map.keys()].filter((k) => !dbCodes.has(k));
    const dupInDb = dbCodes.size - students.filter((x) => Number(x.universityId) === Number(uni.id)).length;
    console.log(`  ${String(uni.code).padEnd(8)}: DB=${dbCodes.size} · فایل(یکتا)=${s.map.size} · مشترک=${common} · فقط‌در‌DB=${dbOnly.length} · فقط‌در‌فایل=${fileOnly.length}`);
    if (dupInDb) console.log(`      ⚠ studentCode تکراری در DB برای این دانشگاه: ${dupInDb} مورد`);
    if (dbOnly.length) console.log(`      فقط‌در‌DB (نمونه): ${dbOnly.slice(0, 15).join(' , ')}${dbOnly.length > 15 ? ' …' : ''}`);
    if (fileOnly.length) console.log(`      فقط‌در‌فایل (نمونه): ${fileOnly.slice(0, 10).join(' , ')}${fileOnly.length > 10 ? ' …' : ''}`);
  }

  // ── نمونه‌ها ──
  console.log('\n── نمونهٔ هر سطل ──');
  for (const v of allVerdicts) {
    const rows = plan.filter((r) => r.verdict === v).slice(0, 5);
    if (!rows.length) continue;
    console.log(`  ${v}:`);
    for (const r of rows) {
      const from = r.sourceFrom && r.sourceFrom !== `${r.universityCode}/${r.studentCode}` ? ` [منبع از ${r.sourceFrom}]` : '';
      console.log(`    ${r.universityCode} stno=${r.studentCode} user=${r.userId} «${r.currentCode}» ← «${r.sourceRaw ?? '—'}» ⇒ «${r.proposedCode ?? '—'}» (${r.reason})${from}`);
    }
  }

  // ── خلاصهٔ تصمیم ──
  const autoUsers = [...userLevel.values()].filter((r) => r.verdict === VERDICTS.AUTO_FIX).length;
  console.log('\n── خلاصهٔ تصمیم (کاربر) ──');
  for (const c of codes) {
    const m = uvBy.get(c) || new Map();
    const rows = m.get(VERDICTS.AUTO_FIX) || 0;
    const tot = [...m.values()].reduce((a, b) => a + b, 0);
    console.log(`  ${c.padEnd(10)} خودکار=${String(rows).padStart(6)} · نیازمند آدم=${String(tot - rows).padStart(6)} · جمع=${String(tot).padStart(6)}`);
  }
  console.log(`  ${'— یکتا —'.padEnd(10)} خودکار=${String(autoUsers).padStart(6)} · نیازمند آدم=${String(userLevel.size - autoUsers).padStart(6)} · جمع=${String(userLevel.size).padStart(6)}`);
  console.log('  (جمعِ ستون‌های دانشگاهی > «یکتا» است چون یک کاربر ممکن است در چند دانشگاه دانشجویی داشته باشد)');
  console.log(`  حالت اجرا: ${APPLY ? 'APPLY' : 'DRY-RUN'} — ${APPLY ? 'ممکن است نوشته شود' : 'هیچ تغییری در users رخ نداد'}`);
}

// ═══════════════════════════════════════════════════════════════════════
//  ارتقا: از جدول صحنه به users (تراکنشی، با پارک موقت برای زنجیره‌ها)
// ═══════════════════════════════════════════════════════════════════════
async function promote(client, runIdArg) {
  const runId = runIdArg || (await client.query(`SELECT "runId" FROM national_code_repair_staging GROUP BY 1 ORDER BY max(id) DESC LIMIT 1`)).rows[0]?.runId;
  if (!runId) {
    console.error('\n✗ هیچ اجرایی در جدول صحنه نیست — اول یک dry-run بگیرید.');
    return;
  }
  console.log(`\n════════ ارتقا (runId=${runId}) ════════`);

  const rows = (
    await client.query(
      // شمارش باید روی «کدهای متمایز» باشد نه «سطرها»: یک دانشجوی چند-ثبت‌نامی
      // (مثلاً علامه: ۹۳… و ۹۴…) چند سطر دارد ولی هر دو یک کد یکسان می‌دهند و
      // آن کاربر کاملاً بی‌ابهام است. شمارشِ سطرها این را اشتباهی «چند کد» می‌خواند.
      `SELECT "userId", min("proposedCode") AS "newCode",
              count(DISTINCT "proposedCode") AS codes,
              count(*) AS rows
         FROM national_code_repair_staging
        WHERE "runId"=$1 AND verdict=$2 AND "proposedCode" IS NOT NULL
        GROUP BY "userId"`,
      [runId, VERDICTS.AUTO_FIX],
    )
  ).rows;
  if (!rows.length) {
    console.log('  هیچ سطر AUTO_FIX برای ارتقا وجود ندارد.');
    return;
  }
  const dup = rows.filter((r) => Number(r.codes) > 1);
  if (dup.length) {
    console.error(
      `\n✗ ${dup.length} کاربر بیش از یک کد پیشنهادیِ متمایز دارند — ارتقا متوقف شد (قاعدهٔ «هرگز حدس نزن»).`,
    );
    for (const r of dup) console.error(`    کاربر ${r.userId}: ${r.codes} کد متفاوت`);
    process.exitCode = 1;
    return;
  }

  // ── بازبینی لحظهٔ آخر ──
  const ids = rows.map((r) => r.userId);
  const cur = (await client.query(`SELECT id, "nationalCode" FROM users WHERE id = ANY($1::int[])`, [ids])).rows;
  const curMap = new Map(cur.map((r) => [r.id, r.nationalCode]));
  const stagedCurrent = new Map(
    (await client.query(`SELECT DISTINCT ON ("userId") "userId", "currentCode" FROM national_code_repair_staging WHERE "runId"=$1 AND verdict=$2 ORDER BY "userId", id`, [runId, VERDICTS.AUTO_FIX])).rows.map((r) => [r.userId, r.currentCode]),
  );
  const allOwners = new Map((await client.query(`SELECT "nationalCode", id FROM users`)).rows.map((r) => [r.nationalCode, r.id]));

  const promotable = [];
  const skipped = [];
  for (const r of rows) {
    const now = curMap.get(r.userId);
    if (now === undefined) { skipped.push([r.userId, r.newCode, 'USER_MISSING']); continue; }
    if (now === r.newCode) { skipped.push([r.userId, r.newCode, 'ALREADY_EQUAL']); continue; }
    if (now !== stagedCurrent.get(r.userId)) { skipped.push([r.userId, r.newCode, `CONCURRENT_MODIFICATION (now=${now})`]); continue; }
    const hit = checkCollision(allOwners, r.userId, r.newCode);
    if (hit.collides) { skipped.push([r.userId, r.newCode, `COLLISION_WITH_USER_${hit.withUserId}`]); continue; }
    promotable.push({ userId: r.userId, newCode: r.newCode, oldCode: now });
  }
  console.log(`  AUTO_FIX=${rows.length} · قابل‌ارتقا=${promotable.length} · رد‌شده=${skipped.length}`);
  for (const s of skipped.slice(0, 20)) console.log(`    رد ${s[0]}: ${s[1]} (${s[2]})`);
  if (!promotable.length) return;

  // ── نمایش تفاوت، پیش از نوشتن ──
  console.log(`\n── تفاوت (${promotable.length} سطر) — نمونه ──`);
  for (const p of promotable.slice(0, 20)) console.log(`    user ${p.userId}: ${p.oldCode} → ${p.newCode}`);
  if (promotable.length > 20) console.log(`    … و ${promotable.length - 20} سطر دیگر (همه در جدول صحنه‌اند)`);
  const audit = (await client.query(`SELECT count(*)::int AS n FROM national_code_repair_staging WHERE "runId"=$1 AND verdict=$2`, [runId, VERDICTS.AUTO_FIX])).rows[0].n;
  console.log(`    یادآوری: سطرهای این اجرا در جدول صحنه = ${audit} (شامل ردیف‌های چندگانهٔ هر کاربر)`);

  // ── پارک موقت برای زنجیره‌ها ──
  //  با قواعد فعلی هرگز رخ نمی‌دهد: AUTO_FIX یعنی «مقدار فعلی معتبر نیست» و
  //  «کد پیشنهادی معتبر است»، پس کدِ پیشنهادی نمی‌تواند برابرِ مقدار فعلیِ
  //  کاربرِ دیگریِ در حال ارتقا باشد. نگه داشته شده تا اگر روزی قاعده‌ای عوض شد،
  //  جابه‌جایی زنجیره‌ای کد قید یکتای users را نشکند.
  const promoteIds = new Set(promotable.map((p) => p.userId));
  const needsParking = promotable.filter((p) => {
    const holder = allOwners.get(p.newCode);
    return holder !== undefined && holder !== p.userId && promoteIds.has(holder);
  });
  console.log(`  زنجیرهٔ نیازمند پارک موقت: ${needsParking.length}`);

  await client.query('BEGIN');
  try {
    for (const p of needsParking) {
      const temp = `P${String(p.userId).padStart(9, '0').slice(-9)}`;
      await client.query(`UPDATE users SET "nationalCode"=$1 WHERE id=$2`, [temp, p.userId]);
    }
    let done = 0;
    for (let i = 0; i < promotable.length; i += 500) {
      const chunk = promotable.slice(i, i + 500);
      const params = [];
      const tuples = chunk.map((p, k) => {
        const b = k * 3;
        params.push(p.userId, p.newCode, p.oldCode);
        return `($${b + 1}::int,$${b + 2}::varchar(10),$${b + 3}::varchar(10))`;
      });
      const r = await client.query(
        `UPDATE users u SET "nationalCode" = v.new_code
           FROM (VALUES ${tuples.join(',')}) AS v(uid, new_code, old_code)
          WHERE u.id = v.uid AND u."nationalCode" = v.old_code`,
        params,
      );
      done += r.rowCount;
    }
    if (done !== promotable.length) throw new Error(`promote mismatch: ${done}/${promotable.length}`);
    await client.query(
      `UPDATE national_code_repair_staging SET "appliedAt"=now()
        WHERE "runId"=$1 AND verdict=$2 AND "userId" = ANY($3::int[])`,
      [runId, VERDICTS.AUTO_FIX, promotable.map((p) => p.userId)],
    );
    await client.query('COMMIT');
    console.log(`  ✓ ${done} کاربر به‌روزرسانی شد (تراکنش commit شد).`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`  ✗ ارتقا شکست خورد و ROLLBACK شد (هیچ تغییری اعمال نشد): ${e.message}`);
    throw e;
  }
}

main().catch((e) => {
  console.error('\n✗ خطا:', e?.message || e);
  process.exitCode = 1;
});