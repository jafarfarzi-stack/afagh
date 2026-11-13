#!/usr/bin/env tsx
// ════════════════════════════════════════════════════════════════════════════
//  ورود چارت/برنامهٔ درسی از TSV به دیتابیس — با مدلِ دوگانهٔ کاتالوگ
// ────────────────────────────────────────────────────────────────────────────
//  اجرا:  npx tsx scripts/import-curriculum-chart.ts --file <tsv> [--apply --backup <jsonl>]
//
//  ستون‌ها (۸ ستونی — نسخهٔ v6):
//    ۱ کد رشته | ۲ کد مقطع | ۳ از ورودی | ۴ تا ورودی | ۵ کد درس |
//    ۶ ترم پیشنهادی | ۷ نقش | ۸ الزامی
//  ستون‌ها (۷ ستونی — نسخهٔ قدیمی، بدون «کد مقطع»): همان بدون ستون ۲.
//  تشخیص خودکار بر اساس تعداد ستون‌های سرآیندِ داده.
//
//  تغییرات اساسی نسبت به نسخهٔ قبلی (که کاتالوگ‌ها را خراب وارد کرد):
//    ۱) هر چارت به **دو نسخهٔ مستقل** تفکیک می‌شود:
//         • NORMAL       — بدون هیچ درس جبرانی
//         • COMPENSATORY — فقط دروس جبرانی، از ترم ۱
//       و نسخهٔ عادی به نسخهٔ جبرانی لینک می‌شود (compensatoryVersionId).
//    ۲) الگوریتمِ سقف واحد ترم اعمال می‌شود (src/lib/compensatory-catalog.ts):
//       هیچ ترمی نباید از degree_level_configs.maxUnitsPerTerm بگذرد؛
//       جابه‌جایی فقط برای نقش‌های بی‌خطر (جبرانی → اختیاری → کارگاه).
//    ۳) `totalRequiredUnits` و `minRoleUnits` **بدون** واحدهای جبرانی محاسبه
//       می‌شوند — قبلاً واحد جبرانی در جمع کل چارت عادی هم می‌نشست.
//    ۴) ستون «کد مقطع» اعتبارسنجی می‌شود (ناهمخوانی = هشدار، نه شکست؛
//       منبع حقیقت دیتابیس است).
//    ۵) ردیف تکراری (همان درس در همان نسخه) بی‌صدا رد نمی‌شود — گزارش می‌شود.
//
//  پیش‌فرض dry است؛ نوشتن با --apply و بکاپ JSONL اجباری.
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import pg from 'pg';
import {
  checkTermCaps,
  compensatoryVersionCode,
  isCompensatoryRole,
  normalizeRole,
  packTerms,
  rebalanceTerms,
  DEFAULT_TERM_CAP,
  type CatalogRow,
} from '../src/lib/compensatory-catalog.ts';

const A: Record<string, string> = {};
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i].startsWith('--')) {
    const k = process.argv[i].slice(2);
    A[k] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true';
  }
}
const APPLY = A.apply === 'true';
const FILE = A.file || '';
const BACKUP = A.backup || '';
const UNI = Number(A.uni || 1);
const REPORT = A.report || '';
const CAP_OVERRIDE = A.cap ? Number(A.cap) : null;
const NO_SPLIT = A['no-split'] === 'true';

if (!FILE || !existsSync(FILE)) { console.error('--file <tsv> الزامی است'); process.exit(1); }
if (APPLY && !BACKUP) { console.error('--apply نیازمند --backup <file.jsonl> است'); process.exit(1); }

// ── نقش: فارسی → کد کاتالوگ ──
// ⚠️ نوع درسِ «تعریف» (courses.courseType) با نوع درسِ «کاتالوگ» یکی نیست.
// نقش فقط از فایل گرفته می‌شود؛ نبودِ نقش ⇒ CORE + گزارش. هیچ نگاشت خودکاری
// از courseType به نقش وجود ندارد (این همان اشتباهی بود که داده را خراب کرد).
const ROLE_CODES = new Set([
  'CORE', 'MAJOR', 'SPECIALIZED', 'ELECTIVE', 'GENERAL',
  'THESIS', 'INTERNSHIP', 'WORKSHOP', 'COMPENSATORY',
]);
function roleFromFile(raw: string | undefined | null): string | null {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  const n = normalizeRole(t);
  return ROLE_CODES.has(n) ? n : null;
}

