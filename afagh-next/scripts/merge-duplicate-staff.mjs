#!/usr/bin/env node
/**
 * ادغام ردیف‌های تکراری staff یک نفر
 *
 * وقتی یک استاد دو ردیف staff دارد (یکی با کدملی، دیگری بدون کدملی)،
 * کلاس‌ها/قراردادها/امضاها بین دو ردیف پخش می‌شوند و صفحات استاد
 * چون با `staff.userId = me.id` فیلتر می‌کنند فقط یکی را می‌بینند.
 *
 * این اسکریپت ردیف بدون‌کدملی را با کد ملیِ فایل مبدأ به ردیف دارای‌کدملی
 * گره می‌زند، همهٔ ارجاع‌های FK را منتقل می‌کند، ردیف تکراری را حذف
 * و کاربر بدون‌کدملی را غیرفعال می‌کند.
 *
 * استفاده:
 *   node scripts/merge-duplicate-staff.mjs                  # dry-run
 *   node scripts/merge-duplicate-staff.mjs --teaching       # فقط استادهایی که ترم جاری کلاس دارند
 *   node scripts/merge-duplicate-staff.mjs --pair 943301    # فقط یک جفت
 *   node scripts/merge-duplicate-staff.mjs --apply          # اجرای واقعی (تراکنشی)
 */
import pg from 'pg';
import { createReadStream } from 'node:fs';
import { join, resolve } from 'node:path';

const APPLY = process.argv.includes('--apply');
const TEACHING_ONLY = process.argv.includes('--teaching');
const PAIR = argVal('--pair');
const FORCE = new Set(
  (argVal('--force') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
const UNIVERSITY_ID = Number(argVal('--university') || 1);
const LIMIT = Number(argVal('--limit') || 0);
const FILES = [
  { path: '/root/information-afagh/ostadan.txt', ncIdx: [31, 32], nameCol: 1 },
  { path: '/root/information-afagh/اساتید2.txt', ncIdx: [26, 27], nameCol: 0 },
];

function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : null;
}

const DBURL = process.env.DATABASE_URL || process.env.DBURL;
if (!DBURL) {
  console.error('DATABASE_URL/DBURL تنظیم نشده');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: DBURL, max: 4 });
const q = async (sql, params) => (await pool.query(sql, params)).rows;

const dec = new TextDecoder('windows-1256');
async function* fileRows(path) {
  const st = createReadStream(resolve(path), { highWaterMark: 8 * 1024 * 1024 });
  let carry = Buffer.alloc(0);
  let header = 0;
  for await (const chunk of st) {
    const buf = Buffer.concat([carry, chunk]);
    let start = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] !== 10) continue;
      const line = dec.decode(buf.subarray(start, i)).replace(/\r/g, '');
      start = i + 1;
      if (!line.trim()) continue;
      const cols = line.split('\t');
      if (!header) {
        header = 1;
        continue;
      }
      yield cols;
    }
    carry = buf.subarray(start);
  }
}

const HONORIFICS = new Set(
  ['آقای', 'خانم', 'دکتر', 'دکترا', 'مهندس', 'استاد', 'دانشیار', 'استادیار', 'پروفسور', 'مدیرگروه', 'گروه', 'عضو', 'هیئت', 'علمی', 'پژوهشی', 'هیات', 'مدرس', 'محترم', 'گروه‌آموزشی'].map(norm),
);
const isTenDigits = (v) => /^\d{10}$/.test(String(v ?? '').trim());
const isPlausibleNC = (v) =>
  isTenDigits(v) && !/^(\d)\1{9}$/.test(v) && !['1234567890', '9876543210', '0123456789'].includes(v);

/** نرمال‌سازی نویسه‌های عربی/فارسیِ هم‌ارز + حذف نشان‌ها */
function norm(s) {
  return String(s ?? '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ي/g, 'ی')
    .replace(/ى/g, 'ی')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ی')
    .replace(/ة/g, 'ه')
    .replace(/ۀ/g, 'ه');
}
function tokens(name) {
  return norm(name)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3 && !HONORIFICS.has(t));
}
const joined = (name) => norm(name).replace(/[^\p{L}\p{N}]+/gu, '');
const tokenJoined = (name) => tokens(name).join('');
const sortedChars = (s) => [...s].sort().join('');

