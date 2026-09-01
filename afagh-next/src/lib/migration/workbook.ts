import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { legacy_code_maps, legacy_financial_records, legacy_grades, legacy_tuition_formulas, tuition_compare_items, tuition_compare_runs } from '@/db/schema';
import { ENTITIES, type Entity } from './engine';
import { MAP_DOMAINS, type MapDomain, targetOptions, suggest, AUTO_CONFIRM_SCORE, SUGGEST_MIN_SCORE } from './codemap';
import { iterate, missingHeaders, pickTable, type Table } from './tabular';
import { writeXlsx, type CellValue } from './xlsx';
import { norm } from './normalize';
import type { ImportReport } from './tuition';

// ═══ فایل‌های اکسل: قالب خام برای پر کردن + خروجی گزارش‌ها ═══

export type WorkbookKind = Entity | 'codes' | 'tuition-formula' | 'legacy-financial' | 'grades';

type TemplateDef = { title: string; headers: string[]; example: CellValue[][]; help: string[] };

const TEMPLATES: Record<WorkbookKind, TemplateDef> = {
  student: {
    title: 'دانشجویان',
    headers: ['کد ملی', 'نام', 'نام خانوادگی', 'شماره دانشجویی', 'سال ورود', 'رشته', 'وضعیت'],
    example: [['0012345678', 'زهرا', 'کریمی', '31412001', 1402, 'مهندسی کامپیوتر', 'فعال']],
    help: ['«وضعیت» می‌تواند فارسی باشد (فعال/فارغ‌التحصیل/اخراج) — از میز تطبیق کدها هم قابل تعریف است.'],
  },
  course: {
    title: 'دروس',
    headers: ['کد درس', 'نام درس', 'واحد', 'نوع'],
    example: [['CE-101', 'مبانی برنامه‌نویسی', 3, 'نظری']],
    help: ['کد درس همان کد سیستم قدیمی باشد؛ تطبیق با کاتالوگ جدید در میز «تطبیق کدها» انجام می‌شود.'],
  },
  term: {
    title: 'ترم‌ها',
    headers: ['کد ترم', 'عنوان ترم', 'ترم جاری'],
    example: [['4021', 'نیم‌سال اول ۱۴۰۲-۱۴۰۳', 'خیر']],
    help: ['کد ترم ۳ یا ۴ رقمی (۹۹۱ یا ۴۰۲۱).'],
  },
  enrollment: {
    title: 'ثبت‌نام و نمره',
    headers: ['شماره دانشجویی', 'کد درس', 'کد ترم', 'نمره', 'وضعیت نمره'],
    example: [['31412001', 'CE-101', '4021', 17.5, 'قطعی']],
    help: ['برای انتقال انبوهِ نمرات، برگهٔ «نمرات» توصیه می‌شود (اول مقایسه، بعد اعمال).'],
  },
  ledger: {
    title: 'صورتحساب مالی',
    headers: ['شماره دانشجویی', 'کد ترم', 'نوع', 'مبلغ', 'شرح', 'تاریخ'],
    example: [['31412001', '4021', 'بدهی', 18500000, 'شهریه ترم', '1402/07/01']],
    help: ['«نوع»: بدهی یا پرداخت. تاریخ شمسی یا میلادی هر دو پذیرفته می‌شود.'],
  },
  clearance: {
    title: 'تسویه‌حساب',
    headers: ['شماره دانشجویی', 'کد ترم', 'تسویه'],
    example: [['31412001', '4021', 'بله']],
    help: [],
  },
  codes: {
    title: 'تطبیق کدها',
    headers: ['دامنه', 'کد قدیمی', 'عنوان قدیمی', 'کد جدید', 'یادداشت'],
    example: [
      ['MAJOR', '1101', 'مهندسی کامپیوتر نرم‌افزار', '', 'کد جدید را خالی بگذارید تا پیشنهاد خودکار اجرا شود'],
      ['DEGREE', 'K', 'کارشناسی پیوسته', 'BSC', ''],
      ['TERM', '991', 'نیم‌سال اول ۹۹-۱۴۰۰', '3991', ''],
    ],
    help: [
      'ستون «دامنه» یکی از این‌هاست: ' + MAP_DOMAINS.map(d => `${d.id} (${d.title})`).join('، '),
      '«کد جدید» اختیاری است؛ خالی بگذارید تا سامانه با شباهت متنی پیشنهاد بدهد و شما تأیید کنید.',
    ],
  },
  'tuition-formula': {
    title: 'فرمول شهریه',
    headers: ['کد فرمول', 'عنوان', 'کد ترم', 'کد مقطع', 'کد رشته', 'از ورودی', 'تا ورودی', 'شهریه ثابت', 'هر واحد نظری', 'هر واحد عملی', 'هر واحد عمومی', 'فرمول', 'متغیرها', 'یادداشت'],
    example: [
      ['F-BSC-4021', 'کارشناسی نیم‌سال اول ۱۴۰۲', '4021', 'K', '', 0, 0, 12500000, 1850000, 2400000, 1200000, '', '', 'محاسبهٔ استاندارد'],
      ['F-ADV-4021', 'فرمول با عبارت دلخواه', '4021', 'A', '', 1398, 1402, 0, 0, 0, 0, 'fixed + theoryUnits*1850000 + practicalUnits*2400000 + max(0, units-20)*500000', '{"ضریب":1.1}', 'عبارت بر مقادیر ثابت اولویت دارد'],
    ],
    help: [
      'اگر ستون «فرمول» پر باشد، همان ارزیابی می‌شود؛ وگرنه: ثابت + Σ(واحد×نرخ) − تخفیف.',
      'متغیرهای مجاز: fixed، perUnitTheory، perUnitPractical، perUnitGeneral، units، theoryUnits، practicalUnits، generalUnits، entryYear، discount (و معادل فارسی: ثابت، واحد، واحد_نظری، واحد_عملی، واحد_عمومی، تخفیف).',
      'توابع مجاز: min، max، round، floor، ceil، abs، if(شرط، الف، ب).',
      'ستون «متغیرها» یک JSON ساده است: {"ضریب":1.1}',
    ],
  },
  'legacy-financial': {
    title: 'مالی قدیمی',
    headers: ['شماره دانشجویی', 'نام دانشجو', 'کد ترم', 'کد فرمول', 'کد مقطع', 'کد رشته', 'سال ورود', 'تعداد واحد', 'واحد نظری', 'واحد عملی', 'واحد عمومی', 'شهریه', 'تخفیف', 'پرداختی'],
    example: [['31412001', 'زهرا کریمی', '4021', 'F-BSC-4021', 'K', '1101', 1402, 18, 14, 2, 2, 45300000, 0, 20000000]],
    help: ['ستون «شهریه» همان مبلغی است که سیستم قدیمی محاسبه کرده — مبنای مقایسه با فرمول است.'],
  },
  grades: {
    title: 'نمرات قدیمی',
    headers: ['شماره دانشجویی', 'نام دانشجو', 'کد ترم', 'کد درس', 'نام درس', 'واحد', 'نمره', 'وضعیت نمره', 'استاد'],
    example: [
      ['31412001', 'زهرا کریمی', '4021', 'CE-101', 'مبانی برنامه‌نویسی', 3, 17.5, 'قطعی', 'دکتر رضایی'],
      ['31412001', 'زهرا کریمی', '4021', 'GE-110', 'تربیت بدنی', 1, 'قبول', '', ''],
    ],
    help: [
      'نمره می‌تواند عددی (۰..۲۰) یا کیفی باشد: قبول، مردود، معاف، معادل‌سازی، حذف، الف/ب/ج/د.',
      'اول «مقایسه» بگیرید تا اختلاف با نمرات فعلی سامانه دیده شود، بعد «اعمال» کنید.',
    ],
  },
};

