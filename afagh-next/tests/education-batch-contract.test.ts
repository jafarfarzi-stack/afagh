/**
 * ════════════════════════════════════════════════════════════════════════
 *  گاردِ «بارگذاری دستهای» مهاجرت آموزشی
 *
 *  ریشهٔ گلوگاه: نسخهٔ قبل برای هر ردیف LT55/SUS/StudentLessonsHistory یک
 *  SELECT ارائه و یک INSERT جداگانه میفرستاد (≈۲٫۵ میلیون round-trip،
 *  ۶٬۹۰۱ ثانیه). علاوه بر آن schedules هیچ ایندکس یکتایی ندارد، پس
 *  «ON CONFLICT DO NOTHING» قدیم هیچوقت جلوی تکرار را نمیگرفت.
 *
 *  دو لایه:
 *   ۱) قرارداد متن سورس: جریانیبودن TSVها، نبود SELECT ردیفبهردیف،
 *      ایدمپاتنسی schedules با Set، بکاپ اجباری پیش از حذف تکراریها.
 *   ۲) رفتار SQL واقعی روی PGlite: unnest، تکراری درون یک دسته،
 *      ایدمپاتنسی اجرای مجدد، و حذف امن تکراریها.
 * ════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const read = (p: string): string => readFileSync(path.join(ROOT, p), 'utf8');

const MIGRATE = read('scripts/migrate-legacy-education.mjs');
const LIB = read('scripts/lib/legacy-education-batch.mjs');
const ORCH = read('scripts/weekly-uems-sync.mjs');

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string): void => {
  if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); }
};
const eq = (a: unknown, b: unknown, m: string): void => ok(a === b, `${m} (got ${String(a)}, want ${String(b)})`);

async function main(): Promise<void> {
  // ── ۱) قرارداد سورس ────────────────────────────────────────────────────
  const lib: any = await import('../scripts/lib/legacy-education-batch.mjs');
  const mod: any = await import('../scripts/migrate-legacy-education.mjs');

  ok(MIGRATE.includes("from './lib/legacy-education-batch.mjs'"), 'مهاجرت از لایهٔ مشترک import میکند');
  ok(LIB.includes('createReadStream') && LIB.includes('createInterface') &&
     MIGRATE.includes('streamFrom(DIR, name)'),
    'TSVهای بزرگ جریانی خوانده میشوند (حافظهٔ ثابت)');
  for (const f of ['LT55_sessions', 'SUS_grades', 'StudentLessonsHistory']) {
    ok(MIGRATE.includes(`readTsvStream('${f}')`), `${f} جریانی خوانده میشود`);
  }
  ok(!MIGRATE.includes('SELECT id FROM course_offerings WHERE'),
    'SELECT ارائه بهازای هر ردیف حذف شده است');
  ok(MIGRATE.includes('offeringIdByKey.get(') && MIGRATE.includes('loadOfferings()'),
    'ارائهها یکبار در نقشهٔ حافظه بار میشوند');
  ok(MIGRATE.includes('existingSchedules.has(key)') && MIGRATE.includes('existingSchedules.add(key)'),
    'schedules با Set ایدمپاتنت شده (نه ON CONFLICT بیاثر)');
  ok(!/BULK\.schedules[^\n]*ON CONFLICT/.test(LIB), 'schedules دیگر ON CONFLICT بیکار ندارد');
  ok(MIGRATE.includes('schedNullTime++'), 'زمان نامعتبر ردیف را میشکند نه کل قطعه را');
  ok(MIGRATE.includes('pathToFileURL(process.argv[1])'), 'import توسط تست اثر جانبی ندارد');
  ok(MIGRATE.includes("Number(args.chunk || CHUNK_DEFAULT)"), '--chunk قابلتنظیم است');
  ok(MIGRATE.includes('--dedupe-schedules نیازمند --backup'), 'حذف تکراریها بدون بکاپ رد میشود');
  ok(MIGRATE.includes("await client.query('BEGIN')") && MIGRATE.includes("await client.query('COMMIT')"),
    'بکاپ و حذف در یک تراکنشاند');
  ok(LIB.includes("\"roomId\" IS NULL AND \"examDate\" IS NULL") && LIB.includes("'CLASS'"),
    'حذف فقط ردیفهای ساختهشده توسط مهاجرت را لمس میکند');
  ok(LIB.includes('d.rn > 1') && LIB.includes('ORDER BY id'), 'کمترین id نگه داشته میشود');
  ok(ORCH.includes("file: 'migrate-legacy-education.mjs'") && ORCH.includes("'--dir', eduDir"),
    'قرارداد اورکستراتور بدون تغییر باقی ماند');
  for (const t of ['courses', 'offerings', 'enrollments', 'legacyGrades']) {
    ok(lib.BULK[t].sql.includes('unnest(') && lib.BULK[t].sql.includes('ON CONFLICT DO NOTHING'),
      `${t} با unnest و ON CONFLICT DO NOTHING نوشته میشود`);
  }
  eq(lib.CHUNK_DEFAULT, 2000, 'اندازهٔ پیشفرض قطعه ۲۰۰۰ ردیف است');
  eq(lib.BULK.enrollments.casts.length, 7, 'enrollments هفت آرایهٔ همطول دارد');
  eq(lib.BULK.legacyGrades.casts.length, 8, 'legacy_grades هشت آرایهٔ همطول دارد');
  ok(MIGRATE.includes('loadKeySet(EXISTING_KEYS_SQL.enrollments)') &&
     MIGRATE.includes('loadKeySet(EXISTING_KEYS_SQL.legacyGrades)'),
    'کلیدهای موجود enrollments/legacy_grades یکبار بار میشوند');
  ok(MIGRATE.includes('existingEnrollments.has(key)') && MIGRATE.includes('existingHistory.has(key)'),
    'ردیفهای از قبل موجود پیش از INSERT حذف میشوند');
  ok(LIB.includes('array_agg') && LIB.includes('IS NOT NULL'),
    'کوئری کلیدها فشرده است و NULLها را به ON CONFLICT میسپارد');
  eq(lib.enrollmentKey(100, 1), '100|1', 'کلید enrollments با ایندکس یکتا همراستا است');
  eq(lib.historyKey('UEMS', 'S1', '14051', 'C1'), 'UEMS|S1|14051|C1',
    'کلید legacy_grades با ایندکس چهارستونی همراستا است');

  // ── توابع خالص ──────────────────────────────────────────────────────────
  eq(mod.toClock('1545'), '15:45', 'HHMM به ساعت تبدیل میشود نه ۲۵:۴۵');
  eq(mod.toClock('730'), '07:30', 'HHMM سه رقمی صفرگذاری میشود');
  eq(mod.toClock('8:30'), '08:30', 'HH:MM پذیرفته میشود');
  eq(mod.toClock('2560'), null, 'دقیقهٔ نامعتبر → null');
  eq(mod.toClock(''), null, 'زمان خالی → null');
  eq(mod.toOurTerm('402'), '13402', 'کد ترم سه رقمی بسط مییابد');
  eq(lib.scheduleKey(1, 7, null, '07:30:00', '09:00:00'), lib.scheduleKey(1, 7, null, '07:30', '09:00'),
    'زمان DB (HH:MM:SS) و منبع (HH:MM) یک کلید میسازند');
  ok(lib.scheduleKey(1, 7, 1, '07:30', '09:00') !== lib.scheduleKey(1, 7, 2, '07:30', '09:00'),
    'روز متفاوت کلید متفاوت میدهد');
  ok(lib.scheduleKey(1, 7, 1, '07:30', '09:00') !== lib.scheduleKey(2, 7, 1, '07:30', '09:00'),
    'دانشگاه متفاوت کلید متفاوت میدهد');

  // ── خواندن جریانی واقعی (BOM + CRLF + خط خالی) ───────────────────────────
  const tmp = mkdtempSync(path.join(tmpdir(), 'edu-stream-'));
  const tmpFile = path.join(tmp, 'mini.tsv');
  writeFileSync(tmpFile, '\uFEFFA\tB\r\n1\t2\r\n\r\n3\t4\r\n', 'utf8');
  const seen: any[] = [];
  for await (const x of lib.readTsvStream(tmp, 'mini')) seen.push(x);
  eq(seen.length, 2, 'دو ردیف داده خوانده شد (خط خالی رد شد)');
  eq(seen[0].header[0], 'A', 'BOM از سرستون اول حذف شد');
  eq(seen[0].row[1], '2', 'CRLF درست split شد');
  eq(seen[1].row[0], '3', 'ردیف دوم خوانده شد');
  unlinkSync(tmpFile);
  rmdirSync(tmp);

  // ── ۲) رفتار SQL واقعی روی PGlite ──────────────────────────────────────
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE courses (
      id serial PRIMARY KEY, "universityId" int, code varchar(20) NOT NULL,
      title varchar(150) NOT NULL, units numeric(3,1) NOT NULL,
      "practicalUnits" numeric(4,2), "courseType" varchar(50), "departmentId" int,
      UNIQUE ("universityId", code)
    );
    CREATE TABLE course_offerings (
      id serial PRIMARY KEY, "universityId" int, "termId" int, "courseId" int,
      "groupNumber" int, "isActive" int NOT NULL, capacity int NOT NULL
    );
    CREATE UNIQUE INDEX uq_offerings ON course_offerings ("termId","courseId","groupNumber") WHERE "isActive"=1;
    CREATE TABLE schedules (
      id serial PRIMARY KEY, "universityId" int, "offeringId" int NOT NULL,
      "scheduleType" varchar(20) NOT NULL, "dayOfWeek" int,
      "startTime" time NOT NULL, "endTime" time NOT NULL,
      "roomId" int, "examDate" date
    );
    CREATE TABLE enrollments (
      id serial PRIMARY KEY, "universityId" int, "studentId" int NOT NULL,
      "offeringId" int NOT NULL, status varchar(30) NOT NULL,
      "gradeValue" numeric(4,2), "gradeStatus" varchar(20) NOT NULL, "enrolledByUserId" int,
      UNIQUE ("studentId","offeringId")
    );
    CREATE TABLE legacy_grades (
      id serial PRIMARY KEY, "sourceCode" varchar(20), "studentCode" varchar(30),
      "termCode" varchar(10), "courseCode" varchar(30), "gradeValue" numeric(4,2),
      "gradeRaw" varchar(20), "universityId" int, "compareStatus" varchar(20),
      UNIQUE ("sourceCode","studentCode","termCode","courseCode")
    );
  `);
  const count = async (t: string): Promise<number> => {
    const rows: any[] = (await db.query(`SELECT count(*)::int AS n FROM ${t}`)).rows as any[];
    return Number(rows[0].n);
  };

  // BulkWriter: مرز قطعهها
  const cw = new lib.BulkWriter(db, lib.BULK.courses, { chunk: 2, label: 'courses' });
  for (const r of [
    [1, 'C1', 'درس یک', 3, 1, 'عمومی', 4],
    [1, 'C2', 'درس دو', 2, 0, 'پایه', 4],
    [1, 'C1', 'تکراری', 3, 1, 'عمومی', 4], // همان دسته/دستهٔ بعد
    [1, 'C3', 'درس سه', 4, 2, 'تخصصی', 4],
    [1, 'C4', 'درس چهار', 3, 0, 'تخصصی', 4],
  ]) await cw.push(r);
  await cw.flush();
  eq(cw.statements, 3, 'پنج تاپل با chunk=2 ⇒ سه statement');
  eq(cw.rows, 5, 'همهٔ تاپلها شمارش شدند');
  eq(await count('courses'), 4, 'تکراری درون دستهها درج نشد (ON CONFLICT)');
  ok(cw.affected >= 0, 'BulkWriter شمارندهٔ affected را نگه میدارد');

  let threw = false;
  try { await cw.push([1, 'BAD']); } catch { threw = true; }
  ok(threw, 'تاپل با تعداد ستون نادرست fail-closed است');

  // offerings: ایندکس جزئی + تکراری درون یک دسته
  const ow = new lib.BulkWriter(db, lib.BULK.offerings, { chunk: 10 });
  for (let i = 0; i < 4; i++) await ow.push([1, 10, 1, 1, 1, 200]);
  await ow.push([1, 10, 2, 1, 1, 200]);
  await ow.flush();
  eq(await count('course_offerings'), 2, 'چهار ردیف تکراری offering ⇒ فقط دو ردیف درج شد');

  // enrollments: تکراری (studentId, offeringId) درون یک statement
  const ew = new lib.BulkWriter(db, lib.BULK.enrollments, { chunk: 10 });
  for (const r of [
    [1, 100, 1, 'FINALIZED', 18.5, 'FINALIZED', null],
    [1, 100, 1, 'FINALIZED', 18.5, 'FINALIZED', null], // تکراری همان دسته
    [1, 101, 1, 'REGISTERED', null, 'FINALIZED', null],
    [1, 100, 2, 'FINALIZED', 15, 'FINALIZED', null],
  ]) await ew.push(r);
  await ew.flush();
  eq(await count('enrollments'), 3, 'تکراری درون دستهٔ enrollments خطا نمیدهد و حذف میشود');
  const againEw = new lib.BulkWriter(db, lib.BULK.enrollments, { chunk: 10 });
  for (const r of [
    [1, 100, 1, 'FINALIZED', 18.5, 'FINALIZED', null],
    [1, 101, 1, 'REGISTERED', null, 'FINALIZED', null],
    [1, 100, 2, 'FINALIZED', 15, 'FINALIZED', null],
  ]) await againEw.push(r);
  await againEw.flush();
  eq(await count('enrollments'), 3, 'اجرای مجدد enrollments ایدمپاتنت است');

  // legacy_grades: همان الگو با کلید چهارستونی
  const gw = new lib.BulkWriter(db, lib.BULK.legacyGrades, { chunk: 10 });
  const g = (st: string, term: string, course: string, mark: number | null) =>
    ['UEMS', st, term, course, mark, '10', 1, 'PENDING'];
  for (const r of [g('S1', '14051', 'C1', 17), g('S1', '14051', 'C1', 17), g('S2', '14051', 'C1', 12)]) await gw.push(r);
  await gw.flush();
  eq(await count('legacy_grades'), 2, 'تکراری درون دستهٔ legacy_grades حذف شد');
  const gw2 = new lib.BulkWriter(db, lib.BULK.legacyGrades, { chunk: 10 });
  for (const r of [g('S1', '14051', 'C1', 17), g('S2', '14051', 'C1', 12)]) await gw2.push(r);
  await gw2.flush();
  eq(await count('legacy_grades'), 2, 'اجرای مجدد legacy_grades ایدمپاتنت است');

  // کوئری کلیدهای موجود: array_agg + کنارگذاشتن NULLها
  const ekRows: any[] = (await db.query(lib.EXISTING_KEYS_SQL.enrollments)).rows as any[];
  const ek: string[] = Array.isArray(ekRows[0].keys) ? ekRows[0].keys : [];
  eq(ek.length, 3, 'array_agg سه کلید enrollments برگرداند');
  ok(ek.includes(lib.enrollmentKey(100, 1)), 'فرمت کلید enrollments با ایندکس DB یکی است');
  await db.exec(`INSERT INTO legacy_grades ("sourceCode","studentCode","termCode","courseCode","gradeValue")
                 VALUES (NULL,'S3','14051','C1',10);`);
  const hkRows: any[] = (await db.query(lib.EXISTING_KEYS_SQL.legacyGrades)).rows as any[];
  const hk: string[] = Array.isArray(hkRows[0].keys) ? hkRows[0].keys : [];
  eq(hk.length, 2, 'ردیف با کلید NULL از Set کنار گذاشته شد (تصمیم به ON CONFLICT سپرده میشود)');
  ok(hk.includes(lib.historyKey('UEMS', 'S1', '14051', 'C1')),
    'فرمت کلید legacy_grades با ایندکس DB یکی است');

  // schedules: بدون ایندکس یکتا ⇒ ایدمپاتنسی فقط با Set سمت JS
  const sw = new lib.BulkWriter(db, lib.BULK.schedules, { chunk: 10 });
  for (let i = 0; i < 3; i++) await sw.push([1, 1, 'CLASS', 2, '07:30', '09:00']);
  await sw.flush();
  eq(await count('schedules'), 3, 'بدون ایندکس یکتا، SQL بهتنهایی تکرار را جلوگیری نمیکند (پس Set لازم است)');

  // ── حذف امن تکراریها ───────────────────────────────────────────────────
  await db.exec(`
    TRUNCATE schedules RESTART IDENTITY;
    INSERT INTO schedules ("universityId","offeringId","scheduleType","dayOfWeek","startTime","endTime","roomId","examDate") VALUES
      (1,1,'CLASS',2,'07:30','09:00',NULL,NULL),
      (1,1,'CLASS',2,'07:30','09:00',NULL,NULL),
      (1,1,'CLASS',2,'07:30','09:00',NULL,NULL),
      (1,1,'CLASS',2,'07:30','09:00',5,NULL),
      (2,1,'CLASS',2,'07:30','09:00',NULL,NULL),
      (2,1,'CLASS',2,'07:30','09:00',NULL,NULL),
      (1,1,'EXAM',2,'07:30','09:00',NULL,NULL),
      (1,1,'EXAM',2,'07:30','09:00',NULL,NULL);
  `);
  const doomed: any[] = (await db.query(lib.DEDUPE_SELECT_SQL, [1])).rows as any[];
  eq(doomed.length, 2, 'فقط دو ردیف تکراریِ uni=1/CLASS/بدون اتاق قابل حذفاند');
  ok(doomed.every(r => r.roomId === null && r.universityId === 1 && r.scheduleType === 'CLASS'),
    'هیچ ردیف اتاقدار / دانشگاه دیگر / EXAM در لیست حذف نیست');
  const del: any = await db.query(lib.DEDUPE_DELETE_SQL, [1]);
  eq(Number(del.affectedRows ?? del.rowCount ?? 0), 2, 'دقیقاً همان دو ردیف حذف شدند');
  eq(await count('schedules'), 6, 'شش ردیف باقی ماند');
  const survivors: any[] = (await db.query('SELECT id, "universityId", "scheduleType", "roomId" FROM schedules ORDER BY id')).rows as any[];
  eq(Number(survivors[0].id), 1, 'کمترین id نگه داشته شد');
  ok(survivors.some(r => r.roomId === 5), 'ردیف اتاقدار دستنخورده ماند');
  eq(survivors.filter(r => r.universityId === 2).length, 2, 'ردیفهای دانشگاه دیگر دستنخورده ماندند');
  eq(survivors.filter(r => r.scheduleType === 'EXAM').length, 2, 'ردیفهای EXAM دستنخورده ماندند');
  const again: any[] = (await db.query(lib.DEDUPE_SELECT_SQL, [1])).rows as any[];
  eq(again.length, 0, 'اجرای مجدد dedupe بیمضر است');

  await db.close();
  console.log(`\n${pass} قبول / ${fail} رد`);
  if (fail) process.exit(1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
