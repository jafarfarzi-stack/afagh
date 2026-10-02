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
  /** فقط ترم: تاریخ شروع/پایان به قالب 'YYYY-MM-DDTHH:mm' یا null */
  startDate?: string | null;
  endDate?: string | null;
  /** کد استاندارد/کد وزارت — برای اتصال به ثمین (ستون‌های مرجع) */
  standardCode?: string | null;
  ministryCode?: string | null;
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
  // ترم: کدش ثابت است (در انتخاب واحد، نمره، شهریه و کارنامه ریشه دوانده)، ولی
  // زمان‌بندی ترم (شروع/پایان، انتخاب واحد، حذف و اضافه، امتحانات) ویرایش‌پذیر است.
  { id: 'term', title: 'ترم‌ها', hint: 'کد ترم — مثلاً ۴۰۳۱ · کد ثابت، زمان‌بندی ترم ویرایش‌پذیر است', editable: false, creatable: true },
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

export type FieldKind = 'text' | 'code' | 'number' | 'select' | 'date' | 'jdate';

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
/** دو ستون ملی/وزارتی مشترک همهٔ جدول‌های مرجع — برای اتصال به ثمین */
const SAMIN_CODE_FIELDS: NewField[] = [
  { name: 'standardCode', label: 'کد استاندارد', kind: 'code', hint: 'کد استاندارد وزارت علوم — برای اتصال به ثمین' },
  { name: 'ministryCode', label: 'کد وزارت', kind: 'code', hint: 'کد وزارت/وزارت علوم — برای اتصال به ثمین' },
];

export const NEW_FIELDS: Partial<Record<CodeTable, NewField[]>> = {
  degree: [
    { name: 'title', label: 'عنوان مقطع', kind: 'text', required: true, hint: 'مثلاً: کارشناسی ارشد ناپیوسته' },
    { name: 'code', label: 'کد مقطع', kind: 'code', required: true, hint: 'همان کدی که در فایل‌های دانشجو و درس می‌آید — مثلاً 3' },
    ...SAMIN_CODE_FIELDS,
    { name: 'defaultPassingGrade', label: 'نمرهٔ قبولی', kind: 'number', def: '10', hint: 'حد نصاب قبولی در هر درس' },
    { name: 'conditionalGpaThreshold', label: 'معدل مشروطی', kind: 'number', def: '12', hint: 'زیر این معدل، دانشجو مشروط می‌شود' },
    { name: 'maxUnitsPerTerm', label: 'سقف واحد هر ترم', kind: 'number', def: '20' },
    { name: 'termCount', label: 'تعداد ترم تحصیل', kind: 'number', required: true, def: '8', hint: 'کاردانی/ناپیوسته/ارشد: ۴ · کارشناسی پیوسته: ۸ · چارت ترم‌بندی با همین ساخته می‌شود' },
    {
      name: 'isGraduate', label: 'تحصیلات تکمیلی؟', kind: 'select', required: true, def: '0',
      choices: [
        { value: '0', label: 'نه — کاردانی/کارشناسی' },
        { value: '1', label: 'بله — ارشد/دکترا' },
      ],
    },
  ],
  faculty: [
    { name: 'name', label: 'نام دانشکده', kind: 'text', required: true },
    { name: 'code', label: 'کد دانشکده', kind: 'code', hint: 'اختیاری ولی توصیه می‌شود — انتقال داده اول با کد تطبیق می‌دهد' },
    ...SAMIN_CODE_FIELDS,
  ],
  term: [
    { name: 'code', label: 'کد ترم', kind: 'code', required: true, hint: 'مثلاً 4031 = نیم‌سال اول سال ۱۴۰۳ · پس از ثبت قابل تغییر نیست' },
    ...SAMIN_CODE_FIELDS,
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
    ...SAMIN_CODE_FIELDS,
    { name: 'degreeLevelId', label: 'مقطع', kind: 'select', required: true, optionsFrom: 'degree' },
    { name: 'departmentId', label: 'گروه آموزشی', kind: 'select', optionsFrom: 'department', hint: 'دانشکده خودکار از روی گروه پر می‌شود' },
    { name: 'minUnits', label: 'حداقل واحد', kind: 'number' },
  ],
  // گروه و درس از این صفحه ساخته نمی‌شوند (CREATE_ELSEWHERE) — تعریف فیلدها
  // فقط برای یکپارچگی با بقیهٔ جدول‌ها و استفادهٔ احتمالی آینده است.
  department: [...SAMIN_CODE_FIELDS],
  course: [...SAMIN_CODE_FIELDS],
};

