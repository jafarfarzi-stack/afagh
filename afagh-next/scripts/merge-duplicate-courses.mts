#!/usr/bin/env tsx
// ════════════════════════════════════════════════════════════════════════════
//  ادغامِ «درسِ تکراری» در چارت‌ها — با ایدهٔ هم‌ارزی، یکی می‌ماند
// ────────────────────────────────────────────────────────────────────────────
//  مسئله: در چارت‌های مهاجرتی، یک درس با **دو کد مختلف** در یک ترم ثبت شده
//  است (مثلاً «اقتصاد خرد» هم با 43107 و هم 99055). نتیجه: واحد آن ترم دو
//  بار شمرده می‌شود و جمع از سقف می‌گذرد، و دانشجو دو بار یک درس را می‌بیند.
//
//  راه‌حل (همان مفهوم «دروس هم‌ارز» سیستم قدیم):
//    ۱) دو کد در `courses.equivalentCourseCodes` **دوطرفه** هم‌ارز اعلام می‌شوند؛
//    ۲) ردیفِ کدِ «کم‌اعتبارتر» از چارت حذف می‌شود (یکی می‌ماند)؛
//    ۳) `totalRequiredUnits` و `minRoleUnits` نسخه بازمحاسبه می‌شوند؛
//    ۴) موتور فارغ‌التحصیلی و صفحهٔ چارت دانشجو هم‌ارزی را می‌شناسند، پس
//       دانشجویی که کدِ حذف‌شده را پاس کرده، همان درس را «پاس‌شده» می‌بیند.
//
//  قاعدهٔ «کدام بماند» در `chooseKeep` است (src/lib/course-equivalence-map.ts)
//  و ورودی‌هایش **سراسری** محاسبه می‌شوند — نه به‌تفکیک رشته:
//    حضور در کاتالوگ‌های بیشتر (کل دانشگاه) → قبولی‌های بیشتر → واحد بیشتر →
//    کد کوچک‌تر. اگر شمارش را «درون‌رشته‌ای» بگیریم، یک جفت در دو رشته دو
//    تصمیمِ متضاد می‌گیرد و اجرا ناسازگار می‌شود (باگِ نسخهٔ اول).
//
//  دامنه (`--scope`):
//    in-term (پیش‌فرض) — فقط ردیف‌های ترم‌بندی‌شده. این‌ها همان تکراری‌هایی
//      هستند که واحد ترم را دو بار می‌شمارند و سقف را می‌شکنند.
//    all — ردیف‌های بدون ترم را هم ادغام می‌کند (پرخطر: دو کدِ هم‌عنوان
//      ممکن است دو درسِ واقعاً متفاوت از دو گروه باشند).
//  ردیف‌های بدون ترم در هر حالت در بخش «بازبینی» گزارش می‌شوند و دست‌نخورده
//  می‌مانند تا در ویرایشگر HTML تصمیم بگیرید.
//
//  اجرا:
//    npx tsx scripts/merge-duplicate-courses.mts --report /tmp/dups.json
//    npx tsx scripts/merge-duplicate-courses.mts --apply --backup /tmp/dups.jsonl
// ════════════════════════════════════════════════════════════════════════════
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import pg from 'pg';
import {
  chooseKeep,
  findDuplicatePairs,
  mergeEquivalentCodes,
  type DuplicateCandidate,
  type TitleRow,
} from '../src/lib/course-equivalence-map.ts';
import { checkTermCaps, type CatalogRow } from '../src/lib/compensatory-catalog.ts';

const A: Record<string, string> = {};
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i].startsWith('--')) {
    const k = process.argv[i].slice(2);
    A[k] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true';
  }
}
const APPLY = A.apply === 'true';
const BACKUP = A.backup || '';
const REPORT = A.report || '';
const SCOPE = A.scope === 'all' ? 'all' : 'in-term';
const UNI = Number(A.uni || 1);
if (APPLY && !BACKUP) { console.error('--apply نیازمند --backup <file.jsonl> است'); process.exit(1); }

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows;

