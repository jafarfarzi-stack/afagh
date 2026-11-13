#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  migrate-legacy-students — همگامسازی هفتگی وضعیت دانشجویان UEMS → آفاق
 *
 *  منبع: `MAININFO_students.tsv` (تازه، از extract-legacy-students.mjs) و
 *  اختیاری `People_identity.tsv` برای غنیسازی گزارش.
 *
 *  دامنهٔ نوشتن **فقط دو ستون** است:
 *    students.status           ← نگاشت کد STATUS سما (SAMA_STATUS_MAP)
 *    students.samaStatusCode   ← همان کد خام (برای رهگیری/برچسب دقیق UI)
 *  هیچ دانشجویی ساخته یا حذف نمیشود؛ نام/کد ملی/رشته/ورودی/معدل/تاریخها و
 *  تمام ستونهای هویتی و مستندسازت دستنخورده میمانند. دانشجویانی که فقط در
 *  آفاقاند (پذیرش سنجش) یا فقط در UEMSاند (ورودیهای تازه / کدهای اداری)
 *  صرفاً **گزارش** میشوند تا تصمیم ایجادشان به ماژول پذیرش سپرده شود.
 *
 *  ایمنی (fail-closed):
 *    ▸ --apply بدون --backup رد میشود؛ بکاپ JSONL دقیقاً ردیفهای در شُرف تغییر
 *      را پیش از UPDATE مینویسد و --restore همان فایل را برمیگرداند.
 *    ▸ UPDATE روی «id دقیق + studentCode + universityId» پین میشود و
 *      IS DISTINCT FROM دارد ⇒ اجرای مکرر بینه و دست به دانشگاه دیگر نمیزند.
 *    ▸ کد نامعتبر (غیررقمی/کوتاه/بلندتر از varchar(14))، کد تهی، کد تکراری
 *      در منبع یا DB، و STATUS ناشناخته/تهی/لیترال NULL ⇒ آن ردیف رد و
 *      شمارش میشود (هیچوقت وضعیت را به UNKNOWN نمیریزیم). اگر سهم کدهای
 *      ناشناخته از ۱٪ بگذرد، کل اجرا رد میشود (نشانهٔ تغییر قرارداد منبع).
 *    ▸ گیت تطبیق ≥ --min-match (پیشفرض ۰٫۹) پیش از هر نوشتن.
 *
 *  اجرا:
 *    node scripts/migrate-legacy-students.mjs --dir <tsv> --uni 1
 *           [--diff] [--report <json>]                       (فقطخواندنی)
 *    node scripts/migrate-legacy-students.mjs --dir <tsv> --uni 1 --apply \
 *           --backup <file.jsonl> [--report <json>]
 *    node scripts/migrate-legacy-students.mjs --restore <file.jsonl>
 *
 *  پرچمها: --dir / --uni / --apply / --diff / --backup / --restore / --report
 *          --db-env / --db-host / --db-port / --min-match / --chunk
 *          --strict-unknown (هر کد ناشناخته کل اجرا را متوقف کند)
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, existsSync, writeFileSync, openSync, writeSync, closeSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mapSamaStatus, isValidStudentCode } from './lib/student-status-map.mjs';

// ── SQL های قابلتست (tests/student-sync-contract.test.ts روی PGlite اجرا میکند) ──
/** وضعیت فعلی دانشجویان همان دانشگاه — صرفاً خواندنی. */
export const STUDENTS_SQL = `
SELECT id, "studentCode" AS code, status, "samaStatusCode" AS raw, "universityId" AS uni
FROM students
WHERE "universityId" = $1
ORDER BY "studentCode"`;

/** بکاپ دقیق ردیفهایی که قرار است تغییر کنند (پیش از UPDATE). */
export const STUDENT_BACKUP_SQL = `
SELECT id, "studentCode" AS code, status, "samaStatusCode" AS raw, "universityId" AS uni
FROM students
WHERE id = ANY($1::int[])`;

