import { pickCol } from './normalize';
import { iterate, pickTable, type Table } from './tabular';

// ═══ فرهنگ ستون‌ها: «فیلد سامانه ↔ نام‌های محتمل در فایل قدیمی» ═══
// این جدول هم برای تشخیص خودکار ستون‌ها به کار می‌رود و هم برای گام «نگاشت ستون»
// در جادوگر آپلود، جایی که کاربر می‌تواند حدس سامانه را دستی اصلاح کند.
// کلید هر فیلد = نخستین نامک آن (همان چیزی که در سرستون قالب رسمی می‌آید).

export type FieldSpec = { key: string; title: string; aliases: string[]; required?: boolean; hint?: string };

export const FIELD_SPECS: Record<string, FieldSpec[]> = {
  // ── دادهٔ پایهٔ سازمانی (ترتیب انتقال: دانشکده ← گروه ← رشته ← استاد) ──
  faculty: [
    { key: 'کد دانشکده', title: 'کد دانشکده', aliases: ['کد دانشکده', 'کد', 'faculty_code', 'code'] },
    { key: 'نام دانشکده', title: 'نام دانشکده', aliases: ['نام دانشکده', 'دانشکده', 'نام', 'faculty', 'faculty_name', 'name'], required: true },
  ],
  department: [
    { key: 'کد گروه', title: 'کد گروه آموزشی', aliases: ['کد گروه', 'کد گروه آموزشی', 'کد', 'department_code', 'dept_code', 'code'] },
    { key: 'نام گروه', title: 'نام گروه آموزشی', aliases: ['نام گروه', 'گروه آموزشی', 'گروه', 'نام', 'department', 'department_name', 'name'], required: true },
    { key: 'دانشکده', title: 'دانشکده', aliases: ['دانشکده', 'نام دانشکده', 'کد دانشکده', 'faculty', 'faculty_code'], hint: 'نام یا کد دانشکده؛ اگر نبود خودکار ساخته می‌شود' },
  ],
  major: [
    { key: 'کد رشته', title: 'کد رشته', aliases: ['کد رشته', 'کدرشته', 'major_code', 'code'], required: true },
    { key: 'نام رشته', title: 'نام رشته', aliases: ['نام رشته', 'رشته', 'عنوان رشته', 'major', 'major_name', 'name'], required: true },
    { key: 'مقطع', title: 'مقطع تحصیلی', aliases: ['مقطع', 'مقطع تحصیلی', 'سطح', 'degree', 'degree_level'], required: true, hint: 'اگر عنوان مقطع با سامانه فرق دارد، در سربرگ «تطبیق کدها» نگاشتش کنید' },
    { key: 'گروه آموزشی', title: 'گروه آموزشی', aliases: ['گروه آموزشی', 'گروه', 'دپارتمان', 'department', 'dept'] },
    { key: 'دانشکده', title: 'دانشکده', aliases: ['دانشکده', 'نام دانشکده', 'کد دانشکده', 'faculty'] },
    { key: 'گرایش', title: 'گرایش', aliases: ['گرایش', 'نام گرایش', 'track', 'orientation'], hint: 'چند سطر با یک کد رشته = یک رشته و چند گرایش' },
    { key: 'کد گرایش', title: 'کد گرایش', aliases: ['کد گرایش', 'track_code'] },
    { key: 'حداقل واحد', title: 'حداقل واحد', aliases: ['حداقل واحد', 'کل واحد', 'واحد کل', 'min_units', 'total_units'] },
    { key: 'کد استاندارد', title: 'کد استاندارد رشته', aliases: ['کد استاندارد', 'کد استاندارد رشته', 'standard_code'] },
    { key: 'تاریخ تاسیس', title: 'تاریخ تأسیس', aliases: ['تاریخ تاسیس', 'تاریخ تأسیس', 'established_date'], hint: 'شمسی: ۱۳۸۵/۰۷/۰۱' },
    { key: 'تاریخ خاتمه', title: 'تاریخ خاتمه/انحلال', aliases: ['تاریخ خاتمه', 'تاریخ انحلال', 'terminated_date'] },
    { key: 'فعال', title: 'فعال/غیرفعال', aliases: ['فعال', 'وضعیت', 'is_active', 'active'] },
    { key: 'کد استادی مدیر گروه', title: 'مدیر گروه (کد استادی)', aliases: ['کد استادی مدیر گروه', 'مدیر گروه', 'head_staff_code'] },
    { key: 'کارشناس رشته', title: 'کارشناس رشته', aliases: ['کارشناس رشته', 'کارشناس', 'expert_name'] },
    { key: 'آخرین جلسه شورای گسترش', title: 'آخرین جلسهٔ شورای گسترش', aliases: ['آخرین جلسه شورای گسترش', 'شورای گسترش', 'last_council_date'] },
  ],
  professor: [
    { key: 'کد استادی', title: 'کد استادی', aliases: ['کد استادی', 'کد استاد', 'کد پرسنلی', 'staff_code', 'professor_code', 'code'], required: true, hint: 'کلید یکتای استاد؛ بازاجرای فایل ردیف تکراری نمی‌سازد' },
    { key: 'کد ملی', title: 'کد ملی', aliases: ['کد ملی', 'کدملی', 'national_code', 'nationalcode'], hint: 'بدون آن، حساب کاربری با شناسهٔ جایگزین و بدون امکان ورود ساخته می‌شود' },
    { key: 'نام', title: 'نام', aliases: ['نام', 'first_name', 'firstname'] },
    { key: 'نام خانوادگی', title: 'نام خانوادگی', aliases: ['نام خانوادگی', 'نامخانوادگی', 'فامیل', 'last_name', 'lastname'] },
    { key: 'نام و نام خانوادگی', title: 'نام کامل (اگر یک ستون است)', aliases: ['نام و نام خانوادگی', 'نام کامل', 'استاد', 'نام استاد', 'full_name'], hint: 'خودکار به نام/فامیل و لقب تفکیک می‌شود' },
    { key: 'لقب', title: 'لقب (دکتر/مهندس)', aliases: ['لقب', 'عنوان', 'title', 'prefix'] },
    { key: 'گروه آموزشی', title: 'گروه آموزشی', aliases: ['گروه آموزشی', 'گروه', 'دپارتمان', 'department', 'dept'] },
    { key: 'دانشکده', title: 'دانشکده', aliases: ['دانشکده', 'نام دانشکده', 'faculty'] },
    { key: 'مرتبه علمی', title: 'مرتبهٔ علمی', aliases: ['مرتبه علمی', 'مرتبه', 'academic_rank', 'rank'] },
    { key: 'مدرک', title: 'آخرین مدرک', aliases: ['مدرک', 'آخرین مدرک', 'مدرک تحصیلی', 'degree'] },
    { key: 'طریقه همکاری', title: 'طریقهٔ همکاری', aliases: ['طریقه همکاری', 'نحوه همکاری', 'نوع همکاری', 'cooperation_type'] },
    { key: 'نوع استخدام', title: 'نوع استخدام', aliases: ['نوع استخدام', 'نوع استخدامی', 'employment_type'] },
    { key: 'شماره مستخدم', title: 'شمارهٔ مستخدم/پرسنلی', aliases: ['شماره مستخدم', 'شماره پرسنلی', 'personnel_no'] },
    { key: 'تاریخ استخدام', title: 'تاریخ استخدام', aliases: ['تاریخ استخدام', 'hire_date'] },
    { key: 'سال اخذ آخرین مدرک', title: 'سال اخذ آخرین مدرک', aliases: ['سال اخذ آخرین مدرک', 'سال مدرک', 'last_degree_year'] },
    { key: 'رشته و گرایش', title: 'رشته و گرایش', aliases: ['رشته و گرایش', 'رشته تحصیلی', 'رشته', 'field_of_study'] },
    { key: 'دانشگاه محل اخذ مدرک', title: 'دانشگاه محل اخذ مدرک', aliases: ['دانشگاه محل اخذ مدرک', 'دانشگاه', 'last_degree_university'] },
    { key: 'پایه استادی', title: 'پایهٔ استادی', aliases: ['پایه استادی', 'پایه', 'academic_base'] },
    { key: 'وضعیت تاهل', title: 'وضعیت تأهل', aliases: ['وضعیت تاهل', 'تاهل', 'marital_status'] },
    { key: 'استان محل تولد', title: 'استان محل تولد', aliases: ['استان محل تولد', 'استان', 'birth_province'] },
    { key: 'شهر محل تولد', title: 'شهر محل تولد', aliases: ['شهر محل تولد', 'شهر', 'birth_city'] },
    { key: 'شماره حساب', title: 'شمارهٔ حساب', aliases: ['شماره حساب', 'حساب بانکی', 'bank_account'] },
    { key: 'تلفن ثابت', title: 'تلفن ثابت', aliases: ['تلفن ثابت', 'تلفن', 'phone'] },
    { key: 'موبایل', title: 'موبایل', aliases: ['موبایل', 'همراه', 'تلفن همراه', 'mobile'] },
    { key: 'ایمیل', title: 'ایمیل', aliases: ['ایمیل', 'پست الکترونیک', 'email'] },
    { key: 'جنسیت', title: 'جنسیت', aliases: ['جنسیت', 'جنس', 'gender'] },
    { key: 'فعال', title: 'فعال/غیرفعال', aliases: ['فعال', 'وضعیت', 'is_active', 'active'] },
    { key: 'نام فایل عکس', title: 'نام فایل عکس', aliases: ['نام فایل عکس', 'عکس', 'فایل عکس', 'تصویر', 'photo', 'photo_file', 'image', 'picture'], hint: 'خودِ عکس‌ها را بعداً در سربرگ «عکس افراد» به‌صورت یک ZIP می‌دهید' },
  ],
  student: [
    { key: 'کد ملی', title: 'کد ملی', aliases: ['کد ملی', 'کدملی', 'national_code', 'nationalcode', 'ncode'], required: true },
    { key: 'نام', title: 'نام', aliases: ['نام', 'first_name', 'firstname'], required: true },
    { key: 'نام خانوادگی', title: 'نام خانوادگی', aliases: ['نام خانوادگی', 'نامخانوادگی', 'last_name', 'lastname'], required: true },
    { key: 'شماره دانشجویی', title: 'شمارهٔ دانشجویی', aliases: ['شماره دانشجویی', 'شمارهدانشجویی', 'student_code', 'studentcode'], required: true },
    { key: 'سال ورود', title: 'سال ورود', aliases: ['سال ورود', 'ورودی', 'entry_year'] },
    { key: 'رشته', title: 'رشته', aliases: ['رشته', 'گرایش', 'major'] },
    { key: 'مقطع', title: 'مقطع', aliases: ['مقطع', 'مقطع تحصیلی', 'سطح', 'degree', 'degree_level'] },
    { key: 'وضعیت', title: 'وضعیت دانشجو', aliases: ['وضعیت'] },
    { key: 'شماره شناسنامه', title: 'شمارهٔ شناسنامه', aliases: ['شماره شناسنامه', 'شمارهشناسنامه', 'birth_cert_no', 'shenasname'] },
    { key: 'سریال شناسنامه', title: 'سریال شناسنامه', aliases: ['سریال شناسنامه', 'سری شناسنامه', 'birth_cert_series', 'series'] },
    { key: 'محل تولد', title: 'محل تولد', aliases: ['محل تولد', 'محلتولد', 'place_of_birth', 'birth_place'] },
    { key: 'محل صدور', title: 'محل صدور', aliases: ['محل صدور', 'محلصدور', 'place_of_issue'] },
    { key: 'تاریخ تولد', title: 'تاریخ تولد', aliases: ['تاریخ تولد', 'تاریختولد', 'birth_date', 'birthdate'] },
    { key: 'نام پدر', title: 'نام پدر', aliases: ['نام پدر', 'نامپدر', 'father_name', 'father'] },
    { key: 'جنسیت', title: 'جنسیت', aliases: ['جنسیت', 'جنس', 'gender', 'sex'] },
    { key: 'آدرس', title: 'نشانی', aliases: ['آدرس', 'نشانی', 'address'] },
    { key: 'نام فایل عکس', title: 'نام فایل عکس', aliases: ['نام فایل عکس', 'عکس', 'فایل عکس', 'تصویر', 'photo', 'photo_file', 'image', 'picture'], hint: 'خودِ عکس‌ها را بعداً در سربرگ «عکس افراد» به‌صورت یک ZIP می‌دهید' },
  ],
  course: [
    { key: 'کد درس', title: 'کد درس', aliases: ['کد درس', 'کددرس', 'course_code', 'code'], required: true },
    { key: 'نام درس', title: 'نام درس', aliases: ['نام درس', 'عنوان درس', 'درس', 'course_title', 'title'], required: true },
    { key: 'واحد', title: 'تعداد واحد', aliases: ['واحد', 'تعداد واحد', 'units', 'unit'] },
    { key: 'واحد نظری', title: 'واحد نظری', aliases: ['واحد نظری', 'نظری', 'theory_units', 'theory'] },
    { key: 'واحد عملی', title: 'واحد عملی', aliases: ['واحد عملی', 'عملی', 'practical_units', 'practical'] },
    { key: 'نوع', title: 'نوع درس', aliases: ['نوع', 'نوع درس', 'course_type', 'type'] },
    { key: 'مقطع', title: 'مقطع', aliases: ['مقطع', 'مقطع تحصیلی', 'سطح', 'degree', 'degree_level'] },
    { key: 'گروه آموزشی', title: 'گروه آموزشی', aliases: ['گروه آموزشی', 'گروه', 'دپارتمان', 'department', 'dept'] },
  ],
  term: [
    { key: 'کد ترم', title: 'کد ترم', aliases: ['کد ترم', 'کدترم', 'term_code', 'code'], required: true },
    { key: 'عنوان ترم', title: 'عنوان ترم', aliases: ['عنوان ترم', 'عنوان', 'نام ترم', 'term_title', 'title'] },
    { key: 'ترم جاری', title: 'ترم جاری؟', aliases: ['ترم جاری', 'جاری', 'is_current', 'current'] },
  ],
  enrollment: [
    { key: 'شماره دانشجویی', title: 'شمارهٔ دانشجویی', aliases: ['شماره دانشجویی', 'student_code'], required: true },
    { key: 'کد درس', title: 'کد درس', aliases: ['کد درس', 'course_code'], required: true },
    { key: 'کد ترم', title: 'کد ترم', aliases: ['کد ترم', 'term_code'], required: true },
    { key: 'نمره', title: 'نمره', aliases: ['نمره', 'grade', 'نمره نهایی'] },
    { key: 'وضعیت نمره', title: 'وضعیت نمره', aliases: ['وضعیت نمره', 'grade_status'] },
  ],
  codes: [
    { key: 'دامنه', title: 'دامنه', aliases: ['دامنه', 'نوع', 'domain'], required: true, hint: 'TERM / COURSE / MAJOR …' },
    { key: 'کد قدیمی', title: 'کد قدیمی', aliases: ['کد قدیمی', 'کد سیستم قدیمی', 'legacy_code', 'old_code'], required: true },
    { key: 'عنوان قدیمی', title: 'عنوان قدیمی', aliases: ['عنوان قدیمی', 'عنوان', 'شرح', 'legacy_title', 'title'] },
    { key: 'کد جدید', title: 'کد جدید (سامانه)', aliases: ['کد جدید', 'کد سامانه جدید', 'target_code', 'new_code'] },
    { key: 'یادداشت', title: 'یادداشت', aliases: ['یادداشت', 'توضیحات', 'note'] },
  ],
  'tuition-formula': [
    { key: 'کد فرمول', title: 'کد فرمول', aliases: ['کد فرمول', 'کدفرمول', 'formula_code', 'code'], required: true },
    { key: 'عنوان', title: 'عنوان', aliases: ['عنوان', 'شرح', 'title'] },
    { key: 'کد ترم', title: 'کد ترم', aliases: ['کد ترم', 'ترم', 'term_code'] },
    { key: 'کد مقطع', title: 'کد مقطع', aliases: ['کد مقطع', 'مقطع', 'degree_code'] },
    { key: 'کد رشته', title: 'کد رشته', aliases: ['کد رشته', 'رشته', 'major_code'] },
    { key: 'از ورودی', title: 'از ورودی', aliases: ['از ورودی', 'سال ورود از', 'entry_year_from'] },
    { key: 'تا ورودی', title: 'تا ورودی', aliases: ['تا ورودی', 'سال ورود تا', 'entry_year_to'] },
    { key: 'شهریه ثابت', title: 'شهریهٔ ثابت', aliases: ['شهریه ثابت', 'ثابت', 'fixed', 'fixed_amount'] },
    { key: 'هر واحد نظری', title: 'هر واحد نظری', aliases: ['هر واحد نظری', 'واحد نظری', 'per_unit_theory'] },
    { key: 'هر واحد عملی', title: 'هر واحد عملی', aliases: ['هر واحد عملی', 'واحد عملی', 'per_unit_practical'] },
    { key: 'هر واحد عمومی', title: 'هر واحد عمومی', aliases: ['هر واحد عمومی', 'واحد عمومی', 'per_unit_general'] },
    { key: 'فرمول', title: 'فرمول', aliases: ['فرمول', 'عبارت', 'expression', 'formula'] },
    { key: 'متغیرها', title: 'متغیرها', aliases: ['متغیرها', 'variables'] },
    { key: 'یادداشت', title: 'یادداشت', aliases: ['یادداشت', 'توضیحات', 'note'] },
  ],
  'legacy-financial': [
    { key: 'شماره دانشجویی', title: 'شمارهٔ دانشجویی', aliases: ['شماره دانشجویی', 'شماره دانشجو', 'student_code'], required: true },
    { key: 'نام دانشجو', title: 'نام دانشجو', aliases: ['نام دانشجو', 'نام و نام خانوادگی', 'student_name'] },
    { key: 'کد ترم', title: 'کد ترم', aliases: ['کد ترم', 'ترم', 'term_code'], required: true },
    { key: 'کد فرمول', title: 'کد فرمول', aliases: ['کد فرمول', 'formula_code'] },
    { key: 'کد مقطع', title: 'کد مقطع', aliases: ['کد مقطع', 'مقطع', 'degree_code'] },
    { key: 'کد رشته', title: 'کد رشته', aliases: ['کد رشته', 'رشته', 'major_code'] },
    { key: 'سال ورود', title: 'سال ورود', aliases: ['سال ورود', 'ورودی', 'entry_year'] },
    { key: 'تعداد واحد', title: 'تعداد واحد', aliases: ['تعداد واحد', 'واحد', 'units', 'total_units'] },
    { key: 'واحد نظری', title: 'واحد نظری', aliases: ['واحد نظری', 'theory_units'] },
    { key: 'واحد عملی', title: 'واحد عملی', aliases: ['واحد عملی', 'practical_units'] },
    { key: 'واحد عمومی', title: 'واحد عمومی', aliases: ['واحد عمومی', 'general_units'] },
    { key: 'شهریه', title: 'شهریهٔ کل (قدیمی)', aliases: ['شهریه', 'مبلغ شهریه', 'شهریه کل', 'tuition', 'total'], required: true },
    { key: 'تخفیف', title: 'تخفیف', aliases: ['تخفیف', 'discount'] },
    { key: 'پرداختی', title: 'پرداختی', aliases: ['پرداختی', 'پرداخت شده', 'paid'] },
  ],
  grades: [
    { key: 'شماره دانشجویی', title: 'شمارهٔ دانشجویی', aliases: ['شماره دانشجویی', 'شماره دانشجو', 'student_code'], required: true },
    { key: 'نام دانشجو', title: 'نام دانشجو', aliases: ['نام دانشجو', 'نام و نام خانوادگی', 'student_name'] },
    { key: 'کد ترم', title: 'کد ترم', aliases: ['کد ترم', 'ترم', 'term_code'], required: true },
    { key: 'عنوان ترم', title: 'عنوان ترم', aliases: ['عنوان ترم', 'term_title'] },
    { key: 'کد درس', title: 'کد درس', aliases: ['کد درس', 'course_code'], required: true },
    { key: 'نام درس', title: 'نام درس', aliases: ['نام درس', 'عنوان درس', 'course_title'] },
    { key: 'واحد', title: 'واحد', aliases: ['واحد', 'تعداد واحد', 'units'] },
    { key: 'نمره', title: 'نمره', aliases: ['نمره', 'نمره نهایی', 'grade', 'final_grade'] },
    { key: 'وضعیت نمره', title: 'وضعیت نمره', aliases: ['وضعیت نمره', 'وضعیت', 'grade_status'] },
    { key: 'استاد', title: 'استاد', aliases: ['استاد', 'نام استاد', 'professor'] },
  ],
};

