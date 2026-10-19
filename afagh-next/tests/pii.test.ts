/**
 * تست واحد ماژول PII (`src/lib/pii.ts`)
 *
 * پوشش: نرمال‌سازی ارقام فارسی/عربی، رفت‌وبرگشت رمزگذاری، تشخیص دستکاری،
 * قطعی‌بودن و جدایی دامنهٔ شاخص کور، و رفتار fail-closed در پروداکشن.
 */
import {
  PII_KEY_ENV,
  blindIndex,
  decryptPii,
  encryptPii,
  isPiiCiphertext,
  maskPii,
  normalizePiiValue,
  piiKey,
} from '../src/lib/pii';

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string) => {
  if (c) {
    pass++;
    console.log('  ✓', m);
  } else {
    fail++;
    console.log('  ✗', m);
  }
};

/** آیا این تابع خطا می‌دهد؟ (بدون وابستگی به متن خطا) */
const throws = (fn: () => unknown): boolean => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};

/**
 * ENV را موقتاً تغییر می‌دهد. برخلاف Object.assign، مقدار undefined را
 * حذف می‌کند (چون process.env مقدار undefined را به رشتهٔ «undefined» تبدیل می‌کند).
 */
function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const before: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) before[k] = process.env[k];
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
  }
}

/** کلید معتبر ۳۲ بایتی به‌شکل ۶۴ کاراکتر hex */
const TEST_KEY = '0123456789abcdef'.repeat(4);

console.log('\n— normalizePiiValue —');
ok(normalizePiiValue('۰۰۱۲۳۴۵۶۷۸۹') === '00123456789', 'ارقام فارسی → لاتین');
ok(normalizePiiValue('٠٠١٢٣٤٥٦٧٨٩') === '00123456789', 'ارقام عربی-هندی → لاتین');
ok(normalizePiiValue(' ۰۰۱۲-۳۴۵ ۶۷۸ ') === '0012345678', 'فاصله/خط تیره حذف و trim می‌شود');
ok(normalizePiiValue('0012345678') === '0012345678', 'کد لاتین دست‌نخورده می‌ماند');
ok(normalizePiiValue(null) === '' && normalizePiiValue(undefined) === '', 'null/undefined → رشتهٔ خالی');

console.log('\n— piiKey —');
withEnv({ [PII_KEY_ENV]: TEST_KEY }, () => {
  ok(piiKey().length === 32, 'کلید hex ۶۴ کاراکتری → بافر ۳۲ بایتی');
  ok(piiKey().toString('hex') === TEST_KEY, 'بایت‌های کلید عیناً همان hex ورودی است');
});

withEnv({ [PII_KEY_ENV]: 'یک عبارت عبور طولانی برای تست' }, () => {
  const a = piiKey().toString('hex');
  const b = piiKey().toString('hex');
  ok(a.length === 64 && a === b, 'عبارت عبور با scrypt به کلید ۳۲ بایتیِ قطعی مشتق می‌شود');
  ok(a !== TEST_KEY, 'کلید مشتق‌شده با کلید hex مستقیم یکی نیست');
});

console.log('\n— encryptPii / decryptPii —');
withEnv({ [PII_KEY_ENV]: TEST_KEY }, () => {
  const plain = '0012345678';
  const cipher = encryptPii(plain);
  ok(cipher.startsWith('v1:'), 'پاکت با پیشوند نسخه v1 شروع می‌شود');
  ok(cipher.split(':').length === 4, 'قالب پاکت v1:iv:tag:data است');
  ok(isPiiCiphertext(cipher), 'isPiiCiphertext پاکت معتبر را تأیید می‌کند');
  ok(!cipher.includes(plain), 'متن ساده در خروجی دیده نمی‌شود');
  ok(decryptPii(cipher) === plain, 'رفت‌وبرگشت رمزگذاری/رمزگشایی درست است');
  ok(encryptPii(plain) !== cipher, 'IV تصادفی است؛ دو رمزگذاری خروجی یکسان ندارند');
  ok(encryptPii('') === '' && decryptPii('') === '', 'مقدار خالی → رشتهٔ خالی (بدون خطا)');
  ok(!isPiiCiphertext(plain) && !isPiiCiphertext(''), 'متن ساده به‌اشتباه پاکت شناخته نمی‌شود');
  ok(!isPiiCiphertext(cipher.replace('v1:', 'v2:')), 'نسخهٔ ناشناخته پاکت را باطل می‌کند');

  ok(throws(() => decryptPii(plain)), 'متن سادهٔ بی‌پاکت به‌جای افشا، خطا می‌دهد (fail-closed)');

  // دستکاری در بخش داده (ciphertext) باید توسط tag رد شود
  const parts = cipher.split(':');
  const data = parts[3];
  const flipped = (data.slice(-1) === '0' ? '1' : '0');
  const tamperedData = [...parts.slice(0, 3), data.slice(0, -1) + flipped].join(':');
  ok(throws(() => decryptPii(tamperedData)), 'دستکاری ciphertext شناسایی و رد می‌شود');

  // دستکاری در tag
  const tamperedTag = [parts[0], parts[1], parts[2].replace(/^./, parts[2][0] === '0' ? '1' : '0'), parts[3]].join(':');
  ok(throws(() => decryptPii(tamperedTag)), 'دستکاری tag احراز اصالت شناسایی می‌شود');

  // دستکاری در IV
  const tamperedIv = [parts[0], parts[1].replace(/^./, parts[1][0] === '0' ? '1' : '0'), parts[2], parts[3]].join(':');
  ok(throws(() => decryptPii(tamperedIv)), 'دستکاری IV شناسایی می‌شود');

  ok(throws(() => decryptPii(`${cipher}:extra`)), 'پاکت با تعداد بخش نامعتبر رد می‌شود');
});