// ── بارگیری نسخه‌ها و ردیف‌ها ──
const versions = await q(
  `SELECT v.id, v."majorId", v."entryYearFrom", v."entryYearTo", v."degreeLevelId",
          v."totalRequiredUnits", v."minRoleUnits", m."majorCode", m.name AS "majorName",
          d."maxUnitsPerTerm", d.code AS "degreeCode"
     FROM curriculum_versions v
     JOIN majors m ON m.id = v."majorId"
     LEFT JOIN degree_level_configs d ON d.id = v."degreeLevelId"
    WHERE v."universityId" = $1 AND v."catalogKind" = 'NORMAL'
    ORDER BY v."majorId", v."entryYearFrom"`,
  [UNI]
);
const versionById = new Map<number, any>(versions.map((v: any) => [v.id, v]));

const rows = await q(
  `SELECT cc.id AS "rowId", cc."curriculumVersionId" AS "versionId", cc."courseId",
          c.code, c.title, COALESCE(cc.units, c.units, 0) AS units,
          COALESCE(c.units, 0) AS "courseUnits",
          cc."roleType" AS role, cc."recommendedSemester" AS term, cc."isRequired" AS "isRequired"
     FROM curriculum_courses cc
     JOIN courses c ON c.id = cc."courseId"
     JOIN curriculum_versions v ON v.id = cc."curriculumVersionId"
    WHERE v."universityId" = $1 AND v."catalogKind" = 'NORMAL'`,
  [UNI]
);
console.log(`نسخه‌های عادی: ${versions.length} | ردیف درس: ${rows.length}`);

const rowsByVersion = new Map<number, any[]>();
for (const r of rows) {
  const arr = rowsByVersion.get(r.versionId) ?? [];
  arr.push(r);
  rowsByVersion.set(r.versionId, arr);
}

// ── آمار سراسری (کل دانشگاه) برای تصمیمِ یکسان ──
// تعداد کاتالوگ‌هایی که هر درس در آن‌ها آمده — بی‌توجه به رشته، تا یک جفت
// هرگز در دو رشته دو تصمیم نگیرد.
const globalCatalogCount = new Map<number, number>();
for (const r of rows) globalCatalogCount.set(r.courseId, (globalCatalogCount.get(r.courseId) ?? 0) + 1);

const courseUnits = new Map<number, number>();
for (const r of rows) if (!courseUnits.has(r.courseId)) courseUnits.set(r.courseId, Number(r.courseUnits ?? 0));

const passCounts = new Map<number, number>();
for (const p of await q(
  `SELECT o."courseId", count(*)::int AS n
     FROM enrollments e JOIN course_offerings o ON o.id = e."offeringId"
    WHERE e."gradeValue" IS NOT NULL AND e."gradeValue" >= 10
    GROUP BY o."courseId"`
)) passCounts.set(p.courseId, Number(p.n));

// ── تشخیص جفت‌ها ──
type Hit = DuplicateCandidate & { versionId: number; majorId: number; majorCode: string; yf: number };
const allHits: Hit[] = [];
for (const v of versions) {
  const list = rowsByVersion.get(v.id) ?? [];
  const titleRows: TitleRow[] = list.map((r: any) => ({
    rowId: r.rowId, courseId: r.courseId, code: r.code, title: r.title,
    units: Number(r.units ?? 0), role: r.role, term: r.term,
  }));
  for (const d of findDuplicatePairs(titleRows)) {
    allHits.push({ ...d, versionId: v.id, majorId: v.majorId, majorCode: v.majorCode, yf: v.entryYearFrom });
  }
}
const inTermHits = allHits.filter((h) => h.term != null);
const nullTermHits = allHits.filter((h) => h.term == null);
const hits = SCOPE === 'all' ? allHits : inTermHits;
const reviewHits = SCOPE === 'all' ? [] : nullTermHits;

const distinct = (arr: Hit[]) => new Set(arr.map((h) => [h.codeA, h.codeB].sort().join('|'))).size;
console.log(
  `جفت‌ها → کل: ${allHits.length} (${distinct(allHits)} جفتِ کد) | ` +
  `ترم‌بندی‌شده: ${inTermHits.length} (${distinct(inTermHits)}) | ` +
  `بدون ترم: ${nullTermHits.length} (${distinct(nullTermHits)})`
);
console.log(`دامنهٔ اجرا: ${SCOPE} → ${hits.length} ردیف در ${distinct(hits)} جفتِ کد`);

