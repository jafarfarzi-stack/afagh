/**
 * تست واحد «انتقال دروس از سیستم قدیمی» — بدون DB
 *
 * اجرا: npm test
 *
 * چرا این تست؟ پیش از این، مهاجرت درس فقط «کد، نام، واحد، نوع» را می‌خواند و
 * مقطع، گروه آموزشی و تفکیک واحد نظری/عملی به‌کلی از دست می‌رفت. این تست همان
 * قرارداد ستون‌ها را قفل می‌کند تا دوباره سقوط نکند.
 *
 * پوشش: نامک‌های فارسی/انگلیسی ستون‌ها، استنتاج واحد از نظری+عملی،
 * تفکیک خودکار بر پایهٔ نوع درس، هشدار ناسازگاری جمع واحدها، و خطاهای ورودی.
 */
import { parseCourseRow, type ParsedCourseRow } from '../src/lib/migration/course-row.ts';
import { pickCol } from '../src/lib/migration/normalize.ts';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};
const truthy = (name: string, got: unknown) => eq(name, !!got, true);

/**
 * شبیه‌سازی دقیق همان چیزی که موتور مهاجرت می‌دهد: خوانندهٔ ستون بر پایهٔ
 * سرستون‌های فایل (با همان pickCol که نامک‌های فارسی/انگلیسی را تطبیق می‌دهد).
 */
const run = (headers: string[], rows: (string | number)[][]) => {
  const report = { errors: [] as { row: number; msg: string }[], warnings: [] as { row: number; msg: string }[] };
  const out: ParsedCourseRow[] = [];
  rows.forEach((cells, i) => {
    const line = i + 2;
    const get = (aliases: string[], opts?: { exact?: boolean }) => {
      const { idx } = pickCol(headers, aliases, opts);
      return idx >= 0 ? String(cells[idx] ?? '').trim() : '';
    };
    const res = parseCourseRow(get);
    res.warnings.forEach(msg => report.warnings.push({ row: line, msg }));
    if (res.ok) out.push(res.row);
    else report.errors.push({ row: line, msg: res.error });
  });
  return { report, rows: out };
};

console.log('\n— انتقال دروس: ستون‌های کامل —');
{
  const { report, rows } = run(
    ['کد درس', 'نام درس', 'واحد', 'واحد نظری', 'واحد عملی', 'نوع', 'مقطع', 'گروه آموزشی'],
    [['CE-101', 'مبانی برنامه‌نویسی', 3, 2, 1, 'نظری', 'کارشناسی', 'مهندسی کامپیوتر']],
  );
  eq('بدون خطا', report.errors.length, 0);
  eq('کد درس', rows[0].code, 'CE-101');
  eq('کل واحد', rows[0].units, 3);
  eq('واحد نظری', rows[0].theory, 2);
  eq('واحد عملی', rows[0].practical, 1);
  eq('نوع درس', rows[0].courseType, 'نظری');
  eq('مقطع', rows[0].degreeName, 'کارشناسی');
  eq('گروه آموزشی', rows[0].deptName, 'مهندسی کامپیوتر');
}

console.log('\n— نامک‌های جایگزین (تئوری/دپارتمان/انگلیسی) —');
{
  const { rows } = run(
    ['course_code', 'نام درس', 'واحد تئوری', 'practical_units', 'مقطع تحصیلی', 'دپارتمان'],
    [['ME-220', 'ترمودینامیک', 2, 1, 'کارشناسی ارشد', 'مکانیک']],
  );
  eq('کد از course_code', rows[0].code, 'ME-220');
  eq('نظری از «واحد تئوری»', rows[0].theory, 2);
  eq('عملی از practical_units', rows[0].practical, 1);
  eq('واحد کل استنتاج شد (۲+۱)', rows[0].units, 3);
  eq('مقطع از «مقطع تحصیلی»', rows[0].degreeName, 'کارشناسی ارشد');
  eq('گروه از «دپارتمان»', rows[0].deptName, 'مکانیک');
}

