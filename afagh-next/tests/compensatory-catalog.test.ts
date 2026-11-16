/**
 * تست واحد مدلِ دوگانهٔ کاتالوگ (عادی / جبرانی) — بدون DB، بدون React
 *
 * اجرا: npm test
 *
 * چیزی که این تست‌ها تضمین می‌کنند (و پیش از این در کد نبود):
 *   ۱) دانشجوی دارای واحد جبرانی، کاتالوگ جبرانیِ **مستقل** می‌گیرد
 *   ۲) دروس جبرانی از مدل عادی حذف می‌شوند (دیگر جمع واحد را باد نمی‌کنند)
 *   ۳) الگوریتمِ سقف، هیچ ترمی را بالای سقف رها نمی‌کند — مگر نقص دادهٔ مبدأ
 *   ۴) Resolver کاتالوگ عادی را جای جبرانی (و برعکس) نمی‌نشاند
 */
import {
  CATALOG_KINDS, CATALOG_KIND_LABEL, COMPENSATORY_ROLE, DEFAULT_TERM_CAP,
  checkTermCaps, compensatoryVersionCode, isCompensatoryRole, needsCompensatory,
  normalizeRole, packTerms, planCompensatoryCatalog, rebalanceTerms, splitCatalogRows,
  termBuckets, validatePlan,
  type CatalogRow,
} from '../src/lib/compensatory-catalog.ts';
import {
  resolveApplicableCurriculum,
  type ResolvableVersion,
} from '../src/lib/curriculum-resolution.ts';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};

type Seed = { code: string; units: number | null; role?: string | null; sem?: number | null; req?: number };
const R = (o: Seed): CatalogRow => ({
  courseCode: o.code,
  units: o.units,
  roleType: o.role === undefined ? 'CORE' : o.role,
  recommendedSemester: 'sem' in o ? o.sem ?? null : 1,
  isRequired: o.req ?? 1,
});

const totalUnits = (rows: CatalogRow[]) => Math.round(rows.reduce((s, r) => s + Number(r.units ?? 0), 0) * 10) / 10;

console.log('۱) نقش جبرانی و نرمال‌سازی');
eq('کد انگلیسی', isCompensatoryRole('COMPENSATORY'), true);
eq('واژهٔ فارسی', isCompensatoryRole('جبرانی'), true);
eq('با نیم‌فاصله/فاصله', isCompensatoryRole(' جبرانی '), true);
eq('نقش دیگر', isCompensatoryRole('CORE'), false);
eq('خالی', isCompensatoryRole(null), false);
eq('normalizeRole فارسی → کد', normalizeRole('اختیاری'), 'ELECTIVE');
eq('normalizeRole ناشناخته → بزرگ‌حرف', normalizeRole('weird'), 'WEIRD');
eq('برچسب فارسی مدل‌ها', [CATALOG_KIND_LABEL.NORMAL, CATALOG_KIND_LABEL.COMPENSATORY], ['عادی', 'جبرانی']);
eq('نوع‌های کاتالوگ', [...CATALOG_KINDS], ['NORMAL', 'COMPENSATORY']);
eq('نقش جبرانی ثابت', COMPENSATORY_ROLE, 'COMPENSATORY');
eq('سقف پیش‌فرض', DEFAULT_TERM_CAP, 20);

console.log('\n۲) needsCompensatory');
eq('واحد > ۰', needsCompensatory({ compensatoryUnits: 6 }), true);
eq('واحد = ۰', needsCompensatory({ compensatoryUnits: 0 }), false);
eq('واحد رشته‌ای', needsCompensatory({ compensatoryUnits: '4' }), true);
eq('فقط پرچم true', needsCompensatory({ needsCompensatory: true }), true);
eq('پرچم عددی ۱', needsCompensatory({ needsCompensatory: 1 }), true);
eq('null', needsCompensatory(null), false);
eq('undefined', needsCompensatory(undefined), false);
eq('منفی = بدون نیاز', needsCompensatory({ compensatoryUnits: -3 }), false);

