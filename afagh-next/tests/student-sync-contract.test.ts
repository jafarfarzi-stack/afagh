/**
 * ════════════════════════════════════════════════════════════════════════
 *  گاردِ «همگامسازی هفتگی وضعیت دانشجویان»
 *
 *  ریشهٔ شکاف: MAININFO_students.tsv هر هفته استخراج میشد ولی هیچ گامی آن را
 *  نمیخواند ⇒ students.status و students.samaStatusCode روی لایو کهنه مانده
 *  بودند (۲۷۱ وضعیت اشتباه، کد خام سما برای همهٔ ۳۹٬۹۴۶ دانشجو خالی).
 *
 *  سه لایهٔ محک:
 *   ۱) قرارداد سورس و برابری نگاشت با Single Sourceـه UI (student-labels.ts).
 *   ۲) توابع خالص: نگاشت fail-closed، اعتبار کد، buildPlan (diff/گزارش شکاف)،
 *      خواندن TSV با BOM/CRLF.
 *   ۳) رفتار SQL واقعی روی PGlite: پین روی id/code/uni، فقط دو ستون،
 *      IS DISTINCT FROM، ایدمپاتنسی، بکاپ و بازگردانی.
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

const MIGRATE = read('scripts/migrate-legacy-students.mjs');
const EXTRACT = read('scripts/extract-legacy-students.mjs');
const MAPLIB = read('scripts/lib/student-status-map.mjs');
const ORCH = read('scripts/weekly-uems-sync.mjs');
const BAT = read('scripts/run-weekly-uems-sync.bat');
const ENVEX = read('scripts/weekly-uems-sync.env.example');
const LABELS = read('src/lib/student-labels.ts');
const PKG = read('package.json');

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string): void => {
  if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); }
};
const eq = (a: unknown, b: unknown, m: string): void => ok(a === b, `${m} (got ${String(a)}, want ${String(b)})`);

async function main(): Promise<void> {
  const map: any = await import('../scripts/lib/student-status-map.mjs');
  const mod: any = await import('../scripts/migrate-legacy-students.mjs');
  const ext: any = await import('../scripts/extract-legacy-students.mjs');

  // ── ۱) نگاشت مشترک = Single Sourceـه UI ────────────────────────────────
  const block = LABELS.match(/export const SAMA_STATUS_TO_INTERNAL[^=]*=\s*\{([\s\S]*?)\};/);
  ok(!!block, 'SAMA_STATUS_TO_INTERNAL در student-labels.ts پیدا شد');
  const uiMap: Record<string, string> = {};
  for (const m of (block?.[1] ?? '').matchAll(/'(\d+)'\s*:\s*'([A-Z_]+)'/g)) uiMap[m[1]] = m[2];
  eq(Object.keys(uiMap).length, Object.keys(map.SAMA_STATUS_MAP).length,
    'تعداد کدهای نگاشت اسکریپت و UI برابر است');
  for (const [code, want] of Object.entries(uiMap)) {
    eq(map.SAMA_STATUS_MAP[code], want, `کد ${code} همنگاشت UI است`);
  }
  eq(map.mapSamaStatus('26'), 'ACTIVE', 'کد ۲۶ = در حال تحصیل آزاد');
  eq(map.mapSamaStatus('43'), 'GRADUATED', 'کد ۴۳ در افاق = فارغالتحصیل');
  eq(map.mapSamaStatus('43', 'ZARINE'), 'NO_SHOW', 'استثنای زرینه اعمال میشود');
  eq(map.mapSamaStatus(''), null, 'کد تهی → null (fail-closed، نه UNKNOWN)');
  eq(map.mapSamaStatus('NULL'), null, 'لیترال NULL قدیمی → null');
  eq(map.mapSamaStatus('999'), null, 'کد ناشناخته → null');
  eq(map.mapSamaStatus(null), null, 'null → null');
  ok(map.isValidStudentCode('4051223711'), 'کد ۱۰رقمی معتبر است');
  ok(map.isValidStudentCode('9712451'), 'کد ۷رقمی قدیمی معتبر است');
  ok(map.isValidStudentCode('405105919001'), 'کد ۱۲رقمی سنجش معتبر است');
  ok(!map.isValidStudentCode('961'), 'کد ۳رقمی اداری UEMS رد میشود');
  ok(!map.isValidStudentCode('901115109990111'), 'کد ۱۵رقمی (بیش از varchar(14)) رد میشود');
  ok(!map.isValidStudentCode('ABC12345'), 'کد غیررقمی رد میشود');
  ok(!map.isValidStudentCode(''), 'کد تهی رد میشود');

  // ── ۲) قرارداد استخراجگر ───────────────────────────────────────────────
  ok(EXTRACT.includes("'-u', '-o'") && EXTRACT.includes("new TextDecoder('utf-16le')"),
    'خروجی sqlcmd UTF-16LE جریانی به UTF-8 برمیگردد');
  ok(EXTRACT.includes('const CH = 2 * 1024 * 1024'), 'قطعههای دیکود زوجاند');
  ok(EXTRACT.includes("'-h', '-1'") && EXTRACT.includes('writeSync(fd, Buffer.from(spec.header'),
    'سرستون صریح نوشته میشود (بدون وابستگی به سرستون sqlcmd)');
  ok(EXTRACT.includes('ISNULL(') && EXTRACT.includes('CONVERT(varchar(60)'),
    'ISNULL/CONVERT جلوی لیترال NULL را میگیرد');
  ok(EXTRACT.includes("'-b'") && EXTRACT.includes('isSqlError'), 'خطای SQL fail-closed است');
  ok(EXTRACT.includes('dbo.MAININFO') && EXTRACT.includes('dbo.People'),
    'اسکیما بهصراحت dbo قید شده (دو جدول People در UEMS وجود دارد)');
  ok(EXTRACT.includes('byName[name] !== want'), 'شمارش فایل با COUNT(*) منبع تطبیق داده میشود');
  ok(EXTRACT.includes('uniq.size !== codes.length'), 'کد تکراری/تهی استخراج را متوقف میکند');
  ok(EXTRACT.includes('statusDistribution') && EXTRACT.includes('_manifest.json'),
    'manifest شامل توزیع STATUS و هش فایلهاست');
  ok(EXTRACT.includes('backupExisting') && EXTRACT.includes('.bak-'),
    'آینهکردن پیش از بازنویسی بکاپ میگیرد');
  ok(EXTRACT.includes('pathToFileURL(process.argv[1])'), 'import توسط تست اثر جانبی ندارد');
  eq(ext.STUDENT_HEADERS.MAININFO_students.split('\t').length, 32, 'MAININFO دقیقاً ۳۲ ستون دارد');
  eq(ext.STUDENT_HEADERS.People_identity.split('\t').length, 13, 'People دقیقاً ۱۳ ستون دارد');
  ok(ext.STUDENT_HEADERS.MAININFO_students.startsWith('STNO\tOLDSTNO\tNAME\tSEX\tSTATUS'),
    'سرستون با MAININFO_students.tsv قدیمی سازگار است');
  eq(ext.STUDENT_FILES.length, 2, 'دو فایل TSV خروجی است');

  // ── ۳) قرارداد موتور همگامسازی ─────────────────────────────────────────
  ok(MIGRATE.includes("from './lib/student-status-map.mjs'"), 'موتور از نگاشت مشترک استفاده میکند');
  ok(mod.STUDENT_UPDATE_SQL.includes('SET status = v.st, "samaStatusCode" = v.raw'),
    'فقط status و samaStatusCode نوشته میشوند');
  ok(!/INSERT INTO students/i.test(MIGRATE), 'هیچ دانشجوی تازهای ساخته نمیشود');
  ok(!/DELETE FROM students/i.test(MIGRATE), 'هیچ دانشجویی حذف نمیشود');
  ok(mod.STUDENT_UPDATE_SQL.includes('s.id = v.id') &&
     mod.STUDENT_UPDATE_SQL.includes('s."studentCode" = v.code') &&
     mod.STUDENT_UPDATE_SQL.includes('s."universityId" = v.uni'),
    'UPDATE روی id + code + universityId پین شده است');
  ok(mod.STUDENT_UPDATE_SQL.includes('IS DISTINCT FROM'), 'UPDATE بینه / ایدمپاتنت است');
  ok(mod.STUDENT_UPDATE_SQL.includes('unnest(') && mod.STUDENT_UPDATE_SQL.includes('RETURNING'),
    'بروزرسانی دستهای است و تعداد واقعی را برمیگرداند');
  ok(mod.STUDENT_BACKUP_SQL.includes('WHERE id = ANY($1::int[])'), 'بکاپ دقیقاً ردیفهای هدف را میگیرد');
  ok(mod.STUDENTS_SQL.includes('"universityId" = $1'), 'فقط دانشجویان همان دانشگاه خوانده میشوند');
  ok(MIGRATE.includes('--apply نیازمند --backup'), 'apply بدون بکاپ رد میشود');
  ok(MIGRATE.includes('if (RESTORE)') && MIGRATE.includes('STUDENT_UPDATE_SQL'),
    'بازگردانی از همان SQL بروزرسانی استفاده میکند');
  ok(MIGRATE.includes('GATE under') && MIGRATE.includes('matchRate >= MIN_MATCH'), 'گیت تطبیق وجود دارد');
  ok(MIGRATE.includes('بیش از ۱٪ کد STATUS ناشناخته'), 'کد ناشناخته انبوه کل اجرا را متوقف میکند');
  ok(MIGRATE.includes('updated !== plan.toUpdate.length'), 'نوشتن همزمان شناسایی میشود');
  ok(MIGRATE.includes('missingInAfagh') && MIGRATE.includes('onlyInAfagh'),
    'گزارش شکاف دوسویه تولید میشود');
  ok(MIGRATE.includes('if (REPORT) writeFileSync'), 'گزارش JSON قابل ذخیره است');
  ok(MIGRATE.includes('pathToFileURL(process.argv[1])'), 'import توسط تست اثر جانبی ندارد');
  ok(MAPLIB.includes("if (!c || /^null$/i.test(c)) return null"), 'نگاشت ناشناخته را null میدهد نه UNKNOWN');

  // ── ۴) buildPlan خالص (diff + شکاف + fail-closed) ───────────────────────
  const sourceRows = [
    { code: '4051223711', raw: '26', name: 'A', nationalCode: '1001', termCode: '14051', isActive: '1' },
    { code: '4001248003', raw: '25', name: 'B', nationalCode: '1002', termCode: '14001', isActive: '2' },
    { code: '4051292701', raw: '22', name: 'C', nationalCode: '1003', termCode: '14051', isActive: '2' },
    { code: '4051245706', raw: '', name: 'D', nationalCode: '1004', termCode: '14051', isActive: '2' },
    { code: '9321111001', raw: 'NULL', name: 'E', nationalCode: '1005', termCode: '13991', isActive: '2' },
    { code: '961', raw: '1', name: 'staff', nationalCode: '', termCode: '13001', isActive: '2' },
    { code: '901115109990111', raw: '2', name: 'x', nationalCode: '', termCode: '13901', isActive: '2' },
    { code: '', raw: '1', name: '', nationalCode: '', termCode: '', isActive: '' },
    { code: '4051223711', raw: '1', name: 'dup', nationalCode: '', termCode: '', isActive: '' },
    { code: '4051999999', raw: '21', name: 'new', nationalCode: '2741550689', termCode: '14051', isActive: '2' },
    { code: '4051223712', raw: '26', name: 'F', nationalCode: '1006', termCode: '14051', isActive: '1' },
    { code: '4051223713', raw: '1', name: 'G', nationalCode: '1007', termCode: '14051', isActive: '1' },
  ];
  const dbRows = [
    { id: 1, code: '4051223711', status: 'NO_SHOW', raw: null, uni: 1 },
    { id: 2, code: '4001248003', status: 'ACTIVE', raw: null, uni: 1 },
    { id: 3, code: '4051292701', status: 'SUSPENDED', raw: '22', uni: 1 },
    { id: 4, code: '4051245706', status: 'UNKNOWN', raw: null, uni: 1 },
    { id: 5, code: '9321111001', status: 'ACTIVE', raw: null, uni: 1 },
    { id: 6, code: '9999999999', status: 'ACTIVE', raw: null, uni: 1 },
    { id: 7, code: '4051223712', status: 'ACTIVE', raw: null, uni: 1 },
    { id: 8, code: '4051223712', status: 'ACTIVE', raw: null, uni: 1 },
    { id: 9, code: '4051223713', status: 'ACTIVE', raw: null, uni: 2 },
  ];
  const people = new Map([['2741550689', { firstName: 'فرزانه', lastName: 'آذرورجوی', fatherName: '', nationalCode: '2741550689' }]]);
  const plan = mod.buildPlan(sourceRows, dbRows, 1, { people, uniCode: 'AFAGH' });
  eq(plan.toUpdate.length, 1, 'فقط یک ردیف واجد بروزرسانی است');
  eq(plan.toUpdate[0].code, '4001248003', 'ردیف درست شناسایی شد');
  eq(plan.toUpdate[0].status, 'GRADUATED', 'کد ۲۵ → فارغالتحصیل');
  eq(plan.toUpdate[0].raw, '25', 'کد خام سما ذخیره میشود');
  eq(plan.toUpdate[0].oldStatus, 'ACTIVE', 'وضعیت قبلی در برنامه نگه داشته شد');
  eq(plan.toUpdate[0].uni, 1, 'دانشگاه در برنامه پین شده است');
  eq(plan.unchanged, 1, 'ردیف همخوان بدونتغییر ماند');
  eq(plan.missingInAfagh.length, 1, 'یک دانشجو فقط در UEMS است');
  eq(plan.missingInAfagh[0].person, 'فرزانه آذرورجوی', 'گزارش شکاف با People غنی شد');
  eq(plan.skipped.unknownStatus, 2, 'دو کد STATUS تهی/NULL رد شدند');
  eq(plan.skipped.invalidCode, 2, 'دو کد نامعتبر رد شدند');
  eq(plan.skipped.blankCode, 1, 'کد تهی رد شد');
  eq(plan.skipped.duplicateSource, 1, 'کد تکراری منبع رد شد');
  eq(plan.skipped.duplicateDb, 1, 'کد تکراری DB شناسایی شد');
  eq(plan.skipped.duplicateDbSkipped, 1, 'کد تکراری DB fail-closed شد');
  eq(plan.skipped.foreignUni, 1, 'دانشگاه دیگر لمس نشد');
  ok(plan.onlyInAfagh.includes('9999999999'), 'دانشجوی فقطآفاق گزارش میشود');
  ok(!plan.toUpdate.some((r: any) => r.code === '4051223711'),
    'کد تکراری منبع به هیچ وجه بروزرسانی نمیشود');
  ok(!plan.toUpdate.some((r: any) => r.code === '4051245706'),
    'کد STATUS ناشناخته وضعیت را به UNKNOWN نمیریزد');
  eq(plan.statusTransitions.length, 1, 'گزارش گذار وضعیت تولید شد');
  eq(plan.statusTransitions[0].transition, 'ACTIVE→GRADUATED|raw=25', 'گذار دقیق ثبت شد');
  ok(plan.matchRate > 0 && plan.matchRate <= 1, 'نرخ تطبیق محاسبه شد');

  // ── ۵) خواندن TSV واقعی (BOM + CRLF + People اختیاری) ───────────────────
  const tmp = mkdtempSync(path.join(tmpdir(), 'student-sync-'));
  const hdr = ext.STUDENT_HEADERS.MAININFO_students;
  const minimal = hdr.split('\t').map((h: string) => {
    if (h === 'STNO') return '4051223711';
    if (h === 'STATUS') return '26';
    if (h === 'NAME') return 'آزمایشی';
    if (h === 'IDNO') return '2741550689';
    return '';
  }).join('\t');
  writeFileSync(path.join(tmp, 'MAININFO_students.tsv'), '\uFEFF' + hdr + '\r\n' + minimal + '\r\n\r\n', 'utf8');
  const src = mod.readStudentSource(tmp);
  eq(src.rows.length, 1, 'یک ردیف با BOM/CRLF/خط خالی خوانده شد');
  eq(src.rows[0].code, '4051223711', 'BOM از سرستون حذف شد');
  eq(src.rows[0].raw, '26', 'ستون STATUS درست برداشته شد');
  eq(src.rows[0].name, 'آزمایشی', 'نام فارسی سالم ماند');
  eq(src.peopleRows, 0, 'نبود People_identity.tsv خطا نمیدهد');
  let threw = false;
  try { mod.readStudentSource(path.join(tmp, 'nope')); } catch { threw = true; }
  ok(threw, 'نبود MAININFO_students.tsv fail-closed است');
  writeFileSync(path.join(tmp, 'MAININFO_students.tsv'), 'A\tB\n1\t2\n', 'utf8');
  threw = false;
  try { mod.readStudentSource(tmp); } catch { threw = true; }
  ok(threw, 'سرستون فاقد STNO/STATUS رد میشود');
  unlinkSync(path.join(tmp, 'MAININFO_students.tsv'));
  rmdirSync(tmp);

  // ── ۶) SQL واقعی روی PGlite ─────────────────────────────────────────────
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE students (
      id serial PRIMARY KEY, "studentCode" varchar(14) NOT NULL,
      status varchar(30) NOT NULL, "samaStatusCode" varchar(10),
      "universityId" int NOT NULL, "nationalCode" varchar(20), name text
    );
    INSERT INTO students (id,"studentCode",status,"samaStatusCode","universityId","nationalCode",name) VALUES
      (1,'4051223711','NO_SHOW',NULL,1,'NC1','A'),
      (2,'4001248003','ACTIVE',NULL,1,'NC2','B'),
      (3,'4051292701','SUSPENDED','22',1,'NC3','C'),
      (4,'8888888888','ACTIVE',NULL,2,'NC4','D');
  `);
  const q = async (sql: string, p: any[] = []): Promise<any[]> => (await db.query(sql, p)).rows as any[];

  const live: any[] = await q(mod.STUDENTS_SQL, [1]);
  eq(live.length, 3, 'STUDENTS_SQL فقط همان دانشگاه را برمیگرداند');
  const backupRows: any[] = await q(mod.STUDENT_BACKUP_SQL, [[1, 2]]);
  eq(backupRows.length, 2, 'بکاپ دقیقاً دو ردیف هدف را گرفت');
  eq(String(backupRows[0].status), 'NO_SHOW', 'بکاپ وضعیت قدیمی را نگه داشت');
  eq(backupRows[0].raw, null, 'بکاپ کد خام قدیمی (NULL) را نگه داشت');

  const upd1 = await q(mod.STUDENT_UPDATE_SQL, [
    [1, 2, 3], ['4051223711', '4001248003', '4051292701'],
    ['ACTIVE', 'GRADUATED', 'SUSPENDED'], ['26', '25', '22'], [1, 1, 1],
  ]);
  eq(upd1.length, 2, 'دو ردیف تغییر کرد؛ ردیف همخوان لمس نشد (IS DISTINCT FROM)');
  const after: any[] = await q('SELECT id, status, "samaStatusCode" AS raw, "nationalCode" AS nc, name FROM students ORDER BY id');
  eq(after[0].status, 'ACTIVE', 'وضعیت ردیف ۱ بروز شد');
  eq(after[0].raw, '26', 'کد خام ردیف ۱ ذخیره شد');
  eq(after[1].status, 'GRADUATED', 'وضعیت ردیف ۲ بروز شد');
  eq(after[0].nc, 'NC1', 'کد ملی دستنخورده ماند');
  eq(after[0].name, 'A', 'نام دستنخورده ماند');

  const upd2 = await q(mod.STUDENT_UPDATE_SQL, [
    [1, 2], ['4051223711', '4001248003'], ['ACTIVE', 'GRADUATED'], ['26', '25'], [1, 1],
  ]);
  eq(upd2.length, 0, 'اجرای مجدد بینه است (۰ ردیف)');

  const upd3 = await q(mod.STUDENT_UPDATE_SQL, [
    [1], ['WRONG-CODE'], ['WITHDRAWN'], ['17'], [1],
  ]);
  eq(upd3.length, 0, 'کد ناهماهنگ ⇒ پین id+code جلوی نوشتن را گرفت');
  const upd4 = await q(mod.STUDENT_UPDATE_SQL, [
    [1], ['4051223711'], ['WITHDRAWN'], ['17'], [9],
  ]);
  eq(upd4.length, 0, 'universityId ناهماهنگ ⇒ پین جلوی نوشتن را گرفت');
  const other: any[] = await q('SELECT status, "samaStatusCode" AS raw FROM students WHERE id=4');
  eq(other[0].status, 'ACTIVE', 'دانشجوی دانشگاه دیگر دستنخورده ماند');
  eq(other[0].raw, null, 'کد خام دانشگاه دیگر دستنخورده ماند');

  const restored = await q(mod.STUDENT_UPDATE_SQL, [
    backupRows.map((r: any) => r.id), backupRows.map((r: any) => r.code),
    backupRows.map((r: any) => r.status), backupRows.map((r: any) => r.raw ?? null),
    backupRows.map((r: any) => r.uni),
  ]);
  eq(restored.length, 2, 'بازگردانی دو ردیف را برگرداند');
  const back: any[] = await q('SELECT id, status, "samaStatusCode" AS raw FROM students WHERE id IN (1,2) ORDER BY id');
  eq(back[0].status, 'NO_SHOW', 'وضعیت قدیمی برگشت');
  eq(back[0].raw, null, 'کد خام NULL قدیمی برگشت');
  eq(back[1].status, 'ACTIVE', 'وضعیت دوم قدیمی برگشت');

  await db.close();

  // ── ۷) اتصال به خط لوله / لانچر / تستها ────────────────────────────────
  ok(ORCH.includes("file: 'extract-legacy-students.mjs'") && ORCH.includes("file: 'migrate-legacy-students.mjs'"),
    'دو گام دانشجو به اورکستراتور اضافه شدند');
  ok(ORCH.includes("const EXTRACT_STUDENTS = !SKIP_EXTRACT && !STUDENTS_STATIC"),
    'استخراج دانشجویان مستقل و قابل غیرفعالسازی است');
  ok(ORCH.includes("STUDENTS_APPLY ? ['--apply', '--backup'"),
    'نوشتن فقط با پرچم صریح و همراه بکاپ است');
  ok(ORCH.includes("'--report', join(workDir, 'students-gap.json')"),
    'گزارش شکاف در پوشهٔ کاری ذخیره میشود');
  ok(ORCH.includes('step.echo'), 'خلاصهٔ شکاف در لاگ نهایی دیده میشود');
  ok(BAT.includes('%STUFLAG%') && BAT.includes('UEMS_SYNC_STUDENTS_APPLY'),
    'سوئیچها به لانچر ویندوز وصل شدند');
  ok(ENVEX.includes('UEMS_SYNC_STUDENTS_APPLY=0') && ENVEX.includes('STUDENTS_DIR='),
    'نمونهٔ کانفیگ پیشفرض امن (بدون نوشتن) دارد');
  ok(PKG.includes('student-sync-contract.test.ts'), 'تست در npm test ثبت شد');

  console.log(`\n${pass} قبول / ${fail} رد`);
  if (fail) process.exit(1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
