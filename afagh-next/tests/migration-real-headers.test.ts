/**
 * تست واحد «سرستون‌های واقعی فایل‌های قدیمی» — بدون DB
 *
 * اجرا: npm test
 *
 * چرا این تست؟ سرستون‌های فایل‌های واقعی دانشگاه (reshtelist و
 * professorslist) با حروف *عربی* نوشته شده‌اند: «ي» (U+064A) به‌جای «ی»
 * (U+06CC) و «ك» (U+0643) به‌جای «ک» (U+06A9) — تفاوتی که چشم نمی‌بیند ولی
 * تطبیق رشته‌ای را کاملاً خراب می‌کند. پیش از این هیچ ستونی از این فایل‌ها
 * شناسایی نمی‌شد. سرستون‌های زیر عیناً از فایل واقعی کپی شده‌اند؛ اگر روزی
 * کسی نرمال‌سازی حروف را بردارد، این تست فوراً می‌شکند.
 */
import { parseMajorRow, parseProfessorRow, splitFullNameReversed } from '../src/lib/migration/reference-rows.ts';
import { headerKey, norm, pickCol } from '../src/lib/migration/normalize.ts';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};
const truthy = (name: string, got: unknown) => eq(name, !!got, true);

const reader = (headers: string[], cells: (string | number)[]) => (aliases: string[], opts?: { exact?: boolean }) => {
  const { idx } = pickCol(headers, aliases, opts);
  return idx >= 0 ? norm(cells[idx] ?? '') : '';
};

// ═══ سرستون‌های واقعی professorslist (کپی مستقیم، با حروف عربی) ═══
const PROF_HEADERS = [
  'كد', 'لقب', 'نام', 'نام خانوادگي', 'نام خانوادگي و نام ', 'دانشکده', 'گروه اموزشي',
  'فعال/غيرفعال', 'طريقه همکاري', 'مدرک', 'شماره مستخدم', 'نوع استخدامي', 'مرتبه علمي',
  'تاريخ استخدام', 'سال اخذ آخرين مدرک تحصيلي', 'رشته', 'نام پدر', 'شماره شناسنامه',
  'تاريخ تولد', 'محل تولد', 'محل صدور', 'جنسيت', 'تلفن ثابت', 'شماره موبايل', 'آدرس',
  'آدرس الكترونيكي', 'كد ملي', 'کد وضعيت تاهل', 'وضعيت تاهل', 'رشته و گرايش ',
  'کد کشور آخرين مدرک تحصيلي', 'دانشگاه محل اخذ آخرين مدرک تحصيلي', 'پايه استادي',
  'استان محل تولد', 'شهر محل تولد', 'شماره حساب',
];

console.log('\n— یکسان‌سازی حروف عربی/فارسی —');
{
  eq('ي عربی = ی فارسی', headerKey('گروه آموزشي'), headerKey('گروه آموزشی'));
  eq('ك عربی = ک فارسی', headerKey('كد ملي'), headerKey('کد ملی'));
  eq('اموزشي = آموزشی', headerKey('گروه اموزشي'), headerKey('گروه آموزشی'));
  eq('norm مقدار را هم فارسی می‌کند', norm('علي اكبري'), 'علی اکبری');
  eq('فاصله و نیم‌فاصله در کلید حذف می‌شود', headerKey(' نام‌ خانوادگي '), headerKey('نام خانوادگی'));
}

