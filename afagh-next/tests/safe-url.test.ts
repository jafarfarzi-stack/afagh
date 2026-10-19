/**
 * تست واحد خالص — `isSafeLinkUrl` (`src/lib/safe-url.ts`)
 *
 * پوشش: فقط مسیر نسبیِ تک‌اسلش (`/x` و نه `//host`) یا `https://` مجاز است؛
 * بقیه (javascript:, data:, http:, protocol-relative، کاراکتر کنترلی/بک‌اسلش) رد می‌شوند.
 * این ماژول هیچ وابستگی‌ای ندارد → بدون server-only و مناسب اجرای tsx.
 */
import { isSafeLinkUrl } from '../src/lib/safe-url';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

console.log('\n— مسیر داخلی نسبی —');
ok(isSafeLinkUrl('/') === true, 'ریشهٔ سایت پذیرفته می‌شود');
ok(isSafeLinkUrl('/admin/settings') === true, 'مسیر نسبی تک‌اسلش پذیرفته می‌شود');
ok(isSafeLinkUrl('/a/b?x=1#h') === true, 'کوئری و هش حفظ می‌شوند');
ok(isSafeLinkUrl('//evil.com/x') === false, 'protocol-relative رد می‌شود');
ok(isSafeLinkUrl('/a\\b') === false, 'بک‌اسلش رد می‌شود');

console.log('\n— https —');
ok(isSafeLinkUrl('https://example.com') === true, 'https معتبر پذیرفته می‌شود');
ok(isSafeLinkUrl('https://portal.saorg.ir/x?y=1') === true, 'https با مسیر/کوئری پذیرفته می‌شود');
ok(isSafeLinkUrl('HTTPS://EXAMPLE.COM') === true, 'بزرگی/کوچکی حروف مهم نیست');
ok(isSafeLinkUrl('https://') === false, 'https بدون میزبان رد می‌شود');
ok(isSafeLinkUrl('https:///x') === false, 'https با سه اسلش (بدون میزبان) رد می‌شود');
ok(isSafeLinkUrl(' https://example.com') === false, 'فاصلهٔ پیشین مجاز نیست');

console.log('\n— طرح‌های خطرناک —');
ok(isSafeLinkUrl('http://example.com') === false, 'http رد می‌شود (فقط https)');
ok(isSafeLinkUrl('javascript:alert(1)') === false, 'javascript: رد می‌شود');
ok(isSafeLinkUrl('JaVaScRiPt:alert(1)') === false, 'javascript: بدون توجه به بزرگی حروف رد می‌شود');
ok(isSafeLinkUrl('data:text/html,<script>') === false, 'data: رد می‌شود');
ok(isSafeLinkUrl('mailto:a@b.com') === false, 'mailto: رد می‌شود');
ok(isSafeLinkUrl('vbscript:msgbox') === false, 'vbscript: رد می‌شود');

console.log('\n— کاراکترهای کنترلی و ورودی نامعتبر —');
ok(isSafeLinkUrl('/a\u0000b') === false, 'کاراکتر NUL رد می‌شود');
ok(isSafeLinkUrl('/a\nb') === false, 'newline رد می‌شود');
ok(isSafeLinkUrl('/a\tb') === false, 'tab رد می‌شود');
ok(isSafeLinkUrl('https://exam\u007fple.com') === false, 'DEL رد می‌شود');
ok(isSafeLinkUrl('') === false, 'رشتهٔ خالی رد می‌شود');
ok(isSafeLinkUrl(null as unknown as string) === false, 'null رد می‌شود (گارد typeof)');
ok(isSafeLinkUrl(undefined as unknown as string) === false, 'undefined رد می‌شود');
ok(isSafeLinkUrl(123 as unknown as string) === false, 'عدد رد می‌شود');

if (fail) { console.log(`\n✗ ${fail} failed, ${pass} passed`); process.exit(1); }
console.log(`\n✓ همه (${pass}) گذشت`);