/** بروزرسانی دستهای: فقط status و samaStatusCode، پینشده روی id/code/uni. */
export const STUDENT_UPDATE_SQL = `
UPDATE students s
SET status = v.st, "samaStatusCode" = v.raw
FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::int[])
     AS v(id, code, st, raw, uni)
WHERE s.id = v.id
  AND s."studentCode" = v.code
  AND s."universityId" = v.uni
  AND (s.status IS DISTINCT FROM v.st OR s."samaStatusCode" IS DISTINCT FROM v.raw)
RETURNING s.id`;

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      a[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    }
  }
  return a;
}

// ── خواندن TSV منبع ──────────────────────────────────────────────────────
const readTsv = (dir, name, optional = false) => {
  const p = join(dir, name);
  if (!existsSync(p)) {
    if (optional) return { header: [], rows: [] };
    throw new Error('missing ' + p);
  }
  const txt = readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
  const lines = txt.split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = lines[0].split('\t').map((h) => h.trim());
  return { header, rows: lines.slice(1).map((l) => l.split('\t')) };
};
const col = (row, header, ...names) => {
  for (const n of names) {
    let i = header.indexOf(n);
    if (i < 0) i = header.findIndex((h) => h.toLowerCase() === n.toLowerCase());
    if (i >= 0 && i < row.length) return String(row[i] ?? '').trim();
  }
  return '';
};
const cap = (a, n) => a.slice(0, n);

/** خواندن MAININFO + People (People اختیاری است، فقط برای گزارش). */
export function readStudentSource(dir) {
  const main = readTsv(dir, 'MAININFO_students.tsv');
  if (!main.header.includes('STNO') || !main.header.some((h) => h.toLowerCase() === 'status')) {
    throw new Error('MAININFO_students.tsv فاقد STNO/STATUS است: ' + dir);
  }
  const rows = main.rows.map((r) => ({
    code: col(r, main.header, 'STNO'),
    raw: col(r, main.header, 'STATUS'),
    name: col(r, main.header, 'NAME'),
    nationalCode: col(r, main.header, 'IDNO'),
    termCode: col(r, main.header, 'TERMCODE'),
    isActive: col(r, main.header, 'IsActive'),
  }));
  const people = new Map();
  const ppl = readTsv(dir, 'People_identity.tsv', true);
  for (const r of ppl.rows) {
    const nc = col(r, ppl.header, 'IdentificationNumber');
    const key = nc || col(r, ppl.header, 'NationalCode');
    if (!key || people.has(key)) continue;
    people.set(key, {
      firstName: col(r, ppl.header, 'FirstName'),
      lastName: col(r, ppl.header, 'LastName'),
      fatherName: col(r, ppl.header, 'FatherName'),
      nationalCode: nc,
    });
  }
  return { rows, people, peopleRows: ppl.rows.length };
}

/**
 * ساخت برنامهٔ بروزرسانی — تابع خالص (بدون DB) تا تستها بتوانند دقیق محک بزنند.
 * @param {Array} sourceRows خروجی readStudentSource().rows
 * @param {Array} dbRows     خروجی STUDENTS_SQL
 * @param {number} uni
 * @param {object} opts      { people: Map, uniCode: string }
 */
