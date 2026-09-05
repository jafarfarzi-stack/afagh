/**
 * تست واحد «انتقال دادهٔ پایهٔ سازمانی» — بدون DB
 *
 * اجرا: npm test
 *
 * چرا این تست؟ دانشکده، گروه آموزشی، رشته/گرایش و استاد تا امروز اصلاً قابل
 * انتقال نبودند و باید دستی وارد می‌شدند. حالا که importer دارند، این تست
 * قرارداد ستون‌های فایل قدیمی (reshtelist / professorslist) را قفل می‌کند تا
 * یک تغییر بی‌دقت دوباره داده را بی‌صدا دور نریزد.
 *
 * پوشش: نامک‌های فارسی/انگلیسی، تاریخ شمسی نامعتبر (هشدار نه خطا)،
 * «فعال/غیرفعال»، تفکیک نام کامل، کد ملی معیوب، و ستون‌های الزامی.
 */
import {
  parseDepartmentRow, parseFacultyRow, parseMajorRow, parseProfessorRow, splitFullName,
} from '../src/lib/migration/reference-rows.ts';
import { norm, pickCol } from '../src/lib/migration/normalize.ts';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};
const truthy = (name: string, got: unknown) => eq(name, !!got, true);

/**
 * همان خوانندهٔ ستونی که موتور مهاجرت می‌سازد: pickCol روی سرستون‌ها + norm روی
 * مقدار (دقیقاً مثل tabular.ts). norm ارقام فارسی را لاتین و نیم‌فاصله را فاصله
 * می‌کند — پس تست باید همان را ببیند، وگرنه رفتار واقعی را نمی‌سنجد.
 */
const reader = (headers: string[], cells: (string | number)[]) => (aliases: string[], opts?: { exact?: boolean }) => {
  const { idx } = pickCol(headers, aliases, opts);
  return idx >= 0 ? norm(cells[idx] ?? '') : '';
};

// ─────────────────────────── دانشکده ───────────────────────────
console.log('\n— دانشکده —');
{
  const r = parseFacultyRow(reader(['کد دانشکده', 'نام دانشکده'], ['12', 'فنی و مهندسی']));
  truthy('ردیف معتبر', r.ok);
  if (r.ok) { eq('کد', r.row.code, '12'); eq('نام', r.row.name, 'فنی و مهندسی'); }

  const only = parseFacultyRow(reader(['نام دانشکده'], ['علوم پایه']));
  truthy('دانشکده بدون کد هم پذیرفته می‌شود', only.ok);
  if (only.ok) eq('کد خالی → null', only.row.code, null);

  const bad = parseFacultyRow(reader(['کد دانشکده', 'نام دانشکده'], ['12', '']));
  eq('بدون نام رد می‌شود', bad.ok, false);
}

// ───────────────────────── گروه آموزشی ─────────────────────────
console.log('\n— گروه آموزشی —');
{
  const r = parseDepartmentRow(reader(
    ['کد گروه', 'نام گروه', 'دانشکده'],
    ['CE', 'مهندسی کامپیوتر', 'فنی و مهندسی'],
  ));
  truthy('ردیف معتبر', r.ok);
  if (r.ok) {
    eq('کد گروه', r.row.code, 'CE');
    eq('نام گروه', r.row.name, 'مهندسی کامپیوتر');
    eq('دانشکدهٔ والد', r.row.facultyName, 'فنی و مهندسی');
  }

  const orphan = parseDepartmentRow(reader(['نام گروه'], ['ریاضی']));
  truthy('گروه بدون دانشکده هم پارس می‌شود (موتور هشدار می‌دهد)', orphan.ok);
  if (orphan.ok) eq('دانشکده null', orphan.row.facultyName, null);
}

// ──────────────────────── رشته و گرایش ────────────────────────
console.log('\n— رشته و گرایش —');
{
  const headers = [
    'کد رشته', 'نام رشته', 'مقطع', 'گروه آموزشی', 'دانشکده', 'گرایش',
    'حداقل واحد', 'کد استاندارد', 'تاریخ تاسیس', 'فعال', 'کارشناس رشته',
  ];
  const r = parseMajorRow(reader(headers, [
    '۴۰۱۲۳', 'مهندسی کامپیوتر', 'کارشناسی', 'مهندسی کامپیوتر', 'فنی و مهندسی',
    'نرم‌افزار', '۱۴۰', '30-11-01', '۱۳۸۵/۰۷/۰۱', 'فعال', 'احمدی',
  ]));
  truthy('ردیف معتبر', r.ok);
  if (r.ok) {
    eq('کد رشته (ارقام فارسی → لاتین)', r.row.code, '40123');
    eq('مقطع', r.row.degreeName, 'کارشناسی');
    eq('گرایش', r.row.trackTitle, 'نرم افزار');
    eq('حداقل واحد', r.row.minUnits, 140);
    eq('تاریخ تاسیس شمسی', r.row.establishedDate, '1385/07/01');
    eq('فعال', r.row.isActive, true);
    eq('کارشناس رشته', r.row.expertName, 'احمدی');
  }

  const inactive = parseMajorRow(reader(['کد رشته', 'نام رشته', 'مقطع', 'فعال'], ['1', 'الف', 'کارشناسی', 'غیرفعال']));
  if (inactive.ok) eq('«غیرفعال» درست تفسیر می‌شود', inactive.row.isActive, false);

  const badDate = parseMajorRow(reader(
    ['کد رشته', 'نام رشته', 'مقطع', 'تاریخ تاسیس'],
    ['2', 'ب', 'کارشناسی', '85-7-1'],
  ));
  truthy('تاریخ نامعتبر ردیف را رد نمی‌کند', badDate.ok);
  if (badDate.ok) {
    eq('تاریخ نامعتبر → null', badDate.row.establishedDate, null);
    truthy('و هشدار می‌دهد', badDate.warnings.some(w => w.includes('تاریخ تاسیس')));
  }

  const noDegree = parseMajorRow(reader(['کد رشته', 'نام رشته'], ['3', 'ج']));
  truthy('رشتهٔ بدون مقطع پارس می‌شود ولی هشدار دارد', noDegree.ok && noDegree.warnings.length > 0);

  eq('بدون کد رشته رد می‌شود', parseMajorRow(reader(['نام رشته'], ['د'])).ok, false);
}