// ── خواندن TSV (۷ یا ۸ ستونی) ──
const lines = readFileSync(FILE, 'utf8').split(/\r?\n/).filter((l) => l.trim());
const firstCols = lines[0] ? lines[0].split('\t').length : 0;
const EIGHT = firstCols >= 8;
const OFF = EIGHT ? 1 : 0; // جابه‌جایی ستون‌ها بعد از «کد مقطع»
console.log(`ستون‌های فایل: ${firstCols} → حالت ${EIGHT ? '۸ ستونی (با کد مقطع)' : '۷ ستونی (قدیمی)'}`);

type RawRow = {
  maj: string; degreeCode: string; yf: number | null; yt: number | null;
  lesson: string; sem: number | null; role: string; req: string;
};
const rows: RawRow[] = [];
let skipped = 0;
for (const ln of lines) {
  const p = ln.split('\t');
  if (p.length < 7) { skipped++; continue; }
  const maj = String(p[0]).trim();
  const degreeCode = EIGHT ? String(p[1]).trim() : '';
  const yf = p[1 + OFF] && String(p[1 + OFF]).trim() !== '' ? Number(p[1 + OFF]) : null;
  const yt = p[2 + OFF] && String(p[2 + OFF]).trim() !== '' ? Number(p[2 + OFF]) : null;
  const lesson = String(p[3 + OFF]).trim();
  const sem = p[4 + OFF] && String(p[4 + OFF]).trim() !== '' ? Number(p[4 + OFF]) : null;
  const role = p[5 + OFF] ? String(p[5 + OFF]).trim() : '';
  const req = p[6 + OFF] ? String(p[6 + OFF]).trim() : '';
  if (!maj || !lesson) { skipped++; continue; }
  rows.push({ maj, degreeCode, yf, yt, lesson, sem, role, req });
}
console.log(`ردیف‌های فایل: ${rows.length} (ردشده: ${skipped})`);

// ── دیتابیس ──
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql: string, params: unknown[]) => (await pool.query(sql, params)).rows;

const majors = await q(
  `SELECT m.id, m."majorCode", m.name, m."degreeLevelId", d.code AS "degreeCode", d."maxUnitsPerTerm"
     FROM majors m JOIN degree_level_configs d ON d.id = m."degreeLevelId"
    WHERE m."universityId" = $1`,
  [UNI]
);
const majorByCode = new Map(majors.map((m: any) => [String(m.majorCode), m]));
const courses = await q(`SELECT id, code, units, title FROM courses WHERE "universityId" = $1`, [UNI]);
const courseByCode = new Map(courses.map((c: any) => [String(c.code), c]));
console.log(`رشته‌های دانشگاه ${UNI}: ${majors.length} | دروس: ${courses.length}`);

// ── گروه‌بندی: کلید شامل نوع کاتالوگ ──
type Item = { courseId: number; code: string; units: number | null; sem: number | null; role: string | null; req: string; title: string };
type Group = {
  majorId: number; majorName: string; degreeLevelId: number; degreeCode: string;
  from: number; to: number | null; kind: 'NORMAL' | 'COMPENSATORY';
  cap: number; items: Item[]; key: string;
};
const groups = new Map<string, Group>();
const missingMajors = new Map<string, number>();
const missingCourses = new Map<string, number>();
const degreeMismatch = new Map<string, number>();
let dropped = 0;