const YES_NO = [
  { value: '0', label: 'نه' },
  { value: '1', label: 'بله' },
];

/**
 * فرم «ویرایش» برای جدول‌هایی که فیلدهایشان با فرم ساخت فرق دارد (مثل ترم).
 * فرم ساخت ترم فقط کد/عنوان/نوع است؛ ویرایش، زمان‌بندی کامل تحصیل را می‌گیرد.
 */
export const EDIT_FIELDS: Partial<Record<CodeTable, NewField[]>> = {
  term: [
    { name: 'title', label: 'عنوان ترم', kind: 'text', required: true, hint: 'مثلاً: نیم‌سال اول ۱۴۰۳-۱۴۰۴' },
    {
      name: 'termType', label: 'نوع ترم', kind: 'select', required: true,
      choices: [
        { value: 'NORMAL', label: 'عادی (نیم‌سال)' },
        { value: 'SUMMER', label: 'تابستان' },
        { value: 'EQUIVALENCE', label: 'معادل‌سازی' },
        { value: 'SPECIAL', label: 'ویژه' },
      ],
    },
    // کدهای ملی/وزارتی — کد ترم از این فرم ویرایش نمی‌شود ولی کدهای ثمینی بله
    ...SAMIN_CODE_FIELDS,
    { name: 'academicYear', label: 'سال تحصیلی', kind: 'number', hint: 'مثلاً 1403 — مبنای گزارش‌ها و تقویم تحصیلی' },
    { name: 'startDate', label: 'شروع ترم', kind: 'date' },
    { name: 'endDate', label: 'پایان ترم', kind: 'date' },
    { name: 'enrollmentStartDate', label: 'شروع انتخاب واحد', kind: 'date' },
    { name: 'enrollmentEndDate', label: 'پایان انتخاب واحد', kind: 'date' },
    { name: 'addDropStartDate', label: 'شروع حذف و اضافه', kind: 'date' },
    { name: 'addDropEndDate', label: 'پایان حذف و اضافه', kind: 'date' },
    { name: 'gradeEntryDeadline', label: 'مهلت ثبت نمره', kind: 'date' },
    { name: 'examStartDate', label: 'شروع امتحانات', kind: 'jdate', hint: 'شمسی: 1404/01/15 — پنجرهٔ کل امتحانات (بازهٔ عمومی/تخصصی در ماژول امتحانات)' },
    { name: 'examEndDate', label: 'پایان امتحانات', kind: 'jdate' },
    { name: 'appealWindowDays', label: 'مهلت اعتراض دانشجو (روز)', kind: 'number', def: '3' },
    { name: 'professorAppealSlaDays', label: 'مهلت پاسخ استاد (روز)', kind: 'number', def: '5' },
    { name: 'isCurrent', label: 'ترم جاری؟', kind: 'select', def: '0', choices: YES_NO, hint: 'در هر دانشگاه فقط یک ترم جاری است — فعال‌کردن، بقیه را خاموش می‌کند' },
    { name: 'isEnrollmentOpen', label: 'انتخاب واحد باز است؟', kind: 'select', def: '0', choices: YES_NO, hint: 'در هر دانشگاه فقط برای یک ترم باز است' },
  ],
};
