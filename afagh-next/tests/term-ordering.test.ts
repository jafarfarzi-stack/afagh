import {
  capTerms,
  filterTeachingTerms,
  isTeachingTerm,
  normalizeTermType,
  pickEffectiveTerm,
  resolveSelectedTerm,
  sortTermsChronologically,
  termAcademicYear,
  termCodeNumber,
  termRank,
  termSemesterIndex,
} from '../src/lib/term-scope.ts';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};
const codes = (terms: { termCode: string }[]) => terms.map((t) => t.termCode);
const ids = (terms: { id?: number | null }[]) => terms.map((t) => t.id);

type Row = {
  id: number;
  termCode: string;
  termType?: string | null;
  academicYear?: number | null;
  sortOrder?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
  isCurrent?: boolean;
};

const row = (id: number, termCode: string, termType = 'NORMAL', extra: Partial<Row> = {}): Row => ({
  id, termCode, termType, ...extra,
});

console.log('--- ۱. isTeachingTerm: چه چیزی به دانشجو/استاد نشان داده می‌شود ---');
eq('NORMAL آموزشی است', isTeachingTerm(row(1, '14041', 'NORMAL')), true);
eq('SUMMER آموزشی است', isTeachingTerm(row(2, '14043', 'SUMMER')), true);
eq('EQUIVALENCE آموزشی نیست', isTeachingTerm(row(3, '14046', 'EQUIVALENCE')), false);
eq('SPECIAL آموزشی نیست', isTeachingTerm(row(4, '14049', 'SPECIAL')), false);
eq('حروف کوچک/فاصله نرمال می‌شود', isTeachingTerm(row(5, '14040', ' equivalence ')), false);
eq('نوع تهی تایم است (حذف نمی‌شود)', isTeachingTerm({ termType: null }), true);
eq('نوع تهی در سطح خودِ ترم هم تایم است', isTeachingTerm({}), true);
eq('undefined/null ورودی → true', isTeachingTerm(null), true);
eq('normalizeTermType', normalizeTermType(' summer '), 'SUMMER');
eq('normalizeTermType تهی → رشتهٔ خالی', normalizeTermType(null), '');

console.log('--- ۲. filterTeachingTerms ---');
const mixed = [
  row(1, '14051', 'NORMAL'),
  row(2, '14046', 'EQUIVALENCE'),
  row(3, '14043', 'SUMMER'),
  row(4, '14040', 'EQUIVALENCE'),
  row(5, '14041', 'NORMAL'),
];
eq('پیش‌فرض: معادل‌سازی حذف می‌شود', codes(filterTeachingTerms(mixed)), ['14051', '14043', '14041']);
eq('includeSpecial: همه برمی‌گردند', codes(filterTeachingTerms(mixed, { includeSpecial: true })), ['14051', '14046', '14043', '14040', '14041']);
eq('ورودی دست‌نخورده می‌ماند', mixed.length, 5);
eq('آرایهٔ خالی → خالی', filterTeachingTerms([]), []);
eq('همه معادل‌سازی → خالی', filterTeachingTerms([row(1, '14046', 'EQUIVALENCE'), row(2, '14040', 'EQUIVALENCE')]), []);

console.log('--- ۳. termSemesterIndex / termAcademicYear / termCodeNumber ---');
eq('رقم ۱ = نیمسال اول (۰)', termSemesterIndex('14041'), 0);
eq('رقم ۲ = نیمسال دوم (۱)', termSemesterIndex('14042'), 1);
eq('رقم ۳ = تابستان (۲)', termSemesterIndex('14043'), 2);
eq('رقم ۶ معادل‌سازی → ۳ (آخر)', termSemesterIndex('14046'), 3);
eq('رقم ۰ معادل‌سازی → ۳ (آخر)', termSemesterIndex('14040'), 3);
eq('کد تهی/خالی → ۳', termSemesterIndex(''), 3);
eq('سال از academicYear', termAcademicYear({ termCode: '14051', academicYear: 1405 }), 1405);
eq('سال از کد وقتی academicYear تهی است', termAcademicYear({ termCode: '14051', academicYear: null }), 1405);
eq('کد غیرعددی → سال نامعلوم', termAcademicYear({ termCode: 'A14051', academicYear: null }), null);
eq('کد عددی', termCodeNumber('14046'), 14046);
eq('کد غیرعددی → منفی‌بی‌نهایت', Number.isFinite(termCodeNumber('x')), false);

