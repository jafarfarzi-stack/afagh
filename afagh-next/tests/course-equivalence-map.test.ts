/**
 * تست واحد «هم‌ارزی درس در همان دانشگاه» + تشخیص درس تکراری
 * منطق خالص src/lib/course-equivalence-map.ts — بدون DB
 *
 * چیزی که تضمین می‌کند:
 *   ۱) هم‌ارزی متقارن و متعدی است (باگ «از یک طرف کار می‌کند»)
 *   ۲) مجموعهٔ پاس‌شده با هم‌ارزها گسترده می‌شود ولی واحدها دست نمی‌خورند
 *   ۳) «یک عنوان، دو کد» در یک ترم درست تشخیص داده می‌شود و در ترم‌های
 *      مختلف یا با کد یکسان، جفت ساخته نمی‌شود
 *   ۴) قاعدهٔ «کدام بماند» قطعی و مستقل از ترتیب ورودی است
 */
import {
  buildEquivalenceIndex,
  chooseKeep,
  expandPassedCourseIds,
  findDuplicatePairs,
  joinEquivalentCodes,
  mergeEquivalentCodes,
  parseEquivalentCodes,
  titleKey,
  type EquivCourseRow,
  type TitleRow,
} from '../src/lib/course-equivalence-map.ts';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};

console.log('۱) تجزیهٔ فیلد هم‌ارزی');
eq('کاما لاتین', parseEquivalentCodes('99055,91003'), ['99055', '91003']);
eq('کاما فارسی + لوله + فاصله', parseEquivalentCodes('99055،91003|45003 43107'), ['99055', '91003', '45003', '43107']);
eq('بدون تکرار', parseEquivalentCodes('A,A,B'), ['A', 'B']);
eq('خالی', parseEquivalentCodes(null), []);
eq('فاصلهٔ اضافه', parseEquivalentCodes('  a , b '), ['A', 'B']);
eq('ساخت متن', joinEquivalentCodes(['b', 'a', 'b']), 'B,A');
eq('ساخت متن خالی', joinEquivalentCodes([]), null);

console.log('\n۲) ادغام بدون پاک‌کردن لیست موجود');
eq('افزودن به لیست موجود', mergeEquivalentCodes('91003,45003', ['43107'], '99055'), '91003,45003,43107');
eq('خوددرس اضافه نمی‌شود', mergeEquivalentCodes(null, ['99055'], '99055'), null);
eq('تکراری اضافه نمی‌شود', mergeEquivalentCodes('43107', ['43107'], '99055'), '43107');
eq('لیست خالی + افزودن', mergeEquivalentCodes(null, ['43107'], '99055'), '43107');

console.log('\n۳) ایندکس هم‌ارزی');
const courses: EquivCourseRow[] = [
  { id: 1, code: 'A', equivalentCourseCodes: 'B' },          // یک‌طرفه
  { id: 2, code: 'B', equivalentCourseCodes: null },
  { id: 3, code: 'C', equivalentCourseCodes: 'B, ZZZ' },     // زنجیره + کد ناموجود
  { id: 4, code: 'D', equivalentCourseCodes: null },         // تنها
  { id: 5, code: 'E', equivalentCourseCodes: 'E' },          // خودارجاع
];
const idx = buildEquivalenceIndex(courses);
eq('A ↔ B,C (تقارن + بستار)', [...(idx.byId.get(1) ?? [])].sort(), [2, 3]);
eq('B ↔ A (تقارن از طرف مقابل)', [...(idx.byId.get(2) ?? [])].sort(), [1, 3]);
eq('C ↔ A,B (بستار متعدی)', [...(idx.byId.get(3) ?? [])].sort(), [1, 2]);
eq('D هم‌ارز ندارد', idx.byId.get(4), undefined);
eq('خودارجاع نادیده گرفته شد', idx.byId.get(5), undefined);
eq('کد ناموجود گزارش شد', idx.missingCodes, ['ZZZ']);
eq('جفت مستقیم', idx.directPairs, 2);

console.log('\n۴) گسترش مجموعهٔ پاس‌شده');
const expanded = expandPassedCourseIds([2], idx);
eq('پاس‌کردن B ⇒ A و C هم پاس‌شده', [...expanded].sort(), [1, 2, 3]);
const expanded2 = expandPassedCourseIds([4], idx);
eq('درس بدون هم‌ارز فقط خودش', [...expanded2], [4]);
const expanded3 = expandPassedCourseIds([2, 4], idx);
eq('ترکیب', [...expanded3].sort(), [1, 2, 3, 4]);
eq('مجموعهٔ خالی', [...expandPassedCourseIds([], idx)], []);
// شکل Map هم پذیرفته می‌شود
const m = new Map<number, Set<number>>([[1, new Set([2])]]);
eq('Map ساده', [...expandPassedCourseIds([1], m)].sort(), [1, 2]);

console.log('\n۵) کلید عنوان');
eq('ی/ک عربی یکسان', titleKey('اقتصاد خرد') === titleKey('اقتصاد خرد'), true);
eq('نیم‌فاصله حذف می‌شود', titleKey('شیمی‌عمومی۲'), titleKey('شیمی عمومی 2'));
eq('«شيمي عمومي 2» = «شیمی عمومی ۲»', titleKey('شيمي عمومي 2') === titleKey('شیمی عمومی ۲'), true);
eq('عنوان خالی', titleKey(null), '');

