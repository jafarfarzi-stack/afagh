/**
 * تعریف جدول‌های کددار — ماژول خالص.
 *
 * چرا جدا از actions.ts؟ فایل‌های `'use server'` فقط اجازهٔ اکسپورت تابع async
 * دارند؛ اکسپورت آرایه/تایپ از آن‌ها بیلد را می‌شکند.
 */

export type CodeTable = 'faculty' | 'department' | 'major' | 'degree' | 'course' | 'term';

export type CodeRow = {
  id: number;
  code: string | null;
  title: string;
  /** زمینهٔ والد: دانشکدهٔ گروه، گروه و مقطعِ رشته… تا کاربر بداند کدام رکورد است */
  context: string | null;
  /** آیا این کد در همین جدول تکراری است؟ */
  duplicate: boolean;
};

export type CodeStat = {
  id: CodeTable;
  title: string;
  hint: string;
  editable: boolean;
  total: number;
  missing: number;
  duplicate: number;
};

export const CODE_TABLES: { id: CodeTable; title: string; hint: string; editable: boolean }[] = [
  { id: 'faculty', title: 'دانشکده‌ها', hint: 'کد دانشکده — ریشهٔ ساختار سازمانی', editable: true },
  { id: 'department', title: 'گروه‌های آموزشی', hint: 'کد گروه — ذیل دانشکده', editable: true },
  { id: 'major', title: 'رشته‌ها و گرایش‌ها', hint: 'کد رشته — مقطع و گروه و دانشکده را مشخص می‌کند', editable: true },
  { id: 'degree', title: 'مقاطع تحصیلی', hint: 'کد مقطع — در فایل‌های دانشجو و درس به کار می‌رود', editable: true },
  { id: 'course', title: 'دروس', hint: 'کد درس — کلید یکتای کاتالوگ', editable: true },
  { id: 'term', title: 'ترم‌ها', hint: 'کد ترم — مثلاً ۴۰۳۱', editable: false },
];
