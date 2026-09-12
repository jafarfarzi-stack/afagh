/**
 * کد سند اصالت است — نه نام.
 *
 * مشتری با کد کار می‌کند: «کد رشته» می‌گوید مهندسی کامپیوترِ کارشناسیِ گروه
 * کامپیوترِ دانشکدهٔ فنی. نام‌ها در دانشکده‌ها و مقاطع مختلف تکرار می‌شوند،
 * پس هر جا کد هست باید بر نام مقدم باشد و هر جا کد نیست باید هشدار بدهیم.
 */
import { parseDepartmentRow, parseFacultyRow, parseMajorRow } from '../src/lib/migration/reference-rows';
import { parseCourseRow } from '../src/lib/migration/course-row';
import { headerKey } from '../src/lib/migration/normalize';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

/** خواننده‌ای که مثل موتور واقعی، سرستون‌ها را نرمال‌سازی می‌کند */
const reader = (row: Record<string, string>) => (aliases: string[]): string => {
  const map = new Map(Object.entries(row).map(([k, v]) => [headerKey(k), v]));
  for (const a of aliases) {
    const v = map.get(headerKey(a));
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};

console.log('\n— کد دانشکده و کد گروه جدا از نام خوانده می‌شوند —');
{
  const r = parseDepartmentRow(reader({ 'کد گروه': '12', 'نام گروه': 'مهندسی کامپیوتر', 'کد دانشکده': '3', 'نام دانشکده': 'فنی و مهندسی' }));
  ok(r.ok === true, 'سطر گروه معتبر است');
  if (r.ok) {
    ok(r.row.code === '12', 'کد گروه = ۱۲');
    ok(r.row.facultyCode === '3', 'کد دانشکده جداگانه خوانده شد (پیش‌تر با نام قاطی می‌شد)');
    ok(r.row.facultyName === 'فنی و مهندسی', 'نام دانشکده هم جدا حفظ شد');
  }
}
{
  // بدون کد → باید هشدار بدهد، نه اینکه بی‌صدا با نام تطبیق بزند
  const r = parseDepartmentRow(reader({ 'نام گروه': 'مهندسی کامپیوتر', 'نام دانشکده': 'فنی' }));
  ok(r.ok === true && r.warnings.some(w => w.includes('کد گروه')), 'نبودِ کد گروه هشدار می‌گیرد');
}

console.log('\n— رشته: کد رشته، کد مقطع، کد گروه، کد دانشکده —');
{
  const r = parseMajorRow(reader({
    'کد رشته': '40312', 'نام رشته': 'مهندسی کامپیوتر', 'کد مقطع': 'BS', 'مقطع': 'کارشناسی',
    'کد گروه آموزشی': '12', 'نام گروه آموزشی': 'کامپیوتر', 'کد دانشکده': '3', 'نام دانشکده': 'فنی',
  }));
  ok(r.ok === true, 'سطر رشته معتبر است');
  if (r.ok) {
    const v = r.row;
    ok(v.code === '40312', 'کد رشته = ۴۰۳۱۲');
    ok(v.degreeCode === 'BS', 'کد مقطع خوانده شد');
    ok(v.departmentCode === '12', 'کد گروه آموزشی خوانده شد');
    ok(v.facultyCode === '3', 'کد دانشکده خوانده شد');
    ok(v.departmentName === 'کامپیوتر' && v.facultyName === 'فنی', 'نام‌ها هم موازی کد نگه داشته شدند');
  }
}
{
  // «کد گروه آموزشی» نباید به‌اشتباه در ستون نام بنشیند
  const r = parseMajorRow(reader({ 'کد رشته': '1', 'نام رشته': 'الف', 'کد گروه آموزشی': '99' }));
  ok(r.ok === true && r.row.departmentCode === '99' && !r.row.departmentName,
    'وقتی فقط کد گروه هست، نام گروه خالی می‌ماند (نه اینکه کد را نام بپندارد)');
}

console.log('\n— درس: کد گروه آموزشی و کد مقطع —');
{
  const r = parseCourseRow(reader({
    'کد درس': '1101', 'نام درس': 'ریاضی ۱', 'واحد': '3',
    'کد مقطع': 'BS', 'کد گروه آموزشی': '7', 'نام گروه آموزشی': 'ریاضی',
  }));
  ok(r.ok === true, 'سطر درس معتبر است');
  if (r.ok) {
    ok(r.row.deptCode === '7', 'کد گروه آموزشیِ درس خوانده شد');
    ok(r.row.degreeCode === 'BS', 'کد مقطع درس خوانده شد');
    ok(r.row.deptName === 'ریاضی', 'نام گروه هم جدا ماند');
  }
}

console.log('\n— نویسه‌های عربی فایل مشتری در سرستون کدها —');
{
  // فایل‌های مشتری «ي/ك» عربی دارند
  const r = parseMajorRow(reader({ 'كد رشته': '5', 'نام رشته': 'ب', 'كد دانشكده': '2' }));
  ok(r.ok === true && r.row.code === '5', 'سرستون «كد رشته» با ي/ك عربی شناخته شد');
  if (r.ok) ok(r.row.facultyCode === '2', 'سرستون «كد دانشكده» عربی هم شناخته شد');
}

console.log('\n— دانشکده —');
{
  const r = parseFacultyRow(reader({ 'کد دانشکده': '3', 'نام دانشکده': 'فنی و مهندسی' }));
  ok(r.ok === true && r.row.code === '3' && r.row.name === 'فنی و مهندسی', 'کد و نام دانشکده هر دو خوانده شدند');
}

console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
if (fail) process.exit(1);
