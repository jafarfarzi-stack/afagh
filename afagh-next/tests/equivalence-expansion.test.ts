import { expandPassedWithEquivalents } from '../src/lib/enroll-engine/equivalence-expand';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const members = [
  { clusterCode: 1, code: 'MATH1' },
  { clusterCode: 1, code: 'MATHB' },
  { clusterCode: 2, code: 'PHY1' },
  { clusterCode: 2, code: 'PHYB' },
];

console.log('\n— گسترش هم‌ارزی در پیش‌نیاز —');
const a = expandPassedWithEquivalents(new Map([['MATH1', 15]]), members);
ok(a.get('MATHB') === 15, 'گذراندن MATH1، MATHB هم‌خوشه را پاس می‌کند');
ok(a.get('PHY1') === undefined, 'خوشهٔ دیگر گسترش نمی‌یابد');

const b = expandPassedWithEquivalents(new Map([['MATH1', 12], ['MATHB', 17]]), members);
ok(b.get('MATH1') === 17, 'بهترین نمرهٔ خوشه به همهٔ اعضا می‌رسد');

const c = expandPassedWithEquivalents(new Map([['MATHB', 1]]), members);
ok(c.get('MATH1') === 1, 'قبولی توصیفی (نمرهٔ ۱) هم منتقل می‌شود');

console.log('\n— عدم تغییر ناخواسته —');
const src = new Map([['MATH1', 14]]);
const out = expandPassedWithEquivalents(src, members);
ok(!src.has('MATHB'), 'نقشهٔ ورودی تغییر نمی‌کند');
ok(out !== src, 'در صورت گسترش، نقشهٔ جدید برمی‌گردد');

const empty = new Map<string, number>();
ok(expandPassedWithEquivalents(empty, members) === empty, 'بدون نمره، همان نقشه برمی‌گردد');
ok(expandPassedWithEquivalents(new Map([['X', 10]]), [{ clusterCode: 3, code: 'X' }]).size === 1, 'خوشهٔ تک‌عضوی تغییری نمی‌دهد');
ok(expandPassedWithEquivalents(new Map([['A', 10]]), []).get('A') === 10, 'بدون عضو، نمره حفظ می‌شود');

console.log(`\n${fail === 0 ? '🏁 همهٔ تست‌ها موفق' : `🏁 ${fail} تست ناموفق`} — ${pass} موفق`);
process.exit(fail === 0 ? 0 : 1);
