/**
 * کد وضع نمره در کارنامه — همان کد قدیمی، نه عنوان بلند.
 *
 * ستون «وضع» کارنامه فقط کد می‌گیرد و راهنمای کدها پایین سند می‌آید؛ پس
 * ۱) هر کد قدیمی که ETL سما می‌شناسد باید در مرجع کدها باشد (وگرنه کدِ
 *    بی‌توضیح چاپ می‌شود) و ۲) هر وضعیت داخلی سامانهٔ جدید باید کد مرجع
 *    داشته باشد تا ردیف‌های ثبت‌شده در سامانهٔ جدید هم کد بگیرند.
 */
import { readFileSync } from 'node:fs';
import {
  CANONICAL_CODE_BY_STATUS,
  GRADE_STATUS_CODES,
  GRADE_STATUS_CODE_STATUS,
  GRADE_STATUS_FLAGS,
  gradeStatusCodeOf,
  gradeStatusCodeTitle,
  gradeStatusCodeAffectsGpa,
  gradeStatusCodeCountsUnit,
  gradeStatusLegend,
  gradeStatusLegendLine,
  isGradePassed,
  outcomeGradeStatusCodeId,
} from '../src/lib/grade-status-codes';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const byCode = new Map(GRADE_STATUS_CODES.map(c => [c.code, c]));

