/**
 * تست‌های «کلاس ادغامی» — هستهٔ خالصِ تشخیصِ ادغام.
 *
 * چرا این تست‌ها: یک اشتباه در این‌جا دو پیامد دارد —
 *   • اگر ادغام را پیدا نکند → کاربر دو ردیف برای یک کلاس می‌بیند و باید
 *     دو بار ثبت کند (همان دردِ اصلیِ این قابلیت)
 *   • اگر ادغام را اشتباه پیدا کند → حضورِ یک استاد روی کلاسِ استادِ دیگر
 *     نوشته می‌شود و حق‌التدریس اشتباه محاسبه می‌شود
 * پس هر دو جهت باید قفل شود.
 */
import {
  groupSessionsIntoMerged,
  mergeBadgeText,
  mergeMemberTitles,
  normSessionTime,
  sessionMergeKey,
  type MergableSessionRow,
} from '../src/lib/merged-class-core.ts';

let pass = 0;
let fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}\n       got:  ${g}\n       want: ${w}`); }
}
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}`); }
}

const row = (o: Partial<MergableSessionRow> & { sessionId: number }): MergableSessionRow => ({
  offeringId: o.sessionId * 10,
  roomId: 123,
  startTime: '08:00',
  endTime: '10:00',
  professorId: 500,
  sharedScheduleGroupKey: null,
  ...o,
});

console.log('=== normSessionTime ===');
eq('HH:MM', normSessionTime('08:00'), '08:00');
eq('HH:MM:SS → HH:MM', normSessionTime('08:00:00'), '08:00');
eq('H:MM → HH:MM', normSessionTime('8:00'), '08:00');
eq('null', normSessionTime(null), null);
eq('بد', normSessionTime('abc'), null);
eq('ساعت ۲۵', normSessionTime('25:00'), null);

console.log('\n=== sessionMergeKey ===');
eq('ادغامِ خودکار (ساعت/استاد/اتاق)',
  sessionMergeKey(row({ sessionId: 1 })),
  'A:123|500|08:00|10:00');
eq('ادغامِ دستی برنده است',
  sessionMergeKey(row({ sessionId: 1, sharedScheduleGroupKey: 'MC-111-77' })),
  'K:MC-111-77');
eq('SOLO- یعنی جدا → گروهِ یکتا (هرگز ادغام نمی‌شود)',
  sessionMergeKey(row({ sessionId: 1, offeringId: 101, sharedScheduleGroupKey: 'SOLO-101' })),
  'SOLO:101');
eq('بدون استاد → بدون کلید', sessionMergeKey(row({ sessionId: 1, professorId: null })), null);
eq('بدون اتاق → بدون کلید', sessionMergeKey(row({ sessionId: 1, roomId: null })), null);
eq('ساعتِ متفاوت → کلیدِ متفاوت',
  sessionMergeKey(row({ sessionId: 1, startTime: '08:00' })) === sessionMergeKey(row({ sessionId: 2, startTime: '09:00' })),
  false);

console.log('\n=== groupSessionsIntoMerged: موردِ خودِ کاربر ===');
// اتاق ۱۲۳، «ریاضی» و «ریاضی ۱»، یک استاد، هر دو ساعت ۸
{
  const groups = groupSessionsIntoMerged([
    row({ sessionId: 11, offeringId: 101 }),
    row({ sessionId: 12, offeringId: 102 }),
  ]);
  eq('یک کلاس فیزیکی', groups.length, 1);
  eq('ادغامی', groups[0].merged, true);
  eq('نماینده = کوچک‌ترین شناسه', groups[0].primarySessionId, 11);
  eq('دو جلسهٔ عضو', groups[0].memberSessionIds, [11, 12]);
}