export function templateKinds(): { id: WorkbookKind; title: string }[] {
  const entityTitles = new Map(ENTITIES.map(e => [e.id as WorkbookKind, e.title]));
  return (Object.keys(TEMPLATES) as WorkbookKind[]).map(k => ({ id: k, title: entityTitles.get(k) ?? TEMPLATES[k].title }));
}

/** قالب اکسل خام برای پر کردن توسط کاربر (شامل برگهٔ راهنما) */
export function buildTemplate(kind: WorkbookKind): { buf: Buffer; fileName: string } {
  const t = TEMPLATES[kind] ?? TEMPLATES.student;
  const widths = t.headers.map(h => Math.max(12, Math.min(34, h.length + 8)));
  const help: CellValue[][] = [['راهنمای تکمیل'], ...t.help.map(h => [h] as CellValue[]),
    [''], ['نکته: ارقام فارسی، جداکنندهٔ هزارگان و تاریخ شمسی خودکار تبدیل می‌شوند.'],
    ['نکته: ردیف نمونه را پاک کنید و دادهٔ خودتان را از ردیف دوم وارد کنید.']];
  return {
    buf: writeXlsx([
      { name: t.title, rows: [t.headers, ...t.example], widths },
      { name: 'راهنما', rows: help, widths: [110] },
    ]),
    fileName: `afagh-template-${kind}.xlsx`,
  };
}

