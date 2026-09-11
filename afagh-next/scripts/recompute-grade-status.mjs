#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════
 *  بازمحاسبه دسته‌ای وضعیت نمرات + معدل + مشروطی + گزارش راستی‌آزمایی
 *
 *  استفاده:
 *    node scripts/recompute-grade-status.mjs --dry
 *    node scripts/recompute-grade-status.mjs --commit
 *    node scripts/recompute-grade-status.mjs --verify   (فقط گزارش مقایسه)
 * ══════════════════════════════════════════════════════════════════════
 */
import pg from 'pg';
const { Pool } = pg;

const raw = process.argv.slice(2);
const args = {};
for (let i = 0; i < raw.length; i++) {
  if (raw[i].startsWith('--')) {
    const key = raw[i].slice(2);
    args[key] = (raw[i + 1] && !raw[i + 1].startsWith('--')) ? raw[++i] : 'true';
  }
}
const DRY = args.dry === 'true';
const COMMIT = args.commit === 'true';
const VERIFY_ONLY = args.verify === 'true';
const dbUrl = args.db || process.env.DATABASE_URL || 'postgres://afagh:81tZELgWWo17AWSYDCzlnifGCGKX3gqi@localhost:5432/afagh_db';

const pool = new Pool({ connectionString: dbUrl, max: 5 });
const q = async (text, params) => (await pool.query(text, params)).rows;

// ── computeGradeStatus (نسخه JS تابع grade-utils.ts) ──
function computeGradeStatus(value) {
  if (value == null || isNaN(value)) return 'PENDING';
  return 'FINALIZED';
}

// ── تعیین آیین‌نامه بر اساس سال ورود ──
function regulationForEntryYear(entryYear, degreeCode) {
  const m = String(degreeCode || '').replace('SAMA-', '');
  if (m === '3') return '1394MS';
  if (['4', '6', '7', '8'].includes(m)) return '1394PHD';
  if (entryYear < 1391) return 'PRE1391';
  if (entryYear <= 1392) return '1391';
  if (entryYear <= 1401) return '1393';
  return '1402';
}

// ── حد نصاب قبولی بر اساس آیین‌نامه ──
function passingGradeForReg(reg) {
  const map = { '1394MS': 12, '1394PHD': 14, '1391': 10, '1393': 10, '1402': 10, 'PRE1391': 10 };
  return map[reg] || 10;
}

// ── حد نصاب قبولی مجدد ──
function retakeMinForReg(reg) {
  const map = { '1394MS': 12, '1394PHD': 14, '1391': 14, '1393': 10, '1402': 10, 'PRE1391': 10 };
  return map[reg] || 10;
}