console.log('--- ۴. sortTermsChronologically: جدید → قدیم ---');
const afagh = [
  row(1, '14051'),
  row(2, '14041'),
  row(3, '14046', 'EQUIVALENCE'),
  row(4, '14042'),
  row(5, '14043', 'SUMMER'),
  row(6, '14040', 'EQUIVALENCE'),
  row(7, '14031'),
  row(8, '14032'),
  row(9, '14033', 'SUMMER'),
  row(10, '14021'),
  row(11, '14022'),
];
eq('سال نزولی، درون سال اول→دوم→تابستان',
  codes(sortTermsChronologically(afagh)),
  ['14051', '14041', '14042', '14043', '14046', '14040', '14031', '14032', '14033', '14021', '14022']);
eq('ترتیبِ ورودی تغییر نمی‌کند', codes(afagh).slice(0, 4), ['14051', '14041', '14046', '14042']);
eq('خالی/تهی → خالی', sortTermsChronologically([]), []);
eq('null → خالی', sortTermsChronologically(null), []);

console.log('--- ۵. معادل‌سازی فیلترشده + مرتب: فقط آموزشی‌ها ---');
eq('فهرست نهایی انتخاب‌گر',
  codes(sortTermsChronologically(filterTeachingTerms(afagh))),
  ['14051', '14041', '14042', '14043', '14031', '14032', '14033', '14021', '14022']);

console.log('--- ۶. سالی که هم NORMAL دارد هم SUMMER (بدون اتکا به تاریخ) ---');
eq('تابستان بعد از نیمسال دوم می‌آید، حتی با startDate وارونه',
  codes(sortTermsChronologically([
    row(1, '14033', 'SUMMER', { startDate: new Date('1999-01-01') }),
    row(2, '14032', 'NORMAL', { startDate: new Date('2030-01-01') }),
    row(3, '14031', 'NORMAL', { startDate: new Date('2031-01-01') }),
  ])),
  ['14031', '14032', '14033']);
eq('ترتیبِ برعکسِ ورودی همان نتیجه',
  codes(sortTermsChronologically([
    row(3, '14031'),
    row(2, '14032'),
    row(1, '14033', 'SUMMER'),
  ])),
  ['14031', '14032', '14033']);

console.log('--- ۷. NULL sortOrder و NULL academicYear ---');
const withNulls = [
  row(1, '14051', 'NORMAL', { sortOrder: null, academicYear: null }),
  row(2, '14042', 'NORMAL', { sortOrder: null, academicYear: 1404 }),
  row(3, '14041', 'NORMAL', { sortOrder: 14041, academicYear: null }),
];
eq('sortOrder تهی بی‌اثر است؛ ترتیب از کد می‌آید',
  codes(sortTermsChronologically(withNulls)), ['14051', '14041', '14042']);
eq('academicYear تهی از کد بازسازی می‌شود',
  termAcademicYear({ termCode: '14051', academicYear: null }), 1405);
eq('همهٔ sortOrderها تهی → باز هم قطعی',
  codes(sortTermsChronologically([
    row(5, '14031', 'NORMAL', { sortOrder: null, academicYear: null }),
    row(2, '14052', 'NORMAL', { sortOrder: null, academicYear: null }),
    row(9, '14041', 'NORMAL', { sortOrder: null, academicYear: null }),
  ])),
  ['14052', '14041', '14031']);

console.log('--- ۸. پایداری برای سال و کد یکسان ---');
const same = [
  row(9, '14041', 'NORMAL', { academicYear: 1404 }),
  row(3, '14041', 'NORMAL', { academicYear: 1404 }),
  row(7, '14041', 'NORMAL', { academicYear: 1404 }),
];
eq('ترتیب قطعی (id صعودی) و مستقل از ترتیب ورودی', ids(sortTermsChronologically(same)), [3, 7, 9]);
eq('تکرارِ فراخوانی همان نتیجه', ids(sortTermsChronologically(same.slice().reverse())), [3, 7, 9]);
eq('id تهی → آخر',
  ids(sortTermsChronologically([{ termCode: '14041' }, { id: 5, termCode: '14041' }])),
  [null, 5]);

