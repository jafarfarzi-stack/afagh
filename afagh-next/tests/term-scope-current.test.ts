/**
 * ═══════════════════════════════════════════════════════════════════════
 *  «ترمِ جاری» بر پایهٔ تاریخ — به‌جای تکیه بر پرچم دستی isCurrent
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  مسیرهای قدیمی (`currentTermFor`) فقط `isCurrent=1` را می‌پرسیدند و در
 *  پروداکشن سه ردیف هم‌زمان `isCurrent=1` بود (شمس ۱۳۹۹‑۱۴۰۰، آفاق ۱۴۰۵‑۱۴۰۶،
 *  علامه ۱۴۰۳‑۱۴۰۴) — یکی از آن‌ها سال‌ها کهنه بود ولی هنوز «جاری» شمرده می‌شد.
 *  این تست منطقِ انتخاب را بدون هیچ اتصالی به پایگاه داده می‌سنجد: لایهٔ داده
 *  با تابع ساختگی تزریق می‌شود و فقط تاریخ‌های ساختگی به منطق داده می‌شود.
 *
 *  اجرا: npx tsx tests/term-scope-current.test.ts
 */
import { pickEffectiveTerm, termContainsToday, type TermScope } from '../src/lib/term-scope.ts';
import { currentTermFor, pickEffectiveTermId, type AcademicTermRow } from '../src/lib/terms.ts';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};
const ok = (name: string, cond: unknown) => eq(name, !!cond, true);

const D = (s: string) => new Date(s);
const T = (
  id: number,
  termCode: string,
  startDate: Date | null,
  endDate: Date | null,
  isCurrent = false,
): TermScope => ({ id, termCode, title: `term-${termCode}`, startDate, endDate, isCurrent, isEffectiveCurrent: false });

const TODAY = D('2026-10-07T09:00:00Z');

console.log('--- ۱. termContainsToday: دامنهٔ شاملِ امروز ---');
eq('دقیقاً روز شروع = شامل',
  termContainsToday(T(1, 'A', D('2026-10-07T00:00:00Z'), D('2026-12-20T00:00:00Z')), TODAY), true);
eq('دقیقاً روز پایان = شامل',
  termContainsToday(T(1, 'A', D('2026-09-01T00:00:00Z'), D('2026-10-07T23:59:59Z')), TODAY), true);
eq('قبل از شروع = شامل نیست',
  termContainsToday(T(1, 'A', D('2026-10-08T00:00:00Z'), D('2026-12-20T00:00:00Z')), TODAY), false);
eq('بعد از پایان = شامل نیست',
  termContainsToday(T(1, 'A', D('2026-08-01T00:00:00Z'), D('2026-09-30T00:00:00Z')), TODAY), false);

console.log('--- ۲. termContainsToday: startDate و endDate تهی ---');
eq('startDate تهی هرگز شامل نمی‌شود',
  termContainsToday(T(1, 'A', null, null), TODAY), false);
eq('endDate تهی = باز و شاملِ نامحدود',
  termContainsToday(T(1, 'A', D('2020-01-01T00:00:00Z'), null), TODAY), true);
eq('endDate تهی ولی هنوز شروع نشده = نه',
  termContainsToday(T(1, 'A', D('2027-01-01T00:00:00Z'), null), TODAY), false);
eq('تاریخ نامعتبر (NaN) در شروع = نه',
  termContainsToday(T(1, 'A', new Date('nonsense'), null), TODAY), false);
eq('تاریخ نامعتبر (NaN) در پایان = ادامهٔ باز',
  termContainsToday(T(1, 'A', D('2020-01-01T00:00:00Z'), new Date('nonsense')), TODAY), true);

console.log('--- ۳. pickEffectiveTerm: اولویت تاریخ بر پرچم ---');
const overlapping = [
  T(10, 'OLD', D('2026-08-01T00:00:00Z'), D('2026-12-20T00:00:00Z'), true),
  T(11, 'NEW', D('2026-09-20T00:00:00Z'), D('2027-01-20T00:00:00Z'), false),
];
eq('هم‌پوشانی: دیرترین startDate می‌برد (نه پرچم‌دار)',
  pickEffectiveTerm(overlapping, TODAY)?.id, 11);
eq('اگر پرچم‌دار همان دیرترین باشد، همان برنده است',
  pickEffectiveTerm([overlapping[0], { ...overlapping[1], isCurrent: true }], TODAY)?.id, 11);
eq('ترمِ در جریانِ باز (endDate تهی) برنده است',
  pickEffectiveTerm([T(10, 'OLD', D('2026-08-01T00:00:00Z'), D('2026-09-30T00:00:00Z')), T(11, 'OPEN', D('2026-09-20T00:00:00Z'), null)], TODAY)?.id, 11);
eq('startDate تهی هرگز برنده نمی‌شود',
  pickEffectiveTerm([T(9, 'NULL', null, null, true), T(11, 'OPEN', D('2026-09-20T00:00:00Z'), null)], TODAY)?.id, 11);

console.log('--- ۴. pickEffectiveTerm: هیچ ترمی شاملِ امروز نیست → زنجیرهٔ پشتیبان ---');
const pastAll = [
  T(20, 'P1', D('2024-09-01T00:00:00Z'), D('2025-01-15T00:00:00Z')),
  T(21, 'P2', D('2025-09-01T00:00:00Z'), D('2026-01-15T00:00:00Z')),
];
eq('امروز بعد از همه: پرچم isCurrent',
  pickEffectiveTerm([...pastAll, T(22, 'FLAG', D('2024-01-01T00:00:00Z'), D('2024-06-01T00:00:00Z'), true)], TODAY)?.id, 22);
