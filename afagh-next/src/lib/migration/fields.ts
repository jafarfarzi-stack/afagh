import { pickCol } from './normalize';
import { iterate, type Table } from './tabular';

// ═══ فرهنگ ستون‌ها: «فیلد سامانه ↔ نام‌های محتمل در فایل قدیمی» ═══
// این جدول هم برای تشخیص خودکار ستون‌ها به کار می‌رود و هم برای گام «نگاشت ستون»
// در جادوگر آپلود، جایی که کاربر می‌تواند حدس سامانه را دستی اصلاح کند.
// کلید هر فیلد = نخستین نامک آن (همان چیزی که در سرستون قالب رسمی می‌آید).

export type FieldSpec = { key: string; title: string; aliases: string[]; required?: boolean; hint?: string };

export const FIELD_SPECS: Record<string, FieldSpec[]> = {
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
  key: string; title: string; required: boolean;
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
      return { key: sp.key, title: sp.title, required: !!sp.required, detectedIndex: idx, detectedHeader: idx >= 0 ? t.headers[idx] : null };
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