export type InspectField = {
  key: string; title: string; required: boolean; hint?: string;
  detectedIndex: number; detectedHeader: string | null;
};

export type InspectSheet = {
  sheet: string; headers: string[]; rowCount: number;
  fields: InspectField[]; missingRequired: string[];
  sample: string[][];
};

/** گام ۱ جادوگر آپلود: فایل را می‌خوانیم و می‌گوییم چه فهمیده‌ایم */
export function inspectTables(kind: string, tables: Table[]): { kind: string; sheets: InspectSheet[]; best: string | null } {
  const specs = FIELD_SPECS[kind] ?? [];
  const sheets: InspectSheet[] = tables.map(t => {
    const fields: InspectField[] = specs.map(sp => {
      const idx = pickCol(t.headers, sp.aliases).idx;
      return { key: sp.key, title: sp.title, required: !!sp.required, hint: sp.hint, detectedIndex: idx, detectedHeader: idx >= 0 ? t.headers[idx] : null };
    });
    return {
      sheet: t.sheet, headers: t.headers, rowCount: t.rows.length, fields,
      missingRequired: fields.filter(f => f.required && f.detectedIndex < 0).map(f => f.title),
      sample: t.rows.slice(0, 5).map(r => t.headers.map((_, i) => String(r[i] ?? ''))),
    };
  });
  // بهترین شیت = آنکه بیشترین فیلد شناسایی‌شده را دارد
  let best: string | null = null; let bestScore = -1;
  for (const s of sheets) {
    const score = s.fields.filter(f => f.detectedIndex >= 0).length;
    if (score > bestScore) { bestScore = score; best = s.sheet; }
  }
  return { kind, sheets, best };
}

