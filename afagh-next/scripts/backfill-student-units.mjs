// ══════════════════════════════════════════════════════════════════════
//  backfill-student-units.mjs
//
//  چه چیزی را پر می‌کند و چرا:
//    • students.totalTakenUnits  → کل واحدهای لحاظ‌شده در معدل کل
//    • students.totalPassedUnits → کل واحدهای قبولی
//      هر دو ستون از ابزار خودِ برنامه (groupTranscript) پر می‌شوند، نه از
//      SQL دستی، تا معنایشان دقیقاً همان چیزی باشد که کارنامه نمایش می‌دهد.
//      تا پیش از این هر دو ستون برای تمام ۴۸٬۳۵۸ دانشجو NULL بودند.
//
//    • students.totalAverage
//      فقط جاهایی پر می‌شود که مقدار فعلی NULL **یا صفر** است و محاسبهٔ
//      موتور عدد معتبر دارد. مقادیر موجودِ سما دست‌نخورده می‌مانند چون
//      خط پایهٔ اسکریپت audit-gpa-vs-legacy هستند و بازنویسی‌شان ممیزی را
//      بی‌معنا می‌کرد. صفرهای بدون نمره هم به NULL تبدیل می‌شوند (دانشجوی
//      بدون نمره «معدل صفر» ندارد).
//
//  اجرا:  node scripts/backfill-student-units.mjs [--dry] [--uni <id>]
// ══════════════════════════════════════════════════════════════════════
import pg from 'pg';
import { groupTranscript } from '../src/app/admin/students/transcript-utils.js';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });

/** pg ستون‌های numeric را به‌صورت رشته برمی‌گرداند → مقایسهٔ عددی لازم است */
const asNum = (v) => (v == null || v === '' ? null : Number(v));

const isDry = process.argv.includes('--dry');
const uniArg = process.argv.indexOf('--uni');
const onlyUni = uniArg >= 0 ? Number(process.argv[uniArg + 1]) : 0;

const UNIVERSITIES = [
  { id: 1, code: 'AFAGH' }, { id: 2, code: 'ZARINE' }, { id: 3, code: 'ALLAME' },
  { id: 4, code: 'SHAMS' }, { id: 5, code: 'NAZHAND' },
].filter(u => !onlyUni || u.id === onlyUni);

async function backfillUniversity(uni) {
  console.log(`\n── ${uni.code} (id=${uni.id}) ──`);

  // آیین‌نامه‌ها بین دانشگاه‌ها مشترک‌اند → همه لود می‌شوند
  const regRows = (await pool.query(`SELECT id, title, "rulesConfig" FROM educational_regulations`)).rows;
  const regMap = new Map();
  for (const r of regRows) {
    let cfg = null;
    try { if (r.rulesConfig) cfg = JSON.parse(r.rulesConfig); } catch { /* بی‌اعتبار = بدون آیین‌نامه */ }
    regMap.set(r.id, cfg);
  }

  const stuRows = (await pool.query(
    `SELECT id, "studentCode", "regulationId", "totalAverage" FROM students WHERE "universityId" = $1`,
    [uni.id],
  )).rows;
  console.log(`   students: ${stuRows.length}`);

  const enRows = (await pool.query(`
    SELECT e."studentId", c.units::text as units, e."gradeValue"::text as "gradeValue",
           e."gradeStatus", e."samaGradeStatusCode" as "gradeStatusCode", c.code as "courseCode",
           t."termCode"
    FROM enrollments e
    JOIN course_offerings co ON co.id = e."offeringId"
    JOIN courses c ON c.id = co."courseId"
    JOIN academic_terms t ON t.id = co."termId"
    WHERE c."universityId" = $1`, [uni.id])).rows;
  console.log(`   enrollments: ${enRows.length}`);

  const byStudent = new Map();
  for (const r of enRows) {
    let list = byStudent.get(r.studentId);
    if (!list) { list = []; byStudent.set(r.studentId, list); }
    list.push(r);
  }

  const stats = {
    unitsFilled: 0, avgFilled: 0, avgZeroToNull: 0, avgUntouched: 0, noData: 0,
  };
  const updates = [];

  for (const stu of stuRows) {
    const currentAvg = asNum(stu.totalAverage);
    const currentIsZero = currentAvg === 0;
    const ens = byStudent.get(stu.id);
    if (!ens || ens.length === 0) {
      stats.noData++;
      // بدون هیچ رکورد نمره‌ای: صفرِ بی‌معنا باید NULL شود، واحدها NULL بماند
      if (currentIsZero) {
        updates.push({ id: stu.id, taken: null, passed: null, avg: null });
        stats.avgZeroToNull++;
      }
      continue;
    }

    const summary = groupTranscript(ens, regMap.get(stu.regulationId) ?? null);

    let avg = summary.gpa == null ? null : Number(Number(summary.gpa).toFixed(2));
    const taken = summary.totalTaken ?? null;
    const passed = summary.totalPassed ?? null;

    let zeroToNull = false;
    if (avg == null) {
      // محاسبه چیزی نداد؛ اگر مقدار فعلی صفر است بی‌معناست
      if (currentIsZero) { avg = null; zeroToNull = true; stats.avgZeroToNull++; }
      else stats.avgUntouched++;
    } else if (currentAvg == null || currentIsZero) {
      stats.avgFilled++;   // فقط شکاف را پر می‌کنیم، مقدار سما را دست نمی‌زنیم
    } else {
      stats.avgUntouched++; // مقدار سما معتبر است → حفظ
    }

    stats.unitsFilled += (taken != null || passed != null) ? 1 : 0;
    updates.push({ id: stu.id, taken, passed, avg, zeroToNull });
  }

  console.log(`   units filled      : ${stats.unitsFilled}`);
  console.log(`   avg filled (gap)  : ${stats.avgFilled}`);
  console.log(`   avg 0 -> NULL     : ${stats.avgZeroToNull}`);
  console.log(`   avg kept (sama)   : ${stats.avgUntouched}`);
  console.log(`   students no data  : ${stats.noData}`);

  if (isDry) return stats;

  if (updates.length === 0) return stats;

  const BATCH = 500;
  for (let i = 0; i < updates.length; i += BATCH) {
    const chunk = updates.slice(i, i + BATCH);
    await pool.query(`
      UPDATE students s SET
        "totalTakenUnits"  = u.taken,
        "totalPassedUnits" = u.passed,
        "totalAverage"     = u.avg
      FROM (SELECT UNNEST($1::int[]) AS id, UNNEST($2::int[]) AS taken,
                   UNNEST($3::int[]) AS passed, UNNEST($4::numeric[]) AS avg) u
      WHERE s.id = u.id
    `, [
      chunk.map(c => c.id),
      chunk.map(c => c.taken),
      chunk.map(c => c.passed),
      chunk.map(c => c.avg),
    ]);
    process.stdout.write(`   saved ${Math.min(i + BATCH, updates.length)} / ${updates.length}\r`);
  }
  console.log(`\n   ✓ saved`);
  return stats;
}

async function main() {
  console.log(`=== backfill student units (DRY=${isDry}) ===`);
  const all = {};
  for (const uni of UNIVERSITIES) all[uni.code] = await backfillUniversity(uni);
  console.log('\n=== خلاصه ===');
  for (const [code, s] of Object.entries(all)) {
    console.log(`  ${code.padEnd(8)} units=${s.unitsFilled} avgFilled=${s.avgFilled} zeroToNull=${s.avgZeroToNull} kept=${s.avgUntouched} noData=${s.noData}`);
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