console.log('\n=== groupSessionsIntoMerged: تفکیکِ صحیح ===');
{
  // دو استادِ متفاوت در یک اتاق و یک ساعت = تداخلِ واقعی، نه ادغام
  const groups = groupSessionsIntoMerged([
    row({ sessionId: 1, professorId: 500 }),
    row({ sessionId: 2, professorId: 600 }),
  ]);
  eq('دو گروه جدا', groups.length, 2);
  eq('هیچ‌کدام ادغامی نیست', groups.map(g => g.merged), [false, false]);
}
{
  // یک استاد، دو اتاقِ متفاوت، یک ساعت = تداخلِ واقعی
  const groups = groupSessionsIntoMerged([
    row({ sessionId: 1, roomId: 123 }),
    row({ sessionId: 2, roomId: 124 }),
  ]);
  eq('دو گروه جدا (اتاقِ متفاوت)', groups.length, 2);
}
{
  // یک استاد، یک اتاق، دو ساعتِ متفاوت = دو کلاسِ واقعاً جدا
  const groups = groupSessionsIntoMerged([
    row({ sessionId: 1, startTime: '08:00', endTime: '10:00' }),
    row({ sessionId: 2, startTime: '10:00', endTime: '12:00' }),
  ]);
  eq('دو گروه جدا (ساعتِ متفاوت)', groups.length, 2);
}
{
  // SOLO عمداً جدا شده — حتی اگر ساعت و اتاق یکی باشد، دوباره یکی نمی‌شود
  const groups = groupSessionsIntoMerged([
    row({ sessionId: 1, offeringId: 101, sharedScheduleGroupKey: 'SOLO-101' }),
    row({ sessionId: 2, offeringId: 102, sharedScheduleGroupKey: 'SOLO-102' }),
  ]);
  eq('SOLO → دو گروه جدا', groups.length, 2);
  eq('هیچ‌کدام ادغامی نیست', groups.map(g => g.merged), [false, false]);
}
{
  // کلیدِ دستیِ یکسان حتی با ساعتِ متفاوت هم یکی می‌شود (کارشناس گفت یک جلسه است)
  const groups = groupSessionsIntoMerged([
    row({ sessionId: 1, startTime: '14:00', endTime: '16:15', sharedScheduleGroupKey: 'MC-111-9' }),
    row({ sessionId: 2, startTime: '13:45', endTime: '16:10', sharedScheduleGroupKey: 'MC-111-9' }),
  ]);
  eq('کلیدِ دستی با ساعتِ متفاوت → یک گروه', groups.length, 1);
  eq('ادغامی', groups[0].merged, true);
  eq('دو عضو', groups[0].memberSessionIds.length, 2);
}

console.log('\n=== groupSessionsIntoMerged: ترتیب و پایداری ===');
{
  const groups = groupSessionsIntoMerged([
    row({ sessionId: 30, startTime: '10:00', endTime: '12:00' }),
    row({ sessionId: 10, startTime: '08:00', endTime: '10:00' }),
    row({ sessionId: 20, startTime: '08:00', endTime: '10:00' }),
  ]);
  eq('ترتیبِ ورودی حفظ می‌شود', groups.map(g => g.primarySessionId), [30, 10]);
  eq('گروهِ دوم دو عضو دارد', groups[1].memberSessionIds, [10, 20]);
}
{
  // ورودیِ نامرتب → نماینده باز هم کوچک‌ترین شناسه
  const groups = groupSessionsIntoMerged([
    row({ sessionId: 99 }),
    row({ sessionId: 5 }),
    row({ sessionId: 42 }),
  ]);
  eq('نماینده = کوچک‌ترین', groups[0].primarySessionId, 5);
  eq('اعضا مرتب', groups[0].memberSessionIds, [5, 42, 99]);
}

console.log('\n=== برچسب‌های نمایش ===');
eq('دو کلاس', mergeBadgeText(2), '۲ کلاس ادغامی');
eq('پنج کلاس', mergeBadgeText(5), '۵ کلاس ادغامی');
eq('یک کلاس', mergeBadgeText(1), 'یک کلاس');
eq('عناوین یکتا', mergeMemberTitles([{ title: 'ریاضی' }, { title: 'ریاضی ۱' }, { title: 'ریاضی' }]), 'ریاضی · ریاضی ۱');
eq('عنوانِ خالی حذف می‌شود', mergeMemberTitles([{ title: '' }, { title: 'ریاضی' }]), 'ریاضی');

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