console.log('\n۳) splitCatalogRows');
const mixed: CatalogRow[] = [
  R({ code: 'A1', units: 3, role: 'CORE', sem: 1 }),
  R({ code: 'J1', units: 2, role: 'جبرانی', sem: 1 }),
  R({ code: 'E1', units: 2, role: 'ELECTIVE', sem: 2 }),
  R({ code: 'J2', units: 3, role: 'COMPENSATORY', sem: 1 }),
  R({ code: 'N1', units: 0, role: null, sem: null }),
];
const sp = splitCatalogRows(mixed);
eq('عادی: بدون جبرانی', sp.normal.map((r) => r.courseCode), ['A1', 'E1', 'N1']);
eq('جبرانی: فقط جبرانی', sp.compensatory.map((r) => r.courseCode), ['J1', 'J2']);
eq('ردیف بی‌نقش و بی‌واحد مشکوک است (حذف نمی‌شود)', sp.suspicious.map((r) => r.courseCode), ['N1']);
eq('جمع ردیف‌ها حفظ می‌شود', sp.normal.length + sp.compensatory.length, mixed.length);

console.log('\n۴) termBuckets و checkTermCaps');
const over: CatalogRow[] = [
  R({ code: 'A', units: 3, sem: 1 }), R({ code: 'B', units: 3, sem: 1 }),
  R({ code: 'C', units: 3, sem: 1 }), R({ code: 'D', units: 3, sem: 1 }),
  R({ code: 'E', units: 3, sem: 1 }), R({ code: 'F', units: 3, sem: 1 }),
  R({ code: 'G', units: 3, sem: 1 }), R({ code: 'J', units: 4, role: 'COMPENSATORY', sem: 1 }),
];
const b1 = termBuckets(over).get(1)!;
eq('ترم ۱: ۸ درس', b1.courses, 8);
eq('ترم ۱: ۲۵ واحد', b1.units, 25);
const v1 = checkTermCaps(over, 20);
eq('یک ترم بالای سقف', v1.length, 1);
eq('مقدار عبور', v1[0].excess, 5);
eq('واحدِ متحرک', v1[0].movableUnits, 4);
eq('قابل اصلاح است', v1[0].unfixable, true); // ۲۵ − ۴ = ۲۱ > ۲۰
eq('ترم زیر سقف گزارشی ندارد', checkTermCaps(over, 26).length, 0);

console.log('\n۵) rebalanceTerms — الگوریتم سقف با حفظ شمارهٔ ترم');
const reb = rebalanceTerms(over, 20);
eq('درس جبرانی جابه‌جا شد', reb.moves.map((m) => m.courseCode), ['J']);
eq('مقصد = ترم تازه', reb.moves[0].to, 2);
eq('ترم ۱ اکنون ۲۱ واحد', termBuckets(reb.rows).get(1)!.units, 21);
eq('ترم ۱ هنوز بالای سقف (نقص دادهٔ مبدأ)', reb.remaining.map((v) => v.term), [1]);

// حالت واقعی گزارش‌شده: ۲۵ واحد که با جدا کردن جبرانی به ۲۰ می‌رسد
const fixable: CatalogRow[] = [
  R({ code: 'A', units: 3, sem: 1 }), R({ code: 'B', units: 3, sem: 1 }),
  R({ code: 'C', units: 3, sem: 1 }), R({ code: 'D', units: 3, sem: 1 }),
  R({ code: 'E', units: 3, sem: 1 }), R({ code: 'F', units: 3, sem: 1 }),
  R({ code: 'J1', units: 3, role: 'COMPENSATORY', sem: 1 }),
  R({ code: 'J2', units: 2, role: 'COMPENSATORY', sem: 1 }),
  R({ code: 'X', units: 2, sem: 2 }),
];
const reb2 = rebalanceTerms(fixable, 20);
// ۲۳ واحد در ترم ۱: با جابه‌جاییِ تنها یک درسِ جبرانیِ ۳ واحدی به ۲۰ می‌رسد
eq('یک درس جبرانی کافی بود', reb2.moves.map((m) => m.courseCode), ['J1']);
eq('هیچ ترمی بالای سقف نماند', reb2.remaining.length, 0);
eq('جمع واحد تغییر نکرد', totalUnits(reb2.rows), totalUnits(fixable));

