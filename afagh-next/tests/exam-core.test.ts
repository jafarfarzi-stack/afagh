/**
 * تست واحد هستهٔ خالص چرخهٔ امتحانات — بدون React و بدون دیتابیس
 *
 * اجرا:  npm test
 * هدف اصلی: اثبات اینکه مسیر «ورودی مراقب → SQL» هرگز با رشتهٔ مخرب باز نمی‌شود
 * (وایت‌لیست method + اعتبارسنجی عددی) و قواعد بارم‌بندی/اعتراض هرگز نقض نمی‌شود.
 */
import {
  CHECKIN_METHODS,
  decideAppealOutcome,
  scoreFromComponents,
  validateCheckIns,
} from '../src/lib/exam-core.ts';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};
const throws = (name: string, fn: () => unknown, msgPart?: string) => {
  try {
    fn();
    fail++;
    console.log(`  ✗ ${name} (خطا نداد)`);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const ok = !msgPart || msg.includes(msgPart);
    if (ok) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name} — پیام: ${msg}`); }
  }
};

const RUBRIC = { midterm: 8, homework: 0, participation: 0, practical: 0, finalExam: 12 };

console.log('۱) وایت‌لیست روش حضور — دفاع در برابر SQL Injection');
eq('سه روش مجاز تعریف شده', [...CHECKIN_METHODS], ['QR_SCAN', 'MANUAL_BY_INVIGILATOR', 'SYSTEM_EXCUSE']);
throws('تزریق quote-برابر', () => validateCheckIns([{ studentId: 1, isPresent: 1, method: "QR_SCAN' OR '1'='1" }]), 'روش ثبت حضور نامعتبر است');
throws('تزریق DROP TABLE', () => validateCheckIns([{ studentId: 1, isPresent: 1, method: "QR_SCAN'; DROP TABLE users; --" }]), 'روش ثبت حضور نامعتبر است');
throws('تزریق comment', () => validateCheckIns([{ studentId: 1, isPresent: 1, method: "QR_SCAN' --" }]), 'روش ثبت حضور نامعتبر است');
throws('method با کاراکتر کنترلی', () => validateCheckIns([{ studentId: 1, isPresent: 1, method: "QR_SCAN\nMANUAL_BY_INVIGILATOR" }]), 'روش ثبت حضور نامعتبر است');
throws('method خالی', () => validateCheckIns([{ studentId: 1, isPresent: 1, method: '' }]), 'روش ثبت حضور نامعتبر است');
throws('method شیء', () => validateCheckIns([{ studentId: 1, isPresent: 1, method: { toString: () => "QR_SCAN'" } }]), 'روش ثبت حضور نامعتبر است');

console.log('\n۲) اعتبارسنجی عددی ورودی‌ها');
throws('studentId صفر', () => validateCheckIns([{ studentId: 0, isPresent: 1 }]), 'شناسهٔ دانشجو نامعتبر است');
throws('studentId منفی', () => validateCheckIns([{ studentId: -5, isPresent: 1 }]), 'شناسهٔ دانشجو نامعتبر است');
throws('studentId اعشاری', () => validateCheckIns([{ studentId: 1.5, isPresent: 1 }]), 'شناسهٔ دانشجو نامعتبر است');
throws('studentId رشته', () => validateCheckIns([{ studentId: 'abc', isPresent: 1 }]), 'شناسهٔ دانشجو نامعتبر است');
throws('studentId null', () => validateCheckIns([{ studentId: null, isPresent: 1 }]), 'شناسهٔ دانشجو نامعتبر است');
throws('isPresent=۲', () => validateCheckIns([{ studentId: 1, isPresent: 2 }]), 'مقدار حضور و غیاب نامعتبر است');
throws('isPresent=-۱', () => validateCheckIns([{ studentId: 1, isPresent: -1 }]), 'مقدار حضور و غیاب نامعتبر است');
throws('isPresent=رشته بله', () => validateCheckIns([{ studentId: 1, isPresent: 'yes' }]), 'مقدار حضور و غیاب نامعتبر است');
throws('مجوز موقت=۲', () => validateCheckIns([{ studentId: 1, isPresent: 1, hasTemporaryPermit: 2 }]), 'مقدار مجوز موقت نامعتبر است');
throws('لیست خالی', () => validateCheckIns([]), 'ردیف تأییدی برای بررسی ارسال نشده است');

console.log('\n۳) نرمال‌سازی ورودی معتبر');
const ok = validateCheckIns([
  { studentId: 10, isPresent: 0, method: 'SYSTEM_EXCUSE' },
  { studentId: 11, isPresent: 1, method: 'MANUAL_BY_INVIGILATOR', hasTemporaryPermit: 1 },
  { studentId: 12, isPresent: 1 }, // پیش‌فرض: QR_SCAN
]);
eq('سه ردیف معتبر عبور می‌کنند', ok.length, 3);
eq('پیش‌فرض method=QR_SCAN', ok[2], { studentId: 12, isPresent: 1, method: 'QR_SCAN', hasTemporaryPermit: 0 });
eq('SYSTEM_EXCUSE + temp=0', ok[0], { studentId: 10, isPresent: 0, method: 'SYSTEM_EXCUSE', hasTemporaryPermit: 0 });

console.log('\n۴) قواعد بارم‌بندی (کلمپ سقف، سقف ۲۰)');
eq('۹۹/۹۹ → ۲۰ (۸+۱۲)', scoreFromComponents({ midtermScore: 99, finalExamScore: 99 }, RUBRIC), 20);
eq('کلمپ میان‌ترم به ۸', scoreFromComponents({ midtermScore: 99.9, finalExamScore: 5 }, RUBRIC), 13);
eq('کلمپ پایان‌ترم به ۱۲', scoreFromComponents({ midtermScore: 4, finalExamScore: 99 }, RUBRIC), 16);
eq('منفی → صفر', scoreFromComponents({ midtermScore: -3, finalExamScore: -1 }, RUBRIC), 0);
eq('اعشاری گرد می‌شود', scoreFromComponents({ midtermScore: 7.75, finalExamScore: 11.5 }, RUBRIC), 19.25);
eq('مجموع دقیقاً ۲۰ مجاز است', scoreFromComponents({ midtermScore: 8, finalExamScore: 12 }, RUBRIC), 20);

console.log('\n۵) تصمیم پاسخ اعتراض');
eq('تغییر ۰٫۵ → پذیرفته', decideAppealOutcome(12, 12.5), { changed: true, status: 'RESOLVED_ACCEPTED' });
eq('بدون تغییر → رد', decideAppealOutcome(14, 14), { changed: false, status: 'REJECTED' });
eq('تغییر زیر ۰٫۰۱ → رد', decideAppealOutcome(14, 14.004), { changed: false, status: 'REJECTED' });
eq('تغییر ۲ واحد → پذیرفته', decideAppealOutcome(12, 14), { changed: true, status: 'RESOLVED_ACCEPTED' });

console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
