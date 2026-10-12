/**
 * بهداشت تزریق (CSV/LIKE/SSRF/redirect):
 *  csvCell در export-utils · escapeLikeChars در persian-search ·
 *  isPrivateIP/parseSafeUrl در ssrf-guard · safeNext در safe-redirect.
 */
import { csvCell, csvFormulaPrefix, generateCSV } from '../src/lib/export-utils';
import { escapeLikeChars, faLikePattern } from '../src/lib/persian-search';
import { assertSafeUrl, isPrivateIP, parseSafeUrl, UnsafeUrlError } from '../src/lib/ssrf-guard';
import { safeNext } from '../src/lib/safe-redirect';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

console.log('\n— csvCell (تزریق فرمول) —');
ok(csvCell('=1+1') === `"'=1+1"`, 'فرمول = با تک‌کوتیشن خنثی می‌شود');
ok(csvCell('+7') === "\"'+7\"", 'فرمول + خنثی می‌شود');
ok(csvCell('-2') === `"'-2"`, 'فرمول - خنثی می‌شود');
ok(csvCell('@x') === `"'@x"`, 'فرمول @ خنثی می‌شود');
ok(csvCell('|calc') === `"'|calc"`, 'فرمول | خنثی می‌شود');
ok(csvCell('  =cmd') === `"'  =cmd"`, 'فاصلهٔ پیشین نادیده گرفته می‌شود (trimStart)');
ok(csvCell('تهران') === '"تهران"', 'متن عادی دست‌نخورده می‌ماند');
ok(csvCell('a"b') === '"a""b"', 'نقل‌قول دوتایی escape می‌شود');
ok(csvCell(123) === '"123"', 'عدد بدون پیشوند');
ok(csvFormulaPrefix('=x').startsWith(`'`) && !csvFormulaPrefix('abc').startsWith(`'`), 'csvFormulaPrefix');
{
  const csv = generateCSV({ columns: [{ key: 'a', title: 'نام' }], rows: [{ a: '=HYPERLINK("http://evil")' }] });
  ok(csv.includes(`"'=HYPERLINK`), 'generateCSV از csvCell استفاده می‌کند');
}

console.log('\n— LIKE escape —');
ok(escapeLikeChars('100%') === '100\\%', '٪ فرار می‌شود');
ok(escapeLikeChars('a_b') === 'a\\_b', '_ فرار می‌شود');
ok(escapeLikeChars('a\\b') === 'a\\\\b', 'بک‌اسلش فرار می‌شود');
ok(faLikePattern('50%_') === '%50\\%\\_%', 'faLikePattern فرارشده با % می‌سازد');

console.log('\n— ssrf-guard —');
ok(isPrivateIP('10.0.0.1') && isPrivateIP('172.16.5.4') && isPrivateIP('172.31.255.1'), 'رنج‌های خصوصی 10/172.16');
ok(isPrivateIP('192.168.1.1') && isPrivateIP('127.0.0.1') && isPrivateIP('169.254.1.1'), '192.168/لوپ‌بک/لینک‌لوکال');
ok(isPrivateIP('::1') && isPrivateIP('fe80::1') && isPrivateIP('fc00::1'), 'IPv6 خصوصی');
ok(!isPrivateIP('8.8.8.8') && !isPrivateIP('1.1.1.1'), 'IP عمومی خصوصی نیست');
{
  let threw = false;
  try { parseSafeUrl('http://example.com/x'); } catch (e) { threw = e instanceof UnsafeUrlError; }
  ok(threw, 'http رد می‌شود (https-only)');
}
{
  let threw = false;
  try { parseSafeUrl('https://user:pass@example.com/'); } catch (e) { threw = e instanceof UnsafeUrlError; }
  ok(threw, 'userinfo رد می‌شود');
}
{
  const u = parseSafeUrl('https://example.com/api');
  ok(u.hostname === 'example.com', 'https معتبر پذیرفته می‌شود');
}

console.log('\n— safeNext —');
ok(safeNext('/admin/settings') === '/admin/settings', 'مسیر داخلی پذیرفته می‌شود');
ok(safeNext('/a?x=1#h') === '/a?x=1#h', 'کوئری و هش حفظ می‌شود');
ok(safeNext('https://evil.com') === '/', 'URL مطلق خارجی به پیش‌فرض برمی‌گردد');
ok(safeNext('//evil.com/x') === '/', 'protocol-relative رد می‌شود');
ok(safeNext(null) === '/' && safeNext('') === '/', 'ورودی خالی → پیش‌فرض');
ok(safeNext('/x', '/home') === '/x' && safeNext('evil', '/home') === '/home', 'fallback سفارشی');

console.log('\n— assertSafeUrl (DNS خصوصی، بدون شبکه) —');
async function main() {
  let threw = false;
  try { await assertSafeUrl('https://127.0.0.1/health'); } catch (e) { threw = e instanceof UnsafeUrlError; }
  ok(threw, 'IP لوپ‌بک عددی رد می‌شود');
  threw = false;
  try { await assertSafeUrl('https://apim.saorg.ir/x', { allowedHosts: ['other.example.com'] }); } catch (e) { threw = e instanceof UnsafeUrlError; }
  ok(threw, 'میزبان خارج از allow-list رد می‌شود');

  if (fail) { console.log(`\n✗ ${fail} failed, ${pass} passed`); process.exit(1); }
  console.log(`\n✓ همه (${pass}) گذشت`);
}
void main();
