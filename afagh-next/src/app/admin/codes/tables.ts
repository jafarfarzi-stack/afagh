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
  /** آیا از همین صفحه می‌توان رکورد تازه ساخت؟ */
  creatable: boolean;
  total: number;
  missing: number;
  duplicate: number;
};

export const CODE_TABLES: { id: CodeTable; title: string; hint: string; editable: boolean; creatable: boolean }[] = [
  { id: 'faculty', title: 'دانشکده‌ها', hint: 'کد دانشکده — ریشهٔ ساختار سازمانی', editable: true, creatable: true },
  { id: 'department', title: 'گروه‌های آموزشی', hint: 'کد گروه — ذیل دانشکده', editable: true, creatable: false },
  { id: 'major', title: 'رشته‌ها و گرایش‌ها', hint: 'کد رشته — مقطع و گروه و دانشکده را مشخص می‌کند', editable: true, creatable: true },
  { id: 'degree', title: 'مقاطع تحصیلی', hint: 'کد مقطع — در فایل‌های دانشجو و درس به کار می‌رود', editable: true, creatable: true },
  { id: 'course', title: 'دروس', hint: 'کد درس — کلید یکتای کاتالوگ', editable: true, creatable: false },
  // ترم: افزودنی هست ولی کدش ویرایش نمی‌شود — کد ترم در انتخاب واحد، نمره،
  // شهریه و کارنامه ریشه دوانده و تغییرش تاریخ تحصیلی را به هم می‌ریزد.
  { id: 'term', title: 'ترم‌ها', hint: 'کد ترم — مثلاً ۴۰۳۱ · افزودنی، ولی کد ثبت‌شده تغییر نمی‌کند', editable: false, creatable: true },
];

/** برای جدول‌هایی که ساختِ رکورد از این صفحه ممکن نیست، کاربر را کجا بفرستیم */
export const CREATE_ELSEWHERE: Partial<Record<CodeTable, { href: string; label: string }>> = {
  department: { href: '/admin/departments', label: 'ساخت گروه آموزشی در صفحهٔ «گروه‌های آموزشی»' },
  course: { href: '/group-manager/courses', label: 'ساخت درس در کارتابل مدیر گروه ← دروس' },
};

/** برچسب دکمهٔ افزودن — از عنوان جمعِ جدول ساخته نمی‌شود تا فارسی درست بماند */
export const ADD_LABEL: Partial<Record<CodeTable, string>> = {
  faculty: 'افزودن دانشکده',
  major: 'افزودن رشته',
  degree: 'افزودن مقطع تحصیلی',
  term: 'افزودن ترم',
};

export type FieldKind = 'text' | 'code' | 'number' | 'select';

export type NewField = {
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  hint?: string;
  def?: string;
  /** گزینه‌های select از سرور می‌آید (مقاطع یا گروه‌ها) */
  optionsFrom?: 'degree' | 'department';
  /** گزینه‌های ثابت — وقتی به دیتابیس وابسته نیستند */
  choices?: { value: string; label: string }[];
};

/** گزینه‌های والد برای فرم ساخت — از سرور پر می‌شود */
export type FormOptions = {
  degree: { value: string; label: string }[];
  department: { value: string; label: string }[];
};

/**
 * تعریف فرم «افزودن» برای هر جدول.
 *
 * چرا اینجا و نه در actions.ts: فایل‌های `'use server'` فقط اکسپورت تابع async
 * می‌پذیرند؛ اکسپورت این ثابت‌ها از آنجا بیلد را می‌شکند.
 */
export const NEW_FIELDS: Partial<Record<CodeTable, NewField[]>> = {
  degree: [
    { name: 'title', label: 'عنوان مقطع', kind: 'text', required: true, hint: 'مثلاً: کارشناسی ارشد ناپیوسته' },
    { name: 'code', label: 'کد مقطع', kind: 'code', required: true, hint: 'همان کدی که در فایل‌های دانشجو و درس می‌آید — مثلاً 3' },
    { name: 'defaultPassingGrade', label: 'نمرهٔ قبولی', kind: 'number', def: '10', hint: 'حد نصاب قبولی در هر درس' },
    { name: 'conditionalGpaThreshold', label: 'معدل مشروطی', kind: 'number', def: '12', hint: 'زیر این معدل، دانشجو مشروط می‌شود' },
    { name: 'maxUnitsPerTerm', label: 'سقف واحد هر ترم', kind: 'number', def: '20' },
  ],
  faculty: [
    { name: 'name', label: 'نام دانشکده', kind: 'text', required: true },
    { name: 'code', label: 'کد دانشکده', kind: 'code', hint: 'اختیاری ولی توصیه می‌شود — انتقال داده اول با کد تطبیق می‌دهد' },
  ],
  term: [
    { name: 'code', label: 'کد ترم', kind: 'code', required: true, hint: 'مثلاً 4031 = نیم‌سال اول سال ۱۴۰۳ · پس از ثبت قابل تغییر نیست' },
    { name: 'title', label: 'عنوان ترم', kind: 'text', required: true, hint: 'مثلاً: نیم‌سال اول ۱۴۰۳-۱۴۰۴' },
    {
      name: 'termType', label: 'نوع ترم', kind: 'select', required: true, def: 'NORMAL',
      choices: [
        { value: 'NORMAL', label: 'عادی (نیم‌سال)' },
        { value: 'SUMMER', label: 'تابستان' },
        { value: 'EQUIVALENCE', label: 'معادل‌سازی' },
      ],
    },
  ],
  major: [
    { name: 'name', label: 'نام رشته', kind: 'text', required: true },
    { name: 'code', label: 'کد رشته', kind: 'code', hint: 'اختیاری ولی توصیه می‌شود' },
    { name: 'degreeLevelId', label: 'مقطع', kind: 'select', required: true, optionsFrom: 'degree' },
    { name: 'departmentId', label: 'گروه آموزشی', kind: 'select', optionsFrom: 'department', hint: 'دانشکده خودکار از روی گروه پر می‌شود' },
    { name: 'minUnits', label: 'حداقل واحد', kind: 'number' },
  ],
};