// ── هم‌ارزی‌های موجود (نگهبانِ ادغام) ──
// ⚠ تلهٔ واقعی: «انسان از ديدگاه اسلام» با کدهای 48057 و 48072 در یک ترم آمده،
// ولی در هم‌ارزیِ میراثی 48057~99002 (معارف ۲) و 48072~99001 (معارف ۱) است.
// اگر این دو را هم‌ارز اعلام کنیم، بستارِ متعدی «معارف ۱» و «معارف ۲» را یکی
// می‌کند و دانشجو یکی را به‌جای دیگری پاس‌شده می‌گیرد. پس: اگر هر دو کد
// مجموعهٔ هم‌ارزِ **ناتهی و ناهم‌پوشان** داشته باشند، ادغام متوقف و به بازبینی
// می‌رود (با --force می‌توان رد کرد).
const allCourses = await q(`SELECT id, code, "equivalentCourseCodes" AS eq FROM courses`);
const codeToId = new Map<string, number>();
const eqById = new Map<number, Set<number>>();
for (const c of allCourses) codeToId.set(String(c.code).trim().toUpperCase(), c.id);
for (const c of allCourses) {
  const set = new Set<number>();
  for (const code of String(c.eq ?? '').split(/[,،|;\s]+/)) {
    const t = code.trim().toUpperCase();
    if (!t) continue;
    const id = codeToId.get(t);
    if (id != null && id !== c.id) set.add(id);
  }
  eqById.set(c.id, set);
}
const FORCE = A.force === 'true';
function equivalenceConflict(idA: number, idB: number): string | null {
  const a = eqById.get(idA) ?? new Set<number>();
  const b = eqById.get(idB) ?? new Set<number>();
  if (!a.size || !b.size) return null; // یکی خالی → فقط به خوشهٔ دیگری وصل می‌شود
  for (const x of a) if (b.has(x)) return null; // هم‌پوشان → همان خوشه
  if (a.has(idB) || b.has(idA)) return null; // از قبل هم‌ارزند
  return `هر دو خوشهٔ هم‌ارزیِ جدا دارند (${[...a].length} و ${[...b].length} عضو، بدون اشتراک) — ادغام آن‌ها دو خوشه را یکی می‌کند`;
}

// ── تصمیمِ سراسری: یک‌بار برای هر جفتِ کد ──
type Decision = {
  key: string; keepCode: string; dropCode: string; reason: string;
  keepCourseId: number; dropCourseId: number; title: string;
  catalogsKeep: number; catalogsDrop: number; passedKeep: number; passedDrop: number;
  unitsKeep: number; unitsDrop: number; occurrences: Hit[];
};
const decisions = new Map<string, Decision>();
const guarded: { key: string; title: string; codeA: string; codeB: string; why: string; hits: Hit[] }[] = [];

for (const h of hits) {
  const key = [h.codeA, h.codeB].sort().join('|');
  const existing = decisions.get(key);
  if (existing) { existing.occurrences.push(h); continue; }

  const g = guarded.find((x) => x.key === key);
  if (g) { g.hits.push(h); continue; }

  if (!FORCE) {
    const why = equivalenceConflict(h.courseIdA, h.courseIdB);
    if (why) {
      guarded.push({ key, title: h.title, codeA: h.codeA, codeB: h.codeB, why, hits: [h] });
      continue;
    }
  }

  const d = chooseKeep({
    codeA: h.codeA, codeB: h.codeB,
    catalogsA: globalCatalogCount.get(h.courseIdA) ?? 0,
    catalogsB: globalCatalogCount.get(h.courseIdB) ?? 0,
    passedA: passCounts.get(h.courseIdA) ?? 0,
    passedB: passCounts.get(h.courseIdB) ?? 0,
    unitsA: courseUnits.get(h.courseIdA) ?? h.unitsA,
    unitsB: courseUnits.get(h.courseIdB) ?? h.unitsB,
  });

  const keepIsA = d.keepCode === h.codeA;
  decisions.set(key, {
    key, keepCode: d.keepCode, dropCode: d.dropCode, reason: d.reason,
    keepCourseId: keepIsA ? h.courseIdA : h.courseIdB,
    dropCourseId: keepIsA ? h.courseIdB : h.courseIdA,
    title: h.title,
    catalogsKeep: keepIsA ? (globalCatalogCount.get(h.courseIdA) ?? 0) : (globalCatalogCount.get(h.courseIdB) ?? 0),
    catalogsDrop: keepIsA ? (globalCatalogCount.get(h.courseIdB) ?? 0) : (globalCatalogCount.get(h.courseIdA) ?? 0),
    passedKeep: keepIsA ? (passCounts.get(h.courseIdA) ?? 0) : (passCounts.get(h.courseIdB) ?? 0),
    passedDrop: keepIsA ? (passCounts.get(h.courseIdB) ?? 0) : (passCounts.get(h.courseIdA) ?? 0),
    unitsKeep: keepIsA ? (courseUnits.get(h.courseIdA) ?? h.unitsA) : (courseUnits.get(h.courseIdB) ?? h.unitsB),
    unitsDrop: keepIsA ? (courseUnits.get(h.courseIdB) ?? h.unitsB) : (courseUnits.get(h.courseIdA) ?? h.unitsA),
    occurrences: [h],
  });
}