export function buildPlan(sourceRows, dbRows, uni, opts = {}) {
  const people = opts.people || new Map();
  const uniCode = String(opts.uniCode || '');

  const dbByCode = new Map();
  const duplicateDb = [];
  for (const r of dbRows) {
    const code = String(r.code ?? '').trim();
    const rec = {
      id: Number(r.id), code,
      status: String(r.status ?? ''),
      raw: r.raw === null || r.raw === undefined ? null : String(r.raw),
      uni: Number(r.uni ?? uni),
    };
    if (dbByCode.has(code)) { duplicateDb.push(code); dbByCode.set(code, null); }
    else dbByCode.set(code, rec);
  }

  const sourceByCode = new Map();
  const duplicateSource = [], invalidCode = [], blankCode = [], unknownStatus = [];
  for (const s of sourceRows) {
    const code = String(s.code ?? '').trim();
    if (!code) { blankCode.push(code); continue; }
    if (!isValidStudentCode(code)) { invalidCode.push(code); continue; }
    const mapped = mapSamaStatus(s.raw, uniCode);
    if (!mapped) { unknownStatus.push({ code, raw: String(s.raw ?? '') }); continue; }
    if (sourceByCode.has(code)) { duplicateSource.push(code); sourceByCode.set(code, null); continue; }
    sourceByCode.set(code, {
      code, raw: String(s.raw ?? '').trim(), status: mapped,
      name: String(s.name ?? ''), nationalCode: String(s.nationalCode ?? ''),
      termCode: String(s.termCode ?? ''), isActive: String(s.isActive ?? ''),
    });
  }

  const toUpdate = [], missingInAfagh = [], foreignUni = [];
  let unchanged = 0, duplicateDbSkipped = 0;
  for (const [code, want] of sourceByCode) {
    if (!want) continue;                       // کد تکراری منبع ⇒ رد شد
    if (!dbByCode.has(code)) {
      const person = people.get(want.nationalCode) || null;
      missingInAfagh.push({ code, raw: want.raw, status: want.status, name: want.name,
        nationalCode: want.nationalCode, termCode: want.termCode, isActive: want.isActive,
        person: person ? `${person.firstName} ${person.lastName}`.trim() : null });
      continue;
    }
    const cur = dbByCode.get(code);
    if (cur === null) { duplicateDbSkipped++; continue; }
    if (cur.uni !== uni) { foreignUni.push(code); continue; }
    if (cur.status === want.status && (cur.raw ?? '') === want.raw) { unchanged++; continue; }
    toUpdate.push({
      id: cur.id, code, uni,
      status: want.status, raw: want.raw,
      oldStatus: cur.status, oldRaw: cur.raw,
    });
  }

  const sourceCodes = new Set([...sourceByCode.keys()].filter((c) => sourceByCode.get(c)));
  const onlyInAfagh = [...dbByCode.keys()].filter((c) => !sourceCodes.has(c));
  const transitions = new Map();
  for (const r of toUpdate) {
    const k = `${r.oldStatus ?? '(null)'}→${r.status}|raw=${r.raw}`;
    transitions.set(k, (transitions.get(k) || 0) + 1);
  }
  const statusTransitions = [...transitions.entries()]
    .map(([k, n]) => ({ transition: k, count: n }))
    .sort((a, b) => b.count - a.count);

  const valid = [...sourceByCode.values()].filter(Boolean).length;
  const matchedInDb = valid - missingInAfagh.length - duplicateDbSkipped - foreignUni.length;
  const plan = {
    sourceRows: sourceRows.length,
    validSource: valid,
    dbRows: dbRows.length,
    matchedInDb,
    matchRate: valid ? matchedInDb / valid : 0,
    toUpdate, unchanged,
    missingInAfagh, onlyInAfagh,
    statusTransitions,
    skipped: {
      blankCode: blankCode.length, invalidCode: invalidCode.length,
      unknownStatus: unknownStatus.length, duplicateSource: duplicateSource.length,
      duplicateDb: duplicateDb.length, duplicateDbSkipped, foreignUni: foreignUni.length,
    },
    samples: {
      invalidCode: cap(invalidCode, 20),
      unknownStatus: cap(unknownStatus, 20),
      duplicateSource: cap(duplicateSource, 20),
      duplicateDb: cap(duplicateDb, 20),
      onlyInAfagh: cap(onlyInAfagh, 50),
      toUpdate: cap(toUpdate.map((r) => ({ code: r.code, raw: r.raw, from: r.oldStatus, to: r.status })), 10),
    },
  };
  return plan;
}