for (const r of rows) {
  const m: any = majorByCode.get(r.maj);
  if (!m) { missingMajors.set(r.maj, (missingMajors.get(r.maj) || 0) + 1); dropped++; continue; }
  const c: any = courseByCode.get(r.lesson);
  if (!c) { missingCourses.set(r.lesson, (missingCourses.get(r.lesson) || 0) + 1); dropped++; continue; }
  if (EIGHT && r.degreeCode && m.degreeCode && r.degreeCode !== m.degreeCode) {
    degreeMismatch.set(`${r.maj}:${r.degreeCode}≠${m.degreeCode}`, (degreeMismatch.get(`${r.maj}:${r.degreeCode}≠${m.degreeCode}`) || 0) + 1);
  }
  const roleCode = roleFromFile(r.role);
  const kind: 'NORMAL' | 'COMPENSATORY' = !NO_SPLIT && roleCode === 'COMPENSATORY' ? 'COMPENSATORY' : 'NORMAL';
  const from = r.yf ?? 1300;
  const to = r.yt ?? null;
  const cap = CAP_OVERRIDE && CAP_OVERRIDE > 0
    ? CAP_OVERRIDE
    : Number(m.maxUnitsPerTerm) > 0 ? Number(m.maxUnitsPerTerm) : DEFAULT_TERM_CAP;
  const key = `${m.id}|${m.degreeLevelId}|${from}|${to ?? 'null'}|${kind}`;
  if (!groups.has(key)) {
    groups.set(key, {
      majorId: m.id, majorName: m.name, degreeLevelId: m.degreeLevelId, degreeCode: m.degreeCode,
      from, to, kind, cap, items: [], key,
    });
  }
  groups.get(key)!.items.push({
    courseId: c.id, code: String(c.code), units: c.units != null ? Number(c.units) : null,
    sem: r.sem, role: roleCode, req: r.req, title: String(c.title ?? ''),
  });
}
console.log(`گروه‌ها (نسخهٔ چارت): ${groups.size}  [عادی: ${[...groups.values()].filter((g) => g.kind === 'NORMAL').length} | جبرانی: ${[...groups.values()].filter((g) => g.kind === 'COMPENSATORY').length}]`);
if (missingMajors.size) console.log('⚠️ رشته‌های ناموجود:', [...missingMajors.entries()].slice(0, 10));
if (missingCourses.size) console.log('⚠️ دروس ناموجود در بانک:', [...missingCourses.entries()].slice(0, 20), `(${missingCourses.size} کد)`);
if (degreeMismatch.size) console.log('⚠️ ناهمخوانی «کد مقطع» با دیتابیس:', [...degreeMismatch.entries()].slice(0, 10));

// ── پلن: تفکیک + الگوریتم سقف ──
type Plan = Group & {
  rowsPlanned: CatalogRow[]; moves: number; violations: ReturnType<typeof checkTermCaps>;
  byRole: Record<string, number>; total: number; versionCode: string; title: string;
  dupCodes: string[]; verId: number | null;
};
const plan: Plan[] = [];
const dupTotal: string[] = [];

for (const g of groups.values()) {
  const seen = new Set<number>();
  const dupCodes: string[] = [];
  const items: Item[] = [];
  for (const it of g.items) {
    if (seen.has(it.courseId)) { dupCodes.push(it.code); continue; } // قید یکتایی (نسخه، درس)
    seen.add(it.courseId);
    items.push(it);
  }
  if (dupCodes.length) dupTotal.push(`${g.majorName} (${g.majorId}/${g.from}) ${g.kind}: ${dupCodes.join('، ')}`);

  const catalogRows: CatalogRow[] = items.map((it) => ({
    courseCode: it.code,
    units: it.units,
    roleType: it.role,
    recommendedSemester: it.sem,
  }));

  let plannedRows: CatalogRow[] = catalogRows;
  let moves = 0;
  if (g.kind === 'NORMAL') {
    const reb = rebalanceTerms(catalogRows, g.cap);
    plannedRows = reb.rows;
    moves = reb.moves.length;
  } else {
    const packed = packTerms(catalogRows, g.cap);
    plannedRows = packed.rows;
  }

  const byRole: Record<string, number> = {};
  let total = 0;
  for (const r of plannedRows) {
    const role = normalizeRole(r.roleType) || 'CORE';
    const u = Number(r.units ?? 0);
    if (!(u > 0)) continue;
    byRole[role] = Math.round(((byRole[role] || 0) + u) * 10) / 10;
    total = Math.round((total + u) * 10) / 10;
  }

  const label = g.to ? `${g.from}–${g.to}` : `${g.from} به بعد`;
  const baseCode = `LEGACY-${g.from}${g.to ? '-' + g.to : ''}`;
  plan.push({
    ...g,
    items,
    rowsPlanned: plannedRows,
    moves,
    violations: checkTermCaps(plannedRows, g.cap),
    byRole,
    total,
    versionCode: g.kind === 'COMPENSATORY' ? compensatoryVersionCode(baseCode) : baseCode,
    title: g.kind === 'COMPENSATORY'
      ? `کاتالوگ جبرانی — ${g.majorName} (ورودی ${label})`
      : `برنامهٔ درسی مهاجرتی ${g.majorName} (ورودی ${label})`,
    dupCodes,
    verId: null,
  });
}

