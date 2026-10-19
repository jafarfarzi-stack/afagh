/**
 * تست واحد خالص — هلپرهای آپلود/فرم (`src/lib/safe-input.ts`)
 *
 * پوشش: تطبیق magic-bytes با MIME ادعاشده، اعتبارسنجی کامل آپلود
 * (whitelist نوع + magic + تطابق پسوند)، و پاک‌سازی فرم درخواست دانشجو.
 * این ماژول هیچ import ای ندارد → بدون server-only و مناسب اجرای tsx.
 */
import {
  MAX_UPLOAD_BYTES,
  SAFE_MIME,
  magicMatches,
  checkUpload,
  sanitizeRequestFormData,
} from '../src/lib/safe-input';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x00, 0x00]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GIF = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const BMP = Buffer.from([0x42, 0x4d, 0x00, 0x00, 0x00, 0x00]);
const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);

console.log('\n— ثابت‌ها —');
ok(MAX_UPLOAD_BYTES === 10 * 1024 * 1024, 'سقف آپلود ۱۰ مگابایت است');
ok(SAFE_MIME.has('image/png') && SAFE_MIME.has('application/pdf'), 'PNG و PDF در whitelist هستند');
ok(!SAFE_MIME.has('text/html') && !SAFE_MIME.has('image/svg+xml'), 'HTML/SVG در whitelist نیستند');

console.log('\n— magicMatches (امضای بایت‌های آغازین) —');
ok(magicMatches('image/png', PNG) === true, 'امضای PNG شناسایی می‌شود');
ok(magicMatches('image/jpeg', JPEG) === true, 'امضای JPEG شناسایی می‌شود');
ok(magicMatches('image/gif', GIF) === true, 'امضای GIF شناسایی می‌شود');
ok(magicMatches('image/bmp', BMP) === true, 'امضای BMP شناسایی می‌شود');
ok(magicMatches('application/pdf', PDF) === true, 'امضای PDF شناسایی می‌شود');
ok(magicMatches('image/webp', WEBP) === true, 'امضای WEBP (RIFF…WEBP) شناسایی می‌شود');
ok(magicMatches('image/jpeg', PNG) === false, 'PNG با ادعای JPEG رد می‌شود');
ok(magicMatches('image/png', JPEG) === false, 'JPEG با ادعای PNG رد می‌شود');
ok(magicMatches('image/png', Buffer.from([0x89, 0x50])) === false, 'بافر کوتاه‌تر از ۴ بایت رد می‌شود');
ok(magicMatches('image/webp', Buffer.from('RIFFxxxxNOPE')) === false, 'RIFF بدون WEBP رد می‌شود');
ok(magicMatches('application/octet-stream', PNG) === false, 'MIME ناشناخته رد می‌شود');

console.log('\n— checkUpload —');
{
  const r = checkUpload('photo.png', 'image/png', PNG);
  ok(r.ok === true && r.mime === 'image/png' && r.ext === 'png', 'آپلود معتبر PNG پذیرفته می‌شود');
}
{
  const r = checkUpload('photo.PNG', 'image/png', PNG);
  ok(r.ok === true && r.ext === 'png', 'پسوند بزرگ‌حرف نرمال می‌شود');
}
{
  const r = checkUpload('doc.pdf', 'application/pdf', PDF);
  ok(r.ok === true && r.ext === 'pdf', 'آپلود معتبر PDF پذیرفته می‌شود');
}
{
  const r = checkUpload('x.txt', 'text/plain', Buffer.from('hello world'));
  ok(r.ok === false && r.status === 415, 'نوع خارج از whitelist → ۴۱۵');
}
{
  const r = checkUpload('photo.png', 'image/jpeg', PNG);
  ok(r.ok === false && r.status === 400, 'نوع ادعاشده با محتوا نمی‌خواند → ۴۰۰');
}
{
  const r = checkUpload('photo.jpg', 'image/png', PNG);
  ok(r.ok === false && r.status === 400, 'پسوند با MIME نمی‌خواند → ۴۰۰');
}
{
  const r = checkUpload('a.p n g', 'image/png', PNG);
  ok(r.ok === true && r.ext === 'png', 'کاراکترهای غیرمجاز پسوند پاک می‌شوند');
}

console.log('\n— sanitizeRequestFormData —');
{
  const r = sanitizeRequestFormData({ title: 'درخواست', count: 3, urgent: true, note: null }, 7);
  ok(r.ok === true && r.data.title === 'درخواست' && r.data.count === 3 && r.data.urgent === true && r.data.note === null, 'مقادیر ساده پذیرفته می‌شوند');
}
{
  const r = sanitizeRequestFormData({ file: { key: 'requests/7/a.pdf', name: 'a.pdf', size: 10, mimeType: 'application/pdf' } }, 7);
  ok(r.ok === true && (r.data.file as { key: string }).key === 'requests/7/a.pdf', 'پیوست با کلید در پوشهٔ همان دانشجو پذیرفته می‌شود');
}
{
  const r = sanitizeRequestFormData({ file: { key: 'requests/8/evil.pdf', name: 'e.pdf', size: 1, mimeType: 'application/pdf' } }, 7);
  ok(r.ok === false, 'پیوست در پوشهٔ دانشجوی دیگر رد می‌شود');
}
{
  const r = sanitizeRequestFormData({ f: 'requests/8/evil.pdf' }, 7);
  ok(r.ok === false, 'رشتهٔ مسیر بیرون از پوشهٔ دانشجو رد می‌شود');
}
{
  const r = sanitizeRequestFormData({ f: { key: 'requests/7/../evil' } }, 7);
  ok(r.ok === false, 'مسیر دارای «..» رد می‌شود');
}
{
  const r = sanitizeRequestFormData({ s: 'x'.repeat(2001) }, 1);
  ok(r.ok === false, 'مقدار رشتهٔ بیش از حد طولانی رد می‌شود');
}
{
  const r = sanitizeRequestFormData(null, 1);
  ok(r.ok === false, 'ورودی null رد می‌شود');
}
{
  const r = sanitizeRequestFormData([1, 2, 3], 1);
  ok(r.ok === false, 'آرایه به‌عنوان ریشه رد می‌شود');
}
{
  const big: Record<string, number> = {};
  for (let i = 0; i < 51; i++) big['k' + i] = i;
  const r = sanitizeRequestFormData(big, 1);
  ok(r.ok === false, 'بیش از ۵۰ کلید رد می‌شود');
}

if (fail) { console.log(`\n✗ ${fail} failed, ${pass} passed`); process.exit(1); }
console.log(`\n✓ همه (${pass}) گذشت`);