// ───────────────── واردسازی جدول تطبیق کدها از اکسل ─────────────────
const DOMAIN_ALIASES: Record<string, MapDomain> = (() => {
  const m: Record<string, MapDomain> = {};
  for (const d of MAP_DOMAINS) { m[d.id.toLowerCase()] = d.id; m[norm(d.title)] = d.id; }
  m['رشته'] = 'MAJOR'; m['گرایش'] = 'MAJOR'; m['مقطع'] = 'DEGREE'; m['ترم'] = 'TERM';
  m['درس'] = 'COURSE'; m['گروه'] = 'DEPARTMENT'; m['دانشکده'] = 'DEPARTMENT';
  return m;
})();

/** واردسازی/به‌روزرسانی نگاشت‌ها از فایل اکسل + پیشنهاد خودکار برای ردیف‌های بدون «کد جدید» */
export async function importCodeMaps(userId: number, sourceCode: string, tables: Table[], fileName: string): Promise<ImportReport> {
  const table = pickTable(tables, [['دامنه', 'domain'], ['کد قدیمی', 'legacy_code'], ['کد جدید', 'target_code']]);
  const rep: ImportReport = { kind: 'codes', fileName, sheet: table?.sheet ?? '-', total: 0, inserted: 0, updated: 0, invalid: 0, errors: [], warnings: [], sample: [] };
  if (!table) { rep.errors.push({ row: 0, msg: 'فایل خالی است.' }); return rep; }

  const miss = missingHeaders(table, [
    { title: 'دامنه', aliases: ['دامنه', 'نوع', 'domain'] },
    { title: 'کد قدیمی', aliases: ['کد قدیمی', 'کد سیستم قدیمی', 'legacy_code', 'old_code'] },
  ]);
  if (miss.length) { rep.errors.push({ row: 1, msg: `ستون‌های الزامی یافت نشد: ${miss.join('، ')}` }); return rep; }

  const optCache = new Map<MapDomain, Awaited<ReturnType<typeof targetOptions>>>();
  const rows = iterate(table);
  rep.total = rows.length;

  for (const r of rows) {
    const domRaw = r.get(['دامنه', 'نوع', 'domain']);
    const domain = DOMAIN_ALIASES[domRaw.toLowerCase()] ?? DOMAIN_ALIASES[norm(domRaw)];
    const legacyCode = r.get(['کد قدیمی', 'کد سیستم قدیمی', 'legacy_code', 'old_code']);
    if (!domain) { rep.invalid++; rep.errors.push({ row: r.line, msg: `دامنهٔ نامعتبر: «${domRaw}»` }); continue; }
    if (!legacyCode) { rep.invalid++; rep.errors.push({ row: r.line, msg: 'کد قدیمی خالی است.' }); continue; }

    const legacyTitle = r.get(['عنوان قدیمی', 'عنوان', 'شرح', 'legacy_title', 'title']);
    const targetCodeRaw = r.get(['کد جدید', 'کد سامانه جدید', 'target_code', 'new_code']);

    if (!optCache.has(domain)) optCache.set(domain, await targetOptions(domain));
    const options = optCache.get(domain) as Awaited<ReturnType<typeof targetOptions>>;

    let targetId: number | null = null;
    let targetCode: string | null = null;
    let targetTitle: string | null = null;
    let confidence = '0';
    let status = 'UNMAPPED';

    if (targetCodeRaw) {
      const hit = options.find(o => norm(o.code) === norm(targetCodeRaw)) ?? null;
      if (!hit) { rep.warnings.push({ row: r.line, msg: `کد جدید «${targetCodeRaw}» در دامنهٔ ${domain} یافت نشد — به‌عنوان مقدار خام ثبت شد.` }); }
      targetId = hit?.id ?? null;
      targetCode = hit?.code ?? targetCodeRaw;
      targetTitle = hit?.title ?? null;
      confidence = '100';
      status = 'CONFIRMED';
    } else {
      const best = suggest(legacyCode, legacyTitle, options);
      if (best && best.score >= SUGGEST_MIN_SCORE) {
        targetId = best.opt.id; targetCode = best.opt.code; targetTitle = best.opt.title;
        confidence = String(best.score);
        status = best.score >= AUTO_CONFIRM_SCORE ? 'CONFIRMED' : 'SUGGESTED';
      }
    }

    const values = {
      sourceCode, domain, legacyCode, legacyTitle: legacyTitle || null,
      targetId, targetCode, targetTitle, confidence, status,
      note: r.get(['یادداشت', 'توضیحات', 'note']) || null,
      updatedByUserId: userId, updatedAt: new Date(),
    };
    const ins = await db.insert(legacy_code_maps).values(values).onConflictDoUpdate({
      target: [legacy_code_maps.sourceCode, legacy_code_maps.domain, legacy_code_maps.legacyCode],
      set: values,
    }).returning({ id: legacy_code_maps.id });
    ins.length ? rep.inserted++ : rep.updated++;
    if (rep.sample.length < 5) rep.sample.push({ domain, legacyCode, targetCode, status });
  }
  return rep;
}

