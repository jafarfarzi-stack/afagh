#!/usr/bin/env node
/**
 * fix-national-codes — اصلاح کد ملی‌های ساختگی از فایل سنجش/پذیرش.
 *
 * ورودی: CSV با جداکنندهٔ ESC (\x1b) و ستون‌های «کد_ملی»، «نام»، «نام خانوادگی»،
 * «نام_پدر»، «شماره_دانشجویی».
 *
 * تطبیق **سخت‌گیرانه** است تا هویت اشتباه اصلاح نشود:
 *   ۱) نام + نام خانوادگی یکسان (نرمال‌شده)
 *   ۲) نام پدر یکسان با NAMEP در MAININFO
 *   ۳) کد ملی ۱۰ رقمی و معتبر بر اساس چک‌ده‌رقمی استاندارد
 *   ۴) تنها یک نامزد
 *
 * پیش‌فرض dry-run. برای اعمال: --apply --backup <file.tsv>
 */
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
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
const FILE = args.file, DIR = args.dir, BACKUP = args.backup || '';
const DB_ENV = args['db-env'] || '/root/afagh/.env';
const DB_HOST = args['db-host'] || '172.20.0.5';
if (!FILE || !DIR) { console.error('--file و --dir لازم است'); process.exit(2); }
if (APPLY && !BACKUP) { console.error('❌ --apply بدون --backup مجاز نیست.'); process.exit(2); }

const req = createRequire(import.meta.url);
const { Pool } = req('pg');
const m = readFileSync(DB_ENV, 'utf8').match(/^POSTGRES_PASSWORD=(.*)$/m);
const pool = new Pool({ host: DB_HOST, port: 5432, user: 'afagh', password: m[1].replace(/\r$/, ''), database: 'afagh_db', max: 5 });

const norm = (s) => String(s ?? '').replace(/[\u200c\s\u064a\u0649]+/g, '').trim();
function okNC(nc) {
  if (!/^\d{10}$/.test(nc) || new Set(nc).size === 1) return false;
  const s = [...nc.slice(0, 9)].reduce((a, c, i) => a + Number(c) * (10 - i), 0);
  const r = s % 11, d = Number(nc[9]);
  return r < 2 ? d === r : d === 11 - r;
}

async function main() {
  const txt = readFileSync(FILE, 'utf8').replace(/^\uFEFF/, '');
  const lines = txt.split(/\r?\n/).filter((l) => l.trim() !== '');
  const hdr = lines[0].split('\x1b');
  const I = Object.fromEntries(['کد_ملی', 'نام', 'نام خانوادگی', 'نام_پدر'].map((k) => [k, hdr.indexOf(k)]));
  if (Object.values(I).some((v) => v < 0)) { console.error('ستون‌های لازم در فایل نیست'); process.exit(2); }

  const byName = new Map();
  for (const l of lines.slice(1)) {
    const p = l.split('\x1b');
    if (p.length <= Math.max(...Object.values(I))) continue;
    const k = `${norm(p[I['نام خانوادگی']])}|${norm(p[I['نام']])}`;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push({ nc: String(p[I['کد_ملی']] || '').replace(/\D/g, ''), fa: norm(p[I['نام_پدر']]) });
  }

  const fathers = new Map();
  const maininfo = join(DIR, 'MAININFO_students.tsv');
  if (existsSync(maininfo)) {
    const rows = readFileSync(maininfo, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
    const h = rows[0].split('\t');
    const iSt = h.indexOf('STNO'), iFa = h.indexOf('NAMEP');
    for (const r of rows.slice(1)) {
      const c = r.split('\t');
      fathers.set(String(c[iSt] || '').trim(), norm(c[iFa]));
    }
  }

  const { rows: bad } = await pool.query(`
    SELECT DISTINCT s."studentCode" AS code, u."nationalCode" AS fake,
           u."firstName" AS fn, u."lastName" AS ln, u.id AS uid
    FROM users u JOIN students s ON s."userId" = u.id
    WHERE u."nationalCode" ~ '[^0-9]'
  `);
  console.log(`کاربران با کد ملی نامعتبر: ${bad.length}`);

  let matched = 0, applied = 0, skippedAmb = 0;
  const skippedDup = [];
  for (const b of bad) {
    const cands = byName.get(`${norm(b.ln)}|${norm(b.fn)}`) || [];
    const good = cands.filter((c) => okNC(c.nc) && c.fa && c.fa === (fathers.get(b.code) || ''));
    if (good.length > 1) { skippedAmb++; continue; }
    if (good.length === 0) continue;
    matched++;
    const nc = good[0].nc;
    if (APPLY) {
      const dup = (await pool.query('select id from users where "nationalCode"=$1 and id<>$2 limit 1', [nc, b.uid])).rows[0];
      if (dup) { skippedDup.push(`${b.code} → ${nc} (کاربر ${dup.id})`); continue; }
      await pool.query('update users set "nationalCode"=$1 where id=$2', [nc, b.uid]);
      appendFileSync(BACKUP, `${b.code}\t${b.fake}\t${nc}\n`);
      applied++;
    } else {
      console.log(`  ${b.code}  ${b.fake} → ${nc}`);
    }
  }
  console.log(`\nتطبیق مطمئن: ${matched}`);
  if (APPLY) console.log(`✅ اصلاح‌شده: ${applied}`);
  if (skippedDup.length) console.log('رد شده (کد ملی تکراری):', skippedDup.length);
  if (skippedAmb) console.log(`مبهم (بیش از یک نامزد): ${skippedAmb}`);
  if (!APPLY) console.log('\n*** DRY: چیزی نوشته نشد ***');
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
