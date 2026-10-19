/**
 * ════════════════════════════════════════════════════════════════════════
 *  تست واحد امنیتی — proxy-trust (هویت کلاینت برای rate-limit + کوکی نشست)
 *
 *  پوشش:
 *   ۱) normalizeClientIp: فقط IP کانونیک، نه لیست/پورت/percent-encoded
 *   ۲) trustedClientIp: اعتماد فقط با توکن مشترک + IP معتبر (timing-safe)
 *   ۳) sessionTransport: ماتریس Secure/SameSite و قاعدهٔ «none + ناامن ممنوع»
 * ════════════════════════════════════════════════════════════════════════
 */
import { normalizeClientIp, trustedClientIp, sessionTransport } from '../src/lib/proxy-trust';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

console.log('\n— normalizeClientIp —');
ok(normalizeClientIp(null) === null, 'null → null');
ok(normalizeClientIp('') === null, 'خالی → null');
ok(normalizeClientIp('127.0.0.1') === '127.0.0.1', 'IPv4 معتبر');
ok(normalizeClientIp('  8.8.8.8  ') === '8.8.8.8', 'trim');
ok(normalizeClientIp('::1') === '::1', 'IPv6 loopback');
ok(normalizeClientIp('::ffff:127.0.0.1') === '127.0.0.1', 'IPv4-mapped IPv6 فروکش می‌شود (یک هویت)');
ok(normalizeClientIp('127.0.0.1:80') === null, 'IP:port رد می‌شود');
ok(normalizeClientIp('10.0.0.1, 192.168.1.1') === null, 'لیست XFF رد می‌شود');
ok(normalizeClientIp('not-an-ip') === null, 'رشتهٔ غیر-IP رد می‌شود');
ok(normalizeClientIp('127.0.0.1%2f') === null, 'percent-encoded رد می‌شود');
ok(normalizeClientIp('a'.repeat(65)) === null, 'ورودی بسیار بلند رد می‌شود');

console.log('\n— trustedClientIp —');
const secret = 'x'.repeat(40);
ok(trustedClientIp({ get: () => null }, { enabled: false, secret }) === null, 'پروکسی غیرفعال → null');
ok(trustedClientIp({ get: () => 'tok' }, { enabled: true, secret: 'short' }) === null, 'secret کوتاه (<32) → null');
ok(trustedClientIp({ get: (n) => (n === 'x-afagh-proxy-token' ? 'wrong' : '1.2.3.4') }, { enabled: true, secret }) === null, 'توکن نادرست → null');
ok(trustedClientIp({ get: (n) => (n === 'x-afagh-proxy-token' ? secret : 'not-an-ip') }, { enabled: true, secret }) === null, 'IP نامعتبر → null');
ok(trustedClientIp({ get: (n) => (n === 'x-afagh-proxy-token' ? secret : '203.0.113.9') }, { enabled: true, secret }) === '203.0.113.9', 'توکن درست + IP معتبر → IP');
// طول متفاوت → timingSafeEqual بدون throw
ok(trustedClientIp({ get: (n) => (n === 'x-afagh-proxy-token' ? secret + 'extra' : '203.0.113.9') }, { enabled: true, secret }) === null, 'توکن با طول متفاوت → null (بدون crash)');

console.log('\n— sessionTransport —');
{
  const prod = sessionTransport({ NODE_ENV: 'production', AFAGH_COOKIE_SECURE: 'false', AFAGH_COOKIE_SAMESITE: 'none' });
  ok(prod.secure === true, 'production: Secure همیشه true (حتی با AFAGH_COOKIE_SECURE=false)');
  ok(prod.sameSite === 'none', 'production: SameSite=None پذیرفته می‌شود وقتی Secure=true');
}
{
  const devHttp = sessionTransport({ NODE_ENV: 'development', AFAGH_PUBLIC_BASE_URL: 'http://localhost:8080', AFAGH_COOKIE_SECURE: 'auto', AFAGH_COOKIE_SAMESITE: 'none' });
  ok(devHttp.secure === false, 'dev HTTP: Secure=false');
  ok(devHttp.sameSite === 'lax', 'dev HTTP: SameSite=None بدون Secure → Lax (fail-safe)');
}
{
  const devHttps = sessionTransport({ NODE_ENV: 'development', AFAGH_PUBLIC_BASE_URL: 'https://app.example.com', AFAGH_COOKIE_SECURE: 'auto', AFAGH_COOKIE_SAMESITE: 'none' });
  ok(devHttps.secure === true, 'dev HTTPS: Secure=true');
  ok(devHttps.sameSite === 'none', 'dev HTTPS: SameSite=None پذیرفته می‌شود');
}
{
  const forced = sessionTransport({ NODE_ENV: 'development', AFAGH_PUBLIC_BASE_URL: 'http://localhost:8080', AFAGH_COOKIE_SECURE: 'true', AFAGH_COOKIE_SAMESITE: 'strict' });
  ok(forced.secure === true, 'AFAGH_COOKIE_SECURE=true اجباری');
  ok(forced.sameSite === 'strict', 'SameSite=strict');
}
{
  const invalidUrlProd = sessionTransport({ NODE_ENV: 'production' });
  ok(invalidUrlProd.secure === true, 'production بدون URL: Secure=true (fail-closed)');
}
{
  const def = sessionTransport({ NODE_ENV: 'development' });
  ok(def.sameSite === 'lax', 'پیش‌فرض SameSite = Lax');
}

if (fail) { console.log(`\n✗ ${fail} failed, ${pass} passed`); process.exit(1); }
console.log(`\n✓ همهٔ آزمون‌ها گذشت (${pass})`);