// ── درسِ تکراری با کد متفاوت در یک ترم — ریشهٔ اصلی «ترم غیرقابل‌اصلاح» ──
// مثال واقعی: «اقتصاد خرد» هم با کد 43107 و هم 99055 در ترم ۱ آمده و جمع را
// به ۲۵ واحد رسانده است. این نقص دادهٔ مبدأ است؛ ایمپورتور آن را حذف نمی‌کند
// (حذف بی‌صدا = تغییر چارت مصوب) و فقط گزارش می‌دهد.
const normTitle = (t: string) =>
  String(t ?? '')
    .replace(/[يى]/g, 'ی').replace(/[ك]/g, 'ک')
    .replace(/[\u200c\u200d\u064b-\u065f]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();

type DupTitle = { majorId: number; majorName: string; from: number; kind: string; term: number; title: string; codes: string[]; units: number };
const dupTitles: DupTitle[] = [];
for (const p of plan) {
  const byTermTitle = new Map<string, Item[]>();
  for (const it of p.items) {
    if (!it.sem || !it.title) continue;
    const k = `${it.sem}|${normTitle(it.title)}`;
    const arr = byTermTitle.get(k) ?? [];
    arr.push(it);
    byTermTitle.set(k, arr);
  }
  for (const [, arr] of byTermTitle) {
    if (arr.length < 2) continue;
    const codes = [...new Set(arr.map((x) => x.code))];
    if (codes.length < 2) continue;
    dupTitles.push({
      majorId: p.majorId, majorName: p.majorName, from: p.from, kind: p.kind,
      term: Number(arr[0].sem), title: arr[0].title, codes,
      units: Math.round(arr.reduce((s, x) => s + Number(x.units ?? 0), 0) * 10) / 10,
    });
  }
}

// ── وضعیت فعلی ──
const existing = await q(
  `SELECT id, "majorId", "degreeLevelId", "entryYearFrom", "entryYearTo", "catalogKind"
     FROM curriculum_versions WHERE "universityId" = $1`,
  [UNI]
);
const exKey = new Map(
  existing.map((v: any) => [
    `${v.majorId}|${v.degreeLevelId}|${v.entryYearFrom}|${v.entryYearTo ?? 'null'}|${v.catalogKind ?? 'NORMAL'}`,
    v.id,
  ])
);
let willCreate = 0, willReuse = 0;
for (const p of plan) {
  const id = exKey.get(`${p.majorId}|${p.degreeLevelId}|${p.from}|${p.to ?? 'null'}|${p.kind}`) ?? null;
  p.verId = id as number | null;
  if (id) willReuse++; else willCreate++;
}

// ── گزارش پیش از اجرا ──
const totalViol = plan.reduce((s, p) => s + p.violations.length, 0);
const normalViol = plan.filter((p) => p.kind === 'NORMAL').reduce((s, p) => s + p.violations.length, 0);
const compViol = plan.filter((p) => p.kind === 'COMPENSATORY').reduce((s, p) => s + p.violations.length, 0);
const movedTotal = plan.reduce((s, p) => s + p.moves, 0);
const noRoleCount = plan.reduce((s, p) => s + p.items.filter((it) => !it.role).length, 0);

console.log(`\nنسخه‌ها → ساخت: ${willCreate} | موجود: ${willReuse}`);
console.log(`جمع واحدِ کاتالوگ‌های عادی: ${plan.filter((p) => p.kind === 'NORMAL').reduce((s, p) => s + p.total, 0)}`);
console.log(`جمع واحدِ کاتالوگ‌های جبرانی: ${plan.filter((p) => p.kind === 'COMPENSATORY').reduce((s, p) => s + p.total, 0)}`);
console.log(`جابه‌جایی برای رعایت سقف: ${movedTotal} درس`);
console.log(`ترم بالای سقف → عادی: ${normalViol} | جبرانی: ${compViol} | جمع: ${totalViol}`);
if (normalViol) {
  console.log('  ⚠️ ترم‌های بالای سقف در کاتالوگ عادی (نقص دادهٔ مبدأ — جابه‌جانشدنی):');
  for (const p of plan.filter((x) => x.kind === 'NORMAL' && x.violations.length)) {
    for (const v of p.violations.slice(0, 5)) {
      console.log(`     ${p.majorName} (${p.majorId}) ورودی ${p.from}: ترم ${v.term} = ${v.units} واحد (سقف ${v.cap})${v.oversized.length ? ` — درس بزرگ‌تر از سقف: ${v.oversized.join('، ')}` : ''}`);
    }
  }
}
if (noRoleCount) console.log(`⚠️ ردیف بدون نقش (⇒ CORE): ${noRoleCount}`);
if (dropped) console.log(`⚠️ ردیف‌های حذف‌شده (درس/رشتهٔ ناموجود): ${dropped}`);
if (dupTitles.length) {
  console.log(`⚠️ درسِ تکراری با کد متفاوت در یک ترم (علت اصلی ترم‌های بالای سقف): ${dupTitles.length} مورد`);
  dupTitles.slice(0, 8).forEach((d) =>
    console.log(`     ${d.majorName} (${d.majorId}) ${d.kind} ورودی ${d.from} ترم ${d.term}: «${d.title}» با کدهای ${d.codes.join(' + ')} = ${d.units} واحد`)
  );
}
if (dupTotal.length) {
  console.log(`⚠️ درس تکراری در یک نسخه (فقط اولی نگه داشته شد): ${dupTotal.length} مورد`);
  dupTotal.slice(0, 5).forEach((d) => console.log('   ', d));
}

if (REPORT) {
  writeFileSync(REPORT, JSON.stringify({
    file: FILE, uni: UNI, columns: firstCols, eightColumn: EIGHT,
    rows: rows.length, skipped, groups: groups.size,
    willCreate, willReuse,
    normalUnits: plan.filter((p) => p.kind === 'NORMAL').reduce((s, p) => s + p.total, 0),
    compensatoryUnits: plan.filter((p) => p.kind === 'COMPENSATORY').reduce((s, p) => s + p.total, 0),
    movedTotal, violations: { normal: normalViol, compensatory: compViol },
    violationDetail: plan.filter((p) => p.violations.length).map((p) => ({
      majorId: p.majorId, majorName: p.majorName, kind: p.kind, from: p.from, cap: p.cap,
      terms: p.violations.map((v) => ({ term: v.term, units: v.units, oversized: v.oversized })),
    })),
    missingMajors: [...missingMajors.entries()],
    missingCourses: [...missingCourses.entries()],
    degreeMismatch: [...degreeMismatch.entries()],
    duplicates: dupTotal,
    duplicateTitlesSameTerm: dupTitles,
  }, null, 2), 'utf8');
  console.log('report:', REPORT);
}

if (!APPLY) { console.log('\n(dry) برای اجرا: --apply --backup <file.jsonl>'); await pool.end(); process.exit(0); }

// ── اجرا ──
// ⚠️ نوشتنِ تک‌ردیفی روی دیتابیسِ راه‌دور (تونل SSH) برای ~۱۱٬۰۰۰ ردیف بیش از
//    حد کند است و تراکنش را به تایم‌اوت می‌برد. پس همهٔ نوشتن‌ها دسته‌ای‌اند:
//    درجِ چندردیفی VALUES + به‌روزرسانیِ دسته‌ای با unnest.
if (!existsSync(dirname(BACKUP))) mkdirSync(dirname(BACKUP), { recursive: true });
const log: any[] = [];
const client = await pool.connect();
let vMade = 0, iRows = 0, uRows = 0, eRows = 0, links = 0;

const chunk = <T,>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

try {
  await client.query('BEGIN');

  // ── ۱) نسخه‌ها (دسته‌ای، ۲۰۰ نسخه در هر کوئری) ──
  const toCreate = plan.filter((p) => !p.verId);
  for (const ch of chunk(toCreate, 200)) {
    const vals: unknown[] = [];
    const tuples = ch.map((p, i) => {
      const b = i * 10;
      vals.push(
        p.majorId, p.degreeLevelId, p.versionCode, p.title, p.kind,
        p.from, p.to, String(p.total || 0), JSON.stringify(p.byRole), UNI
      );
      return `($${b + 1},$${b + 2},NULL,$${b + 3},$${b + 4},'DRAFT',$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`;
    });
    const res = await client.query(
      `INSERT INTO curriculum_versions
         ("majorId","degreeLevelId","trackId","versionCode","title","status","catalogKind",
          "entryYearFrom","entryYearTo","totalRequiredUnits","minRoleUnits","universityId")
       VALUES ${tuples.join(',')}
       RETURNING id, "majorId", "degreeLevelId", "versionCode", "catalogKind", "entryYearFrom", "entryYearTo"`,
      vals
    );
    for (const r of res.rows) {
      const k = `${r.majorId}|${r.degreeLevelId}|${r.entryYearFrom}|${r.entryYearTo ?? 'null'}|${r.catalogKind}`;
      const p = plan.find((x) => x.key === k);
      if (p) p.verId = r.id;
      log.push({ entity: 'version', id: r.id, key: r.versionCode, kind: r.catalogKind });
      vMade++;
    }
  }

  // ── ۲) تفکیک ردیف‌ها به «درج» و «به‌روزرسانی» ──
  type Ins = { versionId: number; courseId: number; role: string; units: string | null; req: number; sem: number | null };
  type Upd = { versionId: number; courseId: number; role: string; req: number; sem: number | null };
  const ins: Ins[] = [];
  const upd: Upd[] = [];

  const verIds = plan.map((p) => p.verId!).filter(Boolean);
  const existingCc = verIds.length
    ? (await client.query(
        `SELECT "curriculumVersionId", "courseId", "roleType", "isRequired", "recommendedSemester"
           FROM curriculum_courses WHERE "curriculumVersionId" = ANY($1::int[])`,
        [verIds]
      )).rows
    : [];
  const exMap = new Map<string, any>(
    existingCc.map((r: any) => [`${r.curriculumVersionId}|${r.courseId}`, r])
  );

  for (const p of plan) {
    const verId = p.verId!;
    const itemByCode = new Map(p.items.map((it) => [it.code, it]));
    for (const r of p.rowsPlanned) {
      const it = itemByCode.get(r.courseCode);
      if (!it) continue;
      const role = it.role ?? 'CORE';
      const req = it.req === 'خیر' ? 0 : 1;
      const ex = exMap.get(`${verId}|${it.courseId}`);
      if (!ex) {
        ins.push({ versionId: verId, courseId: it.courseId, role, units: it.units != null ? String(it.units) : null, req, sem: r.recommendedSemester });
        continue;
      }
      const semDiff = r.recommendedSemester != null && Number(ex.recommendedSemester ?? -1) !== r.recommendedSemester;
      const roleDiff = ex.roleType !== role;
      const reqDiff = Number(ex.isRequired ?? 1) !== req;
      if (!semDiff && !roleDiff && !reqDiff) { eRows++; continue; }
      upd.push({ versionId: verId, courseId: it.courseId, role, req, sem: r.recommendedSemester });
    }
  }

  // ── ۳) درجِ دسته‌ای (۴۰۰ ردیف × ۹ ستون = ۳۶۰۰ پارامتر) ──
  for (const ch of chunk(ins, 400)) {
    const vals: unknown[] = [];
    const tuples = ch.map((r, i) => {
      const b = i * 9;
      vals.push(r.versionId, r.courseId, r.role, r.units, r.req,
        r.role === 'ELECTIVE' ? 1 : 0, r.req, r.sem, UNI);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9})`;
    });
    await client.query(
      `INSERT INTO curriculum_courses
         ("curriculumVersionId","courseId","roleType","units","isRequired",
          "isElective","isGraduationRequired","recommendedSemester","universityId")
       VALUES ${tuples.join(',')}`,
      vals
    );
    iRows += ch.length;
  }

  // ── ۴) به‌روزرسانیِ دسته‌ای با unnest ──
  for (const ch of chunk(upd, 2000)) {
    await client.query(
      `UPDATE curriculum_courses c
          SET "recommendedSemester" = v.sem,
              "roleType" = v.role,
              "isElective" = CASE WHEN v.role = 'ELECTIVE' THEN 1 ELSE 0 END,
              "isRequired" = v.req,
              "isGraduationRequired" = v.req
         FROM (
           SELECT unnest($1::int[]) AS version_id,
                  unnest($2::int[]) AS course_id,
                  unnest($3::int[]) AS sem,
                  unnest($4::text[]) AS role,
                  unnest($5::int[]) AS req
         ) v
        WHERE c."curriculumVersionId" = v.version_id AND c."courseId" = v.course_id`,
      [
        ch.map((x) => x.versionId), ch.map((x) => x.courseId),
        ch.map((x) => x.sem), ch.map((x) => x.role), ch.map((x) => x.req),
      ]
    );
    uRows += ch.length;
  }

  // ── ۵) لینک نسخهٔ عادی → نسخهٔ جبرانی ──
  const normalIds: number[] = [];
  const compIds: number[] = [];
  for (const p of plan.filter((x) => x.kind === 'NORMAL' && x.verId)) {
    const comp = plan.find(
      (x) => x.kind === 'COMPENSATORY' && x.majorId === p.majorId &&
        x.degreeLevelId === p.degreeLevelId && x.from === p.from && x.to === p.to
    );
    if (!comp?.verId) continue;
    normalIds.push(p.verId!);
    compIds.push(comp.verId);
  }
  if (normalIds.length) {
    await client.query(
      `UPDATE curriculum_versions v
          SET "compensatoryVersionId" = m.comp_id
         FROM (SELECT unnest($1::int[]) AS normal_id, unnest($2::int[]) AS comp_id) m
        WHERE v.id = m.normal_id
          AND v."compensatoryVersionId" IS DISTINCT FROM m.comp_id`,
      [normalIds, compIds]
    );
    links = normalIds.length;
  }

  await client.query('COMMIT');
} catch (e: any) {
  await client.query('ROLLBACK');
  console.error('ROLLBACK:', e.message);
  process.exit(1);
} finally {
  client.release();
}

writeFileSync(BACKUP, log.map((r) => JSON.stringify(r)).join('\n') + (log.length ? '\n' : ''), 'utf8');
console.log(`apply → نسخه‌های ساخته‌شده: ${vMade} | درج: ${iRows} | به‌روزرسانی: ${uRows} | بدون تغییر: ${eRows} | لینک عادی↔جبرانی: ${links}`);
console.log('backup:', BACKUP, log.length, 'versions');
console.log('rollback: DELETE FROM curriculum_courses WHERE "curriculumVersionId" = ANY(ids); DELETE FROM curriculum_versions WHERE id = ANY(ids);');
await pool.end();