// ── گزارش تصمیم‌ها ──
console.log('\nتصمیم‌ها (یکی می‌ماند):');
const list = [...decisions.values()].sort((a, b) => a.key.localeCompare(b.key));
for (const d of list) {
  console.log(
    `  «${d.title}»: نگه‌داشتن ${d.keepCode} (کاتالوگ ${d.catalogsKeep} · قبولی ${d.passedKeep} · ${d.unitsKeep} واحد) ` +
    `↔ حذف ${d.dropCode} (کاتالوگ ${d.catalogsDrop} · قبولی ${d.passedDrop} · ${d.unitsDrop} واحد) — ${d.reason}`
  );
  console.log(`     در ${d.occurrences.length} نسخه: ${[...new Set(d.occurrences.map((o) => `${o.majorCode}/v${o.versionId}ت${o.term ?? '—'}`))].join(', ')}`);
}

// ── بازبینی: جفت‌هایی که نگهبانِ هم‌ارزی متوقف کرد ──
if (guarded.length) {
  console.log(`\n⛔ متوقف‌شده با نگهبانِ هم‌ارزی (ادغام نشد): ${guarded.length} جفت`);
  for (const g of guarded) {
    console.log(`  «${g.title}» ${g.codeA} ↔ ${g.codeB} — ${g.why}`);
    console.log(`     ردیف‌ها: ${g.hits.map((h) => `${h.majorCode}/v${h.versionId}ت${h.term ?? '—'}`).join(', ')}`);
  }
  console.log('  (برای عبور از این نگهبان: --force — ولی ابتدا خوشهٔ هم‌ارزی را دستی بررسی کنید)');
}

// ── ردیف‌هایی که باید حذف شوند ──
const dropRowIds: number[] = [];
const dropDetail: any[] = [];
for (const d of list) {
  for (const h of d.occurrences) {
    const rowId = h.codeA === d.dropCode ? h.rowIdA : h.rowIdB;
    const keepRowId = h.codeA === d.keepCode ? h.rowIdA : h.rowIdB;
    const row = (rowsByVersion.get(h.versionId) ?? []).find((r: any) => r.rowId === rowId);
    const v = versionById.get(h.versionId);
    dropRowIds.push(rowId);
    dropDetail.push({
      rowId, versionId: h.versionId, majorCode: h.majorCode, yf: h.yf, term: h.term,
      dropCode: d.dropCode, keepCode: d.keepCode, keepRowId,
      units: row ? Number(row.units) : null,
      role: row?.role ?? null, isRequired: row?.isRequired ?? null,
      majorId: v?.majorId ?? null,
    });
  }
}

// ── بازبینی: تکراری‌های بدون ترم (اقدامی انجام نمی‌شود) ──
if (reviewHits.length) {
  const rv = new Map<string, { title: string; n: number; codes: Set<string> }>();
  for (const h of reviewHits) {
    const k = [h.codeA, h.codeB].sort().join('|');
    const e = rv.get(k) ?? { title: h.title, n: 0, codes: new Set<string>() };
    e.n++; e.codes.add(h.codeA); e.codes.add(h.codeB);
    rv.set(k, e);
  }
  console.log(`\n⚠ بازبینی (بدون ترم، دست‌نخورده ماند): ${reviewHits.length} جفت در ${rv.size} جفتِ کد`);
  const top = [...rv.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 15);
  for (const [k, e] of top) console.log(`  «${e.title}» ${k} — ${e.n} مورد`);
  if (rv.size > top.length) console.log(`  … و ${rv.size - top.length} جفتِ دیگر`);
}