// ───────────────── خروجی اکسل گزارش‌ها ─────────────────
const STATUS_FA: Record<string, string> = {
  UNMAPPED: 'بدون تطبیق', SUGGESTED: 'پیشنهاد سامانه', CONFIRMED: 'تأییدشده', IGNORED: 'نادیده',
  MATCH: 'منطبق', DIFF: 'اختلاف', NO_FORMULA: 'بدون فرمول', ERROR: 'خطای فرمول',
  SAME: 'یکسان', MISSING_IN_NEW: 'در سامانهٔ جدید نیست', NO_STUDENT: 'دانشجو نیست',
  NO_TERM: 'ترم تطبیق نخورده', NO_COURSE: 'درس تطبیق نخورده', PENDING: 'مقایسه‌نشده',
  FINALIZED: 'قطعی', TEMPORARY: 'موقت', PASSED_NO_GRADE: 'قبول (بدون نمره)',
  FAILED_NO_GRADE: 'مردود (بدون نمره)', EXEMPT: 'معادل‌سازی/معافیت', DROPPED: 'حذف‌شده',
};

export async function exportCodeMaps(sourceCode: string, domain?: MapDomain): Promise<{ buf: Buffer; fileName: string }> {
  const where = domain
    ? and(eq(legacy_code_maps.sourceCode, sourceCode), eq(legacy_code_maps.domain, domain))
    : eq(legacy_code_maps.sourceCode, sourceCode);
  const rows = await db.select().from(legacy_code_maps).where(where)
    .orderBy(asc(legacy_code_maps.domain), asc(legacy_code_maps.legacyCode));

  const sheets = MAP_DOMAINS
    .filter(d => rows.some(r => r.domain === d.id))
    .map(d => ({
      name: d.title,
      widths: [16, 34, 16, 30, 12, 16, 28],
      rows: [
        ['کد قدیمی', 'عنوان قدیمی', 'کد جدید', 'عنوان جدید', 'امتیاز', 'وضعیت', 'یادداشت'] as CellValue[],
        ...rows.filter(r => r.domain === d.id).map(r => [
          r.legacyCode, r.legacyTitle ?? '', r.targetCode ?? '', r.targetTitle ?? '',
          Number(r.confidence ?? 0), STATUS_FA[r.status] ?? r.status, r.note ?? '',
        ] as CellValue[]),
      ],
    }));

  if (!sheets.length) sheets.push({ name: 'تطبیق کدها', rows: [['کد قدیمی', 'عنوان قدیمی', 'کد جدید', 'عنوان جدید', 'امتیاز', 'وضعیت', 'یادداشت']], widths: [16, 34, 16, 30, 12, 16, 28] });
  return { buf: writeXlsx(sheets), fileName: `afagh-codemaps-${sourceCode}.xlsx` };
}