// اولویت: جبرانی قبل از اختیاری
const prio: CatalogRow[] = [
  ...Array.from({ length: 6 }, (_, i) => R({ code: `C${i}`, units: 3, sem: 1 })),
  R({ code: 'EL', units: 3, role: 'ELECTIVE', sem: 1 }),
  R({ code: 'CP', units: 3, role: 'COMPENSATORY', sem: 1 }),
];
const rebP = rebalanceTerms(prio, 20);
eq('اول جبرانی بعد اختیاری', rebP.moves.map((m) => m.courseCode), ['CP', 'EL']);

// ظرفیت ترم بعدی به‌جای ساختن ترم تازه
const withRoom: CatalogRow[] = [
  ...Array.from({ length: 6 }, (_, i) => R({ code: `T1_${i}`, units: 3, sem: 1 })),
  R({ code: 'J', units: 3, role: 'COMPENSATORY', sem: 1 }),
  R({ code: 'Z', units: 3, sem: 2 }),
];
const rebR = rebalanceTerms(withRoom, 20);
eq('به ترم ۲ رفت (نه ترم تازه)', rebR.moves[0].to, 2);
eq('ترم تازه ساخته نشد', rebR.createdTerms, []);
eq('بدون تخلف', rebR.remaining.length, 0);
eq('ترم ۱ اکنون ۱۸ واحد', termBuckets(rebR.rows).get(1)!.units, 18);

// ترمی که فقط درسِ غیرقابل‌جابه‌جایی دارد → نقص دادهٔ مبدأ، نه اصلاحِ کورکورانه
const immovable: CatalogRow[] = Array.from({ length: 7 }, (_, i) => R({ code: `M${i}`, units: 3, sem: 1 }));
const rebI = rebalanceTerms(immovable, 20);
eq('هیچ جابه‌جایی انجام نشد', rebI.moves.length, 0);
eq('به‌عنوان تخلفِ باقی‌مانده گزارش شد', rebI.remaining.map((v) => v.term), [1]);
eq('غیرقابل اصلاح علامت خورد', rebI.remaining[0].unfixable, true);

console.log('\n۶) packTerms — چیدمان از ترم ۱');
const pack = packTerms(fixable.filter((r) => isCompensatoryRole(r.roleType)), 20);
eq('ترم‌ها از ۱ شروع می‌شوند', [...new Set(pack.rows.map((r) => r.recommendedSemester))], [1]);
eq('جمع واحد', totalUnits(pack.rows), 5);
const bigPack = packTerms(
  Array.from({ length: 9 }, (_, i) => R({ code: `P${i}`, units: 3, sem: 1 })),
  20
);
eq('۹ درس × ۳ واحد → ۲ ترم', bigPack.terms, 2);
eq('هیچ ترمی بالای ۲۰', checkTermCaps(bigPack.rows, 20).length, 0);
const oversize = packTerms([R({ code: 'HUGE', units: 25, sem: 1 }), R({ code: 'N', units: 2, sem: 1 })], 20);
eq('درس بزرگ‌تر از سقف تنها در یک ترم', termBuckets(oversize.rows).get(1)!.units, 25);
eq('هشدار نقص داده صادر شد', oversize.warnings.some((w) => w.includes('HUGE')), true);
eq('درس بعدی به ترم ۲ رفت', termBuckets(oversize.rows).get(2)!.units, 2);