// ── وضعیت سقف قبل/بعد ──
const capOf = (v: any) => (Number(v?.maxUnitsPerTerm) > 0 ? Number(v.maxUnitsPerTerm) : 20);
function capStats(excludedRowIds: Set<number>) {
  let over = 0, excess = 0;
  const details: any[] = [];
  for (const v of versions) {
    const list2 = (rowsByVersion.get(v.id) ?? []).filter((r: any) => !excludedRowIds.has(r.rowId));
    const catalogRows: CatalogRow[] = list2.map((r: any) => ({
      courseCode: r.code, units: Number(r.units), roleType: r.role,
      recommendedSemester: r.term,
    }));
    for (const viol of checkTermCaps(catalogRows, capOf(v))) {
      over++; excess += viol.excess;
      details.push({ versionId: v.id, majorCode: v.majorCode, term: viol.term, units: viol.units, excess: viol.excess });
    }
  }
  return { over, excess: Math.round(excess * 10) / 10, details };
}
const before = capStats(new Set());
const after = capStats(new Set(dropRowIds));
console.log(`\nترم‌های بالای سقف → قبل: ${before.over} (اضافه ${before.excess} واحد) | بعد: ${after.over} (اضافه ${after.excess} واحد)`);
if (after.over) {
  console.log('  باقی‌مانده (نیازمند تصمیم انسانی — در ویرایشگر HTML قابل اصلاح است):');
  for (const d of after.details.sort((a, b) => b.excess - a.excess).slice(0, 30)) {
    console.log(`    ${d.majorCode} v${d.versionId} ترم${d.term} = ${d.units} واحد (+${d.excess})`);
  }
}

// ── نسخه‌های تحت تأثیر (برای بازمحاسبهٔ جمع واحد) ──
const affectedVersions = [...new Set(dropDetail.map((d) => d.versionId))];
console.log(`\nنسخه‌های تحت تأثیر: ${affectedVersions.length}`);

// ── هم‌ارزی: وضعیت فعلی ──
const courseIds = [...new Set(list.flatMap((d) => [d.keepCourseId, d.dropCourseId]))];
const courseRows = courseIds.length
  ? await q(`SELECT id, code, "equivalentCourseCodes" FROM courses WHERE id = ANY($1::int[])`, [courseIds])
  : [];
const courseById = new Map<number, any>(courseRows.map((c: any) => [c.id, c]));

const equivUpdates: { id: number; code: string; before: string | null; after: string | null }[] = [];
for (const d of list) {
  const keep = courseById.get(d.keepCourseId);
  const drop = courseById.get(d.dropCourseId);
  if (!keep || !drop) continue;
  const keepAfter = mergeEquivalentCodes(keep.equivalentCourseCodes, [drop.code], keep.code);
  const dropAfter = mergeEquivalentCodes(drop.equivalentCourseCodes, [keep.code], drop.code);
  if (keepAfter !== keep.equivalentCourseCodes) equivUpdates.push({ id: keep.id, code: keep.code, before: keep.equivalentCourseCodes, after: keepAfter });
  if (dropAfter !== drop.equivalentCourseCodes) equivUpdates.push({ id: drop.id, code: drop.code, before: drop.equivalentCourseCodes, after: dropAfter });
}
console.log(`به‌روزرسانی هم‌ارزی: ${equivUpdates.length} درس`);
for (const u of equivUpdates) console.log(`  ${u.code}: «${u.before ?? '—'}» → «${u.after ?? '—'}»`);