export async function exportCompareRun(runId: number): Promise<{ buf: Buffer; fileName: string }> {
  const [run] = await db.select().from(tuition_compare_runs).where(eq(tuition_compare_runs.id, runId)).limit(1);
  const items = await db.select().from(tuition_compare_items).where(eq(tuition_compare_items.runId, runId)).orderBy(asc(tuition_compare_items.studentCode));

  const summary: CellValue[][] = [
    ['شاخص', 'مقدار'],
    ['شناسهٔ اجرا', runId],
    ['سامانهٔ مبدأ', run?.sourceCode ?? ''],
    ['ترم', run?.termCode ?? 'همهٔ ترم‌ها'],
    ['رواداری (ریال)', Number(run?.tolerance ?? 0)],
    ['کل ردیف', Number(run?.totalRows ?? 0)],
    ['منطبق', Number(run?.matched ?? 0)],
    ['دارای اختلاف', Number(run?.mismatched ?? 0)],
    ['بدون فرمول/خطا', Number(run?.unresolved ?? 0)],
    ['جمع شهریهٔ قدیمی', Number(run?.sumLegacy ?? 0)],
    ['جمع محاسبهٔ فرمول', Number(run?.sumComputed ?? 0)],
    ['اختلاف کل', Number(run?.sumDiff ?? 0)],
  ];

  const detail: CellValue[][] = [
    ['شماره دانشجویی', 'نام', 'کد ترم', 'کد فرمول', 'واحد', 'مبلغ قدیمی', 'محاسبهٔ فرمول', 'اختلاف', 'وضعیت', 'توضیح'],
    ...items.map(i => [
      i.studentCode, i.studentName ?? '', i.termCode ?? '', i.formulaCode ?? '', Number(i.totalUnits ?? 0),
      Number(i.legacyAmount ?? 0), Number(i.computedAmount ?? 0), Number(i.diff ?? 0),
      STATUS_FA[i.status] ?? i.status, i.detail ?? '',
    ] as CellValue[]),
  ];

  return {
    buf: writeXlsx([
      { name: 'خلاصه', rows: summary, widths: [26, 24] },
      { name: 'جزئیات', rows: detail, widths: [18, 22, 12, 18, 10, 18, 18, 16, 16, 46] },
    ]),
    fileName: `afagh-tuition-compare-${runId}.xlsx`,
  };
}