console.log('\n۶) تشخیص درس تکراری');
const mk = (rowId: number, courseId: number, code: string, title: string, term: number | null, units = 3): TitleRow =>
  ({ rowId, courseId, code, title, units, role: 'CORE', term });
const rows: TitleRow[] = [
  mk(1, 101, '43107', 'اقتصاد خرد', 1),
  mk(2, 102, '99055', 'اقتصاد خرد', 1),     // تکراری با ۱
  mk(3, 103, '43108', 'اقتصاد کلان', 1),    // ترم ۱، عنوان دیگر
  mk(4, 104, '43107', 'اقتصاد خرد', 2),     // همان کد، ترم دیگر → تکراری نیست
  mk(5, 105, '54015', 'بيوشيمي متابوليسم', 4, 3),
  mk(6, 106, '54103', 'بيوشيمي متابوليسم', 4, 2),
  mk(7, 107, '54003', 'شيمي عمومي 2', 2),
  mk(8, 108, '54182', 'شيمي عمومي2', 2),    // همان عنوان بدون فاصله
];
const pairs = findDuplicatePairs(rows);
eq('سه جفت پیدا شد', pairs.length, 3);
eq('جفت اقتصاد خرد', pairs.find((p) => p.title.includes('اقتصاد خرد'))?.codeA + '/' + pairs.find((p) => p.title.includes('اقتصاد خرد'))?.codeB, '43107/99055');
eq('جفت شیمی (نرمال‌سازی فاصله)', !!pairs.find((p) => p.codeB === '54182'), true);
eq('همان کد در ترم دیگر جفت نمی‌سازد', pairs.some((p) => p.codeA === '43107' && p.term === 2), false);
eq('درس تک، جفت نمی‌سازد', pairs.some((p) => p.codeA === '43108' || p.codeB === '43108'), false);

// سه‌گانه: سه کد با یک عنوان در یک ترم → سه جفت
const triple: TitleRow[] = [
  mk(11, 1, 'X1', 'درس مشترک', 1), mk(12, 2, 'X2', 'درس مشترک', 1), mk(13, 3, 'X3', 'درس مشترک', 1),
];
eq('سه‌گانه → سه جفت', findDuplicatePairs(triple).length, 3);

console.log('\n۷) قاعدهٔ «کدام بماند»');
const base = { codeA: '43107', codeB: '99055', catalogsA: 1, catalogsB: 11, passedA: 79, passedB: 391, unitsA: 3, unitsB: 3 };
const d1 = chooseKeep(base);
eq('حضور در کاتالوگ‌های بیشتر مقدم است', [d1.keepCode, d1.dropCode], ['99055', '43107']);
eq('دلیل ذکر می‌شود', d1.reason.includes('کاتالوگ'), true);

const d2 = chooseKeep({ ...base, catalogsA: 3, catalogsB: 3 });
eq('تساوی کاتالوگ → قبولی بیشتر', [d2.keepCode, d2.dropCode], ['99055', '43107']);
eq('دلیل قبولی', d2.reason.includes('پاس'), true);

const d3 = chooseKeep({ ...base, catalogsA: 3, catalogsB: 3, passedA: 100, passedB: 100, unitsA: 3, unitsB: 2 });
eq('تساوی قبولی → واحد بیشتر', [d3.keepCode, d3.dropCode], ['43107', '99055']);

const d4 = chooseKeep({ ...base, catalogsA: 3, catalogsB: 3, passedA: 1, passedB: 1, unitsA: 3, unitsB: 3 });
eq('تساوی کامل → کد کوچک‌تر', [d4.keepCode, d4.dropCode], ['43107', '99055']);

// قطعیت: جابه‌جایی ترتیب ورودی نباید تصمیم را عوض کند
const d5 = chooseKeep({ codeA: '99055', codeB: '43107', catalogsA: 11, catalogsB: 1, passedA: 391, passedB: 79, unitsA: 3, unitsB: 3 });
eq('مستقل از ترتیب ورودی', d5.keepCode, d1.keepCode);

console.log('\n۸) موارد واقعی گزارش‌شده');
const real = [
  { a: '43107', b: '99055', catA: 1, catB: 11, keep: '99055' },
  { a: '43108', b: '99056', catA: 1, catB: 31, keep: '99056' },
  { a: '99116', b: '99311', catA: 9, catB: 12, keep: '99311' },
  { a: '48057', b: '48072', catA: 2, catB: 1, keep: '48057' },
  { a: '54003', b: '54182', catA: 3, catB: 1, keep: '54003' },
  { a: '54027', b: '54116', catA: 3, catB: 1, keep: '54027' },
];
for (const r of real) {
  const d = chooseKeep({
    codeA: r.a, codeB: r.b, catalogsA: r.catA, catalogsB: r.catB,
    passedA: 0, passedB: 0, unitsA: 3, unitsB: 3,
  });
  eq(`${r.a}/${r.b} → ${r.keep}`, d.keepCode, r.keep);
}

console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
