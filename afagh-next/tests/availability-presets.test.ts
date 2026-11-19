import assert from 'node:assert/strict';
import { isEvenWeekday, isOddWeekday } from '@/lib/availability-presets';

const DAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
const names = (pred: (d: number) => boolean) => DAYS.filter((_, i) => pred(i));

// عرف تقویم ایرانی: شنبه روزِ ۱ هفته است ⇒ فرد = شنبه، دوشنبه، چهارشنبه، جمعه
assert.deepEqual(names(isOddWeekday), ['شنبه', 'دوشنبه', 'چهارشنبه', 'جمعه'], 'روزهای فرد');
assert.deepEqual(names(isEvenWeekday), ['یکشنبه', 'سه‌شنبه', 'پنج‌شنبه'], 'روزهای زوج');

// هیچ روزی هم‌زمان زوج و فرد نیست و هر ۷ روز پوشش داده می‌شود
for (let d = 0; d < 7; d += 1) {
  assert.notEqual(isOddWeekday(d), isEvenWeekday(d), `روز ${d} باید دقیقاً یکی باشد`);
}
assert.equal(DAYS.filter((_, i) => isOddWeekday(i) || isEvenWeekday(i)).length, 7, 'پوشش کامل ۷ روز');

console.log('✅ availability-presets: ۷ موفق، ۰ ناموفق');