// ── اتصال (فقط داخل main ساخته میشود ⇒ import توسط تست بیدردسر است) ────────
let pool = null;
const q = async (t, p) => (await pool.query(t, p)).rows;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const APPLY = args.apply === 'true';
  const DIFF = args.diff === 'true';
  const BACKUP = args.backup && args.backup !== 'true' ? args.backup : '';
  const RESTORE = args.restore && args.restore !== 'true' ? args.restore : '';
  const REPORT = args.report && args.report !== 'true' ? args.report : '';
  const UNI = Number(args.uni || 1);
  const MIN_MATCH = Number(args['min-match'] || 0.9);
  const CHUNK = Math.max(1, Number(args.chunk || 1000));
  const STRICT_UNKNOWN = args['strict-unknown'] === 'true';
  const DIR = args.dir || '/tmp/lp2v2/students_export';
  const DB_ENV = args['db-env'] || '';
  const DB_HOST = args['db-host'] || '172.20.0.3';
  const DB_PORT = Number(args['db-port'] || 5432);

  let password = String(process.env.POSTGRES_PASSWORD || '').trim();
  if (!password && DB_ENV) {
    if (!existsSync(DB_ENV)) throw new Error('db-env not found: ' + DB_ENV);
    const m = readFileSync(DB_ENV, 'utf8').match(/^POSTGRES_PASSWORD=(.*)$/m);
    if (!m) throw new Error('POSTGRES_PASSWORD not found in ' + DB_ENV);
    password = m[1].replace(/\r$/, '');
  }
  if (!password) throw new Error('رمز Postgres مقصد مشخص نشد (POSTGRES_PASSWORD یا --db-env)');
  const req = createRequire(import.meta.url);
  const pgMod = req('pg');
  const Pool = pgMod.Pool || pgMod.default?.Pool;
  if (!Pool) throw new Error('pg.Pool در دسترس نیست');
  pool = new Pool({ host: DB_HOST, port: DB_PORT, user: 'afagh', password, database: 'afagh_db', max: 5 });

  try {
    // ── حالت بازگردانی: فقط ردیفهای بکاپشده، با id دقیق ──────────────────
    if (RESTORE) {
      if (!existsSync(RESTORE)) throw new Error('backup file not found: ' + RESTORE);
      const recs = readFileSync(RESTORE, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
      let restored = 0;
      for (let i = 0; i < recs.length; i += CHUNK) {
        const p = recs.slice(i, i + CHUNK);
        restored += (await q(STUDENT_UPDATE_SQL, [
          p.map((r) => r.id), p.map((r) => r.code), p.map((r) => r.status),
          p.map((r) => r.raw ?? null), p.map((r) => r.uni),
        ])).length;
      }
      console.log(`RESTORE: ${restored}/${recs.length} ردیف از ${RESTORE} بازگردانده شد`);
      await pool.end();
      return;
    }

    const uni = (await q('SELECT id, code, title FROM universities WHERE id=$1', [UNI]))[0];
    if (!uni) throw new Error('university not found: ' + UNI);
    console.log('university:', uni.code, uni.title, 'apply=', APPLY, 'diff=', DIFF);

    const source = readStudentSource(DIR);
    let manifest = null;
    const mf = join(DIR, '_manifest.json');
    if (existsSync(mf)) manifest = JSON.parse(readFileSync(mf, 'utf8'));

    const dbRows = await q(STUDENTS_SQL, [UNI]);
    const plan = buildPlan(source.rows, dbRows, UNI, { people: source.people, uniCode: uni.code });

    // ── گیتها ────────────────────────────────────────────────────────────
    const gate = {
      minMatch: MIN_MATCH, matchRate: plan.matchRate, pass: plan.matchRate >= MIN_MATCH,
      unknownRatio: source.rows.length ? plan.skipped.unknownStatus / source.rows.length : 0,
    };
    console.log('\n── گزارش شکاف دانشجویان (MAININFO ↔ students) ──');
    console.log(`  ردیفهای منبع: ${plan.sourceRows}  معتبر: ${plan.validSource}  دانشجویان لایو (uni ${UNI}): ${plan.dbRows}`);
    console.log(`  منطبق: ${plan.matchedInDb}  بدونتغییر: ${plan.unchanged}  نیازمند بروزرسانی: ${plan.toUpdate.length}`);
    console.log(`  فقط در UEMS (گزارش، ایجاد نمیشوند): ${plan.missingInAfagh.length}`);
    console.log(`  فقط در آفاق (پذیرش سنجش/قدیمی، دستنخورده): ${plan.onlyInAfagh.length}`);
    console.log(`  ردشدهها: ${JSON.stringify(plan.skipped)}`);
    console.log(`  GATE تطبیق: ${(100 * gate.matchRate).toFixed(2)}% (حداقل ${100 * MIN_MATCH}%)`);
    for (const t of cap(plan.statusTransitions, 15)) console.log(`    • ${t.transition}: ${t.count}`);
    for (const s of plan.samples.toUpdate) console.log(`    • ${s.code} raw=${s.raw}: ${s.from} → ${s.to}`);
    if (manifest?.generatedAt) console.log(`  استخراج منبع: ${manifest.generatedAt} (${manifest.stats?.maininfo ?? '?'} ردیف)`);

    gate.unknownPass = gate.unknownRatio <= 0.01 && !(STRICT_UNKNOWN && plan.skipped.unknownStatus > 0);
    if (!gate.unknownPass) {
      throw new Error(`بیش از ۱٪ کد STATUS ناشناخته است (${plan.skipped.unknownStatus}/${source.rows.length}) — قرارداد منبع تغییر کرده؛ نگاشت را بهروز کنید`);
    }
    if (!gate.pass) throw new Error('GATE under ' + MIN_MATCH + ' — refuse (dry or apply)');
    if (APPLY && !BACKUP) {
      throw new Error('--apply نیازمند --backup <file.jsonl> است (بکاپ قابل بازگردانی اجباری است)');
    }

    const report = {
      generatedAt: new Date().toISOString(),
      university: { id: uni.id, code: uni.code, title: uni.title },
      source: { dir: DIR, manifestGeneratedAt: manifest?.generatedAt ?? null, manifestStats: manifest?.stats ?? null, peopleRows: source.peopleRows },
      gate, counts: {
        sourceRows: plan.sourceRows, validSource: plan.validSource, dbRows: plan.dbRows,
        matchedInDb: plan.matchedInDb, unchanged: plan.unchanged, toUpdate: plan.toUpdate.length,
        missingInAfagh: plan.missingInAfagh.length, onlyInAfagh: plan.onlyInAfagh.length,
      },
      skipped: plan.skipped, samples: plan.samples,
      statusTransitions: plan.statusTransitions,
      missingInAfagh: cap(plan.missingInAfagh, 500),
      onlyInAfaghCodes: cap(plan.onlyInAfagh, 500),
      applied: false, backup: BACKUP || null, updated: 0,
    };

    if (!APPLY) {
      console.log('*** DRY: گزارش، بدون نوشتن ***');
      if (REPORT) writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n', 'utf8');
      console.log(`SUMMARY status=${plan.toUpdate.length} missing=${plan.missingInAfagh.length} onlyAfagh=${plan.onlyInAfagh.length} dry=true`);
      await pool.end();
      return;
    }

    // ── بکاپ + اعمال بروزرسانیها ─────────────────────────────────────────
    const ids = plan.toUpdate.map((r) => r.id);
    const fd = openSync(BACKUP, 'w');
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const rows = await q(STUDENT_BACKUP_SQL, [ids.slice(i, i + CHUNK)]);
        for (const r of rows) writeSync(fd, JSON.stringify(r) + '\n', 'utf8');
      }
    } finally { closeSync(fd); }
    if (ids.length && !statSync(BACKUP).size) throw new Error('بکاپ خالی است؛ از اعمال صرفنظر شد: ' + BACKUP);
    console.log(`backup: ${ids.length} ردیف → ${BACKUP} (${statSync(BACKUP).size} bytes)`);

    let updated = 0;
    for (let i = 0; i < plan.toUpdate.length; i += CHUNK) {
      const p = plan.toUpdate.slice(i, i + CHUNK);
      updated += (await q(STUDENT_UPDATE_SQL, [
        p.map((r) => r.id), p.map((r) => r.code), p.map((r) => r.status),
        p.map((r) => r.raw), p.map((r) => r.uni),
      ])).length;
    }
    if (updated !== plan.toUpdate.length) {
      throw new Error(`تعداد بروزرسانیها ${updated} ≠ ${plan.toUpdate.length} — نوشتن همزمان رخ داده؛ دوباره diff بگیرید`);
    }
    report.applied = true;
    report.updated = updated;
    console.log(`apply: ${updated}/${plan.toUpdate.length} ردیف بروز شد (status + samaStatusCode)`);
    if (REPORT) writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`SUMMARY status=${updated} missing=${plan.missingInAfagh.length} onlyAfagh=${plan.onlyInAfagh.length} dry=false`);
    await pool.end();
  } catch (e) {
    console.error('FATAL', e);
    try { await pool.end(); } catch { /* ignore */ }
    process.exit(1);
  }
}

// اجرا فقط وقتی مستقیماً فراخوانی شود ⇒ import توسط تست اثر جانبی ندارد
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