console.log('\n— هر کد قدیمیِ ETL سما در مرجع کدها هست —');
{
  // مجموعه‌ها را از خودِ اسکریپت واردسازی می‌خوانیم تا اگر آنجا کدی اضافه شد،
  // این تست شکست بخورد (نه اینکه مرجع کدها بی‌صدا عقب بماند)
  const src = readFileSync(new URL('../scripts/import-sama-afagh.mjs', import.meta.url), 'utf8');
  const setOf = (name: string): string[] => {
    const m = src.match(new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]\\)`));
    if (!m) throw new Error(`مجموعهٔ ${name} در import-sama-afagh.mjs پیدا نشد`);
    return m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  };
  const expected: [string, string[]][] = [
    ['EXEMPT', setOf('EXEMPT_MS')],
    ['PASSED_NO_GRADE', setOf('PASSNG_MS')],
    ['FAILED_NO_GRADE', setOf('FAILNG_MS')],
    ['TEMPORARY', setOf('TEMP_MS')],
    ['DROPPED', setOf('DROP_MS')],
  ];
  let missing: string[] = [];
  let wrongStatus: string[] = [];
  for (const [status, codes] of expected) {
    for (const code of codes) {
      const def = byCode.get(code);
      if (!def) missing.push(`${status}:${code}`);
      else if (def.status !== status) wrongStatus.push(`${code}→${def.status} (باید ${status})`);
    }
  }
  ok(missing.length === 0, `همهٔ کدهای قدیمی پوشش داده شدند${missing.length ? ` — کم: ${missing.join('، ')}` : ''}`);
  ok(wrongStatus.length === 0, `وضعیت داخلی هر کد درست است${wrongStatus.length ? ` — ${wrongStatus.join('، ')}` : ''}`);
  ok(byCode.get('1')?.status === 'FINALIZED', 'کد ۱ = نمرهٔ قطعی (همان فرض ETL)');
}

console.log('\n— کد هر ردیف: اول کد قدیمی، بعد کد مرجع وضعیت —');
{
  ok(gradeStatusCodeOf('FINALIZED', '53') === '53', 'کد قدیمیِ ردیف بر کد مرجع مقدم است');
  ok(gradeStatusCodeOf('FINALIZED', ' 53 ') === '53', 'فاصلهٔ اطراف کد قدیمی پاک می‌شود');
  ok(gradeStatusCodeOf('FINALIZED', null) === '1', 'FINALIZED بدون کد قدیمی → کد مرجع ۱');
  ok(gradeStatusCodeOf('EXEMPT') === '3', 'EXEMPT بدون کد قدیمی → ۳');
  ok(gradeStatusCodeOf('PASSED_NO_GRADE') === '12', 'PASSED_NO_GRADE → ۱۲ (جبرانی بدون احتساب - قبول)');
  ok(gradeStatusCodeOf('FAILED_NO_GRADE') === '2', 'FAILED_NO_GRADE → ۲');
  ok(gradeStatusCodeOf('TEMPORARY') === '10', 'TEMPORARY → ۱۰');
  ok(gradeStatusCodeOf('DROPPED') === 'N3', 'DROPPED کد قدیمیِ هم‌معنا ندارد → N3 (کد قدیمی جعل نمی‌شود)');
  ok(gradeStatusCodeOf('PENDING', null) === '0', 'PENDING → کد قدیمی ۰ («نامشخص» در فایل مرجع)');
  // کد مرجع باید عنوانِ هم‌خوان داشته باشد، وگرنه کارنامه کد گمراه‌کننده چاپ می‌کند
  const canonicalPairs: [string, string][] = [['FINALIZED','1'],['FAILED_NO_GRADE','2'],['EXEMPT','3'],['TEMPORARY','10'],['PASSED_NO_GRADE','12'],['PENDING','0']];
  ok(canonicalPairs.every(([st, code]) => CANONICAL_CODE_BY_STATUS[st] === code && GRADE_STATUS_CODE_STATUS[code] === st),
    'کد مرجع هر وضعیت، واقعاً همان وضعیت است (رفت‌وبرگشت پذیر)');
  ok(gradeStatusCodeOf('DRAFT', null) === 'N1' && gradeStatusCodeOf('APPEALED', null) === 'N2', 'پیش‌نویس و اعتراض کد داخلی دارند');
  const statuses = ['FINALIZED', 'TEMPORARY', 'DRAFT', 'APPEALED', 'PENDING', 'EXEMPT', 'PASSED_NO_GRADE', 'FAILED_NO_GRADE', 'DROPPED'];
  ok(statuses.every(s => !!CANONICAL_CODE_BY_STATUS[s]), 'همهٔ وضعیت‌های داخلی کد مرجع دارند');
}

console.log('\n— هیچ کدی بی‌توضیح چاپ نمی‌شود —');
{
  const untitled = GRADE_STATUS_CODES.filter(c => !gradeStatusCodeTitle(c.code));
  ok(untitled.length === 0, 'همهٔ کدها عنوان دارند');
  ok(gradeStatusCodeTitle('999') === '999', 'کد ناشناخته دست‌کم خودش را نشان می‌دهد');
  ok(gradeStatusCodeTitle('53', 'PASSED_NO_GRADE', 'قبولی در واحد درسی (توصیفی)') === 'قبولی در واحد درسی (توصیفی)',
    'عنوان دقیق میز تطبیق بر عنوان مرجع مقدم است');
  ok(new Set(GRADE_STATUS_CODES.map(c => c.code)).size === GRADE_STATUS_CODES.length, 'کد تکراری در مرجع نیست');
}

console.log('\n— راهنمای پایین کارنامه: گروه‌شده و مرتب —');
{
  const legend = gradeStatusLegend(['53', '1', '53', '', '3', '10', '2', '-1', 'N1']);
  const titles = legend.map(g => g.title);
  // ۸ کد غیرخالی با یک تکراری (۵۳) و هفت عنوان متفاوت → هفت ردیف راهنما
  ok(titles.length === 7 && new Set(titles).size === 7, `کدهای هم‌عنوان در یک ردیف آمدند (${legend.length} ردیف)`);
  ok(legend.find(g => g.codes.includes('53'))!.codes.join(',') === '53', 'کد تکراری فقط یک‌بار در راهنما می‌آید');
  const flat = legend.map(g => g.codes[0]);
  ok(flat[0] === '1' && flat[flat.length - 1] === 'N1', 'ترتیب: عددی صعودی، کد داخلی آخر');
  ok(legend.find(g => g.codes.includes('-1'))!.codes.join(',') === '-1', 'کد منفی حذف در راهنما هست');
  ok(legend.every(g => g.codes.length >= 1 && !!g.title), 'هیچ ردیف راهنما بی‌کد/بی‌عنوان نیست');
  // عنوان دقیق فایل مرجع (از میز تطبیق) باید در راهنما هم اعمال شود
  const withDb = gradeStatusLegend(['53', '12'], code => (code === '53' ? 'قبولی با ارزشیابی توصیفی' : null));
  ok(withDb.length === 2, 'دو کد با عنوان‌های متفاوت، دو ردیف راهنما می‌سازند');
  ok(!!withDb.find(g => g.title === 'قبولی با ارزشیابی توصیفی'), 'عنوان میز تطبیق در راهنما نشست');
}

console.log('\n— راهنمای تک‌خطی پایین کارنامه —');
{
  const line = gradeStatusLegendLine(['53', '1', '10', '53'], undefined, '');
  ok(line === '1=درس عادی - قبول، 10=نمره گزارش نشده، 53=دروس‌خودخوان _قبول(جبرانی‌بدون‌احتساب‌درمعدل)', `یک خط با ویرگول: «${line}»`);
  ok(!line.includes('\n'), 'راهنما چندخطی نمی‌شود');
  // کدهای هم‌عنوان با «/» کنار هم، تا راهنما کش نیاید
  const grouped = gradeStatusLegendLine(['2', '22', '51', '1'], undefined, '');
  // عنوان‌ها حالا کدبه‌کد دقیق‌اند، پس هر کد بند جداگانه می‌گیرد
  ok(grouped.startsWith('1=') && grouped.split('، ').length === 4, `هر کد یک بند جدا: «${grouped}»`);
  ok(grouped.includes('22=جبرانی بدون احتساب در معدل - مردود'), 'عنوان کد ۲۲ عین فایل مرجع');
  ok(gradeStatusLegendLine([], undefined, '') === '', 'بدون کد، راهنمایی چاپ نمی‌شود');
  ok(gradeStatusLegendLine(['6'], undefined, 'راهنمای کد وضعیت نمره: ') === 'راهنمای کد وضعیت نمره: 6=حذف اضطراری', 'پیشوند اختیاری است');
}

console.log('\n— عینِ فایل مرجع «وضع نمره»: ۴۷ کد، عنوان و پرچم‌ها —');
{
  const fileCodes = ['0','1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','22','23','24','27','28','29','32','40','50','51','52','53','54','55','200','201','300','931','941','951','-1','-3','-4','-5','-6','-91'];
  const missing = fileCodes.filter(c => !byCode.has(c));
  ok(missing.length === 0, `همهٔ ۴۷ کد فایل مرجع در جدول هستند${missing.length ? ' — کم: ' + missing.join('، ') : ''}`);
  ok(GRADE_STATUS_CODES.filter(c => c.origin === 'LEGACY').length === 47, '۴۷ کد قدیمی + ۲ کد داخلی');
  // عنوان‌ها عیناً از فایل آمده‌اند (فقط ي/ك عربی یکسان شده)
  ok(byCode.get('1')?.title === 'درس عادی - قبول', 'کد ۱ = «درس عادی - قبول»');
  ok(byCode.get('17')?.title === 'درمعادل‌سازی‌پذیرفته‌شده‌جزواحدبدون‌احتسابمعدل', 'کد ۱۷ عین فایل (بی‌فاصله)');
  ok(byCode.get('0')?.title === 'نامشخص' && byCode.get('0')?.status === 'PENDING', 'کد ۰ = نامشخص → PENDING');
  ok(byCode.get('11')?.title === 'جبرانی- بااحتساب درمعدل' && byCode.get('11')?.status === 'FINALIZED', 'کد ۱۱ = جبرانی با احتساب در معدل');
  ok(byCode.get('54')?.title === 'فوت' && byCode.get('54')?.status === 'PASSED_NO_GRADE', 'کد ۵۴ = فوت (پاس‌شده)');
  // پرچم‌های اثرِ هر کد هم مهاجرت شده‌اند (نه فقط عنوان)
  const f1 = GRADE_STATUS_FLAGS['1'], f2 = GRADE_STATUS_FLAGS['2'], f20 = GRADE_STATUS_FLAGS['20'];
  ok(f1.gpa === true && f1.unitPassed === true && f1.keepAfterRetake === true, 'کد ۱: اثر در معدل/واحد + عدم حذف با قبولی مجدد');
  ok(f2.gpa === true && f2.unitPassed === false && f2.keepAfterRetake === false, 'کد ۲: اثر در معدل، بدون واحد گذرانده');
  ok(f20.gpa === false && f20.totalSum === false, 'کد ۲۰: بدون اثر در معدل و جمع کل');
  ok(GRADE_STATUS_FLAGS['N1'] === undefined, 'کد داخلی پرچم قدیمی ندارد');
}

console.log('\n— کد وضع نمرهٔ وابسته به درس (قبولی / مردودی) —');
{
  // درس جبرانیِ بدون احتساب در معدل: ۱۲ در صورت قبولی، ۲۲ در صورت مردودی
  const compensatory = { passGradeStatusCodeId: 12, failGradeStatusCodeId: 22 };
  const ids: Record<string, number | null> = { '1': 101, '2': 102, '12': 112, '22': 122 };

  ok(outcomeGradeStatusCodeId(true, compensatory, ids) === 12, 'درس جبرانی در صورت قبولی کد تنظیم‌شدهٔ خودش (۱۲) را می‌گیرد');
  ok(outcomeGradeStatusCodeId(false, compensatory, ids) === 22, 'درس جبرانی در صورت مردودی کد تنظیم‌شدهٔ خودش (۲۲) را می‌گیرد');
  ok(outcomeGradeStatusCodeId(true, null, ids) === 101, 'درس بدون تنظیم، در صورت قبولی کد مرجع ۱ را می‌گیرد');
  ok(outcomeGradeStatusCodeId(false, null, ids) === 102, 'درس بدون تنظیم، در صورت مردودی کد مرجع ۲ را می‌گیرد');
  ok(outcomeGradeStatusCodeId(false, { passGradeStatusCodeId: 12, failGradeStatusCodeId: null }, ids) === 102,
    'اگر فقط کد قبولی تنظیم شده باشد، مردودی به کد مرجع برمی‌گردد');
  ok(outcomeGradeStatusCodeId(true, null, {}) === null, 'در نبود هر دو کد، هیچ کدی تحمیل نمی‌شود');
}

console.log('\n— تعیین قبول/رد با قاعدهٔ موتور آیین‌نامه —');
{
  ok(isGradePassed('12.00', 'NUMERIC', 10) === true, 'نمرهٔ ۱۲ با حدنصاب ۱۰ قبول است');
  ok(isGradePassed('9.75', 'NUMERIC', 10) === false, 'نمرهٔ ۹.۷۵ با حدنصاب ۱۰ مردود است');
  ok(isGradePassed('10', 'NUMERIC', 10) === true, 'نمرهٔ دقیقاً حدنصاب قبول است');
  ok(isGradePassed('1', 'DESCRIPTIVE', 10) === true, 'نمرهٔ توصیفی ۱ قبول است');
  ok(isGradePassed('2', 'DESCRIPTIVE', 10) === false, 'نمرهٔ توصیفی ۲ مردود است');
  ok(isGradePassed('', 'NUMERIC', 10) === null, 'نمرهٔ خالی سنجیده نمی‌شود');
  ok(isGradePassed(null, 'NUMERIC', 10) === null, 'نمرهٔ null سنجیده نمی‌شود');
  ok(isGradePassed('غیبت', 'NUMERIC', 10) === null, 'نمرهٔ متنی سنجیده نمی‌شود');
}

console.log('\n— پرچم «اثر در معدل» خودِ کد وضع (درس جبرانی) —');
{
  const flags = (code: string) => JSON.stringify(GRADE_STATUS_FLAGS[code]);

  // همان دو کدی که تعریف درس جبرانی انتخاب می‌کند
  ok(gradeStatusCodeAffectsGpa(flags('11')) === true, 'کد ۱۱ «جبرانی- بااحتساب درمعدل» در معدل اثر دارد');
  ok(gradeStatusCodeAffectsGpa(flags('12')) === false, 'کد ۱۲ «جبرانی بدون احتساب در معدل-قبول» در معدل اثر ندارد');
  // واحد گذرانده از معدل جدا است: کد ۱۲ واحد دارد ولی معدل نه
  ok(gradeStatusCodeCountsUnit(flags('12')) === true, 'کد ۱۲ واحد گذرانده حساب می‌شود');
  ok(gradeStatusCodeCountsUnit(flags('2')) === false, 'کد ۲ (مردود) واحد گذرانده ندارد');
  ok(gradeStatusCodeAffectsGpa(flags('1')) === true, 'کد ۱ (درس عادی قبول) در معدل اثر دارد');
  ok(gradeStatusCodeAffectsGpa(flags('20')) === false, 'کد ۲۰ (غیبت) در معدل اثر ندارد');

  // «نمی‌دانم» → فراخوان به قاعدهٔ قبلی خودش برمی‌گردد، رکورد حذف نمی‌شود
  ok(gradeStatusCodeAffectsGpa(null) === null, 'بدون پرچم → null (قاعدهٔ قبلی درس)');
  ok(gradeStatusCodeAffectsGpa('') === null, 'پرچم خالی → null');
  ok(gradeStatusCodeAffectsGpa('{خراب') === null, 'JSON خراب → null (نه خطا)');
  ok(gradeStatusCodeAffectsGpa('{"gpa":"بله"}') === null, 'gpa غیربولی → null');
  ok(gradeStatusCodeCountsUnit(null) === null, 'unitPassed بدون پرچم → null');
}

console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
if (fail) process.exit(1);