function dice(a, b) {
  if (!a || !b) return 0;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let common = 0;
  let total = 0;
  for (const [g, n] of ga) {
    const m = gb.get(g) || 0;
    common += Math.min(n, m);
    total += n;
  }
  for (const [, n] of gb) total += n;
  return (2 * common) / total;
}

/** سازگاری دو نام؛ اگر قطعی نبود false تا ادغام متوقف شود. */
function nameMatch(nameA, nameB) {
  const ta = tokens(nameA);
  const tb = tokens(nameB);
  const ja = joined(nameA);
  const jb = joined(nameB);
  if (!ja || !jb) return false;
  for (const t of ta) if (t.length >= 5 && jb.includes(t)) return true;
  for (const t of tb) if (t.length >= 5 && ja.includes(t)) return true;
  let strong = 0;
  const setB = new Set(tb);
  for (const t of ta) if (setB.has(t) && t.length >= 5) strong++;
  let shared4 = 0;
  const setB4 = new Set(tb);
  for (const t of ta) if (setB4.has(t) && t.length >= 4) shared4++;
  if (strong >= 1 || shared4 >= 2) return true;
  // مجموعهٔ توکن‌ها دقیقاً یکسان است (حتی اگر تک‌توکنی شده باشد)
  if (ta.length && ta.length === tb.length && ta.every((t) => setB.has(t))) return true;
  // همهٔ توکن‌های حداقل‌یک نام در نام دیگری هست (مثلاً «صمد زارع» ⇄ «زارع صمد»)
  const shared = ta.filter((t) => setB.has(t));
  const minLen = Math.min(ta.length, tb.length);
  if (minLen >= 2 && shared.length >= minLen && shared.length >= 2) return true;
  // هم‌حرف با چیدمان متفاوت (مثلاً «خوشنیت سعید» ⇄ «نیت سعیدخوش»)
  const tjA = tokenJoined(nameA);
  const tjB = tokenJoined(nameB);
  if (tjA && tjB && sortedChars(tjA) === sortedChars(tjB)) return true;
  return dice(ja, jb) >= 0.86;
}

/** ستون‌های FK تک‌ستونی به staff + ستون‌های شناخته‌شدهٔ بدون FK. */
async function staffRefColumns() {
  const fk = await q(`
    SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.confrelid = 'staff'::regclass AND c.contype = 'f'
      AND array_length(c.conkey, 1) = 1
    ORDER BY 1, 2`);
  const extra = [{ tbl: 'process_steps', col: 'assignedStaffId' }];
  const out = new Map();
  for (const { tbl, col } of [...fk, ...extra]) {
    if (!out.has(tbl)) out.set(tbl, []);
    out.get(tbl).push(col);
  }
  return out;
}

/** ایندکس‌های یکتایی که ستون staff داخلشان است (به‌جز PK). */
async function uniqueGuards(refs) {
  const guards = new Map();
  for (const tbl of refs.keys()) {
    const rows = await q(
      `SELECT i.relname AS idx, array_agg(a.attname::text ORDER BY k.ord) AS cols
       FROM pg_index x
       JOIN pg_class i ON i.oid = x.indexrelid
       JOIN pg_class t ON t.oid = x.indrelid
       JOIN LATERAL unnest(x.indkey) WITH ORDINALITY k(attn, ord) ON true
       JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attn
       WHERE x.indisunique AND t.oid = $1::regclass AND k.attn <> 0
       GROUP BY i.relname`,
      [tbl],
    );
    for (const { idx, cols } of rows) {
      for (const col of refs.get(tbl)) {
        if (!cols.includes(col)) continue;
        if (!guards.has(tbl)) guards.set(tbl, new Map());
        guards.get(tbl).set(col, {
          idx,
          others: cols.filter((c) => c !== col),
        });
      }
    }
  }
  return guards;
}

