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

// ── بارگذاری کد وضع نمره از codemap ──
async function loadGradeStatusMap() {
  const rows = await q(`SELECT "legacyCode", "legacyTitle" FROM legacy_code_maps WHERE domain = 'GRADE_STATUS' AND "sourceCode" = 'AFAGH'`);
  const map = new Map();
  for (const r of rows) map.set(String(r.legacyCode), String(r.legacyTitle));
  return map;
}

// ── تعیین وضعیت نمره از دیتای خام سما (markStat) ──
function statusFromMarkStat(markStat, gsMap) {
  const code = String(markStat ?? '').trim();
  if (!code) return 'PENDING';
  const label = gsMap.get(code) || code;
  const l = label.toLowerCase();
  const c = code.toLowerCase();
  // کدهای PENDING / موقت / در انتظار
  if (l.includes('موقت') || l.includes('pending') || l.includes('انتظار') ||
      l.includes('آزمایشی') || l.includes('provisional') || l.includes('تایید نشده') ||
      c === '0' || c === "mo't") return 'PENDING';
  // بقیه همه FINALIZED
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

  // ── ۱. بازمحاسبه gradeStatus در legacy_grades (از دیتای خام سما) ──
  console.log('\n── مرحله ۱: بازمحاسبه gradeStatus در legacy_grades (از raw SAMA) ──');
  const gsMap = await loadGradeStatusMap();
  console.log(`  کدهای وضع نمره: ${gsMap.size} مورد`);
  for (const [k, v] of gsMap) console.log(`    ${k} → ${v}`);

  // نمایش توزیع markStat در دیتای خام
  const markStatDist = await q(`
    SELECT (lg.raw::jsonb)->>'markStat' as mark_stat, COUNT(*) as cnt
    FROM legacy_grades lg
    WHERE lg.raw IS NOT NULL AND pg_input_is_valid(lg.raw, 'jsonb')
    GROUP BY 1 ORDER BY 2 DESC LIMIT 20
  `);
  console.log('  توزیع markStat در raw:');
  for (const r of markStatDist) {
    const label = gsMap.get(String(r.mark_stat)) || '?';
    console.log(`    ${r.mark_stat} (${label}): ${r.cnt}`);
  }

  const legacyRows = await q(`
    SELECT lg.id, lg."gradeValue", lg."gradeStatus" as old_status, lg."studentCode",
           lg.raw
    FROM legacy_grades lg
  `);
  let legacyChanged = 0;
  const legacyBatch = [];
  let legacyNoRaw = 0;
  for (const r of legacyRows) {
    let newStatus;
    if (r.raw) {
      try {
        const rawObj = typeof r.raw === 'string' ? JSON.parse(r.raw) : r.raw;
        newStatus = statusFromMarkStat(rawObj.markStat, gsMap);
      } catch {
        // raw خراب → از مقدار عددی
        const val = r.gradeValue != null ? Number(r.gradeValue) : null;
        newStatus = val != null && !isNaN(val) ? 'FINALIZED' : 'PENDING';
      }
    } else {
      legacyNoRaw++;
      const val = r.gradeValue != null ? Number(r.gradeValue) : null;
      newStatus = val != null && !isNaN(val) ? 'FINALIZED' : 'PENDING';
    }
    if (newStatus !== r.old_status) {
      legacyChanged++;
      legacyBatch.push({ id: r.id, old: r.old_status, new: newStatus });
    }
  }
  console.log(`  legacy_grades: ${legacyRows.length} ردیف بررسی شد — ${legacyChanged} تغییر (بدون raw: ${legacyNoRaw})`);

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

  // ── ۲. بازمحاسبه gradeStatus در enrollments (از raw SAMA از طریق legacy_grades) ──
  console.log('\n── مرحله ۲: بازمحاسبه gradeStatus در enrollments (از raw SAMA) ──');
  const enrollRows = await q(`
    SELECT e.id, e."gradeValue", e."gradeStatus" as old_status,
           lg.raw
    FROM enrollments e
    JOIN students s ON s.id = e."studentId"
    JOIN course_offerings co ON co.id = e."offeringId"
    JOIN courses c ON c.id = co."courseId"
    JOIN academic_terms at2 ON at2.id = co."termId"
    LEFT JOIN legacy_grades lg ON lg."studentCode" = s."studentCode"
      AND lg."termCode" = at2."termCode" AND lg."courseCode" = c."code"
    WHERE e."gradeStatus" IS NOT NULL
  `);
  let enrollChanged = 0;
  const enrollBatch = [];
  let enrollNoRaw = 0;
  for (const r of enrollRows) {
    let newStatus;
    if (r.raw) {
      try {
        const rawObj = typeof r.raw === 'string' ? JSON.parse(r.raw) : r.raw;
        newStatus = statusFromMarkStat(rawObj.markStat, gsMap);
      } catch {
        const val = r.gradeValue != null ? Number(r.gradeValue) : null;
        newStatus = val != null && !isNaN(val) ? 'FINALIZED' : 'PENDING';
      }
    } else {
      enrollNoRaw++;
      const val = r.gradeValue != null ? Number(r.gradeValue) : null;
      newStatus = val != null && !isNaN(val) ? 'FINALIZED' : 'PENDING';
    }
    if (newStatus !== r.old_status) {
      enrollChanged++;
      enrollBatch.push({ id: r.id, old: r.old_status, new: newStatus });
    }
  }
  console.log(`  enrollments: ${enrollRows.length} ردیف بررسی شد — ${enrollChanged} تغییر (بدون raw: ${enrollNoRaw})`);

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

  // ── ۳. راستی‌آزمایی: مقایسه وضع نمره فعلی با محاسبه‌شده از raw ──
  console.log('\n── مرحله ۳: راستی‌آزمایی — مقایسه وضعیت فعلی vs محاسبه از raw ──');
  const verifyRows = await q(`
    SELECT lg."studentCode", lg."termCode", lg."courseCode",
           lg."gradeValue", lg."gradeStatus" as current_status,
           lg.raw
    FROM legacy_grades lg
    WHERE lg.raw IS NOT NULL
    LIMIT 5000
  `);
  let verifyMatch = 0, verifyDiff = 0;
  const diffs = [];
  for (const r of verifyRows) {
    let computedStatus;
    try {
      const rawObj = typeof r.raw === 'string' ? JSON.parse(r.raw) : r.raw;
      computedStatus = statusFromMarkStat(rawObj.markStat, gsMap);
    } catch {
      const val = r.gradeValue != null ? Number(r.gradeValue) : null;
      computedStatus = val != null && !isNaN(val) ? 'FINALIZED' : 'PENDING';
    }
    if (computedStatus === r.current_status) verifyMatch++;
    else {
      verifyDiff++;
      if (diffs.length < 20) {
        let markStat = null;
        try {
          const rawObj = typeof r.raw === 'string' ? JSON.parse(r.raw) : r.raw;
          markStat = rawObj.markStat;
        } catch {}
        diffs.push({
          stno: r.studentCode, term: r.termCode, course: r.courseCode,
          grade: r.gradeValue, markStat,
          current: r.current_status, computed: computedStatus,
        });
      }
    }
  }
  console.log(`  مقایسه: ${verifyMatch} تطابق — ${verifyDiff} اختلاف (از ${verifyRows.length} نمونه)`);
  if (diffs.length > 0) {
    console.log('  نمونه اختلافات:');
    for (const d of diffs) {
      console.log(`    ${d.stno}|${d.term}|${d.course}: نمره=${d.grade} markStat=${d.markStat} — فعلی=${d.current} محاسبه=${d.computed}`);
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
