#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════
 *  تجمیع آیین‌نامه‌ها به ۶ سند واقعی + حذف بقیه
 *
 *  نگه‌داشته می‌شود (فقط همین‌ها):
 *    ۱) آیین‌نامه ۱۴۰۲ — کاردانی و کارشناسی
 *    ۲) آیین‌نامه ۱۳۹۳
 *    ۳) آیین‌نامه ۱۳۹۱
 *    ۴) آیین‌نامه ۱۳۹۴ — کارشناسی ارشد
 *    ۵) آیین‌نامه ۱۳۹۴ — دکتری تخصصی
 *    ۶) آیین‌نامه ماقبل ۱۳۹۱ (بدون حذف نمره مردودی — KEEP_ALWAYS)
 *  نمرات در همه مقاطع یکسان است؛ تفاوت مقطع (کاردانی/ناپیوسته در برابر
 *  پیوسته) فقط در نیمسال/سنوات است و داخل levels همان ردیف می‌آید.
 *
 *  رفتار: دانشجویان ردیف‌های حذف‌شونده به سند درست reassigned می‌شوند
 *  (از روی عنوان قدیمی: کد/مقطع سما)، بعد ردیف‌های اضافه DELETE و نقشه‌های
 *  کهنهٔ REGULATION پاک می‌شود (ETL دوباره می‌سازد).
 *
 *  استفاده:
 *    node scripts/cleanup-regulations.mjs --dry
 *    node scripts/cleanup-regulations.mjs --apply
 * ══════════════════════════════════════════════════════════════════════
 */
import pg from 'pg';
const { Pool } = pg;

const raw = process.argv.slice(2);
const args = {};
for (let i = 0; i < raw.length; i++) {
  if (raw[i].startsWith('--')) {
    const k = raw[i].slice(2);
    args[k] = (raw[i + 1] && !raw[i + 1].startsWith('--')) ? raw[++i] : 'true';
  }
}
const APPLY = args.apply === 'true';
const dbUrl = args.db || process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db';
const pool = new Pool({ connectionString: dbUrl, max: 5 });
const q = async (t, p) => (await pool.query(t, p)).rows;

const TITLES = {
  R1402: 'آیین‌نامه ۱۴۰۲ — کاردانی و کارشناسی',
  R1393: 'آیین‌نامه ۱۳۹۳',
  R1391: 'آیین‌نامه ۱۳۹۱',
  R1394MS: 'آیین‌نامه ۱۳۹۴ — کارشناسی ارشد',
  R1394PHD: 'آیین‌نامه ۱۳۹۴ — دکتری تخصصی',
  RPRE: 'آیین‌نامه ماقبل ۱۳۹۱',
};
const KIND_1393 = new Set(['93', '94', '912', '914', '915']);

