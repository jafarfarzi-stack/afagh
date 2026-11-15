/**
 * تست واحدِ «نوع انتخاب شهریه» در کارنامهٔ مالی.
 *
 * اجرا: npm test
 *
 * ریشهٔ باگ: ستون از `tuition_coefficients.variableCoefficient` خوانده می‌شد،
 * اما آن جدول در تولید صفر ردیف دارد ⇒ ستون همیشه «—» بود، در حالی که
 * کارنامهٔ سما آن را پر چاپ می‌کرد (TuitionTypeId).
 *
 * منبعِ درست همان `students.tuitionType` است که با کدهای COURSTYPE مهاجرت
 * شده و نگاشتش در `student-labels.ts` هست.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { courseTypeFa, COURSE_TYPE_FA } from '../src/lib/student-labels.ts';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};

console.log('\n۱) نگاشت کدهای COURSTYPE (همان TuitionTypeId سما)');
eq('کد ۱ = روزانه', courseTypeFa('1'), 'روزانه');
eq('کد ۲ = شبانه', courseTypeFa('2'), 'شبانه');
// کدی که بیشترین دانشجو را در تولید دارد
eq('کد ۴ = غیرانتفاعی', courseTypeFa('4'), 'غیرانتفاعی');
eq('کد ۸ = دوره‌های آموزش عالی آزاد', courseTypeFa('8'), 'دوره‌های آموزش عالی آزاد');
eq('کد ۱۰ = مجازی', courseTypeFa('10'), 'مجازی');
eq('کد ۰ = نامشخص', courseTypeFa('0'), 'نامشخص');

console.log('\n۲) ورودی‌های تهی/نامعتبر → خط تیره (نه استثنا)');
eq('null', courseTypeFa(null), '—');
eq('undefined', courseTypeFa(undefined), '—');
eq('رشتهٔ خالی', courseTypeFa('   '), '—');
eq('کدِ ناموجود (۹۹) خودش برمی‌گردد', courseTypeFa('99'), '99');

console.log('\n۳) فهرستِ کدها کامل است (هیچ کدی بدون برچسب نماند)');
for (const [code, label] of Object.entries(COURSE_TYPE_FA)) {
  eq(`کد ${code} برچسب دارد`, typeof label === 'string' && label.length > 0, true);
}

console.log('\n۴) نگهبانِ ایستا: کارنامه دیگر از منبعِ خالی نمی‌خواند');
const root = join(import.meta.dirname, '..');
const comp = readFileSync(join(root, 'src/components/FinancialTranscript.tsx'), 'utf8');
eq('ستون از courseTypeFa می‌آید', comp.includes('courseTypeFa(studentType)'), true);
eq('ستون مقدارِ دانشجو را می‌گیرد', comp.includes('tuitionSelectionLabel(c, student.courseType)'), true);
eq('سربرگ «نوع دوره» هم نگاشت می‌شود', comp.includes('{courseTypeFa(student.courseType)}'), true);
// ضریبِ نیمسال فقط جایگزینِ ثانویه است، نه منبعِ اصلی
eq(
  'ضریب فقط به‌عنوان fallback مانده',
  /if \(label !== '—'\) return label;/.test(comp),
  true,
);

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} موفق، ${fail} ناموفق\n`);
if (fail > 0) process.exit(1);