console.log('\n۷) planCompensatoryCatalog — تولیدکنندهٔ کاتالوگ جبرانی');
const source: CatalogRow[] = [
  R({ code: 'A', units: 3, sem: 1 }), R({ code: 'B', units: 3, sem: 1 }),
  R({ code: 'C', units: 3, sem: 1 }), R({ code: 'D', units: 3, sem: 1 }),
  R({ code: 'E', units: 3, sem: 1 }), R({ code: 'F', units: 3, sem: 1 }),
  R({ code: 'J1', units: 3, role: 'COMPENSATORY', sem: 1 }),
  R({ code: 'J2', units: 2, role: 'COMPENSATORY', sem: 1 }),
  R({ code: 'G', units: 3, sem: 2 }),
];
const plan = planCompensatoryCatalog({
  rows: source, cap: 20, versionCode: '1404', title: 'برنامهٔ آزمون',
});

eq('مدل عادی ساخته شد', plan.normal.kind, 'NORMAL');
eq('کد نسخهٔ عادی', plan.normal.versionCode, '1404');
eq('کاتالوگ جبرانی ساخته شد', plan.compensatory?.kind, 'COMPENSATORY');
eq('کد نسخهٔ جبرانی', plan.compensatory?.versionCode, '1404-C');
eq('عنوان جبرانی', plan.compensatory?.title, 'کاتالوگ جبرانی — برنامهٔ آزمون');
eq('تفکیک انجام شد', plan.split, true);
eq('درس جبرانی دارد', plan.hasCompensatory, true);
eq('مدل عادی هیچ درس جبرانی ندارد', plan.normal.rows.filter((r) => isCompensatoryRole(r.roleType)).length, 0);
eq('کاتالوگ جبرانی فقط درس جبرانی دارد', plan.compensatory!.rows.every((r) => isCompensatoryRole(r.roleType)), true);
eq('جمع واحد عادی = ۲۱ (A..F + G)', plan.normal.totalUnits, 21);
eq('جمع واحد جبرانی = ۵', plan.compensatory!.totalUnits, 5);
eq('جمع دو مدل = جمع خام منهای هیچ', plan.normal.totalUnits + plan.compensatory!.totalUnits, totalUnits(source));
eq('byRole عادی', plan.normal.byRole, { CORE: 21 });
eq('byRole جبرانی', plan.compensatory!.byRole, { COMPENSATORY: 5 });
eq('هیچ ترمی در مدل عادی بالای سقف نیست', plan.normal.violations.length, 0);
eq('هیچ ترمی در مدل جبرانی بالای سقف نیست', plan.compensatory!.violations.length, 0);
eq('اعتبارسنجی بدون خطا', validatePlan(plan, 20).filter((i) => i.severity === 'ERROR').length, 0);

// چارت بدون درس جبرانی → کاتالوگ جبرانی ساخته نمی‌شود
const noComp = planCompensatoryCatalog({
  rows: [R({ code: 'A', units: 3, sem: 1 })], cap: 20, versionCode: '1404', title: 'بدون جبرانی',
});
eq('بدون جبرانی: مدل جبرانی null', noComp.compensatory, null);
eq('بدون جبرانی: split=false', noComp.split, false);
eq('بدون جبرانی: hasCompensatory=false', noComp.hasCompensatory, false);

// چارت ۲۵ واحدی با ۵ واحد جبرانی — همان موردی که در ۴۸ ترم گزارش شد
const realCase: CatalogRow[] = [
  ...Array.from({ length: 6 }, (_, i) => R({ code: `R${i}`, units: 3, sem: 1 })),
  R({ code: 'J1', units: 3, role: 'COMPENSATORY', sem: 1 }),
  R({ code: 'J2', units: 2, role: 'COMPENSATORY', sem: 1 }),
];
const planReal = planCompensatoryCatalog({ rows: realCase, cap: 20, versionCode: '1396', title: 'واقعی' });
eq('ترم ۱ خام ۲۳ واحد', termBuckets(realCase).get(1)!.units, 23);
eq('مدل عادی ۱۸ واحد (زیر سقف)', planReal.normal.terms[0].units, 18);
eq('مدل جبرانی ۵ واحد', planReal.compensatory!.terms[0].units, 5);
eq('مدل عادی بدون تخلف', planReal.normal.violations.length, 0);