console.log('--- ۹. termRank: کلیدهای رتبه‌بندی ---');
eq('رتبه ۱۴۰۵-۱ نیمسال اول',
  termRank(row(1, '14051')), { year: 1405, semester: 0, code: 14051, id: 1 });
eq('رتبهٔ سالِ نامعلوم تهی است', termRank({ termCode: 'ZZZ' }).year, null);
eq('رتبهٔ معادل‌سازیِ همان سال semester=3', termRank(row(2, '14046', 'EQUIVALENCE')).semester, 3);

console.log('--- ۱۰. ترمِ مؤثر از همان فهرستِ فیلترشده ---');
const today = new Date('2026-10-07T09:00:00Z');
const live = [
  { id: 1, termCode: '14051', termType: 'NORMAL', startDate: new Date('2026-09-01'), endDate: new Date('2027-01-15'), isCurrent: false },
  { id: 2, termCode: '14046', termType: 'EQUIVALENCE', startDate: new Date('2026-09-01'), endDate: new Date('2027-01-15'), isCurrent: true },
  { id: 3, termCode: '14043', termType: 'SUMMER', startDate: new Date('2026-06-01'), endDate: new Date('2026-08-01'), isCurrent: false },
];
const teaching = filterTeachingTerms(live);
eq('پرچمِ کهنهٔ معادل‌سازی به ترمِ آموزشی منتقل نمی‌شود',
  pickEffectiveTerm(teaching, today)?.id, 1);
eq('اگر همه معادل‌سازی باشند، فهرست خالی و ترمِ مؤثر تهی',
  pickEffectiveTerm(filterTeachingTerms([live[1]]), today), null);
eq('ترمِ مؤثر پیش از برشِ سقف محاسبه می‌شود (سقف ۳۰ کافی است)',
  pickEffectiveTerm(sortTermsChronologically(teaching).slice(0, 30), today)?.id, 1);

console.log('--- ۱۱. سقفِ فهرست (سال‌های اخیر پنهان نمی‌شوند) ---');
const sixty = Array.from({ length: 60 }, (_, i) => row(i + 1, `14${String(30 + Math.floor(i / 3)).padStart(2, '0')}${(i % 3) + 1}`));
eq('سقف ۳۰ → تازه‌ترین ۳۰', capTerms(sixty, 30).length, 30);
eq('سقف، تازه‌ترین را نگه می‌دارد نه قدیمی‌ترین را',
  capTerms(sixty, 30)[0].termCode, sixty[0].termCode);
eq('limit=null → بدون سقف', capTerms(sixty, null).length, 60);
eq('limit=0 → بدون سقف', capTerms(sixty, 0).length, 60);
eq('سقف بزرگ‌تر از فهرست → کل فهرست', capTerms(sixty, 999).length, 60);

console.log('--- ۱۲. انتخابِ کاربر هرگز با سقفِ فهرست گم نمی‌شود ---');
const ordered = sortTermsChronologically(afagh);
eq('انتخاب داخلِ سقف → همان فهرست',
  (() => { const r = resolveSelectedTerm(ordered, 30, 1); return [r.selectedId, r.terms.length]; })(), [1, 11]);
eq('انتخابِ قدیمی خارج از سقف → به فهرست برمی‌گردد و حذف نمی‌شود',
  (() => { const r = resolveSelectedTerm(ordered, 5, 11); return [r.selectedId, r.terms.length, r.terms.some((t) => t.id === 11)]; })(), [11, 6, true]);
eq('انتخابِ ناموجود → بدون انتخاب',
  (() => { const r = resolveSelectedTerm(ordered, 30, 9999); return [r.selectedId, r.terms.length]; })(), [null, 11]);
eq('کوکی خراب/تهی → بدون انتخاب',
  (() => { const r = resolveSelectedTerm(ordered, 30, null); return [r.selectedId, r.terms.length]; })(), [null, 11]);
eq('فهرست خالی → خالی',
  (() => { const r = resolveSelectedTerm([], 30, 5); return [r.selectedId, r.terms.length]; })(), [null, 0]);

console.log(`\nنتیجه: ${pass} موفق | ${fail} شکست`);
process.exit(fail === 0 ? 0 : 1);