export async function exportGrades(sourceCode: string, termCode?: string): Promise<{ buf: Buffer; fileName: string }> {
  const where = termCode
    ? and(eq(legacy_grades.sourceCode, sourceCode), eq(legacy_grades.termCode, termCode))
    : eq(legacy_grades.sourceCode, sourceCode);
  const rows = await db.select().from(legacy_grades).where(where)
    .orderBy(asc(legacy_grades.studentCode), asc(legacy_grades.termCode), asc(legacy_grades.courseCode));

  return {
    buf: writeXlsx([{
      name: 'نمرات قدیمی',
      widths: [18, 22, 12, 16, 30, 10, 12, 16, 20, 22, 40],
      rows: [
        ['شماره دانشجویی', 'نام دانشجو', 'کد ترم', 'کد درس', 'نام درس', 'واحد', 'نمره', 'وضعیت نمره', 'استاد', 'نتیجهٔ مقایسه', 'توضیح'],
        ...rows.map(r => [
          r.studentCode, r.studentName ?? '', r.termCode, r.courseCode, r.courseTitle ?? '',
          r.units == null ? '' : Number(r.units), r.gradeValue == null ? (r.gradeRaw ?? '') : Number(r.gradeValue),
          STATUS_FA[r.gradeStatus] ?? r.gradeStatus, r.professorName ?? '',
          STATUS_FA[r.compareStatus ?? 'PENDING'] ?? r.compareStatus ?? '', r.compareNote ?? '',
        ] as CellValue[]),
      ],
    }]),
    fileName: `afagh-legacy-grades-${sourceCode}.xlsx`,
  };
}

export async function exportFinancial(sourceCode: string): Promise<{ buf: Buffer; fileName: string }> {
  const recs = await db.select().from(legacy_financial_records)
    .where(eq(legacy_financial_records.sourceCode, sourceCode)).orderBy(asc(legacy_financial_records.studentCode));
  const formulas = await db.select().from(legacy_tuition_formulas)
    .where(eq(legacy_tuition_formulas.sourceCode, sourceCode)).orderBy(asc(legacy_tuition_formulas.formulaCode));

  return {
    buf: writeXlsx([
      {
        name: 'مالی قدیمی',
        widths: [18, 22, 12, 18, 12, 12, 12, 12, 18, 14, 18],
        rows: [
          ['شماره دانشجویی', 'نام دانشجو', 'کد ترم', 'کد فرمول', 'مقطع', 'رشته', 'واحد', 'واحد عملی', 'شهریه', 'تخفیف', 'پرداختی'],
          ...recs.map(r => [
            r.studentCode, r.studentName ?? '', r.termCode, r.formulaCode ?? '', r.degreeCode ?? '', r.majorCode ?? '',
            Number(r.totalUnits ?? 0), Number(r.practicalUnits ?? 0), Number(r.legacyTuition ?? 0),
            Number(r.legacyDiscount ?? 0), Number(r.legacyPaid ?? 0),
          ] as CellValue[]),
        ],
      },
      {
        name: 'فرمول‌ها',
        widths: [20, 30, 12, 12, 12, 18, 18, 18, 18, 46],
        rows: [
          ['کد فرمول', 'عنوان', 'کد ترم', 'مقطع', 'رشته', 'ثابت', 'هر واحد نظری', 'هر واحد عملی', 'هر واحد عمومی', 'فرمول'],
          ...formulas.map(f => [
            f.formulaCode, f.title ?? '', f.termCode ?? '', f.degreeCode ?? '', f.majorCode ?? '',
            Number(f.fixedAmount ?? 0), Number(f.perUnitTheory ?? 0), Number(f.perUnitPractical ?? 0),
            Number(f.perUnitGeneral ?? 0), f.expression ?? '',
          ] as CellValue[]),
        ],
      },
    ]),
    fileName: `afagh-legacy-financial-${sourceCode}.xlsx`,
  };
}
