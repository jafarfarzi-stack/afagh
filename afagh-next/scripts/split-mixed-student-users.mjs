#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  split-mixed-student-users — جدا کردن هویت دانشجوهایی که روی یک کاربر نشستهاند
 *
 *  ریشهٔ خطا (تأییدشده با نمونههای کاربر):
 *    `placeholderNc('A', studentCode)` = 'SA' + **۸ رقم آخر** کد دانشجویی.
 *    کدهای ۹رقمی و ۱۰رقمی که ۸رقم آخرشان_one است، کد مصنوعی یکسانی میگیرند:
 *      9212274089 -> SA12274089    9412274089 -> SA12274089   ← برخورد!
 *      9312234049 -> SA12234049    9412234049 -> SA12234049   ← برخورد!
 *    چون `USER_LOOKUP_SQL` بر اساس همان کد مصنوعی میگردد، هر دو شمارهٔ
 *    دانشجویی به **یک userId** وصل میشوند ⇒ اختلاط هویت.
 *
 *  درمان: مهاجرت هر دانشجو به کاربری که کد ملی واقعیاش را دارد،
 *  و ساختن کاربر تازه وقتی چنین کاربری وجود ندارد.
 *  کد ملی منبع (NAHAIID.tsv) صفرهای پیشروی ازدسترفته دارد ⇒ padStart(10,'0')
 *  و حتماً چکسم معتبر است.
 *
 *  ایمنی: DRY پیشفرض؛ --apply + --backup JSONL؛ --restore برمیگرداند.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, writeFileSync, existsSync, openSync, writeSync, closeSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';

