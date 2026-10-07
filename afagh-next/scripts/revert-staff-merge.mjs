#!/usr/bin/env node
/**
 * برگرداندن ادغام ردیف‌های staff (revert merge-duplicate-staff)
 *
 * از بکاپ data-only (COPY) همان ردیف‌هایی را که ادغام جابه‌جا/حذف کرد برمی‌گرداند:
 *  - ردیف‌های staff حذف‌شده → INSERT عین بکاپ
 *  - course_offerings.professorId / offering_professors.staffId / departments.headStaffId
 *    فقط برای همان PKهایی که در بکاپ به ردیف حذف‌شده اشاره داشتند → UPDATE به مقدار بکاپ
 *  - کاربران بدون‌کدملیِ بدون-staff که غیرفعال شده بودند → isActive=1
 *  - ردیف‌های گمشده (اگر dedup چیزی حذف کرده بود) → INSERT عین بکاپ
 *
 *   node scripts/revert-staff-merge.mjs                                    # dry-run
 *   node scripts/revert-staff-merge.mjs --apply                            # اجرا (تراکنشی)
 *   node scripts/revert-staff-merge.mjs --backup /path/to.sql --apply
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
function argVal(f) {
  const i = process.argv.indexOf(f);
  return i > -1 ? process.argv[i + 1] : null;
}
const BACKUP = argVal('--backup') || '/root/afagh/backups/staff-merge-20261006-125804.sql';
const DBURL = process.env.DATABASE_URL || process.env.DBURL;
if (!DBURL) {
  console.error('DATABASE_URL/DBURL تنظیم نشده');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: DBURL, max: 4 });
const q = async (t, p) => (await pool.query(t, p)).rows;

function unesc(v) {
  if (v === '\\N') return null;
  return v.replace(/\\(\\|t|n|r)/g, (m, c) => (c === '\\' ? '\\' : c === 't' ? '\t' : c === 'n' ? '\n' : '\r'));
}

function parseCopy(text, table) {
  const lines = text.split('\n');
  const head = lines.findIndex((l) => l.startsWith(`COPY public.${table} (`));
  if (head < 0) throw new Error(`COPY ${table} یافت نشد`);
  const cols = lines[head].match(/^COPY public\.\S+ \((.+)\) FROM stdin;$/)[1].split(/,\s*/).map((c) => c.replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = head + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l === '\\.') break;
    rows.push(l.split('\t').map(unesc));
  }
  return { cols, rows };
}
const obj = (cols, arr) => Object.fromEntries(cols.map((c, i) => [c, arr[i] ?? null]));

