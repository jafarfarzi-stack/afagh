/**
 * ════════════════════════════════════════════════════════════════════════
 *  تست واحد امنیتی — مرز دانشگاه (tenant isolation) — توابع خالص
 *
 *  پوشش: isRealUniversityId — تشخیص شناسهٔ دانشگاهِ واقعی (fail-closed).
 *  هدف: از تبدیلِ شناسهٔ نامعتبر (0/null/undefined/NaN) به «حذف فیلتر» جلوگیری شود.
 * ════════════════════════════════════════════════════════════════════════
 */
import { isRealUniversityId } from '../src/lib/university-scope';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

console.log('\n— isRealUniversityId —');
ok(isRealUniversityId(1) === true, 'شناسهٔ مثبت واقعی است');
ok(isRealUniversityId(42) === true, 'شناسهٔ بزرگ واقعی است');
ok(isRealUniversityId(0) === false, '0 (DENY_UNI) واقعی نیست');
ok(isRealUniversityId(null) === false, 'null واقعی نیست');
ok(isRealUniversityId(undefined) === false, 'undefined واقعی نیست');
ok(isRealUniversityId(NaN) === false, 'NaN واقعی نیست');
ok(isRealUniversityId(Infinity) === false, 'Infinity واقعی نیست');
ok(isRealUniversityId(-5) === false, 'منفی واقعی نیست');

if (fail) { console.log(`\n✗ ${fail} failed, ${pass} passed`); process.exit(1); }
console.log(`\n✓ همهٔ آزمون‌ها گذشت (${pass})`);