console.log('\n— فایل قدیمیِ ناقص: فقط کد و واحد —');
{
  const { report, rows } = run(
    ['کد درس', 'نام درس', 'واحد', 'نوع'],
    [['GE-100', 'اندیشه اسلامی', 2, 'نظری']],
  );
  eq('بدون خطا', report.errors.length, 0);
  eq('کل واحد نظری در نظر گرفته شد', [rows[0].theory, rows[0].practical], [2, 0]);
  truthy('هشدار تفکیک داده شد', report.warnings.length > 0);
  eq('مقطع خالی می‌ماند (نه صفرِ ساختگی)', rows[0].degreeName, null);
  eq('گروه خالی می‌ماند', rows[0].deptName, null);
}

console.log('\n— درس آزمایشگاهی بدون تفکیک: از روی «نوع» عملی می‌شود —');
{
  const { rows } = run(
    ['کد درس', 'نام درس', 'واحد', 'نوع'],
    [['CE-102', 'آزمایشگاه مدار منطقی', 1, 'آزمایشگاه']],
  );
  eq('واحد به عملی رفت', [rows[0].theory, rows[0].practical], [0, 1]);
}
{
  const { rows } = run(
    ['کد درس', 'نام درس', 'واحد', 'نوع'],
    [['ME-330', 'کارگاه ماشین‌ابزار', 2, 'کارگاه']],
  );
  eq('«کارگاه» هم عملی است', [rows[0].theory, rows[0].practical], [0, 2]);
}

console.log('\n— ناسازگاری جمع واحدها: هشدار، نه حذف ردیف —');
{
  const { report, rows } = run(
    ['کد درس', 'نام درس', 'واحد', 'واحد نظری', 'واحد عملی'],
    [['CE-201', 'ساختمان داده', 3, 1, 1]],
  );
  eq('ردیف حفظ شد', rows.length, 1);
  eq('ملاک، ستون «واحد» است', rows[0].units, 3);
  truthy('هشدار ناسازگاری ثبت شد', report.warnings.some(w => w.msg.includes('جمع واحد')));
  eq('بدون خطا', report.errors.length, 0);
}

console.log('\n— ورودی‌های نامعتبر —');
{
  const { report, rows } = run(['کد درس', 'نام درس', 'واحد'], [['', 'بدون کد', 3]]);
  eq('ردیف بدون کد رد شد', rows.length, 0);
  truthy('خطای «کد درس … الزامی»', report.errors.some(e => e.msg.includes('الزامی')));
}
{
  const { report, rows } = run(['کد درس', 'نام درس', 'واحد'], [['X-1', 'واحد پوچ', 0]]);
  eq('واحد صفر رد شد', rows.length, 0);
  truthy('خطای واحد نامعتبر', report.errors.some(e => e.msg.includes('واحد نامعتبر')));
}
{
  const { rows } = run(['کد درس', 'نام درس', 'واحد'], [['X-2', 'واحد بزرگ', 13]]);
  eq('واحد بیش از ۱۲ رد شد', rows.length, 0);
}
{
  const { report, rows } = run(['کد درس', 'نام درس', 'واحد نظری'], [['X-3', 'فقط نظری', 2]]);
  eq('واحد از نظری استنتاج شد', rows[0]?.units, 2);
  eq('بدون خطا', report.errors.length, 0);
}

console.log('\n— ارقام فارسی و فاصلهٔ اضافه —');
{
  const { rows } = run(
    ['کد درس', 'نام درس', 'واحد', 'واحد نظری', 'واحد عملی'],
    [['CE-303', 'شبکه', '۳', '۲', '۱']],
  );
  eq('ارقام فارسی خوانده شد', [rows[0].units, rows[0].theory, rows[0].practical], [3, 2, 1]);
}

console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