function levelsConfig(which) {
  const base = {
    source: 'SAMA-ETL', regulation: which,
    summer_term_rules: { default_max_units: 6, graduating_max_units: 8 },
    graduating_term_rules: { can_take_with_probation: true, max_units: 24, auto_corequisite_allowed: true },
  };
  if (which === '1394MS') return { ...base,
    regular_term_rules: { min_units: 8, max_units: 14, probation_max_units: 10, honors_min_gpa: 17.0, honors_max_units: 16 },
    probation_and_tenure: { probation_gpa_threshold: 14.0, max_consecutive_probations: 2, max_total_probations: 2, max_study_semesters: 4 },
    grading_and_gpa: { failed_course_gpa_policy: 'EXCLUDE_IF_PASSED', default_passing_grade: 12.0 } };
  if (which === '1394PHD') return { ...base, graduating_term_rules: { can_take_with_probation: false, max_units: 12, auto_corequisite_allowed: false },
    regular_term_rules: { min_units: 6, max_units: 12, probation_max_units: 8, honors_min_gpa: 17.0, honors_max_units: 12 },
    probation_and_tenure: { probation_gpa_threshold: 16.0, max_consecutive_probations: 2, max_total_probations: 2, max_study_semesters: 8 },
    grading_and_gpa: { failed_course_gpa_policy: 'EXCLUDE_IF_PASSED', default_passing_grade: 14.0 } };
  if (which === 'PRE1391') return { ...base,
    regular_term_rules: { min_units: 12, max_units: 20, probation_max_units: 14, honors_min_gpa: 17.0, honors_max_units: 24 },
    probation_and_tenure: { probation_gpa_threshold: 12.0, max_consecutive_probations: 3, max_total_probations: 3, max_study_semesters: 10 },
    grading_and_gpa: { failed_course_gpa_policy: 'KEEP_ALWAYS', default_passing_grade: 10.0 } };
  const lv = (minU, sp, lp, ss, ls) => ({
    SHORT: { min_units: minU, max_consecutive_probations: sp, max_total_probations: sp, max_study_semesters: ss },
    LONG: { min_units: minU, max_consecutive_probations: lp, max_total_probations: lp, max_study_semesters: ls },
  });
  const minU = which === '1391' ? 14 : 12;
  const sem = which === '1391' ? [5, 10] : [4, 8];
  return { ...base, levels: lv(minU, 2, 3, sem[0], sem[1]),
    regular_term_rules: { min_units: minU, max_units: 20, probation_max_units: 14, honors_min_gpa: 17.0, honors_max_units: 24 },
    probation_and_tenure: { probation_gpa_threshold: 12.0, max_consecutive_probations: 3, max_total_probations: 3, max_study_semesters: sem[1] },
    grading_and_gpa: { failed_course_gpa_policy: 'EXCLUDE_IF_PASSED', default_passing_grade: 10.0 } };
}
const WANT = [
  { title: TITLES.R1402, which: '1402', eff: 1402, rep: ['SAMA-2'] },
  { title: TITLES.R1393, which: '1393', eff: 1393, rep: ['SAMA-2'] },
  { title: TITLES.R1391, which: '1391', eff: 1391, rep: ['SAMA-2'] },
  { title: TITLES.R1394MS, which: '1394MS', eff: 1394, rep: ['SAMA-3'] },
  { title: TITLES.R1394PHD, which: '1394PHD', eff: 1394, rep: ['SAMA-4', 'SAMA-6', 'SAMA-7', 'SAMA-8'] },
  { title: TITLES.RPRE, which: 'PRE1391', eff: 1390, rep: ['SAMA-2'] },
];

function groupOfMaghta(m) {
  m = String(m ?? '');
  if (m === '3') return 'MS';
  if (['4', '6', '7', '8'].includes(m)) return 'PHD';
  return 'BS';
}
function targetFor(kind, maghta) {
  const g = groupOfMaghta(maghta);
  if (g === 'MS') return TITLES.R1394MS;
  if (g === 'PHD') return TITLES.R1394PHD;
  return KIND_1393.has(String(kind)) ? TITLES.R1393 : TITLES.R1402;
}

