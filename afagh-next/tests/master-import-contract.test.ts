/**
 * ════════════════════════════════════════════════════════════════════════
 *  گاردِ «ورود ردیفهای جدید دانشجو/استاد/رشته به خط لولهٔ هفتگی»
 *
 *  درخواست کاربر: از این به بعد اگر ردیف دانشجو/استاد/درس/رشتهٔ جدید در
 *  UEMS ساخته شد، با کلیهٔ اطلاعات وارد آفاق شود. درسها از قبل توسط گام
 *  آموزشی هفتگی ساخته میشوند؛ این گارد پوشش سه master باقی‌مانده است:
 *    رشته  LT66 → majors · استاد DONBIN → users+staff · دانشجو MAININFO → users+students
 *
 *  سه لایهٔ محک:
 *   ۱) قرارداد سورس استخراجگر (ستونهای صریح، dbo.LT66/dbo.DONBIN، یونیکد، fail-closed).
 *   ۲) قرارداد واردکننده: فقط درج (بدون UPDATE/حذف ردیف موجود)، بکاپ اجباری،
 *      fail-closed، کدملی مصنوعی قطعی، نگاشت نام/جنسیت/آیین‌نامه/ورود.
 *   ۳) رفتار SQL واقعی روی PGlite: ON CONFLICT بینه، نقش استاد، ایدمپاتنسی.
 * ════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const read = (p: string): string => readFileSync(path.join(ROOT, p), 'utf8');

const IMPORT = read('scripts/import-new-master.mjs');
const EXTRACT = read('scripts/extract-legacy-master.mjs');
const EDU = read('scripts/migrate-legacy-education.mjs');
const ORCH = read('scripts/weekly-uems-sync.mjs');
const BAT = read('scripts/run-weekly-uems-sync.bat');
const ENVEX = read('scripts/weekly-uems-sync.env.example');
const PKG = read('package.json');

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string): void => {
  if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); }
};
const eq = (a: unknown, b: unknown, m: string): void => ok(a === b, `${m} (got ${String(a)}, want ${String(b)})`);

async function main(): Promise<void> {
  const ext: any = await import('../scripts/extract-legacy-master.mjs');
  const imp: any = await import('../scripts/import-new-master.mjs');

  // ── ۱) قرارداد استخراجگر master ─────────────────────────────────────────
  eq(ext.MASTER_FILES.length, 2, 'دو فایل TSV master');
  ok(ext.MASTER_HEADERS.LT66_majors.includes('Code\tTitle\tMaghta\tDaneshkadeh'),
    'هدر LT66: Code/Title/Maghta/Daneshkadeh');
  ok(ext.MASTER_HEADERS.DONBIN_professors.includes('Code\tTitle\tGroupCode\tDaneshkadeh\tDegree\tEmploymentStatus\tisActive'),
    'هدر DONBIN: ستونهای کلیدی استاد');
  ok(/FROM dbo\.LT66/.test(EXTRACT), 'منبع رشته صریحاً dbo.LT66 است');
  ok(/FROM dbo\.DONBIN/.test(EXTRACT), 'منبع استاد صریحاً dbo.DONBIN است');
  ok(!/SELECT \*/.test(EXTRACT), 'SELECT * ندارد (DONBIN دو ستون بی نام دارد)');
  ok(EXTRACT.includes("'-u', '-o'"), 'خروجی یونیکد sqlcmd (-u -o)');
  ok(EXTRACT.includes("ISNULL("), 'ISNULL جلوی لیترال NULL را میگیرد');
  ok(EXTRACT.includes('process.exit(1)'), 'خطای استخراج fail-closed است');
  ok(/\.bak-'/.test(EXTRACT.replace(/\r/g, '')) || EXTRACT.includes(".bak-'"), 'آینه با بکاپ .bak انجام میشود');
  ok(EXTRACT.includes('COUNT(*)'), 'شمارش فایل با COUNT(*) منبع تطبیق داده میشود');

  // ── ۲) قرارداد واردکننده ────────────────────────────────────────────────
  ok(!/UPDATE /i.test(IMPORT), 'هیچ UPDATE وجود ندارد (فقط درج)');
  ok(/INSERT INTO majors/.test(IMPORT) && /INSERT INTO staff/.test(IMPORT)
    && /INSERT INTO students/.test(IMPORT) && /INSERT INTO users/.test(IMPORT),
  'چهار درج master وجود دارد');
  ok(/ON CONFLICT \("universityId","majorCode"\) DO NOTHING/.test(IMPORT), 'رشته: ON CONFLICT(uni+majorCode) بینه');
  ok(/ON CONFLICT \("universityId",code\) DO NOTHING/.test(IMPORT), 'درس: ON CONFLICT بینه');
  ok(/WHERE NOT EXISTS \(SELECT 1 FROM users WHERE "nationalCode"/.test(IMPORT), 'کاربر: گارد NOT EXISTS (users قید یکتایی ندارد)');
  ok(/ON CONFLICT \("universityId","studentCode"\) DO NOTHING/.test(IMPORT), 'دانشجو: پین uni+code');
  ok(/'LEGACY'/.test(IMPORT), 'منبع پذیرش دانشجوی تازه LEGACY ثبت میشود');
  ok(/samaStatusCode/.test(IMPORT), 'کد خام سما همذانگاه درج میشود');
  ok(/--apply نیازمند --backup/.test(IMPORT), 'apply بدون بکاپ رد میشود');
  ok(/MIGRATED:/.test(IMPORT), 'passwordHash الگوی مهاجرتی دارد');
  ok(/isActive=\$?\d?1|VALUES \(\$1,\$2,\$3,\$4,1,\$5\)/.test(IMPORT) && /INSERT INTO staff/.test(IMPORT),
    'استاد فعال درج میشود');
  ok(/roles WHERE code='PROFESSOR'/.test(IMPORT), 'نقش PROFESSOR از جدول roles خوانده میشود');
  ok(/PROFESSOR/.test(IMPORT) && /user_roles/.test(IMPORT), 'نقش استاد به کاربر وصل میشود');
  ok(/DELETE FROM students WHERE id=\$1/.test(IMPORT), 'بازگردانی: حذف دانشجوی درجشده');
  ok(/هنوز استفاده میشود/.test(IMPORT), 'بازگردانی کاربرِ وابستهدار را fail-closed رد میکند');
  ok(/> 0\.2/.test(IMPORT.replace(/\r/g, '')) || /0\.2/.test(IMPORT), 'گیت سخت ۲۰٪ حلنشدهها');

  // توابع خالص
  const pn = imp.parseProfessorName('مهندس ليلا برادران');
  ok(pn && pn.honorific === 'مهندس' && pn.lastName === 'ليلا برادران' && pn.firstName === '',
    'نام استاد با لقب: «مهندس ليلا برادران»');
  const pn2 = imp.parseProfessorName('حسين پور-فرهاد');
  ok(pn2 && pn2.lastName === 'حسين پور' && pn2.firstName === 'فرهاد' && pn2.honorific === '',
    'نام استاد دونگانه: نام خانوادگی-نام');
  eq(imp.parseProfessorName('نامشخص'), null, '«نامشخص» رد میشود');
  eq(imp.parseProfessorName(''), null, 'نام تهی رد میشود');
  eq(imp.placeholderNc('D', '933104'), 'SD00933104', 'کد مصنوعی استاد قطعی است');
  eq(imp.placeholderNc('A', '4051227719'), 'SA51227719', 'کد مصنوعی دانشجو قطعی است (۸ رقم آخر)');
  eq(imp.placeholderNc('D', '933104'), imp.placeholderNc('D', '933104'), 'کد مصنوعی تکرارپذیر');
  eq(imp.genderFromSex('1'), 'FEMALE', 'SEX=1 زن');
  eq(imp.genderFromSex('2'), 'MALE', 'SEX=2 مرد');
  eq(imp.genderFromSex(''), null, 'جنسیت نامعلوم تهی');
  eq(imp.regulationWhich('2', 1405), '1402', 'ورود ۱۴۰۵ ⇒ آیین‌نامه ۱۴۰۲');
  eq(imp.regulationWhich('3', 1405), '1394MS', 'ارشد ⇒ آیین‌نامه ۱۳۹۴ ارشد');
  eq(imp.regulationWhich('2', 1397), '1393', 'ورود ۱۳۹۷ ⇒ آیین‌نامه ۱۳۹۳');
  const e1 = imp.entryFrom('1405/07/01', '14051');
  ok(e1 && e1.entryYear === 1405 && e1.entryTerm === 1, 'ورود از Startdate');
  const e2 = imp.entryFrom('', '14051');
  ok(e2 && e2.entryYear === 1405 && e2.entryTerm === 1, 'ورود از TERMCODE جایگزین');
  eq(imp.entryFrom('', ''), null, 'ورود نامعلوم ⇒ null (رد fail-closed)');

  // ── ۳) buildMasterPlan — خالص ───────────────────────────────────────────
  const mk = (header: string, rows: string[][]) => ({ header: header.split('\t'), rows });
  const src = {
    lt66: mk('Code\tTitle\tMaghta\tDaneshkadeh\tGroupA', [
      ['0', 'بی نام', '2', '1', '0'],            // زباله
      ['93', 'رشتهٔ تازه', '2', '1', '0'],        // باید درج شود
      ['27', 'مهندسي گياهپزشکي', '2', '1', '0'], // موجود ⇒ رد
      ['94', 'بدون مقطع', '99', '1', '0'],        // مقطع حلنشده ⇒ رد
    ]),
    lt66Header: 'Code\tTitle\tMaghta\tDaneshkadeh\tGroupA'.split('\t'),
    donbin: mk('Code\tTitle\tGroupCode\tDaneshkadeh\tDegree\tEmploymentStatus\tisActive\tmadrak\tEmploymentDate\tActiveTerm\tRESHTE\tNAMEP', [
      ['0', 'نامشخص', '0', '3', '0', '0', '1', '0', '', '0', '', ''],      // زباله
      ['933201', 'مهندس استاد تازه', '0', '2', '4', '3', '1', '50', '', '0', '', ''], // فعال ⇒ درج
      ['933202', 'استاد غیرفعال', '0', '2', '4', '3', '2', '50', '', '0', '', ''],    // غیرفعال ⇒ رد
      ['933101', 'کاظم زاده-رقيه', '0', '3', '4', '3', '1', '50', '', '0', '', ''],   // موجود ⇒ رد
    ]),
    donbinHeader: 'Code\tTitle\tGroupCode\tDaneshkadeh\tDegree\tEmploymentStatus\tisActive\tmadrak\tEmploymentDate\tActiveTerm\tRESHTE\tNAMEP'.split('\t'),
    maininfo: mk('STNO\tNAME\tSEX\tSTATUS\tTERMCODE\tMAGHTA\tRESHTE\tDANESHKADEH\tIDNO\tBIRTHDATE\tStartdate', [
      ['4051999999', 'تازه-دانشجو', '2', '0', '14051', '2', '93', '1', '2742999999', '1382/05/10', '1405/07/01'],
      ['', '', '0', '0', '', '0', '0', '0', '', '', ''],                        // زباله
      ['4051888888', 'بی رشته', '1', '0', '14051', '2', '77', '1', '', '', '1405/07/01'], // رشتهٔ حلنشده
      ['12345', 'کدبد-مجید', '2', '0', '14051', '2', '93', '1', 'abc', '', '1405/07/01'], // کد دانشجویی نامعتبر (۵ رقم)
      ['4051666666', 'بدون ملی-سارا', '1', '22', '14051', '2', '93', '1', '8507', '', '1405/07/01'], // کدملی کوتاه ⇒ مصنوعی
    ]),
    maininfoHeader: 'STNO\tNAME\tSEX\tSTATUS\tTERMCODE\tMAGHTA\tRESHTE\tDANESHKADEH\tIDNO\tBIRTHDATE\tStartdate'.split('\t'),
  };
  const maps = {
    majors: new Map([['27', 501]]),
    courses: new Map(), staff: new Map([['933101', 601]]), students: new Map(),
    degrees: new Map([['SAMA-2', 19]]), faculties: new Map([['1', 3], ['2', 4]]),
    departments: new Map(), users: new Map(), regulations: new Map([
      ['آیین‌نامه ۱۴۰۲ — کاردانی و کارشناسی', 701],
    ]),
    professorRoleId: 8,
  };
  const plan = imp.buildMasterPlan(src, maps, 1);
  eq(plan.majors.length, 1, 'فقط یک رشتهٔ تازه');
  ok(plan.majors[0] && plan.majors[0].code === '93' && plan.majors[0].degreeLevelId === 19 && plan.majors[0].facultyId === 3,
    'رشتهٔ تازه با مقطع/دانشکده درست');
  eq(plan.skipped.majorJunk, 1, 'رشتهٔ زباله (کد ۰) رد شد');
  eq(plan.skipped.majorNoDegree, 1, 'رشتهٔ بی‌مقطع رد شد');
  eq(plan.skipped.duplicateMajor, 1, 'رشتهٔ موجود رد شد');
  eq(plan.professors.length, 1, 'فقط استاد فعال تازه');
  ok(plan.professors[0] && plan.professors[0].code === '933201' && plan.professors[0].nc === 'SD00933201'
    && plan.professors[0].lastName === 'استاد تازه' && plan.professors[0].professorRoleId === 8,
    'استاد تازه با کد مصنوعی و نقش');
  eq(plan.skipped.profInactive, 1, 'استاد غیرفعال رد شد');
  eq(plan.skipped.profJunk, 1, 'استاد زباله رد شد');
  ok(!plan.professors.some((p: any) => p.code === '933101'), 'استاد موجود درج نمیشود');
  eq(plan.students.length, 2, 'دو دانشجوی تازهٔ کامل');
  const s1 = plan.students.find((s: any) => s.code === '4051999999') as any;
  ok(s1 && s1.majorId === -1 && s1.degreeLevelId === 19 && s1.regulationId === 701
    && s1.entryYear === 1405 && s1.entryTerm === 1 && s1.status === 'UNKNOWN'
    && s1.rawStatus === '0' && s1.nc === '2742999999' && !s1.ncSynthetic
    && s1.gender === 'MALE' && s1.firstName === 'دانشجو' && s1.lastName === 'تازه'
    && s1.reshte === '93',
    'دانشجوی تازه با کلیهٔ اطلاعات (کد ملی واقعی، نگاشت جنسیت/وضعیت/ورود)');
  const s2 = plan.students.find((s: any) => s.code === '4051666666') as any;
  ok(s2 && s2.nc === 'SA51666666' && s2.ncSynthetic, 'کدملی کوتاه ⇒ کد مصنوعی');
  ok(s2 && s2.status === 'SUSPENDED' && s2.rawStatus === '22', 'وضعیت ۲۲ = تعلیق');
  eq(plan.skipped.stuJunk, 1, 'دانشجوی بی‌نام رد شد');
  eq(plan.skipped.stuBadCode, 1, 'کد نامعتبر رد شد');
  eq(plan.skipped.stuNoMajor, 1, 'رشتهٔ حلنشده رد شد');

  // ── ۴) رفتار SQL واقعی روی PGlite ───────────────────────────────────────
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE users (id serial PRIMARY KEY, "nationalCode" varchar(10) NOT NULL,
      "firstName" varchar(100) NOT NULL, "lastName" varchar(100) NOT NULL, gender varchar(10),
      "passwordHash" varchar(100) NOT NULL, "isActive" integer DEFAULT 1,
      "mustChangePassword" integer DEFAULT 1, "universityId" integer NOT NULL,
      UNIQUE ("nationalCode","universityId"));
    CREATE TABLE majors (id serial PRIMARY KEY, name varchar(150) NOT NULL,
      "majorCode" varchar(10), "degreeLevelId" integer, "facultyId" integer,
      "universityId" integer, UNIQUE ("universityId","majorCode"));
    CREATE TABLE staff (id serial PRIMARY KEY, "userId" integer NOT NULL UNIQUE,
      "staffCode" varchar(20) NOT NULL, title varchar(50), "facultyId" integer,
      "isActive" integer DEFAULT 1, "universityId" integer, UNIQUE ("universityId","staffCode"));
    CREATE TABLE user_roles ("userId" integer, "roleId" integer, "universityId" integer,
      PRIMARY KEY ("userId","roleId"));
    CREATE TABLE students (id serial PRIMARY KEY, "userId" integer, "studentCode" varchar(14) NOT NULL,
      "majorId" integer, "degreeLevelId" integer, "regulationId" integer,
      "entryYear" integer NOT NULL, "entryTerm" integer DEFAULT 1, status varchar(30) NOT NULL,
      "universityId" integer, "samaStatusCode" varchar(10), "admissionSource" varchar(20),
      "saminLocalFieldCode" varchar(20), UNIQUE ("universityId","studentCode"));
  `);
  // کاربر: درج دوباره بینه است
  const u1 = (await db.query(imp.USER_INSERT_SQL, ['SD00933201', '', 'استاد تازه', null, 'MIGRATED:x', 1])).rows as any;
  eq(u1.length, 1, 'کاربر استاد درج شد');
  const u2 = (await db.query(imp.USER_INSERT_SQL, ['SD00933201', '', 'استاد تازه', null, 'MIGRATED:x', 1])).rows as any;
  eq(u2.length, 0, 'درج مجدد کاربر بینه است');
  const lu = (await db.query(imp.USER_LOOKUP_SQL, ['SD00933201', 1])).rows as any;
  eq(lu.length, 1, 'LOOKUP پس از برخورد کاربر پیدا میکند (مسیر idempotency)');
  // رشته: بینه روی majorCode سراسری
  const m1 = (await db.query(imp.MAJOR_INSERT_SQL, ['رشتهٔ تازه', '93', 19, 3, 1])).rows as any;
  eq(m1.length, 1, 'رشته درج شد');
  const m2 = (await db.query(imp.MAJOR_INSERT_SQL, ['دوباره', '93', 19, 3, 1])).rows as any;
  eq(m2.length, 0, 'درج مجدد رشته بینه است');
  // staff + نقش
  const st1 = (await db.query(imp.STAFF_INSERT_SQL, [u1[0].id, '933201', 'مهندس', 4, 1])).rows as any;
  eq(st1.length, 1, 'staff درج شد');
  const st2 = (await db.query(imp.STAFF_INSERT_SQL, [u1[0].id, '933201', 'مهندس', 4, 1])).rows as any;
  eq(st2.length, 0, 'staff یکتا روی userId است');
  const ur1 = (await db.query(imp.USER_ROLE_INSERT_SQL, [u1[0].id, 8])) as any;
  eq(ur1.rowCount, 1, 'نقش PROFESSOR وصل شد');
  const ur2 = (await db.query(imp.USER_ROLE_INSERT_SQL, [u1[0].id, 8])) as any;
  eq(ur2.rowCount, 0, 'نقش تکراری بی‌اثر');
  // دانشجو: پین uni+code — دانشگاه دیگر دستنخورده
  const s3 = await db.query(imp.STUDENT_INSERT_SQL, [u1[0].id, '4051999999', 501, 19, 701, 1405, 1, 'UNKNOWN', 1, '0', '93']) as any;
  eq(s3.rows.length, 1, 'دانشجو درج شد');
  const s4 = await db.query(imp.STUDENT_INSERT_SQL, [u1[0].id, '4051999999', 501, 19, 701, 1405, 1, 'UNKNOWN', 1, '0', '93']) as any;
  eq(s4.rows.length, 0, 'درج مجدد دانشجو بینه است');
  const s5 = await db.query(imp.STUDENT_INSERT_SQL, [u1[0].id, '4051999999', 501, 19, 701, 1405, 1, 'UNKNOWN', 2, '0', '93']) as any;
  eq(s5.rows.length, 1, 'کد تکراری در دانشگاه دیگر ردیف مستقل میسازد (یکتا = uni+code)');
  const row = (await db.query(`SELECT "samaStatusCode" AS raw, "admissionSource" AS src, "saminLocalFieldCode" AS lf FROM students WHERE "studentCode"='4051999999'`)).rows[0] as any;
  eq(row?.raw, '0', 'کد خام سما ذخیره شد');
  eq(row?.src, 'LEGACY', 'منبع پذیرش LEGACY است');

  // ── ۵) سیمکشی اورکستراتور/لانچر/کانفیگ/npm ──────────────────────────────
  ok(/import-new-master\.mjs/.test(ORCH), 'گام import-new-master در اورکستراتور');
  ok(/extract-legacy-master\.mjs/.test(ORCH), 'گام extract-legacy-master در اورکستراتور');
  ok(ORCH.indexOf("name: 'import-new-master") < ORCH.indexOf("name: 'migrate-legacy-students"),
    'ورود master قبل از وضعیت دانشجویان اجرا میشود');
  ok(ORCH.indexOf("name: 'import-new-master") < ORCH.indexOf("name: 'migrate-legacy-education"),
    'ورود master قبل از مهاجرت آموزشی اجرا میشود (انتخاب واحد دانشجوی تازه)');
  ok(/A\['master-apply'\]/.test(ORCH), 'پرچم --master-apply');
  ok(/A\['master-refresh'\]/.test(ORCH) && /--mirror/.test(ORCH), 'آینهٔ master با --master-refresh');
  ok(/A\['master-static'\]/.test(ORCH), 'حالت ایستای master');
  ok(BAT.includes('UEMS_SYNC_MASTER_APPLY') && BAT.includes('MASFLAG'), 'لانچر: MASFLAG و سوئیچها');
  ok((BAT.match(/%MASFLAG%/g) || []).length >= 2, 'MASFLAG به هر دو فرمان node وصل است');
  ok(ENVEX.includes('UEMS_SYNC_MASTER_APPLY=0'), 'نمونهٔ کانفیگ پیشفرض امن (بدون نوشتن) دارد');
  ok(ENVEX.includes('MASTER_DIR='), 'نمونهٔ کانفیگ MASTER_DIR دارد');
  ok(PKG.includes('tests/master-import-contract.test.ts'), 'تست در npm test ثبت شد');
  // درسها: گام آموزشی کاتالوگ تازه را میسازد (پوشش «درس جدید»)
  ok(/LT7_lessons/.test(EDU) && /courses: \+/.test(EDU), 'درس جدید در گام آموزشی ساخته میشود (courses: +N)');

  console.log(`\n${pass} قبول / ${fail} رد`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