eq('امروز بعد از همه و بی‌پرچم: آخرین ترمِ شروع‌شده',
  pickEffectiveTerm(pastAll, TODAY)?.id, 21);
const futureAll = [
  T(30, 'F1', D('2027-09-01T00:00:00Z'), D('2028-01-15T00:00:00Z')),
  T(31, 'F2', D('2028-09-01T00:00:00Z'), D('2029-01-15T00:00:00Z')),
];
eq('امروز قبل از همه: نزدیک‌ترین ترمِ آینده',
  pickEffectiveTerm(futureAll, TODAY)?.id, 30);
eq('امروز قبل از همه ولی پرچم‌دار: پرچم مقدم است',
  pickEffectiveTerm([...futureAll, T(32, 'FLAG', D('2026-01-01T00:00:00Z'), D('2026-06-01T00:00:00Z'), true)], TODAY)?.id, 32);
eq('آرایهٔ خالی → null', pickEffectiveTerm([], TODAY), null);
eq('null/undefined → null', pickEffectiveTerm(null as unknown as TermScope[], TODAY), null);

console.log('--- ۵. pickEffectiveTermId ---');
eq('شناسهٔ ترمِ مؤثر', pickEffectiveTermId(overlapping, TODAY), 11);
eq('شناسهٔ خالی → null', pickEffectiveTermId([], TODAY), null);
eq('آرایهٔ تهی → null', pickEffectiveTermId(null, TODAY), null);

console.log('--- ۶. دامنهٔ دانشگاه: هرگز ترمِ دانشگاه دیگر ---');
const unis = {
  1: [T(111, 'A14051', D('2026-09-23T00:00:00Z'), D('2027-02-15T00:00:00Z'), true)],
  3: [T(627, 'S14032', D('2025-09-23T00:00:00Z'), D('2026-02-15T00:00:00Z'), true)],
  4: [T(657, 'SH13992', D('2021-01-01T00:00:00Z'), D('2021-06-01T00:00:00Z'), true)],
};

const scoped = (universityId: number) => async () => unis[universityId as keyof typeof unis] ?? [];

console.log('--- ۷. currentTermFor: تفکیک دانشگاهی و زنجیرهٔ تاریخ ---');
const fakeRow = (id: number, universityId: number, termCode: string) => ({
  id, universityId, termCode, title: `term-${termCode}`, termType: 'NORMAL', sortOrder: 0,
  academicYear: 0, isCurrent: 1, isSummer: 0, isEnrollmentOpen: 1,
  startDate: D('2026-09-23T00:00:00Z'), endDate: D('2027-02-15T00:00:00Z'),
}) as unknown as AcademicTermRow;
const spy = (rows: Record<number, AcademicTermRow[]>) => {
  const asked: number[] = [];
  return {
    asked,
    list: async (universityId?: number | null) => {
      asked.push(Number(universityId ?? -1));
      return unis[Number(universityId) as keyof typeof unis] ?? [];
    },
    load: async (id: number) => Object.values(rows).flat().find((r) => r.id === id),
  };
};

const main = async () => {
  {
    const s = spy({ 1: [fakeRow(111, 1, 'A14051')] });
    const t = await currentTermFor(1, { listTerms: s.list, loadTermRow: s.load });
    eq('دانشگاه ۱ → ترم ۱۱۱', t?.id, 111);
    eq('فقط همان دانشگاه پرسیده شد', s.asked, [1]);
  }
  {
    const s = spy({ 3: [fakeRow(627, 3, 'S14032')] });
    const t = await currentTermFor(3, { listTerms: s.list, loadTermRow: s.load });
    eq('دانشگاه ۳ → ترم ۶۲۷ (کهنه ولی پرچم‌دار)', t?.id, 627);
  }
  {
    const s = spy({ 4: [fakeRow(657, 4, 'SH13992')] });
    const t = await currentTermFor(4, { listTerms: s.list, loadTermRow: s.load });
    eq('دانشگاه ۴ که فقط ترمِ کهنه دارد → همان با زنجیرهٔ پشتیبان', t?.id, 657);
  }
  {
    const t = await currentTermFor(99, { listTerms: async () => [], loadTermRow: async () => undefined });
    eq('دانشگاهِ بدون ترم → null', t, null);
  }
  {
    const t = await currentTermFor(null, { listTerms: async () => [], loadTermRow: async () => undefined });
    eq('بدون دانشگاه → null (نه نشتِ ترمِ دانشگاه دیگر)', t, null);
  }
  {
    const leaked = await currentTermFor(3, {
      listTerms: async () => [T(111, 'A14051', D('2026-09-23T00:00:00Z'), D('2027-02-15T00:00:00Z'), true)],
      loadTermRow: async (id) => fakeRow(id, 1, 'A14051'),
    });
    eq('اگر لایهٔ داده ردیفِ دانشگاه دیگری بدهد → null (نشت مسدود)', leaked, null);
  }
  {
    const picked = await currentTermFor(1, {
      listTerms: async () => [
        T(1, 'OLD', D('2026-08-01T00:00:00Z'), D('2026-12-20T00:00:00Z'), true),
        T(2, 'LIVE', D('2026-09-20T00:00:00Z'), D('2027-01-20T00:00:00Z')),
      ],
      loadTermRow: async (id) => fakeRow(id, 1, id === 2 ? 'LIVE' : 'OLD'),
    });
    eq('پرچمِ کهنه کنار می‌رود و ترمِ تاریخ‌محور برنده می‌شود', picked?.termCode, 'LIVE');
  }

  console.log(`\nنتیجه: ${pass} موفق | ${fail} شکست`);
  process.exit(fail === 0 ? 0 : 1);
};

main();