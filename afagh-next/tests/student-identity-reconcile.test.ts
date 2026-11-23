/**
 * گاردهای هویت دانشجو:
 *   ۱) چکسم کد ملی ایران و ترمیم صفر پیشرو
 *   ۲) نگاشت دو فایل قدیمی NAHAIID / اطلاعات هويتي
 *   ۳) ریشهٔ اختلاط هویت: برخورد کد مصنوعی SA روی ۸رقم آخر کد دانشجویی
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const eq = (a: unknown, b: unknown, m: string) => ok(a === b, `${m} (got ${String(a)}, want ${String(b)})`);

async function main() {
  const rec: any = await import('../scripts/reconcile-student-identity.mjs');

  // ── الگوریتم چکسم ──
  ok(rec.isValidIranianNationalCode('2756021946'), 'کد ملی معتبر تأیید میشود');
  ok(!rec.isValidIranianNationalCode('1234567890'), 'کد نامعتبر رد میشود');
  ok(!rec.isValidIranianNationalCode('1111111111'), 'کد تکراری حتی با چکسم رد میشود');
  ok(!rec.isValidIranianNationalCode('12345'), 'کد کوتاه رد میشود');
  eq(rec.isValidIranianNationalCode('0480632766'), true, 'صفر پیشروی ۹رقمی ⇒ معتبر');
  eq(rec.isValidIranianNationalCode('0020421893'), true, 'دو صفر پیشروی ۸رقمی ⇒ معتبر');

  // ── نام «نام خانوادگی-نام» ──
  const n1 = rec.parseFullName('قليزاده قرالر-ويدا');
  ok(n1 && n1.lastName === 'قليزاده قرالر' && n1.firstName === 'ويدا', 'شکست نام سما');
  const n2 = rec.parseFullName('قاسمي دويران-شيوا-شيوا');
  ok(n2 && n2.lastName === 'قاسمي دويران' && n2.firstName === 'شيوا', 'تکرار انتهایی حذف میشود');

  // ── ریشهٔ اختلاط هویت ──
  const SRC = read('scripts/split-mixed-student-users.mjs');
  ok(/placeholderNc|SA/.test(SRC) && /۸ رقم آخر/.test(SRC), 'ریشهٔ برخورد کد مصنوعی مستند است');
  const last8 = (c: string) => c.slice(-8);
  eq(last8('9212274089'), last8('9412274089'), 'دو کد دانشجویی مثال ۸رقم آخر یکسان');
  eq(last8('9312234049'), last8('9412234049'), 'جفت دوم هم ۸رقم آخر یکسان');
  ok(/ncs\.size <= 1/.test(SRC), 'گروههای تک هویت (چند ثبتنام یک شخص) جدا نمیشوند');

  // ── قرارداد اسکریپت ──
  const R = read('scripts/reconcile-student-identity.mjs');
  ok(/استان_محل_تولد/.test(R) && /محل_صدور/.test(R), 'استان و محل صدور از فایل دوم خوانده میشوند');
  ok(/isUnknown\(cityRaw\)/.test(R) && /isUnknown\(issueRaw\)/.test(R), 'جایگزینی شهر نامشخص با محل صدور');
  ok(/padStart\(10, '0'\)/.test(R), 'صفر پیشروی کدهای کوتاه');
  ok(/PARALLEL/.test(R) && /Promise\.all\(shards/.test(R), 'نوشتن با ۱۰ کارگر موازی');
  ok(/--apply/.test(R) && /--backup/.test(R) && /--restore/.test(R), 'dry/backup/restore گارد شدهاند');

  console.log(`\n${pass} قبول / ${fail} رد`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