const argv = process.argv.slice(2);
const A = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) {
  const k = argv[i].slice(2);
  A[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
}
const DIR = A.dir || '/tmp/identity_sync';
const UNI = Number(A.uni || 1);
const APPLY = A.apply === 'true';
const BACKUP = A.backup && A.backup !== 'true' ? A.backup : '';
const RESTORE = A.restore && A.restore !== 'true' ? A.restore : '';
const REPORT = A.report && A.report !== 'true' ? A.report : '';
const DB_ENV = A['db-env'] || '';
const DB_HOST = A['db-host'] || 'postgres';
const DB_PORT = Number(A['db-port'] || 5432);
const PARALLEL = Math.max(1, Math.min(20, Number(A.parallel || 10)));

let password = String(process.env.POSTGRES_PASSWORD || '').trim();
if (!password && DB_ENV && existsSync(DB_ENV)) {
  const m = readFileSync(DB_ENV, 'utf8').match(/^POSTGRES_PASSWORD=(.*)$/m);
  if (m) password = m[1].replace(/\r$/, '');
}
const needPassword = () => { if (!password && !RESTORE) throw new Error('POSTGRES_PASSWORD لازم است'); };
const req = createRequire(import.meta.url);
const pgMod = req('pg');
const Pool = pgMod.Pool || pgMod.default?.Pool;
const pool = new Pool({ host: DB_HOST, port: DB_PORT, user: 'afagh', password, database: 'afagh_db', max: PARALLEL });
const q = async (t, p) => (await pool.query(t, p)).rows;

function validNc(raw) {
  let s = String(raw ?? '').trim();
  if (/^\d{7,9}$/.test(s)) s = s.padStart(10, '0');
  if (!/^\d{10}$/.test(s) || new Set(s).size === 1) return null;
  const sum = [...s.slice(0, 9)].reduce((a, c, i) => a + Number(c) * (10 - i), 0);
  const r = sum % 11;
  return (r < 2 ? r : 11 - r) === Number(s[9]) ? s : null;
}
const norm = (v) => String(v ?? '').replace(/[\u200c\u200f\u200e]/g, '').replace(/\s+/g, ' ').trim();
function parseName(raw) {
  const m = norm(raw).match(/^(.*?)\s*-\s*(.*)$/);
  if (!m) return { firstName: '', lastName: norm(raw) };
  let first = m[2].trim();
  const parts = m[1].trim().split(/\s+/);
  if (parts.length > 1 && parts[parts.length - 1] === first) parts.pop();
  return { firstName: first, lastName: parts.join(' ') };
}

function readNahai() {
  const text = readFileSync(join(DIR, 'NAHAIID.tsv'), 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const hdr = lines[0].split('\t').map((h) => h.trim());
  const at = (c, name) => { const i = hdr.indexOf(name); return i >= 0 ? String(c[i] ?? '').trim() : ''; };
  const map = new Map();
  for (const line of lines.slice(1)) {
    const c = line.split('\t');
    const code = at(c, hdr[0]);
    if (!code) continue;
    const name = parseName(at(c, 'نام_و_نام_خانوادگي'));
    const nc = validNc(at(c, 'کد_ملي'));
    map.set(code, { nc, firstName: name.firstName, lastName: name.lastName,
      fatherName: norm(at(c, 'نام_پدر')) || null, gender: norm(at(c, 'جنسيت')) === 'زن' ? 'FEMALE' : 'MALE',
      birthCertNo: norm(at(c, 'شماره_شناسنامه')) || null });
  }
  return map;
}

async function main() {
  needPassword();
  if (RESTORE) {
    const recs = readFileSync(RESTORE, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
    for (const r of recs.reverse()) await q('UPDATE students SET "userId"=$1 WHERE id=$2', [r.oldUserId, r.studentId]);
    console.log('RESTORE userId:', recs.length, 'ردیف');
    await pool.end(); return;
  }
  if (APPLY && !BACKUP) throw new Error('--apply نیازمند --backup است');

  const source = readNahai();
  const students = await q(`SELECT s.id, s."studentCode", s."userId" FROM students s WHERE s."universityId"=$1`, [UNI]);
  const users = await q(`SELECT u.id, u."nationalCode", u."firstName", u."lastName" FROM users u`);
  const userById = new Map(users.map((u) => [Number(u.id), u]));
  const byNc = new Map();
  for (const u of users) if (u.nationalCode && !byNc.has(u.nationalCode)) byNc.set(u.nationalCode, Number(u.id));

  const groups = new Map();
  for (const s of students) {
    if (!groups.has(s.userId)) groups.set(s.userId, []);
    groups.get(s.userId).push(s);
  }
  const mixed = [...groups.entries()].filter(([, list]) => list.length > 1);
  console.log(`LIVE: ${students.length} دانشجو · ${groups.size} کاربر · ${mixed.length} کاربر مشترک (${mixed.reduce((n, [, l]) => n + l.length - 1, 0)} جابجایی لازم)`);

  // نگهدارندهٔ هر گروه: کسی که نامش با کاربر فعلی همخوانی دارد
  const keep = new Set(), moves = [];
  const stats = { noSource: 0, invalidNc: 0, ncTakenByOther: 0, keepByName: 0, keepByFirst: 0,
    keepByDefault: 0, samePersonGroups: 0, trulyMixedGroups: 0 };
  for (const [uid, list] of mixed) {
    // ⚠️ گروههایی که همهٔ اعضایشان **یک کد ملی** دارند،یک شخص با چند شمارهٔ
    // دانشجوییاند (انتقالی/دورهٔ دوم) و نباید جدا شوند. فقط گروههایی که
    // کد ملیهای متفاوت دارند اختلاط هویت حقیقیاند.
    const ncs = new Set(list.map((s) => source.get(String(s.studentCode).trim())?.nc).filter(Boolean));
    if (ncs.size <= 1) { stats.samePersonGroups++; continue; }
    stats.trulyMixedGroups++;
    const u = userById.get(Number(uid));
    const score = (s) => {
      const src = source.get(String(s.studentCode).trim());
      if (!src) return -1;
      let n = 0;
      // کد ملی معتبرِ کاربر فعلی قویترین نشانهٔ مالکیت است
      if (src.nc && u?.nationalCode && src.nc === String(u.nationalCode).trim()) n += 10;
      if (u && /^S[AD]/.test(String(u.nationalCode || ''))) n -= 1; // کد مصنوعی ⇒ نشانهای نیست
      if (src.firstName && u?.firstName && norm(src.firstName) === norm(u.firstName)) n += 2;
      if (src.lastName && u?.lastName && norm(src.lastName) === norm(u.lastName)) n += 3;
      return n;
    };
    const ranked = [...list].sort((a, b) => score(b) - score(a));
    const winner = ranked[0];
    keep.add(winner.id);
    if (score(winner) >= 5) stats.keepByName++;
    else if (score(winner) > 0) stats.keepByFirst++;
    else stats.keepByDefault++;

    for (const s of ranked.slice(1)) {
      const src = source.get(String(s.studentCode).trim());
      if (!src) { stats.noSource++; continue; }
      if (!src.nc) { stats.invalidNc++; continue; }
      let target = byNc.get(src.nc);
      if (target && target !== Number(uid)) stats.ncTakenByOther++;
      moves.push({ studentId: s.id, code: s.studentCode, oldUserId: Number(uid), newNc: src.nc,
        desired: { ...src, nc: src.nc }, targetUserId: target || null });
    }
  }
  console.log(`KEEP: name=${stats.keepByName} partial=${stats.keepByFirst} default=${stats.keepByDefault}`);
  console.log(`MOVES=${moves.length} · noSource=${stats.noSource} · invalidNc=${stats.invalidNc} · ncTakenByOther=${stats.ncTakenByOther}`);
  for (const m of moves.slice(0, 10)) console.log('  ', m.code, m.oldUserId, '->', m.newNc, m.targetUserId || '(new user)');
  if (REPORT) writeFileSync(REPORT, JSON.stringify({ stats, moves, mixed: mixed.length }, null, 2) + '\n', 'utf8');
  if (!APPLY) { console.log('*** DRY: بدون نوشتن ***'); await pool.end(); return; }

  // جابجایی و ساختن کاربر — ۱۰ کارگر موازی
  const shards = Array.from({ length: PARALLEL }, () => []);
  moves.forEach((m, i) => shards[i % PARALLEL].push(m));
  const t0 = Date.now();
  const results = await Promise.all(shards.map(async (chunk, idx) => {
    const file = BACKUP.replace(/\.jsonl$/i, '') + `.w${idx}.jsonl`;
    const fd = openSync(file, 'w');
    let moved = 0, created = 0;
    try {
      for (const m of chunk) {
        let uid = m.targetUserId;
        if (!uid) {
          const d = m.desired;
          const rows = await q(`INSERT INTO users ("nationalCode","firstName","lastName",gender,"passwordHash","isActive","mustChangePassword","universityId","fatherName","birthCertNo")
            SELECT $1::varchar,$2::varchar,$3::varchar,$4::varchar,$5::varchar,1,1,$6::int,$7::varchar,$8::varchar
            WHERE NOT EXISTS (SELECT 1 FROM users WHERE "nationalCode"=$1::varchar AND "universityId"=$6::int) RETURNING id`,
            [m.newNc, d.firstName, d.lastName, d.gender, 'MIGRATED:' + randomBytes(8).toString('hex'), UNI, d.fatherName, d.birthCertNo]);
          uid = rows[0]?.id || (await q('SELECT id FROM users WHERE "nationalCode"=$1 AND "universityId"=$2 LIMIT 1', [m.newNc, UNI]))[0]?.id;
          if (!uid) continue;
          created++;
          // نقش دانشجو را از کاربر مبدأ کپی کن
          await q(`INSERT INTO user_roles ("userId","roleId")
                   SELECT $1, "roleId" FROM user_roles WHERE "userId"=$2
                   ON CONFLICT ("userId","roleId") DO NOTHING`, [uid, m.oldUserId]);
          writeSync(fd, JSON.stringify({ action: 'createUser', id: uid, key: m.code }) + '\n', 'utf8');
        }
        await q('UPDATE students SET "userId"=$1 WHERE id=$2', [uid, m.studentId]);
        writeSync(fd, JSON.stringify({ action: 'move', studentId: m.studentId, oldUserId: m.oldUserId, newUserId: uid, key: m.code }) + '\n', 'utf8');
        moved++;
      }
    } finally { closeSync(fd); }
    return { worker: idx, moved, created, file };
  }));
  console.log(`APPLY: ${results.reduce((n, r) => n + r.moved, 0)} جابجایی + ${results.reduce((n, r) => n + r.created, 0)} کاربر تازه در ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  for (const r of results) console.log(`  worker-${r.worker}: ${r.moved} move / ${r.created} user / ${r.file}`);
  await pool.end();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error('FATAL', e); try { await pool.end(); } catch { /* ignore */ } process.exit(1); });
}