try {
  console.log(`cleanup-regulations | ${APPLY ? 'APPLY' : 'DRY'}`);
  const degRows = await q(`SELECT id, code FROM degree_level_configs`);
  const degByCode = new Map(degRows.map(d => [String(d.code), Number(d.id)]));
  const anyDeg = degRows.length ? Number(degRows[0].id) : null;
  const repId = (codes) => { for (const c of codes) if (degByCode.has(c)) return degByCode.get(c); return anyDeg; };

  // ۱) تضمین ۶ سند
  const keepIds = new Map(); // title -> id
  for (const w of WANT) {
    const cfg = JSON.stringify(levelsConfig(w.which));
    let row = (await q(`SELECT id, "rulesConfig" FROM educational_regulations WHERE title = $1`, [w.title]))[0];
    if (!row && APPLY) {
      const degId = repId(w.rep);
      if (degId == null) { console.log(`  ! مدرک نماینده برای «${w.title}» نیست — رد شد`); continue; }
      row = (await q(`INSERT INTO educational_regulations (title, "degreeLevelId", "effectiveFromYear", "rulesConfig")
        VALUES ($1,$2,$3,$4) RETURNING id`, [w.title, degId, w.eff, cfg]))[0];
      console.log(`  + ساخته شد: ${w.title}`);
    } else if (row) {
      console.log(`  = هست: ${w.title} (id=${row.id})`);
      if (APPLY && (!row.rulesConfig || row.rulesConfig === '{}')) {
        await pool.query(`UPDATE educational_regulations SET "rulesConfig"=$2 WHERE id=$1`, [row.id, cfg]);
        console.log(`    ✓ پیکربندی اجرایی شد`);
      }
    } else {
      console.log(`  (dry) ساخته می‌شود: ${w.title}`);
    }
    if (row) keepIds.set(w.title, Number(row.id));
  }

  // ۲) ردیف‌های اضافه:解析 عنوان → مقصد، reassignment دانشجویان، حذف
  const all = await q(`SELECT id, title, "degreeLevelId" FROM educational_regulations ORDER BY id`);
  const degCodeById = new Map(degRows.map(d => [Number(d.id), String(d.code)]));
  let moved = 0, deleted = 0;
  for (const r of all) {
    if ([...keepIds.values()].includes(Number(r.id))) continue;
    if (keepIds.has(r.title)) { keepIds.set(r.title, Number(r.id)); continue; }
    let target = null;
    let m = String(r.title || '').match(/آیین‌نامه آموزشی سما \(کد (\S+)، مقطع (\S+)\)/);
    if (m) target = targetFor(m[1], m[2]);
    if (!target) {
      m = String(r.title || '').match(/آیین‌نامه مهاجرتی سما \(مقطع (\S+)\)/);
      if (m) target = targetFor('0', m[1]);
    }
    if (!target) {
      // seedهای «مصوب ۱۴۰۳» و بقیه: از روی مدرک خود ردیف
      const code = degCodeById.get(Number(r.degreeLevelId)) || '';
      const g = code === 'SAMA-3' ? 'MS' : ['SAMA-4', 'SAMA-6', 'SAMA-7', 'SAMA-8'].includes(code) ? 'PHD' : 'BS';
      target = g === 'MS' ? TITLES.R1394MS : g === 'PHD' ? TITLES.R1394PHD : TITLES.R1402;
    }
    const targetId = keepIds.get(target);
    const [{ c: nStu }] = await q(`SELECT count(*)::int c FROM students WHERE "regulationId" = $1`, [r.id]);
    console.log(`  - [${r.id}] «${r.title}» (${nStu} دانشجو) → «${target}»`);
    if (!APPLY) continue;
    if (targetId == null) { console.log('    ! مقصد هنوز ساخته نشده (اول apply با ساخته‌شدن هر ۶ سند) — رد شد'); continue; }
    if (nStu > 0) {
      await pool.query(`UPDATE students SET "regulationId" = $2 WHERE "regulationId" = $1`, [r.id, targetId]);
      moved += nStu;
    }
    await pool.query(`DELETE FROM educational_regulations WHERE id = $1`, [r.id]);
    deleted++;
  }
  // ۳) نقشه‌های کهنه REGULATION (به idهای حذف‌شده اشاره می‌کنند)
  const [{ c: nMap }] = await q(`SELECT count(*)::int c FROM legacy_code_maps WHERE domain = 'REGULATION'`);
  if (APPLY && nMap > 0) {
    await pool.query(`DELETE FROM legacy_code_maps WHERE domain = 'REGULATION'`);
    console.log(`  نقشه‌های REGULATION پاک شد (${nMap}) — با اجرای codemap دوباره ساخته می‌شود`);
  } else if (nMap > 0) {
    console.log(`  (dry) نقشه‌های REGULATION پاک می‌شود (${nMap})`);
  }
  console.log(APPLY ? `✅ اعمال شد: reassigned=${moved} دانشجو، deleted=${deleted} ردیف.` : `--dry: reassigned≈${moved} (شمارش نشد)، چیزی نوشته نشد. برای اعمال --apply بدهید.`);
} catch (err) {
  console.error('❌', err.message);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}
