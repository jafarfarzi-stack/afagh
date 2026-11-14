// ادغام نسخه‌های چارت با «فهرست درسِ یکسان»
// نسخه‌های متوالی یک رشته که مجموعهٔ درس‌هایشان دقیقاً یکی است (فقط نقش/الزامی/ترم
// متفاوت است) در یک نسخه با بازهٔ پیوسته ادغام می‌شوند. این کار از «برای هر ورودی یک
// چارت» جلوگیری می‌کند. کاتالوگ‌های جبرانی (versionCode با پسوند -C) جدا و با همان قاعده
// ادغام می‌شوند. پیش‌فرض dry؛ نوشتن با --apply و بکاپ JSONL اجباری.
import { createRequire } from 'node:module';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const req = createRequire(import.meta.url);
const { Pool } = req('pg');

const A = {};
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i].startsWith('--')) {
    const k = process.argv[i].slice(2);
    A[k] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true';
  }
}
const APPLY = A.apply === 'true';
const BACKUP = A.backup || '';
const UNI = Number(A.uni || 1);
const REPORT = A.report || '';
if (APPLY && !BACKUP) { console.error('--apply نیازمند --backup <file.jsonl> است'); process.exit(1); }

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql, params) => (await pool.query(sql, params)).rows;

const versions = await q(
  `SELECT id, "majorId", "degreeLevelId", "entryYearFrom" AS f, "entryYearTo" AS o,
          "versionCode", title, "totalRequiredUnits", "minRoleUnits"
     FROM curriculum_versions WHERE "universityId" = $1
    ORDER BY "majorId", "degreeLevelId", "entryYearFrom"`, [UNI]);
if (!versions.length) { console.log('نسخه‌ای نیست.'); await pool.end(); process.exit(0); }

const ids = versions.map(v => v.id);
const rows = await q(
  `SELECT id, "curriculumVersionId" AS vid, "courseId", "roleType", units, "isRequired",
          "isElective", "isGraduationRequired", "recommendedSemester"
     FROM curriculum_courses WHERE "curriculumVersionId" = ANY($1::int[])`, [ids]);

const byVer = new Map();
for (const r of rows) {
  if (!byVer.has(r.vid)) byVer.set(r.vid, []);
  byVer.get(r.vid).push(r);
}

const isComp = (code) => /-C$/.test(code || '');
const sigOf = (list) => list.map(r => r.courseId).sort((a, b) => a - b).join(',');