withEnv({ [PII_KEY_ENV]: 'عبارت عبور دیگر برای تست' }, () => {
  const cipher = encryptPii('0012345678');
  ok(decryptPii(cipher) === '0012345678', 'رمزگذاری/رمزگشایی با کلید مشتق از عبارت عبور هم درست است');
});

// رمزگذاری با کلید A و رمزگشایی با کلید B باید شکست بخورد
const cipherWithTestKey = withEnv({ [PII_KEY_ENV]: TEST_KEY }, () => encryptPii('0012345678'));
withEnv({ [PII_KEY_ENV]: 'کلید سوم برای تست' }, () => {
  ok(throws(() => decryptPii(cipherWithTestKey)), 'کلید اشتباه باعث خطا می‌شود (نه خروجی خراب)');
});

console.log('\n— blindIndex —');
withEnv({ [PII_KEY_ENV]: TEST_KEY }, () => {
  const a = blindIndex('0012345678', 'users.nationalCode');
  const b = blindIndex('0012345678', 'users.nationalCode');
  ok(/^[0-9a-f]{64}$/.test(a), 'خروجی HMAC-SHA256 به‌شکل ۶۴ کاراکتر hex است');
  ok(a === b, 'برای ورودی یکسان، شاخص کور قطعی است');
  ok(blindIndex('0012345678', 'admissions_staging.nationalCode') !== a, 'context متفاوت → شاخص متفاوت (جدایی دامنه)');
  ok(blindIndex('0012345679', 'users.nationalCode') !== a, 'مقدار متفاوت → شاخص متفاوت');
  ok(
    blindIndex(' ۰۰۱۲-۳۴۵ ۶۷۸ ', 'users.nationalCode') === a,
    'کد ملی با ارقام فارسی/فاصله، همان شاخص کد لاتین را می‌دهد',
  );
  ok(throws(() => blindIndex('', 'users.nationalCode')), 'مقدار خالی شاخص نمی‌سازد');
  ok(throws(() => blindIndex('0012345678', '   ')), 'context خالی پذیرفته نمی‌شود');
});

withEnv({ [PII_KEY_ENV]: 'کلید متفاوت برای شاخص' }, () => {
  ok(
    blindIndex('0012345678', 'users.nationalCode') !==
      withEnv({ [PII_KEY_ENV]: TEST_KEY }, () => blindIndex('0012345678', 'users.nationalCode')),
    'شاخص کور به کلید وابسته است (بدون کلید قابل بازسازی نیست)',
  );
});

console.log('\n— maskPii —');
ok(maskPii('0012345678') === '001*****78', 'ماسک: سه رقم اول + پنج ستاره + دو رقم آخر');
ok(maskPii('00123456789') === '001*****89', 'طول خروجی برای کد ۱۱ رقمی هم ثابت است');
ok(maskPii('12345') === '*****', 'کد کوتاه کاملاً ماسک می‌شود');
ok(maskPii(null) === '—' && maskPii('') === '—', 'مقدار خالی → خط تیره');

console.log('\n— fail-closed در پروداکشن —');
withEnv({ NODE_ENV: 'production', [PII_KEY_ENV]: undefined }, () => {
  ok(throws(() => piiKey()), 'بدون کلید، piiKey در پروداکشن خطا می‌دهد');
  ok(throws(() => encryptPii('0012345678')), 'بدون کلید، رمزگذاری در پروداکشن متوقف می‌شود');
  ok(throws(() => decryptPii(`v1:${'0'.repeat(24)}:${'0'.repeat(32)}:00`)), 'بدون کلید، رمزگشایی در پروداکشن متوقف می‌شود');
});

withEnv({ NODE_ENV: 'production', [PII_KEY_ENV]: '   ' }, () => {
  ok(throws(() => piiKey()), 'کلید خالی/فاصله در پروداکشن هم رد می‌شود');
});

withEnv({ NODE_ENV: 'development', [PII_KEY_ENV]: undefined }, () => {
  ok(piiKey().length === 32, 'در توسعه، کلید جایگزین مستند وجود دارد (۳۲ بایت)');
  const c = encryptPii('0012345678');
  ok(decryptPii(c) === '0012345678', 'کلید توسعه هم رفت‌وبرگشت درست دارد');
});

if (fail) {
  console.log(`\n✗ ${fail} failed, ${pass} passed`);
  process.exit(1);
}
console.log(`\n✓ همه (${pass}) گذشت`);