console.log('\n— شناسایی خودکار هر ۳۶ ستون فایل استادان —');
{
  const cells = [
    '1024', 'دکتر', 'مريم', 'رضايي', 'رضايي مريم', 'فني و مهندسي', 'مهندسي کامپيوتر',
    'فعال', 'تمام وقت', 'دکتري', '5567', 'رسمي قطعي', 'استاديار',
    '1390/06/31', '1388', 'مهندسي کامپيوتر', 'حسن', '4410', '1360/05/12', 'تهران', 'تهران',
    'زن', '02188112233', '09121234567', 'تهران، خيابان آزادي', 'm.rezaei@afagh.ac.ir',
    '0011111111', '2', 'متاهل', 'مهندسي کامپيوتر - هوش مصنوعي', 'IR',
    'دانشگاه صنعتي شريف', '12', 'تهران', 'تهران', 'IR120570000000123456789',
  ];
  const r = parseProfessorRow(reader(PROF_HEADERS, cells));
  truthy('ردیف معتبر', r.ok);
  if (r.ok) {
    eq('کد استادی از ستون «كد»', r.row.staffCode, '1024');
    eq('کد ملی', r.row.nationalCode, '0011111111');
    eq('نام (حروف فارسی شد)', r.row.firstName, 'مریم');
    eq('نام خانوادگی', r.row.lastName, 'رضایی');
    eq('لقب', r.row.title, 'دکتر');
    eq('دانشکده', r.row.facultyName, 'فنی و مهندسی');
    eq('گروه آموزشی از «گروه اموزشي»', r.row.departmentName, 'مهندسی کامپیوتر');
    eq('فعال', r.row.isActive, true);
    eq('طریقهٔ همکاری', r.row.cooperationType, 'تمام وقت');
    eq('مدرک', r.row.degree, 'دکتری');
    eq('شماره مستخدم', r.row.personnelNo, '5567');
    eq('نوع استخدام', r.row.employmentType, 'رسمی قطعی');
    eq('مرتبهٔ علمی', r.row.academicRank, 'استادیار');
    eq('تاریخ استخدام', r.row.hireDate, '1390/06/31');
    eq('سال آخرین مدرک', r.row.lastDegreeYear, 1388);
    eq('رشته (ستون جدا)', r.row.fieldMain, 'مهندسی کامپیوتر');
    eq('رشته و گرایش', r.row.fieldOfStudy, 'مهندسی کامپیوتر - هوش مصنوعی');
    eq('نام پدر', r.row.fatherName, 'حسن');
    eq('شماره شناسنامه', r.row.birthCertNo, '4410');
    eq('تاریخ تولد', r.row.birthDate, '1360/05/12');
    eq('محل تولد', r.row.placeOfBirth, 'تهران');
    eq('محل صدور', r.row.placeOfIssue, 'تهران');
    eq('جنسیت', r.row.gender, 'FEMALE');
    eq('تلفن ثابت', r.row.phone, '02188112233');
    eq('موبایل از «شماره موبايل»', r.row.mobile, '09121234567');
    eq('نشانی', r.row.address, 'تهران، خیابان آزادی');
    eq('ایمیل از «آدرس الكترونيكي»', r.row.email, 'm.rezaei@afagh.ac.ir');
    eq('کد وضعیت تأهل', r.row.maritalStatusCode, 2);
    eq('وضعیت تأهل', r.row.maritalStatus, 'متاهل');
    eq('کد کشور مدرک', r.row.lastDegreeCountryCode, 'IR');
    eq('دانشگاه محل اخذ مدرک', r.row.lastDegreeUniversity, 'دانشگاه صنعتی شریف');
    eq('پایهٔ استادی', r.row.academicBase, '12');
    eq('استان محل تولد', r.row.birthProvince, 'تهران');
    eq('شهر محل تولد', r.row.birthCity, 'تهران');
    eq('شمارهٔ حساب', r.row.bankAccountNo, 'IR120570000000123456789');
  }
}

console.log('\n— ستون «نام خانوادگي و نام» (ترتیب برعکس) —');
{
  eq('فامیل اول، نام آخر', splitFullNameReversed('رضایی مریم'), { title: null, first: 'مریم', last: 'رضایی' });
  eq('فامیل چندبخشی', splitFullNameReversed('محمدی نژاد علی'), { title: null, first: 'علی', last: 'محمدی نژاد' });
  eq('با لقب', splitFullNameReversed('دکتر کریمی سعید'), { title: 'دکتر', first: 'سعید', last: 'کریمی' });

  // وقتی ستون‌های «نام» و «نام خانوادگي» خالی‌اند، باید از ستون برعکس بخواند
  const cells = new Array(PROF_HEADERS.length).fill('');
  cells[0] = '2048'; cells[4] = 'کريمي سعيد';
  const r = parseProfessorRow(reader(PROF_HEADERS, cells));
  truthy('ردیف معتبر', r.ok);
  if (r.ok) {
    eq('نام درست خوانده شد', r.row.firstName, 'سعید');
    eq('فامیل درست خوانده شد', r.row.lastName, 'کریمی');
  }
}