async function main() {
  console.log(`\n=== برگشت ادغام staff — ${APPLY ? 'APPLY' : 'DRY-RUN'} ===\n`);
  const text = readFileSync(BACKUP, 'utf8');

  const bStaff = parseCopy(text, 'staff');
  const bOff = parseCopy(text, 'course_offerings');
  const bOp = parseCopy(text, 'offering_professors');
  const bDep = parseCopy(text, 'departments');
  console.log(`بکاپ: staff=${bStaff.rows.length} offerings=${bOff.rows.length} op=${bOp.rows.length} depts=${bDep.rows.length}`);

  const curStaffIds = new Set((await q(`SELECT id FROM staff`)).map((r) => r.id));
  const deletedStaff = bStaff.rows.map((r) => obj(bStaff.cols, r)).filter((s) => !curStaffIds.has(Number(s.id)));
  console.log(`ردیف staff حذف‌شده برای بازگردانی: ${deletedStaff.length}`);
  const delSet = new Set(deletedStaff.map((s) => Number(s.id)));

  const idx = (cols, name) => cols.indexOf(name);
  // course_offerings
  const offId = idx(bOff.cols, 'id'), offProf = idx(bOff.cols, 'professorId');
  const offRefs = bOff.rows.filter((r) => delSet.has(Number(r[offProf])));
  const offPks = offRefs.map((r) => Number(r[offId]));
  const curOff = new Map((await q(`SELECT id, "professorId" FROM course_offerings WHERE id = ANY($1)`, [offPks])).map((r) => [r.id, r.professorId]));
  const offMove = [], offIns = [];
  for (const r of offRefs) {
    const o = obj(bOff.cols, r);
    if (curOff.has(Number(o.id))) offMove.push(o);
    else offIns.push(o);
  }
  // offering_professors
  const opId = idx(bOp.cols, 'id'), opStaff = idx(bOp.cols, 'staffId');
  const opRefs = bOp.rows.filter((r) => delSet.has(Number(r[opStaff])));
  const opPks = opRefs.map((r) => Number(r[opId]));
  const curOp = new Map((await q(`SELECT id, "staffId" FROM offering_professors WHERE id = ANY($1)`, [opPks])).map((r) => [r.id, r.staffId]));
  const opMove = [], opIns = [];
  for (const r of opRefs) {
    const o = obj(bOp.cols, r);
    if (curOp.has(Number(o.id))) opMove.push(o);
    else opIns.push(o);
  }
  // departments
  const depId = idx(bDep.cols, 'id'), depHead = idx(bDep.cols, 'headStaffId');
  const depRefs = bDep.rows.filter((r) => delSet.has(Number(r[depHead])));
  const depMove = [];
  for (const r of depRefs) {
    const o = obj(bDep.cols, r);
    const [cur] = await q(`SELECT id, "headStaffId" FROM departments WHERE id = $1`, [Number(o.id)]);
    if (cur) depMove.push(o);
  }
  // users to reactivate
  const dupUserIds = [...new Set(deletedStaff.map((s) => Number(s.userId)))];
  const react = await q(
    `SELECT u.id, u."firstName"||' '||u."lastName" AS nm,
            (SELECT count(*)::int FROM staff s WHERE s."userId" = u.id) AS sc
     FROM users u WHERE u.id = ANY($1) AND u."isActive" = 0 AND u."nationalCode" IS NULL`,
    [dupUserIds],
  );
  const reactOk = react.filter((r) => r.sc === 0);
  const reactSkip = react.filter((r) => r.sc !== 0);

  console.log(`\n— برنامه —`);
  console.log(`  staff بازگردانی (INSERT): ${deletedStaff.length}`);
  console.log(`  course_offerings برگشت (UPDATE): ${offMove.length} | گمشده (INSERT): ${offIns.length}`);
  console.log(`  offering_professors برگشت (UPDATE): ${opMove.length} | گمشده (INSERT): ${opIns.length}`);
  console.log(`  departments برگشت (UPDATE): ${depMove.length}`);
  console.log(`  کاربران فعال‌سازی مجدد: ${reactOk.length} (ردشده چون staff دارند: ${reactSkip.length})`);
  console.log(`  نمونه staff: ${deletedStaff.slice(0, 5).map((s) => `${s.staffCode}`).join('، ')}`);

  if (!APPLY) {
    console.log('\n(DRY-RUN — چیزی نوشته نشد. برای اجرا: --apply)');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 1) staff rows first (FK targets)
    for (const s of deletedStaff) {
      const cols = bStaff.cols;
      const vals = cols.map((c) => s[c]);
      await client.query(
        `INSERT INTO staff (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})`,
        vals,
      );
    }
    // 2) move FK refs back
    for (const o of offMove) await client.query(`UPDATE course_offerings SET "professorId"=$2 WHERE id=$1`, [o.id, o.professorId]);
    for (const o of opMove) await client.query(`UPDATE offering_professors SET "staffId"=$2 WHERE id=$1`, [o.id, o.staffId]);
    for (const o of depMove) await client.query(`UPDATE departments SET "headStaffId"=$2 WHERE id=$1`, [o.id, o.headStaffId]);
    // 3) re-insert missing rows (dedup losses, if any)
    for (const o of offIns) {
      await client.query(
        `INSERT INTO course_offerings (${bOff.cols.map((c) => `"${c}"`).join(',')}) VALUES (${bOff.cols.map((_, i) => `$${i + 1}`).join(',')})`,
        bOff.cols.map((c) => o[c]),
      );
    }
    for (const o of opIns) {
      await client.query(
        `INSERT INTO offering_professors (${bOp.cols.map((c) => `"${c}"`).join(',')}) VALUES (${bOp.cols.map((_, i) => `$${i + 1}`).join(',')})`,
        bOp.cols.map((c) => o[c]),
      );
    }
    // 4) reactivate users
    for (const r of reactOk) await client.query(`UPDATE users SET "isActive"=1 WHERE id=$1`, [r.id]);
    // 5) sequences
    for (const [t] of [['staff'], ['course_offerings'], ['offering_professors'], ['departments']]) {
      await client.query(`SELECT setval(pg_get_serial_sequence($1,'id'), (SELECT max(id) FROM ${t}))`, [t]);
    }
    await client.query('COMMIT');
    console.log(`\n✅ برگشت انجام شد: staff=${deletedStaff.length} refs=${offMove.length + opMove.length + depMove.length} users=${reactOk.length} reins=${offIns.length + opIns.length}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('\nROLLBACK — هیچ تغییری اعمال نشد:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