// ── سیاست حذف مردودی ──
function policyForReg(reg) {
  if (reg === 'PRE1391') return 'KEEP_ALWAYS';
  if (reg === '1391') return 'EXCLUDE_IF_PASSED_1391';
  return 'EXCLUDE_IF_PASSED';
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  بازمحاسبه وضعیت نمرات + راستی‌آزمایی');
  console.log(`  حالت: ${DRY ? 'پیش‌نمایش (DRY)' : COMMIT ? 'اجرا (COMMIT)' : VERIFY_ONLY ? 'فقط مقایسه' : 'پیش‌نمایش'}`);
  console.log('═══════════════════════════════════════════════════════');

  // ── ۱. بازمحاسبه gradeStatus در legacy_grades ──
  console.log('\n── مرحله ۱: بازمحاسبه gradeStatus در legacy_grades ──');
  const legacyRows = await q(`
    SELECT lg.id, lg."gradeValue", lg."gradeStatus" as old_status, lg."studentCode"
    FROM legacy_grades lg
  `);
  let legacyChanged = 0;
  const legacyBatch = [];
  for (const r of legacyRows) {
    const val = r.gradeValue != null ? Number(r.gradeValue) : null;
    const newStatus = computeGradeStatus(val);
    if (newStatus !== r.old_status) {
      legacyChanged++;
      legacyBatch.push({ id: r.id, old: r.old_status, new: newStatus });
    }
  }
  console.log(`  legacy_grades: ${legacyRows.length} ردیف بررسی شد — ${legacyChanged} تغییر`);

  if (legacyBatch.length > 0) {
    console.log('  نمونه تغییرات:');
    for (const b of legacyBatch.slice(0, 10)) {
      console.log(`    id=${b.id}: ${b.old} → ${b.new}`);
    }
  }

  if (!DRY && !VERIFY_ONLY && legacyChanged > 0) {
    for (let i = 0; i < legacyBatch.length; i += 500) {
      const ch = legacyBatch.slice(i, i + 500);
      const ids = ch.map(b => b.id);
      const newStatuses = ch.map(b => b.new);
      const ph = ids.map((_, j) => `$${j + 1}`).join(',');
      const statusPh = ids.map((_, j) => `$${ids.length + j + 1}`).join(',');
      await q(`UPDATE legacy_grades SET "gradeStatus" = v.new_status FROM (
        SELECT unnest(ARRAY[${ph}]) as id, unnest(ARRAY[${statusPh}]) as new_status
      ) v WHERE legacy_grades.id = v.id::int`, [...ids, ...newStatuses]);
    }
    console.log(`  ✅ ${legacyChanged} ردیف legacy_grades به‌روزرسانی شد`);
  }

  // ── ۲. بازمحاسبه gradeStatus در enrollments ──
  console.log('\n── مرحله ۲: بازمحاسبه gradeStatus در enrollments ──');
  const enrollRows = await q(`
    SELECT e.id, e."gradeValue", e."gradeStatus" as old_status
    FROM enrollments e
    WHERE e."gradeStatus" IS NOT NULL
  `);
  let enrollChanged = 0;
  const enrollBatch = [];
  for (const r of enrollRows) {
    const val = r.gradeValue != null ? Number(r.gradeValue) : null;
    const newStatus = computeGradeStatus(val);
    if (newStatus !== r.old_status) {
      enrollChanged++;
      enrollBatch.push({ id: r.id, old: r.old_status, new: newStatus });
    }
  }
  console.log(`  enrollments: ${enrollRows.length} ردیف بررسی شد — ${enrollChanged} تغییر`);

  if (!DRY && !VERIFY_ONLY && enrollChanged > 0) {
    for (let i = 0; i < enrollBatch.length; i += 500) {
      const ch = enrollBatch.slice(i, i + 500);
      const ids = ch.map(b => b.id);
      const newStatuses = ch.map(b => b.new);
      const ph = ids.map((_, j) => `$${j + 1}`).join(',');
      const statusPh = ids.map((_, j) => `$${ids.length + j + 1}`).join(',');
      await q(`UPDATE enrollments SET "gradeStatus" = v.new_status FROM (
        SELECT unnest(ARRAY[${ph}]) as id, unnest(ARRAY[${statusPh}]) as new_status
      ) v WHERE enrollments.id = v.id::int`, [...ids, ...newStatuses]);
    }
    console.log(`  ✅ ${enrollChanged} ردیف enrollments به‌روزرسانی شد`);
  }

  // ── ۳. راستی‌آزمایی: مقایسه وضع نمره خام سما با محاسبه سیستم ──
  console.log('\n── مرحله ۳: راستی‌آزمایی — مقایسه وضع نمره سما با سیستم ──');
  // ستون raw از نوع text است، نه jsonb — قبل از ->> باید cast شود؛ چون بعضی
  // ردیف‌های قدیمی ممکن است JSON معتبر نباشند، با pg_input_is_valid (PG16+)
  // فقط ردیف‌هایی که واقعاً JSON سالم دارند بازیابی می‌شوند، بدون کرش کل کوئری.
  const verifyRows = await q(`
    SELECT lg."studentCode", lg."termCode", lg."courseCode",
           lg."gradeValue", lg."gradeStatus" as file_status,
           (lg.raw::jsonb)->>'markStat' as raw_mark_stat
    FROM legacy_grades lg
    WHERE lg.raw IS NOT NULL
      AND pg_input_is_valid(lg.raw, 'jsonb')
      AND (lg.raw::jsonb)->>'markStat' IS NOT NULL
    LIMIT 5000
  `);
  let verifyMatch = 0, verifyDiff = 0;
  const diffs = [];
  for (const r of verifyRows) {
    const val = r.gradeValue != null ? Number(r.gradeValue) : null;
    const systemStatus = computeGradeStatus(val);
    if (systemStatus === r.file_status) verifyMatch++;
    else {
      verifyDiff++;
      if (diffs.length < 20) {
        diffs.push({
          stno: r.studentCode, term: r.termCode, course: r.courseCode,
          grade: r.gradeValue, markStat: r.raw_mark_stat,
          file: r.file_status, system: systemStatus,
        });
      }
    }
  }
  console.log(`  مقایسه: ${verifyMatch} تطابق — ${verifyDiff} اختلاف (از ${verifyRows.length} نمونه)`);
  if (diffs.length > 0) {
    console.log('  نمونه اختلافات:');
    for (const d of diffs) {
      console.log(`    ${d.stno}|${d.term}|${d.course}: نمره=${d.grade} markStat=${d.markStat} — فایل=${d.file} سیستم=${d.system}`);
    }
  }

  // ── ۴. راستی‌آزمایی: مقایسه مشروطی نیمسال ──
  console.log('\n── مرحله ۴: راستی‌آزمایی — مقایسه مشروطی نیمسال ──');
  const termStats = await q(`
    SELECT s."studentCode", s."entryYear", dlc.code as degree_code,
           lg."termCode",
           AVG(lg."gradeValue"::numeric) as term_avg,
           COUNT(*) as course_count
    FROM legacy_grades lg
    JOIN students s ON s."studentCode" = lg."studentCode"
    JOIN degree_level_configs dlc ON dlc.id = s."degreeLevelId"
    WHERE lg."gradeValue" IS NOT NULL AND lg."gradeStatus" = 'FINALIZED'
    GROUP BY s."studentCode", s."entryYear", dlc.code, lg."termCode"
    HAVING AVG(lg."gradeValue"::numeric) < 12
    LIMIT 200
  `);
  console.log(`  نیمسال‌های با معدل زیر ۱۲: ${termStats.length} مورد`);
  if (termStats.length > 0) {
    console.log('  نمونه:');
    for (const t of termStats.slice(0, 10)) {
      const reg = regulationForEntryYear(t.entryYear, t.degree_code);
      console.log(`    ${t.studentCode}|${t.termCode}: معدل=${Number(t.term_avg).toFixed(2)} واحد=${t.course_count} آیین‌نامه=${reg}`);
    }
  }

  // ── خلاصه ──
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  خلاصه:');
  console.log(`    legacy_grades: ${legacyChanged} تغییر وضعیت`);
  console.log(`    enrollments: ${enrollChanged} تغییر وضعیت`);
  console.log(`    راستی‌آزمایی: ${verifyMatch} تطابق — ${verifyDiff} اختلاف`);
  console.log(`    مشروطی: ${termStats.length} نیمسال با معدل < ۱۲`);
  if (DRY) console.log('  ⚠️  حالت DRY — تغییرات اعمال نشد');
  else if (VERIFY_ONLY) console.log('  ℹ️  فقط مقایسه — تغییری اعمال نشد');
  else console.log('  ✅ تغییرات اعمال شد');
  console.log('═══════════════════════════════════════════════════════');

  await pool.end();
}

main().catch(e => { console.error('خطا:', e.message); process.exit(1); });
