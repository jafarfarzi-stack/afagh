// پاک‌سازی کامل چارت‌های قبلی (نسخه‌ها + دروس + تأییدها + قواعد درس)
// با بکاپ JSONL اجباری. پیش‌فرض: dry (فقط شمارش). اجرا: --apply --backup <dir>
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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
const DIR = A.backup || '';
if (APPLY && !DIR) { console.error('--apply نیازمند --backup <dir> است'); process.exit(1); }
if (DIR && !existsSync(DIR)) mkdirSync(DIR, { recursive: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql, params) => (await pool.query(sql, params)).rows;

const versions = await q(`SELECT * FROM curriculum_versions ORDER BY id`);
const ids = versions.map(v => v.id);
if (!ids.length) { console.log('هیچ نسخه‌ای وجود ندارد — کاری نیست.'); await pool.end(); process.exit(0); }
const cc = await q(`SELECT * FROM curriculum_courses WHERE "curriculumVersionId" = ANY($1::int[]) ORDER BY id`, [ids]);
const ap = await q(`SELECT * FROM curriculum_approvals WHERE "curriculumVersionId" = ANY($1::int[]) ORDER BY id`, [ids]);
const cr = await q(`SELECT * FROM course_rules WHERE "syllabusId" = ANY($1::int[]) ORDER BY id`, [ids]);

console.log(`نسخه‌ها: ${versions.length} | دروس چارت: ${cc.length} | تأییدها: ${ap.length} | قواعد درس: ${cr.length}`);
for (const v of versions) console.log(`  ${v.id} | ${v.versionCode} | ${v.status} | ${v.entryYearFrom}-${v.entryYearTo ?? '∞'} | major=${v.majorId}`);

if (!APPLY) { console.log('\n(dry) برای اجرا: --apply --backup <dir>'); await pool.end(); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const write = (name, rows) => {
  const f = join(DIR, `${name}-${stamp}.jsonl`);
  writeFileSync(f, rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
  console.log('backup:', f, rows.length, 'rows');
};
write('curriculum-versions', versions);
write('curriculum-courses', cc);
write('curriculum-approvals', ap);
write('course-rules', cr);

const client = await pool.connect();
try {
  await client.query('BEGIN');
  // FK دوری: curriculum_versions.approvalId → curriculum_approvals.id
  //         curriculum_approvals.curriculumVersionId → curriculum_versions.id
  await client.query(`UPDATE curriculum_versions SET "approvalId" = NULL WHERE id = ANY($1::int[])`, [ids]);
  const a1 = await client.query(`DELETE FROM curriculum_approvals WHERE "curriculumVersionId" = ANY($1::int[])`, [ids]);
  const a2 = await client.query(`DELETE FROM course_rules WHERE "syllabusId" = ANY($1::int[])`, [ids]);
  const a3 = await client.query(`DELETE FROM curriculum_courses WHERE "curriculumVersionId" = ANY($1::int[])`, [ids]);
  const a4 = await client.query(`DELETE FROM curriculum_versions WHERE id = ANY($1::int[])`, [ids]);
  await client.query('COMMIT');
  console.log(`حذف شد → تأییدها:${a1.rowCount} قواعد:${a2.rowCount} دروس:${a3.rowCount} نسخه‌ها:${a4.rowCount}`);
} catch (e) {
  await client.query('ROLLBACK');
  console.error('ROLLBACK:', e.message);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