// ── گزارش ──
if (REPORT) {
  const payload = {
    uni: UNI, scope: SCOPE,
    versions: versions.length,
    rows: rows.length,
    duplicatePairs: allHits.length,
    inTermPairs: inTermHits.length,
    nullTermPairs: nullTermHits.length,
    decisions: list.map((d) => ({
      title: d.title, keepCode: d.keepCode, dropCode: d.dropCode, reason: d.reason,
      catalogsKeep: d.catalogsKeep, catalogsDrop: d.catalogsDrop,
      passedKeep: d.passedKeep, passedDrop: d.passedDrop,
      unitsKeep: d.unitsKeep, unitsDrop: d.unitsDrop,
      occurrences: d.occurrences.length,
    })),
    review: [...new Map(reviewHits.map((h) => [[h.codeA, h.codeB].sort().join('|'), h])).values()]
      .map((h) => ({ title: h.title, codeA: h.codeA, codeB: h.codeB })),
    guarded: guarded.map((g) => ({ title: g.title, codeA: g.codeA, codeB: g.codeB, why: g.why, rows: g.hits.length })),
    drops: dropDetail,
    equivalenceUpdates: equivUpdates,
    cap: { before: { over: before.over, excess: before.excess }, after: { over: after.over, excess: after.excess }, remaining: after.details },
    affectedVersions,
  };
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, JSON.stringify(payload, null, 2), 'utf8');
  console.log('report:', REPORT);
}

if (!APPLY) {
  console.log('\n(dry) برای اجرا: --apply --backup <file.jsonl>');
  await pool.end();
  process.exit(0);
}

// ════════════════════════════ اجرا ════════════════════════════
mkdirSync(dirname(BACKUP), { recursive: true });
const client = await pool.connect();
const log: any[] = [];
let eqUpdated = 0, deleted = 0, versionsUpdated = 0;

try {
  await client.query('BEGIN');

  // ۱) هم‌ارزی دوطرفه
  for (const u of equivUpdates) {
    await client.query(
      `UPDATE courses SET "equivalentCourseCodes" = $1 WHERE id = $2`,
      [u.after, u.id]
    );
    log.push({ entity: 'course_equiv', id: u.id, code: u.code, before: u.before, after: u.after });
    eqUpdated++;
  }

  // ۲) حذف ردیف‌های تکراری
  const snapshot = dropDetail.map((d) => ({ ...d, row: rows.find((r: any) => r.rowId === d.rowId) }));
  if (dropRowIds.length) {
    await client.query(`DELETE FROM curriculum_courses WHERE id = ANY($1::int[])`, [dropRowIds]);
    deleted = dropRowIds.length;
  }
  log.push({ entity: 'curriculum_courses_deleted', rows: snapshot });

  // ۳) بازمحاسبهٔ totalRequiredUnits و minRoleUnits نسخه‌های تحت تأثیر
  for (const vid of affectedVersions) {
    const agg = (await client.query(
      `SELECT cc."roleType" AS role, COALESCE(cc.units, c.units, 0) AS u
         FROM curriculum_courses cc JOIN courses c ON c.id = cc."courseId"
        WHERE cc."curriculumVersionId" = $1`,
      [vid]
    )).rows;
    const byRole: Record<string, number> = {};
    let total = 0;
    for (const a of agg) {
      const u = Number(a.u ?? 0);
      if (!(u > 0)) continue;
      byRole[a.role] = Math.round(((byRole[a.role] ?? 0) + u) * 10) / 10;
      total = Math.round((total + u) * 10) / 10;
    }
    const v = versionById.get(vid);
    await client.query(
      `UPDATE curriculum_versions SET "totalRequiredUnits" = $1, "minRoleUnits" = $2, "updatedAt" = now() WHERE id = $3`,
      [String(total), JSON.stringify(byRole), vid]
    );
    log.push({ entity: 'version_totals', id: vid, before: { total: v?.totalRequiredUnits, roles: v?.minRoleUnits }, after: { total, roles: byRole } });
    versionsUpdated++;
  }

  await client.query('COMMIT');
} catch (e: any) {
  await client.query('ROLLBACK');
  console.error('ROLLBACK:', e.message);
  process.exit(1);
} finally {
  client.release();
}

writeFileSync(BACKUP, log.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
console.log(`\napply → هم‌ارزی: ${eqUpdated} درس | حذف ردیف: ${deleted} | نسخهٔ بازمحاسبه‌شده: ${versionsUpdated}`);
console.log('backup:', BACKUP);
await pool.end();