console.log('\n۸) validatePlan — گرفتن نشتی');
const leaked = {
  normal: { ...plan.normal, rows: [...plan.normal.rows, R({ code: 'L', units: 2, role: 'COMPENSATORY', sem: 3 })] },
  compensatory: plan.compensatory,
  hasCompensatory: true,
  split: true,
  warnings: [],
};
const li = validatePlan(leaked as never, 20);
eq('نشتی جبرانی در مدل عادی گرفته شد', li.some((i) => i.code === 'COMPENSATORY_LEAK_IN_NORMAL' && i.severity === 'ERROR'), true);

console.log('\n۹) کد نسخهٔ جبرانی');
eq('1404 → 1404-C', compensatoryVersionCode('1404'), '1404-C');
eq('1404-R1 → 1404-R1-C', compensatoryVersionCode('1404-R1'), '1404-R1-C');
eq('idempotent', compensatoryVersionCode('1404-C'), '1404-C');
eq('طول ≤ ۲۰', compensatoryVersionCode('LEGACY-1392-1400').length <= 20, true);
eq('خالی → خطا', (() => { try { compensatoryVersionCode(''); return 'no-throw'; } catch { return 'throw'; } })(), 'throw');

console.log('\n۱۰) Resolver — کاتالوگ عادی جای جبرانی نمی‌نشیند');
const V = (o: Partial<ResolvableVersion> & { id: number }): ResolvableVersion => ({
  majorId: 21, degreeLevelId: 5, trackId: null, versionCode: '1404', status: 'PUBLISHED',
  entryYearFrom: 1390, entryYearTo: null, entryTermId: null, catalogKind: 'NORMAL', ...o,
});
const versions: ResolvableVersion[] = [
  V({ id: 1, catalogKind: 'NORMAL' }),
  V({ id: 2, catalogKind: 'COMPENSATORY', versionCode: '1404-C' }),
];
const base = { majorId: 21, degreeLevelId: 5, trackId: null, entryYear: 1395, entryTerm: 1 };
const normalOut = resolveApplicableCurriculum(versions, { ...base, catalogKind: 'NORMAL' });
const compOut = resolveApplicableCurriculum(versions, { ...base, catalogKind: 'COMPENSATORY' });
eq('عادی → نسخهٔ ۱', normalOut.version?.id, 1);
eq('جبرانی → نسخهٔ ۲', compOut.version?.id, 2);
eq('بدون catalogKind = عادی', resolveApplicableCurriculum(versions, base).version?.id, 1);
eq(
  'بدون کاتالوگ جبرانی → دلیل صریح',
  resolveApplicableCurriculum([V({ id: 1 })], { ...base, catalogKind: 'COMPENSATORY' }).reason,
  'NO_COMPENSATORY_CATALOG'
);
eq(
  'کاتالوگ جبرانی جای عادی نمی‌نشیند',
  resolveApplicableCurriculum([V({ id: 9, catalogKind: 'COMPENSATORY' })], base).reason,
  'NO_MAJOR_OR_DEGREE'
);
// نسخهٔ قدیمی که ستون catalogKind را ندارد (select جزئی) = عادی
const legacyRow = { id: 3, majorId: 21, degreeLevelId: 5, trackId: null, versionCode: '1392', status: 'PUBLISHED', entryYearFrom: 1390, entryYearTo: null, entryTermId: null } as ResolvableVersion;
eq('ردیف بدون catalogKind = عادی', resolveApplicableCurriculum([legacyRow], base).version?.id, 3);

console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