/** کلیدهای منطقی (بدون ایندکس یکتا) که بعد از انتقال دوباره پر می‌شوند. */
const SOFT_KEYS = {
  offering_professors: ['offeringId', 'role'],
  instructor_attendance_days: ['attendanceDate'],
  professor_class_attendance: ['sessionId'],
  professor_exam_attendance: ['offeringId', 'sessionId'],
  professor_availabilities: ['termId', 'dayOfWeek', 'startTime'],
};

async function readSourceFiles() {
  const ncByCode = new Map();
  const nameByCode = new Map();
  for (const f of FILES) {
    for await (const cols of fileRows(f.path)) {
      const code = String(cols[0] ?? '').trim();
      if (!/^\d+$/.test(code) || code === '0') continue;
      // چند ردیف ۸۱ ستونه‌اند و کدملی یک ستون جابه‌جا شده؛ از چند ایندکس امتحان می‌کنیم
      let nc = '';
      for (const i of f.ncIdx) {
        const v = String(cols[i] ?? '').trim();
        if (v !== code && isPlausibleNC(v)) {
          nc = v;
          break;
        }
      }
      if (nc && !ncByCode.has(code)) ncByCode.set(code, nc);
      const nm = String(cols[f.nameCol] ?? '').trim();
      if (nm && !nameByCode.has(code)) nameByCode.set(code, nm);
    }
  }
  return { ncByCode, nameByCode };
}

