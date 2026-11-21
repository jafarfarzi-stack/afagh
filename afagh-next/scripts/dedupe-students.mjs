#!/usr/bin/env node
/**
 * dedupe-students — حذفِ پرونده‌های دانشجوییِ تکراری که **هیچ داده‌ای ندارند**.
 *
 * چرا محافظه‌کار: ۴۲ جدول به students وابسته‌اند. ادغامِ ردیف‌های دارای داده
 * (ثبت‌نام/دفتر/چک/…) نیازمند بازنویسی همهٔ ارجاع‌ها و مدیریتِ تضادِ یکتایی
 * است؛ آن بخش عمداً انجام نمی‌شود و فقط گزارش می‌شود.
 *
 * قاعده: در هر گروهِ کدِ تکراری با «همان کاربر»، ردیفِ برتر (بیشترین داده،
 * بعد کوچک‌ترین id) می‌ماند؛ ردیف‌های دیگر فقط اگر در **هیچ‌یک** از ۴۲ جدول
 * ارجاعی نداشته باشند حذف می‌شوند.
 *
 * پیش‌فرض dry-run. برای اعمال: --apply --backup <file.jsonl>
 */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const raw = process.argv.slice(2);
const args = {};
for (let i = 0; i < raw.length; i++) {
  if (raw[i].startsWith('--')) {
    const k = raw[i].slice(2);
    args[k] = (raw[i + 1] && !raw[i + 1].startsWith('--')) ? raw[++i] : 'true';
  }
}
const APPLY = args.apply === 'true';
const BACKUP = args.backup || '';
const DB_ENV = args['db-env'] || '/root/afagh/.env';
const DB_HOST = args['db-host'] || '172.20.0.5';
if (APPLY && !BACKUP) { console.error('❌ --apply بدون --backup مجاز نیست.'); process.exit(2); }

const req = createRequire(import.meta.url);
const { Pool } = req('pg');
const m = readFileSync(DB_ENV, 'utf8').match(/^POSTGRES_PASSWORD=(.*)$/m);
const pool = new Pool({ host: DB_HOST, port: 5432, user: 'afagh', password: m[1].replace(/\r$/, ''), database: 'afagh_db', max: 5 });

/** همهٔ جدول‌هایی که به students(id) ارجاع می‌دهند (از information_schema) */
async function refTables() {
  const { rows } = await pool.query(`
    SELECT tc.table_name AS t, kcu.column_name AS c
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type='FOREIGN KEY' AND ccu.table_name='students'
  `);
  return rows;
}

async function main() {
  const tables = await refTables();
  console.log(`جدول‌های وابسته: ${tables.length}`);

  // ⚠ تفکیک بر اساس (دانشگاه، کد) — نه فقط کد!
  // نسخهٔ اول فقط با studentCode گروه می‌کرد و ردیفِ آفاق را با ردیفِ دانشگاه
  // دیگر «تکراری» می‌دید؛ نتیجه: ۲٬۳۲۰ پروندهٔ آفاق حذف شد. ایندکس یکتای
  // students هم (universityId, studentCode) است، پس دامنهٔ درست همین است.
  const { rows: groups } = await pool.query(`
    SELECT s."universityId" AS uni, s."studentCode" AS code,
           count(*) AS n, count(DISTINCT s."userId") AS users
    FROM students s
    GROUP BY s."universityId", s."studentCode"
    HAVING count(*) > 1 AND count(DISTINCT s."userId") = 1
  `);
  console.log(`گروه‌های تک‌کاربری (در سطح دانشگاه): ${groups.length}`);

  let candidates = 0, deleted = 0, skippedWithData = 0;
  const backupRows = [];

  for (const g of groups) {
    const { rows: st } = await pool.query(
      `SELECT id, "studentCode", "userId", status FROM students WHERE "studentCode"=$1 AND "universityId"=$2 ORDER BY id ASC`,
      [g.code, g.uni],
    );
    if (st.length < 2) continue;

    // رتبه‌بندی: بیشترین ثبت‌نام، بعد دفتر، بعد کوچک‌ترین id
    const scored = [];
    for (const s of st) {
      const e = (await pool.query('SELECT count(*)::int AS c FROM enrollments WHERE "studentId"=$1', [s.id])).rows[0].c;
      const l = (await pool.query('SELECT count(*)::int AS c FROM student_ledger WHERE "studentId"=$1', [s.id])).rows[0].c;
      scored.push({ ...s, score: e * 1000 + l });
    }
    scored.sort((a, b) => (b.score - a.score) || (a.id - b.id));

    for (const extra of scored.slice(1)) {
      let refs = 0;
      for (const t of tables) {
        const r = await pool.query(`SELECT count(*)::int AS c FROM "${t.t}" WHERE "${t.c}"=$1`, [extra.id]);
        refs += r.rows[0].c;
        if (refs > 0) break;
      }
      if (refs > 0) { skippedWithData++; continue; }
      candidates++;
      if (APPLY) {
        await pool.query('DELETE FROM students WHERE id=$1', [extra.id]);
        backupRows.push({ id: extra.id, studentCode: extra.studentCode, userId: extra.userId, status: extra.status });
        appendFileSync(BACKUP, JSON.stringify(backupRows[backupRows.length - 1]) + '\n');
        deleted++;
      }
    }
  }

  console.log(`\n── نتیجه ──`);
  console.log(`قابل حذف (بدون هیچ ارجاع): ${candidates}`);
  console.log(`دارای داده (دست‌نخورده، نیازمند ادغام دستی): ${skippedWithData}`);
  if (APPLY) console.log(`✅ حذف‌شده: ${deleted} — بکاپ: ${BACKUP}`);
  else console.log('\n*** DRY: چیزی حذف نشد. برای اعمال: --apply --backup <file> ***');
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