// ═══ سرستون‌های واقعی reshtelist ═══
const MAJOR_HEADERS = [
  'کد رشته', 'نام رشته', 'مقطع', 'کد گروه آموزشي', 'گروه آموزشي', 'حداقل واحد',
  'کد استاندارد', 'تاريخ تاسيس', 'تاريخ خاتمه', 'فعال', 'نام مدير گروه',
  'کد استادي مدير گروه', 'نام کارشناس رشته', 'آخرين تاريخ جلسه شوراي گسترش جهت تمديد رشته',
];

console.log('\n— سرستون‌های واقعی فایل رشته‌ها —');
{
  const r = parseMajorRow(reader(MAJOR_HEADERS, [
    '40123', 'مهندسي کامپيوتر', 'کارشناسي', 'CE', 'مهندسي کامپيوتر', '140',
    '30-11-01', '1385/07/01', '', 'فعال', 'دکتر رضايي',
    '1024', 'خانم احمدي', '1402/03/15',
  ]));
  truthy('ردیف معتبر', r.ok);
  if (r.ok) {
    eq('کد رشته', r.row.code, '40123');
    eq('نام رشته', r.row.name, 'مهندسی کامپیوتر');
    eq('مقطع', r.row.degreeName, 'کارشناسی');
    eq('حداقل واحد', r.row.minUnits, 140);
    eq('کد استاندارد', r.row.standardCode, '30-11-01');
    eq('تاریخ تأسیس', r.row.establishedDate, '1385/07/01');
    eq('تاریخ خاتمه خالی', r.row.terminatedDate, null);
    eq('فعال', r.row.isActive, true);
    eq('نام مدیر گروه', r.row.headName, 'دکتر رضایی');
    eq('کد استادی مدیر گروه', r.row.headStaffCode, '1024');
    eq('کارشناس رشته', r.row.expertName, 'خانم احمدی');
    eq('آخرین جلسهٔ شورای گسترش (سرستون بلند)', r.row.lastCouncilDate, '1402/03/15');
  }
}

console.log('\n— حدس مبهم نباید داده را جابه‌جا کند —');
{
  // دو ستون که هر دو نامک «کد» را در خود دارند: تطبیق «دربردارنده» باید
  // کنار برود و ستونی انتخاب نشود، نه اینکه اولی را کورکورانه بردارد.
  eq('نامک کوتاه در حالت مبهم انتخاب نمی‌شود', pickCol(['کد رشته', 'کد درس'], ['کد']).idx, -1);
  eq('ولی برابری دقیق همیشه کار می‌کند', pickCol(['کد', 'کد درس'], ['کد']).idx, 0);
  eq('نامک بلندِ یکتا با دربردارندگی پیدا می‌شود', pickCol(['شماره موبايل همراه'], ['موبایل']).idx, 0);
  // نامک عام نباید ستون تخصصی را بردارد: «واحد» ≠ «واحد تئوری»
  eq('حالت exact جلوی ربودن ستون تخصصی را می‌گیرد', pickCol(['واحد تئوری'], ['واحد'], { exact: true }).idx, -1);
  eq('و «نام خانوادگی» ستون «نام و نام خانوادگی» را برنمی‌دارد', pickCol(['نام و نام خانوادگي'], ['نام خانوادگی'], { exact: true }).idx, -1);
}

console.log(`\n${fail === 0 ? '✅' : '❌'} سرستون‌های واقعی: ${pass} موفق، ${fail} ناموفق\n`);
process.exit(fail === 0 ? 0 : 1);