async function main() {
  console.log(`\n=== ادغام ردیف‌های staff تکراری — ${APPLY ? 'APPLY (نوشتن واقعی)' : 'DRY-RUN (فقط گزارش)'} ===\n`);

  const { ncByCode, nameByCode } = await readSourceFiles();
  console.log(`کدملیِ خوانده‌شده از فایل مبدأ: ${ncByCode.size} کد استاد`);

  const users = await q(`
    SELECT u.id, u."nationalCode" AS nc, u."firstName"||' '||u."lastName" AS name,
           u."isActive", u."universityId",
           (SELECT array_agg(s.id ORDER BY s.id) FROM staff s WHERE s."userId" = u.id) AS staff_ids,
           (SELECT array_agg(s."staffCode" ORDER BY s.id) FROM staff s WHERE s."userId" = u.id) AS staff_codes
    FROM users u
    WHERE EXISTS (SELECT 1 FROM staff s WHERE s."userId" = u.id AND s."universityId" = $1)
      AND u."universityId" = $1`, [UNIVERSITY_ID]);
  const byNC = new Map();
  for (const u of users) {
    if (!isPlausibleNC(u.nc)) continue;
    const key = u.nc + '|' + u.universityId;
    if (!byNC.has(key)) byNC.set(key, []);
    byNC.get(key).push(u);
  }

  const staffRows = await q(`
    SELECT s.id, s."staffCode", s."userId", s."universityId", u."firstName"||' '||u."lastName" AS name, u."nationalCode" AS nc
    FROM staff s JOIN users u ON u.id = s."userId"
    WHERE s."universityId" = $1`, [UNIVERSITY_ID]);

  const refs = await staffRefColumns();
  const guards = await uniqueGuards(refs);

  const teachingCur = `
    SELECT DISTINCT "professorId" AS sid FROM course_offerings
    WHERE "termId" = (SELECT id FROM academic_terms WHERE "isCurrent" = 1 AND "universityId" = $1 ORDER BY id LIMIT 1)`;
  const teachingIds = new Set((await q(teachingCur, [UNIVERSITY_ID])).map((r) => r.sid));

  // ساخت جفت‌ها: کدملیِ فایل برای کد استاد، مالکِ کاربر دیگری است
  const work = [];
  const blocked = [];
  for (const s of staffRows) {
    const code = String(s.staffCode ?? '').trim();
    const nc = ncByCode.get(code);
    if (!nc) continue;
    if (isPlausibleNC(s.nc)) continue; // خودش کدملی دارد
    // مالک باید هم‌دانشگاه باشد
    const key = nc + '|' + s.universityId;
    const owners = byNC.get(key) || [];
    const owner = owners.find((o) => o.id !== s.userId && o.staff_ids?.length);
    if (!owner) continue;
    if (PAIR && String(s.staffCode) !== PAIR) continue;
    if (TEACHING_ONLY && !teachingIds.has(s.id)) continue;
    // ردیف هدف: ردیف staff کاربرِ دارای‌کدملی که خودش به همین کدملی از فایل رسیده
    const tgtStaffId =
      owner.staff_ids.find((sid) => {
        const sc = owner.staff_codes[owner.staff_ids.indexOf(sid)];
        return ncByCode.get(String(sc ?? '').trim()) === nc;
      }) ?? owner.staff_ids[0];
    const forced = FORCE.has(String(s.staffCode));
    const fileDup = nameByCode.get(code) || '';
    const fileTgt = (owner.staff_codes || [])
      .map((c) => nameByCode.get(String(c ?? '').trim()) || '')
      .filter(Boolean);
    const ok =
      forced ||
      nameMatch(s.name, owner.name) ||
      (fileDup && nameMatch(fileDup, owner.name)) ||
      fileTgt.some((n) => nameMatch(n, s.name));
    const item = {
      dupStaffId: s.id,
      dupStaffCode: s.staffCode,
      dupUserId: s.userId,
      dupName: s.name,
      tgtStaffId,
      tgtUserId: owner.id,
      tgtName: owner.name,
      tgtActive: owner.isActive,
      nc,
      srcName: nameByCode.get(code) || '',
      teaching: teachingIds.has(s.id),
    };
    if (!ok) blocked.push({ ...item, why: 'نام‌ها هم‌پوشانی ندارند' });
    else work.push(item);
  }

  if (TEACHING_ONLY || PAIR || LIMIT) {
    // فیلتر اعمال‌شده — گزارش کلی را حفظ می‌کنیم
  }

  console.log(`جفت‌های قابل ادغام: ${work.length} | متوقف‌شده (گارد نام): ${blocked.length}`);
  if (blocked.length) {
    console.log('\n— متوقف‌شده —');
    for (const b of blocked.slice(0, 20))
      console.log(`  ${b.dupStaffCode} ${b.dupName}  ⇄  ${b.tgtName} (NC=${b.nc})`);
    if (blocked.length > 20) console.log(`  ... و ${blocked.length - 20} مورد دیگر`);
    console.log(`\n  برای ردِ گارد پس از بازبینی دستی:\n    --force ${blocked.map((b) => b.dupStaffCode).join(',')}`);
  }

  // شمارش ارجاع‌ها
  const stats = new Map();
  let totalRows = 0;
  for (const item of work) {
    for (const [tbl, cols] of refs) {
      for (const col of cols) {
        const [{ n }] = await q(`SELECT count(*)::int AS n FROM ${tbl} WHERE "${col}" = $1`, [
          item.dupStaffId,
        ]);
        if (!n) continue;
        totalRows += n;
        if (!stats.has(tbl)) stats.set(tbl, new Map());
        const m = stats.get(tbl);
        m.set(col, (m.get(col) || 0) + n);
      }
    }
  }

  console.log('\n— ارجاع‌هایی که منتقل می‌شوند —');
  const statsList = [...stats]
    .map(([tbl, m]) => [tbl, m, [...m.values()].reduce((a, b) => a + b, 0)])
    .sort((a, b) => b[2] - a[2]);
  for (const [tbl, m, n] of statsList) {
    console.log(`  ${tbl}: ${n}`);
    for (const [col, c] of m) console.log(`      ${col} = ${c}`);
  }
  console.log(`  جمع کل ردیف منتقل‌شونده: ${totalRows}`);

  // آیا کاربرِ بدون‌کدملی چیز دیگری هم دارد؟ (اگر دانشجو باشد نباید غیرفعال شود)
  const dupUserIds = [...new Set(work.map((w) => w.dupUserId))];
  const others = await q(
    `SELECT u.id, u."firstName"||' '||u."lastName" AS name,
            (SELECT count(*)::int FROM students st WHERE st."userId" = u.id AND st."universityId" = $2) AS student_rows,
            (SELECT count(*)::int FROM user_roles ur WHERE ur."userId" = u.id) AS roles
     FROM users u WHERE u.id = ANY($1)`,
    [dupUserIds, UNIVERSITY_ID],
  );
  const withStudent = others.filter((o) => o.student_rows > 0);
  if (withStudent.length) {
    console.log(`\n⚠ ${withStudent.length} کاربرِ بدون‌کدملی ردیف دانشجو هم دارد (نباید غیرفعال شود):`);
    for (const o of withStudent) console.log(`  ${o.name} (id=${o.id}, roles=${o.roles})`);
  }

  if (!APPLY) {
    console.log('\n(DRY-RUN — چیزی نوشته نشد. برای اجرا: --apply)');
    await pool.end();
    return;
  }

  if (!work.length) {
    console.log('\nچیزی برای ادغام نیست.');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  const moved = new Map();
  try {
    await client.query('BEGIN');
    const touched = [];
    for (const item of work) {
      for (const [tbl, cols] of refs) {
        for (const col of cols) {
          // 1) کلیدهای منطقی: ردیف‌های dup که با ردیف tgt یکی می‌شوند حذف
          const soft = SOFT_KEYS[tbl];
          if (soft) {
            const where = soft.map((k) => `a."${k}" IS NOT DISTINCT FROM b."${k}"`).join(' AND ');
            const r = await client.query(
              `DELETE FROM ${tbl} a WHERE a."${col}" = $1 AND EXISTS (
                 SELECT 1 FROM ${tbl} b WHERE b."${col}" = $2 AND ${where})`,
              [item.dupStaffId, item.tgtStaffId],
            );
            if (r.rowCount) {
              moved.set(`${tbl}.${col}.dedup`, (moved.get(`${tbl}.${col}.dedup`) || 0) + r.rowCount);
            }
          }
          // 2) ایندکس یکتای حاوی ستون staff: تداخل‌ها حذف، بقیه منتقل
          const guard = guards.get(tbl)?.get(col);
          if (guard) {
            const where = guard.others.map((k) => `b."${k}" IS NOT DISTINCT FROM a."${k}"`).join(' AND ');
            const d = await client.query(
              `DELETE FROM ${tbl} a WHERE a."${col}" = $1 AND EXISTS (
                 SELECT 1 FROM ${tbl} b WHERE b."${col}" = $2${where ? ` AND ${where}` : ''})`,
              [item.dupStaffId, item.tgtStaffId],
            );
            if (d.rowCount) {
              moved.set(`${tbl}.${col}.dupe`, (moved.get(`${tbl}.${col}.dupe`) || 0) + d.rowCount);
            }
          }
          const r = await client.query(`UPDATE ${tbl} SET "${col}" = $1 WHERE "${col}" = $2`, [
            item.tgtStaffId,
            item.dupStaffId,
          ]);
          if (r.rowCount) {
            moved.set(`${tbl}.${col}`, (moved.get(`${tbl}.${col}`) || 0) + r.rowCount);
            if (!touched.includes(tbl)) touched.push(tbl);
          }
        }
      }
      // 3) حذف ردیف staff تکراری (همهٔ ارجاع‌ها رفته‌اند)
      await client.query(`DELETE FROM staff WHERE id = $1 AND "userId" = $2`, [
        item.dupStaffId,
        item.dupUserId,
      ]);
      // 4) اگر کاربرِ بدون‌کدملی دیگر staff ندارد → غیرفعال + پایان نشست
      const [{ n }] = (await client.query(`SELECT count(*)::int AS n FROM staff WHERE "userId" = $1`, [
        item.dupUserId,
      ])).rows;
      if (n === 0) {
        const [{ s }] = (await client.query(
          `SELECT count(*)::int AS s FROM students WHERE "userId" = $1 AND "universityId" = $2`,
          [item.dupUserId, UNIVERSITY_ID],
        )).rows;
        if (s === 0) {
          await client.query(`UPDATE users SET "isActive" = 0 WHERE id = $1 AND "isActive" = 1`, [
            item.dupUserId,
          ]);
          await client.query(`DELETE FROM sessions WHERE "userId" = $1`, [item.dupUserId]);
        }
      }
    }
    await client.query('COMMIT');

    console.log('\n— نوشته شد —');
    for (const [k, v] of moved) console.log(`  ${k}: ${v}`);
    console.log(`\nادغام ${work.length} جفت با موفقیت انجام شد.`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('\nROLLBACK — هیچ تغییری اعمال نشد:', e.message);
    console.error(e.stack);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
