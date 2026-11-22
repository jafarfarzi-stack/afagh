import { createRequire } from 'module';

// همان الگوی tests/enroll-core.test.ts: خنثی کردن گارد server-only بیرون از Next
const requireCjs = createRequire(import.meta.url);
const serverOnlyId = requireCjs.resolve('server-only');
(requireCjs as any).cache[serverOnlyId] = {
  id: serverOnlyId, filename: serverOnlyId, loaded: true, exports: {}, children: [], paths: [],
};

const { SETTING_BY_KEY, getSetting } = require('../src/lib/settings') as typeof import('../src/lib/settings');

let pass = 0, fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label); }
}

(async () => {
  console.log('تنظیمات ثبت\u200cنامی — آستانهٔ بدهی');
  const def = SETTING_BY_KEY['ENROLLMENT_DEBT_THRESHOLD'];
  ok(!!def, 'ENROLLMENT_DEBT_THRESHOLD در فهرست تنظیمات ثبت شده است');
  ok(def?.group === 'شهریه و امور مالی', 'در گروه امور مالی قرار دارد');
  ok(def?.type === 'number', 'نوع آن number است');
  ok(def?.default === '0', 'پیش\u200cفرض ۰ (تسویه\u200cکامل) است');
  const v = await getSetting('ENROLLMENT_DEBT_THRESHOLD');
  ok(v === '0', 'getSetting بدون خطا مقدار پیش\u200cفرض را برمی\u200cگرداند');
  console.log(`نتیجه: ${pass} موفق، ${fail} ناموفق`);
  if (fail) process.exit(1);
})();
