#!/usr/bin/env node
/**
 * restore-deleted-students — بازگرداندنِ پرونده‌هایی که در پاکسازیِ اشتباه حذف شدند.
 *
 * منبع: فایل بکاپِ حذف (JSONL: studentCode, userId, status).
 * برای هر ردیف، پروندهٔ دانشجویی با **همان userId موجود** بازساخته می‌شود؛
 * کد ملی لازم نیست (کاربر از قبل هست)، فقط نگاشتِ مقطع/رشته/آیین‌نامه و
 * سال ورود از MAININFO خوانده می‌شود.
 */
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const raw = process.argv.slice(2);
const args = {};
for (let i = 0; i < raw.length; i++) {
  if (raw[i].startsWith('--')) {
    const k = raw[i].slice(2);
    args[k] = (raw[i + 1] && !raw[i + 1].startsWith('--')) ? raw[++i] : 'true';
  }
}
const APPLY = args.apply === 'true';
const FILE = args.file;
const DIR = args.dir;
const UNI = Number(args.uni || 1);
const BACKUP = args.backup || '';
const DB_ENV = args['db-env'] || '/root/afagh/.env';
const DB_HOST = args['db-host'] || '172.20.0.5';
if (!FILE || !DIR) { console.error('--file و --dir لازم است'); process.exit(2); }
if (APPLY && !BACKUP) { console.error('❌ --apply بدون --backup مجاز نیست.'); process.exit(2); }

const req = createRequire(import.meta.url);
const { Pool } = req('pg');
const m = readFileSync(DB_ENV, 'utf8').match(/^POSTGRES_PASSWORD=(.*)$/m);
const pool = new Pool({ host: DB_HOST, port: 5432, user: 'afagh', password: m[1].replace(/\r$/, ''), database: 'afagh_db', max: 5 });

function readTsv(name) {
  let p = join(DIR, name);
  if (!existsSync(p)) p = join(DIR, name + '.tsv');
  const lines = readFileSync(p, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = lines[0].split('\t');
  return lines.slice(1).map((l) => { const c = l.split('\t'); const o = {}; header.forEach((h, i) => { o[h] = c[i]; }); return o; });
}

async function main() {
  const del = readFileSync(FILE, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  console.log(`ردیف‌های بکاپ: ${del.length}`);

  const src = new Map(readTsv('MAININFO_students.tsv').map((r) => [String(r.STNO).trim(), r]));
  const degRows = (await pool.query(`select id, code from degree_level_configs where "universityId"=$1 or "universityId" is null`, [UNI])).rows;
  const degBySama = new Map();
  for (const d of degRows) { const mm = String(d.code || '').match(/^SAMA-(\d+)$/i); if (mm) degBySama.set(mm[1], d); }
  const majorRows = (await pool.query('select id, "majorCode", "degreeLevelId" from majors where "universityId"=$1', [UNI])).rows;
  const majorMap = new Map(majorRows.map((x) => [`${String(x.majorCode).trim()}|${x.degreeLevelId}`, x]));
  const regRows = (await pool.query('select id, "degreeLevelId", "effectiveFromYear", "effectiveToYear" from educational_regulations where "universityId"=$1 or "universityId" is null', [UNI])).rows;
  const REG_FB = { '2': '1', '9': '1', '0': '1', '13': '1', '10': '1', '11': '1' };

  let exists = 0, restored = 0, skipped = 0;
  const problems = [];

  for (const d of del) {
    const code = String(d.studentCode).trim();
    const has = (await pool.query('select 1 from students where "studentCode"=$1 and "universityId"=$2 limit 1', [code, UNI])).rows[0];
    if (has) { exists++; continue; }

    const r = src.get(code);
    if (!r) { skipped++; problems.push(`${code}: در MAININFO نیست`); continue; }
    const deg = degBySama.get(String(r.MAGHTA).trim());
    if (!deg) { skipped++; problems.push(`${code}: مقطع نامطابق`); continue; }
    const major = majorMap.get(`${String(r.RESHTE).trim()}|${deg.id}`);
    if (!major) { skipped++; problems.push(`${code}: رشته نامطابق`); continue; }
    const regDegId = regRows.some((g) => g.degreeLevelId === deg.id) ? deg.id : (degBySama.get(REG_FB[String(deg.code).replace(/^SAMA-/i, '')] || '')?.id ?? deg.id);
    const term = String(r.TERMCODE || '').trim();
    const entryYear = term.length === 5 ? Number(term.slice(0, 4)) : null;
    if (!entryYear) { skipped++; problems.push(`${code}: TERMCODE نامعتبر`); continue; }
    const reg = regRows.filter((g) => g.degreeLevelId === regDegId)
      .filter((g) => Number(g.effectiveFromYear) <= entryYear && (g.effectiveToYear == null || Number(g.effectiveToYear) >= entryYear))
      .sort((a, b) => Number(b.effectiveFromYear) - Number(a.effectiveFromYear))[0]
      || regRows.filter((g) => g.degreeLevelId === regDegId)[0];
    if (!reg) { skipped++; problems.push(`${code}: آیین‌نامه ندارد`); continue; }

    const uid = (await pool.query('select id from users where id=$1', [d.userId])).rows[0]?.id;
    if (!uid) { skipped++; problems.push(`${code}: کاربر ${d.userId} نیست`); continue; }

    if (APPLY) {
      const st = (await pool.query(
        `insert into students ("userId","studentCode","majorId","degreeLevelId","regulationId","entryYear","entryTerm","status","universityId")
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [uid, code, major.id, deg.id, reg.id, entryYear, Number(term.slice(4)) || 1, d.status || 'ACTIVE', UNI],
      )).rows[0];
      appendFileSync(BACKUP, JSON.stringify({ studentCode: code, studentId: st.id, userId: uid }) + '\n');
      restored++;
    } else restored++;
  }

  console.log(`موجود (نیازی به بازسازی نیست): ${exists}`);
  console.log(`قابل بازسازی: ${restored}`);
  console.log(`ناموفق: ${skipped}`);
  if (problems.length) console.log('نمونهٔ مشکلات:', problems.slice(0, 10));
  if (!APPLY) console.log('\n*** DRY: چیزی نوشته نشد ***');
  else console.log(`✅ بازسازی‌شده: ${restored}`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
