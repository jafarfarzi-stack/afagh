import assert from 'node:assert/strict';
import {
  CHECKIN_OPEN_MIN_AFTER,
  CHECKIN_OPEN_MIN_BEFORE,
  checkinState,
  checkinWindowLabel,
  compareJalali,
  hmToMinutes,
  minutesToHm,
  parseRoomCode,
  tehranNow,
} from '@/lib/room-checkin';

/**
 * تستِ منطقِ خالصِ «ثبت حضور استاد با QR».
 *
 * چرا این تست مهم است: کلِ امنیتِ این قابلیت روی همین سه چیز ایستاده —
 *  ۱) پارس‌کردن سخت‌گیرانهٔ کدِ QR (وگرنه `room-abc` یا `room-0` راه باز می‌کند)
 *  ۲) پنجرهٔ زمانی (وگرنه استاد می‌تواند روزها بعد حضور جعل کند)
 *  ۳) «امروزِ تهران» (وگرنه با کانتینرِ UTC، جلسهٔ شبِ ایران پیدا نمی‌شود)
 * هر سه، خالص و بدون دیتابیس‌اند؛ پس دقیقاً همین‌جا تست می‌شوند.
 */

console.log('— room check-in —');

// ── ۱) کدِ QR ───────────────────────────────────────────────────────────
assert.equal(parseRoomCode('room-203'), 203);
assert.equal(parseRoomCode('  room-7  '), 7);
assert.equal(parseRoomCode('room-1'), 1);
assert.equal(parseRoomCode('room-123456789'), 123456789);

// نامعتبر: صفر، خالی، حرفی، پیشوند اشتباه، بیش از ۹ رقم، حروف بزرگ، تزریق
assert.equal(parseRoomCode('room-0'), null, 'room-0 همان QRِ جای‌نگهدار است و باید رد شود');
assert.equal(parseRoomCode('room-'), null);
assert.equal(parseRoomCode('room-abc'), null);
assert.equal(parseRoomCode('room-12x'), null);
assert.equal(parseRoomCode('room-1234567890'), null);
assert.equal(parseRoomCode('ROOM-5'), null);
assert.equal(parseRoomCode('room-5/../admin'), null);
assert.equal(parseRoomCode('room--5'), null);
assert.equal(parseRoomCode('203'), null);
assert.equal(parseRoomCode(''), null);
assert.equal(parseRoomCode(null), null);
assert.equal(parseRoomCode(undefined), null);

// ── ۲) ساعت ─────────────────────────────────────────────────────────────
assert.equal(hmToMinutes('09:30'), 570);
assert.equal(hmToMinutes('00:00'), 0);
assert.equal(hmToMinutes('23:59'), 1439);
assert.equal(hmToMinutes('9:05'), 545);
assert.equal(hmToMinutes('24:00'), null);
assert.equal(hmToMinutes('10:60'), null);
assert.equal(hmToMinutes('1000'), null);
assert.equal(hmToMinutes(''), null);
assert.equal(hmToMinutes(null), null);

assert.equal(minutesToHm(570), '09:30');
assert.equal(minutesToHm(0), '00:00');
assert.equal(minutesToHm(1439), '23:59');
assert.equal(minutesToHm(-30), '23:30', 'دقیقهٔ منفی نباید ساعتِ منفی بدهد');

// ── ۳) پنجرهٔ زمانی ─────────────────────────────────────────────────────
// کلاس ۱۰:۰۰ تا ۱۱:۳۰ → باز ۰۹:۳۰، بسته ۱۱:۵۰
const START = '10:00';
const END = '11:30';

assert.equal(checkinState(START, END, hmToMinutes('09:29')!), 'BEFORE');
assert.equal(checkinState(START, END, hmToMinutes('09:30')!), 'OPEN', 'لبهٔ بازشدن باید شامل باشد');
assert.equal(checkinState(START, END, hmToMinutes('10:00')!), 'OPEN');
assert.equal(checkinState(START, END, hmToMinutes('11:30')!), 'OPEN', 'تا پایان کلاس قطعاً باز است');
assert.equal(checkinState(START, END, hmToMinutes('11:50')!), 'OPEN', 'مهلتِ بعد از پایان');
assert.equal(checkinState(START, END, hmToMinutes('11:51')!), 'CLOSED');
assert.equal(checkinState(START, END, hmToMinutes('23:00')!), 'CLOSED');

// fail-closed: ساعتِ نامعتبر هرگز «باز» نیست
assert.equal(checkinState(null, END, 600), 'CLOSED');
assert.equal(checkinState(START, null, 600), 'CLOSED');
assert.equal(checkinState('xx:yy', END, 600), 'CLOSED');

// پنجرهٔ نمایشی
const win = checkinWindowLabel(START, END);
assert.deepEqual(win, { from: '09:30', to: '11:50' });
assert.equal(checkinWindowLabel(null, END), null);

// ثابت‌ها همان چیزی باشند که در UI وعده داده می‌شود
assert.equal(CHECKIN_OPEN_MIN_BEFORE, 30);
assert.equal(CHECKIN_OPEN_MIN_AFTER, 20);

// ── ۴) امروزِ تهران (مهم‌ترین بخش) ──────────────────────────────────────
// ۲۰۲۶-۱۰-۲۰T۲۰:۰۰Z = ۲۳:۳۰ تهران → همان روز
const lateEvening = tehranNow(new Date('2026-10-20T20:00:00Z'));
assert.equal(lateEvening.jalali, '1405/07/28');
assert.equal(lateEvening.minutes, 23 * 60 + 30);

// ۲۰۲۶-۱۰-۲۰T۲۱:۰۰Z = ۰۰:۳۰ تهرانِ روزِ بعد → باید ۲۹ شود، نه ۲۸
const afterMidnight = tehranNow(new Date('2026-10-20T21:00:00Z'));
assert.equal(
  afterMidnight.jalali,
  '1405/07/29',
  'عبور از نیمه‌شبِ تهران باید تاریخ شمسی را جلو ببرد (باگِ UTC)',
);
assert.equal(afterMidnight.minutes, 30);

// ۲۰۲۶-۱۰-۲۰T00:00Z = ۰۳:۳۰ تهران → همان روز
const earlyMorning = tehranNow(new Date('2026-10-20T00:00:00Z'));
assert.equal(earlyMorning.jalali, '1405/07/28');
assert.equal(earlyMorning.minutes, 3 * 60 + 30);

// قالب همیشه صفرپر و ۱۰ کاراکتری است تا با sessionDate مقایسه‌پذیر بماند
assert.match(lateEvening.jalali, /^\d{4}\/\d{2}\/\d{2}$/);

// ── ۵) مقایسهٔ تاریخ ────────────────────────────────────────────────────
assert.ok(compareJalali('1405/07/28', '1405/07/29') < 0);
assert.ok(compareJalali('1405/07/29', '1405/07/28') > 0);
assert.equal(compareJalali('1405/07/28', '1405/07/28'), 0);
assert.ok(compareJalali('1405/07/28', '1405/08/01') < 0, 'مقایسهٔ رشته‌ای با صفرپر درست کار می‌کند');
assert.ok(compareJalali('1405/12/29', '1406/01/01') < 0);

console.log('✓ همهٔ تست‌های room-checkin موفق');