/** بازسازی سطرهای خام یک جدول برای ذخیره در staging (JSONB) */
export function rawRows(table: Table): { rowNumber: number; rawData: Record<string, string> }[] {
  return iterate(table).map(r => ({ rowNumber: r.line, rawData: r.raw }));
}


/**
 * انتخاب شیت و اعمال نگاشت دستی ستون‌ها — همان تصمیمی که کاربر در گام
 * «بررسی ستون‌ها» گرفته است.
 *
 * چرا مشترک؟ پیش از این فقط مسیر import آن را می‌فهمید؛ اگر «تحلیل اولیه» و
 * «ثبت نهایی» همین منطق را نداشته باشند، کاربر ستون‌ها را نگاشت می‌کند و
 * بعد می‌بیند هیچ اثری نداشته است.
 */
export function chooseTable(
  tables: Table[], kind: string, sheetWanted?: string | null, columnMapRaw?: string | null,
): { table: Table; columnMap: Record<string, number> | null; error?: string } {
  const specs = FIELD_SPECS[kind] ?? [];
  const table: Table =
    (sheetWanted ? tables.find(t => t.sheet === sheetWanted) : undefined) ||
    pickTable(tables, specs.map(sp => sp.aliases)) ||
    tables[0];

  let columnMap: Record<string, number> | null = null;
  const raw = (columnMapRaw ?? '').trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      columnMap = Object.fromEntries(
        Object.entries(parsed)
          .filter(([, v]) => v !== null && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0)
          .map(([k, v]) => [k, Number(v)]),
      );
      table.columnMap = columnMap;
    } catch {
      return { table, columnMap: null, error: 'نگاشت ستون‌ها معتبر نیست.' };
    }
  }
  return { table, columnMap };
}