// ── ساخت زنجیره‌ها ──
const groups = new Map();
for (const v of versions) {
  const key = `${v.majorId}|${v.degreeLevelId}|${isComp(v.versionCode) ? 'C' : 'P'}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(v);
}

const chains = [];
for (const [key, list] of groups) {
  const sorted = list.slice().sort((a, b) => (a.f || 0) - (b.f || 0));
  let cur = null;
  for (const v of sorted) {
    const sig = sigOf(byVer.get(v.id) || []);
    if (cur && sig === cur.sig && (cur.last.o == null || v.f <= cur.last.o + 1)) {
      cur.members.push(v);
      cur.last = v;
      continue;
    }
    cur = { key, sig, members: [v], last: v };
    chains.push(cur);
  }
}

const toMerge = chains.filter(c => c.members.length > 1);
let mergedVersions = 0, movedCourses = 0, filledSem = 0, roleDiffs = 0;
const plan = [];
for (const c of toMerge) {
  const target = c.members[0];
  const last = c.members[c.members.length - 1];
  const newTo = last.o;
  const comp = isComp(target.versionCode);
  const code = `LEGACY-${target.f}${newTo ? '-' + newTo : ''}${comp ? '-C' : ''}`;
  const label = newTo ? `${target.f}–${newTo}` : `${target.f} به بعد`;
  const title = String(target.title || '').replace(/\(ورودی [^)]*\)/, `(ورودی ${label})`);
  const sources = c.members.slice(1);

  // نقش‌های متفاوت (فقط برای گزارش)
  const baseRole = new Map((byVer.get(target.id) || []).map(r => [r.courseId, r.roleType]));
  for (const s of sources) {
    for (const r of byVer.get(s.id) || []) {
      if (baseRole.has(r.courseId) && baseRole.get(r.courseId) !== r.roleType) roleDiffs++;
    }
  }
  plan.push({
    target: target.id, majorId: target.majorId, comp,
    from: target.f, to: newTo, code, title,
    merge: sources.map(s => ({ id: s.id, from: s.f, to: s.o, code: s.versionCode })),
    n: (byVer.get(target.id) || []).length,
  });
}

console.log(`نسخه‌ها: ${versions.length} | گروه‌ها: ${groups.size} | زنجیره‌ها: ${chains.length}`);
console.log(`قابل ادغام: ${toMerge.length} زنجیره (${toMerge.reduce((s, c) => s + c.members.length - 1, 0)} نسخه حذف می‌شود)`);
console.log(`نسخه‌ها بعد از ادغام: ${versions.length - toMerge.reduce((s, c) => s + c.members.length - 1, 0)}`);
console.log(`اختلاف نقش بین نسخه‌های ادغامی: ${roleDiffs} ردیف (نقشِ نسخهٔ قدیمی‌تر حفظ می‌شود)`);
for (const p of plan.slice(0, 12)) {
  console.log(`  major=${p.majorId} ${p.comp ? '[جبرانی]' : '[چارت]'} ${p.merge.map(m => `${m.from}-${m.to || '∞'}`).join(' + ')} → ${p.from}-${p.to || '∞'} (${p.n} درس)`);
}

if (REPORT) {
  writeFileSync(REPORT, JSON.stringify({
    uni: UNI, versions: versions.length, chains: chains.length, merges: plan,
  }, null, 2), 'utf8');
  console.log('report:', REPORT);
}

if (!APPLY) { console.log('\n(dry) برای اجرا: --apply --backup <file.jsonl>'); await pool.end(); process.exit(0); }

// ── اجرا ──
if (!existsSync(dirname(BACKUP))) mkdirSync(dirname(BACKUP), { recursive: true });
const log = [];
const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const p of plan) {
    const allIds = [p.target, ...p.merge.map(m => m.id)];
    const vs = (await client.query(
      `SELECT * FROM curriculum_versions WHERE id = ANY($1::int[])`, [allIds])).rows;
    const cs = (await client.query(
      `SELECT * FROM curriculum_courses WHERE "curriculumVersionId" = ANY($1::int[])`, [allIds])).rows;
    for (const v of vs) log.push({ entity: 'version', before: v });
    for (const c of cs) log.push({ entity: 'course', before: c });

    const have = new Map(cs.filter(c => c.curriculumVersionId === p.target).map(c => [c.courseId, c]));
    for (const c of cs) {
      if (c.curriculumVersionId === p.target) continue;
      const ex = have.get(c.courseId);
      if (ex) {
        // فقط ترمِ خالی را پر کن؛ نقش/الزامیِ نسخهٔ قدیمی‌تر دست‌نخورده می‌ماند
        if (ex.recommendedSemester == null && c.recommendedSemester != null) {
          await client.query(`UPDATE curriculum_courses SET "recommendedSemester"=$1 WHERE id=$2`,
            [c.recommendedSemester, ex.id]);
          filledSem++;
        }
      } else {
        const ins = await client.query(
          `INSERT INTO curriculum_courses ("curriculumVersionId","courseId","roleType","units","isRequired",
             "isElective","isGraduationRequired","recommendedSemester","universityId")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [p.target, c.courseId, c.roleType, c.units, c.isRequired, c.isElective,
            c.isGraduationRequired, c.recommendedSemester, c.universityId]);
        log.push({ entity: 'course', inserted: ins.rows[0] });
        movedCourses++;
      }
    }

    // جمع واحد و سهم نقش‌ها را دوباره حساب کن
    const agg = (await client.query(
      `SELECT "roleType", COALESCE(SUM(units),0)::numeric AS u, count(*) AS n
         FROM curriculum_courses WHERE "curriculumVersionId"=$1 GROUP BY 1`, [p.target])).rows;
    const total = agg.reduce((s, a) => s + Number(a.u), 0);
    const byRole = Object.fromEntries(agg.map(a => [a.roleType, Number(a.u)]));

    await client.query(
      `UPDATE curriculum_versions SET "entryYearTo"=$1, "versionCode"=$2, title=$3,
          "totalRequiredUnits"=$4, "minRoleUnits"=$5 WHERE id=$6`,
      [p.to, p.code, p.title, String(total), JSON.stringify(byRole), p.target]);

    const srcIds = p.merge.map(m => m.id);
    await client.query(`UPDATE curriculum_versions SET "approvalId"=NULL WHERE id = ANY($1::int[])`, [srcIds]);
    await client.query(`DELETE FROM curriculum_approvals WHERE "curriculumVersionId" = ANY($1::int[])`, [srcIds]);
    await client.query(`DELETE FROM curriculum_courses WHERE "curriculumVersionId" = ANY($1::int[])`, [srcIds]);
    await client.query(`DELETE FROM curriculum_versions WHERE id = ANY($1::int[])`, [srcIds]);
    mergedVersions += srcIds.length;
  }
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  console.error('ROLLBACK:', e.message);
  await pool.end();
  process.exit(1);
}

writeFileSync(BACKUP, log.map(l => JSON.stringify(l)).join('\n') + '\n', 'utf8');
console.log(`apply → ادغام: ${plan.length} زنجیره | نسخهٔ حذف‌شده: ${mergedVersions} | درس منتقل‌شده: ${movedCourses} | ترم پر‌شده: ${filledSem}`);
console.log('backup:', BACKUP, `(${log.length} رکورد)`);
await pool.end();