// ────────────────────────── تفکیک نام ──────────────────────────
console.log('\n— تفکیک نام کامل —');
{
  eq('دکتر رضا احمدی', splitFullName('دکتر رضا احمدی'), { title: 'دکتر', first: 'رضا', last: 'احمدی' });
  eq('فامیل چندبخشی', splitFullName('علی محمدی نژاد'), { title: null, first: 'علی', last: 'محمدی نژاد' });
  eq('لقب مرکب', splitFullName('آقای دکتر سعید کریمی'), { title: 'آقای دکتر', first: 'سعید', last: 'کریمی' });
  eq('تک‌کلمه', splitFullName('احمدی'), { title: null, first: 'احمدی', last: 'احمدی' });
}

// ──────────────────────────── استاد ────────────────────────────
console.log('\n— استاد —');
{
  const headers = [
    'کد استادی', 'کد ملی', 'نام و نام خانوادگی', 'گروه آموزشی', 'دانشکده',
    'مرتبه علمی', 'مدرک', 'طریقه همکاری', 'تاریخ استخدام', 'سال اخذ آخرین مدرک',
    'رشته و گرایش', 'موبایل', 'فعال',
  ];
  const r = parseProfessorRow(reader(headers, [
    '1024', '0011111111', 'دکتر مریم رضایی', 'مهندسی کامپیوتر', 'فنی و مهندسی',
    'استادیار', 'دکتری', 'تمام وقت', '۱۳۹۰/۰۶/۳۱', '۱۳۸۸',
    'هوش مصنوعی', '۰۹۱۲۱۲۳۴۵۶۷', 'فعال',
  ]));
  truthy('ردیف معتبر', r.ok);
  if (r.ok) {
    eq('کد استادی', r.row.staffCode, '1024');
    eq('نام از ستون نام کامل', r.row.firstName, 'مریم');
    eq('فامیل از ستون نام کامل', r.row.lastName, 'رضایی');
    eq('لقب', r.row.title, 'دکتر');
    eq('مرتبه علمی', r.row.academicRank, 'استادیار');
    eq('تاریخ استخدام', r.row.hireDate, '1390/06/31');
    eq('سال آخرین مدرک', r.row.lastDegreeYear, 1388);
    eq('رشته و گرایش', r.row.fieldOfStudy, 'هوش مصنوعی');
    eq('موبایل (ارقام لاتین)', r.row.mobile, '09121234567');
    eq('فعال', r.row.isActive, true);
  }

  const noNc = parseProfessorRow(reader(['کد استادی', 'نام', 'نام خانوادگی'], ['2048', 'رضا', 'کریمی']));
  truthy('استاد بدون کد ملی پارس می‌شود', noNc.ok);
  if (noNc.ok) {
    eq('کد ملی null', noNc.row.nationalCode, null);
    truthy('هشدار شناسهٔ جایگزین', noNc.warnings.some(w => w.includes('کد ملی')));
  }

  const badNc = parseProfessorRow(reader(['کد استادی', 'کد ملی', 'نام', 'نام خانوادگی'], ['3072', '123', 'سارا', 'م']));
  if (badNc.ok) {
    eq('کد ملی بدقالب حذف می‌شود', badNc.row.nationalCode, null);
    truthy('و هشدار می‌دهد', badNc.warnings.some(w => w.includes('قالب')));
  }

  eq('بدون کد استادی رد می‌شود', parseProfessorRow(reader(['نام', 'نام خانوادگی'], ['الف', 'ب'])).ok, false);
  eq('بدون نام رد می‌شود', parseProfessorRow(reader(['کد استادی'], ['4096'])).ok, false);

  const en = parseProfessorRow(reader(
    ['staff_code', 'national_code', 'first_name', 'last_name', 'academic_rank'],
    ['5120', '0011111111', 'Ali', 'Ahmadi', 'Professor'],
  ));
  truthy('سرستون‌های انگلیسی هم کار می‌کنند', en.ok);
  if (en.ok) eq('مرتبه از ستون انگلیسی', en.row.academicRank, 'Professor');
}

console.log(`\n${fail === 0 ? '✅' : '❌'} انتقال دادهٔ پایه: ${pass} موفق، ${fail} ناموفق\n`);
process.exit(fail === 0 ? 0 : 1);
