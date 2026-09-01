import 'server-only';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  courses, degree_level_configs, departments, legacy_code_maps, majors, academic_terms,
} from '@/db/schema';
import { norm } from './normalize';

// ═══ میز کار تطبیق کدها ═══
// سیستم قدیمی هر چیزی را با کد خودش می‌شناسد (رشتهٔ «۱۱۰۲»، مقطع «K»، ترم «۹۹۱»…).
// اینجا هر کد قدیمی به موجودیت سامانهٔ جدید نگاشت می‌شود؛ موتور واردسازی نمرات و
// مالی از همین جدول استفاده می‌کند، پس یک‌بار تطبیق ← همه‌جا درست.

export type MapDomain =
  | 'MAJOR' | 'DEGREE' | 'TERM' | 'COURSE' | 'DEPARTMENT'
  | 'STUDENT_STATUS' | 'GRADE_STATUS' | 'TX_TYPE' | 'COURSE_TYPE' | 'QUOTA' | 'FEE_ITEM';

export type DomainDef = {
  id: MapDomain;
  title: string;
  hint: string;
  /** فهرست ثابت (بدون جدول) — برای وضعیت‌ها و نوع‌ها */
  fixed?: { code: string; title: string }[];
};

export const MAP_DOMAINS: DomainDef[] = [
  { id: 'MAJOR', title: 'رشته/گرایش', hint: 'کد رشتهٔ سیستم قدیمی → رشتهٔ سامانهٔ جدید' },
  { id: 'DEGREE', title: 'مقطع تحصیلی', hint: 'کد مقطع قدیمی → مقطع جدید' },
  { id: 'TERM', title: 'ترم تحصیلی', hint: 'کد ترم قدیمی (۹۹۱، ۴۰۲۱…) → ترم جدید' },
  { id: 'COURSE', title: 'درس', hint: 'کد درس قدیمی → درس کاتالوگ جدید' },
  { id: 'DEPARTMENT', title: 'گروه آموزشی', hint: 'کد گروه/دانشکدهٔ قدیمی → گروه جدید' },
  {
    id: 'STUDENT_STATUS', title: 'وضعیت دانشجو', hint: 'وضعیت قدیمی → وضعیت استاندارد',
    fixed: [
      { code: 'ACTIVE', title: 'فعال' },
      { code: 'GRADUATED', title: 'فارغ‌التحصیل' },
      { code: 'EXPELLED', title: 'اخراج/انصراف' },
      { code: 'BLOCKED_COMMISSION', title: 'مسدود (کمیسیون)' },
      { code: 'ON_LEAVE', title: 'مرخصی تحصیلی' },
    ],
  },
  {
    id: 'GRADE_STATUS', title: 'وضعیت نمره', hint: 'وضعیت نمرهٔ قدیمی → وضعیت جدید',
    fixed: [
      { code: 'FINALIZED', title: 'قطعی' },
      { code: 'TEMPORARY', title: 'موقت' },
      { code: 'PENDING', title: 'ثبت‌نشده' },
      { code: 'PASSED_NO_GRADE', title: 'قبول بدون نمره' },
      { code: 'FAILED_NO_GRADE', title: 'مردود بدون نمره' },
      { code: 'EXEMPT', title: 'معادل‌سازی/معافیت' },
    ],
  },
  {
    id: 'TX_TYPE', title: 'نوع تراکنش مالی', hint: 'نوع سند مالی قدیمی → بدهکار/بستانکار',
    fixed: [{ code: 'DEBIT', title: 'بدهی (شهریه/قبض)' }, { code: 'CREDIT', title: 'بستانکار (پرداخت/تخفیف)' }],
  },
  {
    id: 'COURSE_TYPE', title: 'نوع درس', hint: 'نوع درس قدیمی → نوع استاندارد (پایهٔ محاسبهٔ شهریه)',
    fixed: [
      { code: 'THEORY', title: 'نظری' },
      { code: 'PRACTICAL', title: 'عملی/آزمایشگاه' },
      { code: 'GENERAL', title: 'عمومی' },
      { code: 'PROJECT', title: 'پروژه/پایان‌نامه' },
    ],
  },
  {
    id: 'QUOTA', title: 'سهمیه', hint: 'سهمیهٔ قدیمی → سهمیهٔ جدید',
    fixed: [
      { code: 'NORMAL', title: 'آزاد/عادی' },
      { code: 'SHAHED', title: 'شاهد و ایثارگر' },
      { code: 'STAFF', title: 'کارکنان' },
      { code: 'TOP_TALENT', title: 'استعداد درخشان' },
    ],
  },
  {
    id: 'FEE_ITEM', title: 'اقلام شهریه', hint: 'عنوان ردیف شهریهٔ قدیمی → قلم استاندارد شهریه',
    fixed: [
      { code: 'FIXED', title: 'شهریهٔ ثابت' },
      { code: 'PER_UNIT_THEORY', title: 'هر واحد نظری' },
      { code: 'PER_UNIT_PRACTICAL', title: 'هر واحد عملی' },
      { code: 'PER_UNIT_GENERAL', title: 'هر واحد عمومی' },
      { code: 'SERVICE', title: 'خدمات جانبی (خوابگاه/بیمه)' },
      { code: 'PENALTY', title: 'جریمه/دیرکرد' },
      { code: 'DISCOUNT', title: 'تخفیف' },
    ],
  },
];

export type TargetOption = { id: number | null; code: string; title: string };

/** گزینه‌های مقصد برای هر دامنه (از دیتابیس یا فهرست ثابت) */
export async function targetOptions(domain: MapDomain): Promise<TargetOption[]> {
  const def = MAP_DOMAINS.find(d => d.id === domain);
  if (def?.fixed) return def.fixed.map(f => ({ id: null, code: f.code, title: f.title }));

  if (domain === 'MAJOR') {
    const rows = await db.select({ id: majors.id, code: majors.majorCode, title: majors.name }).from(majors).orderBy(asc(majors.name));
    return rows.map(r => ({ id: r.id, code: r.code ?? String(r.id), title: r.title }));
  }
  if (domain === 'DEGREE') {
    const rows = await db.select({ id: degree_level_configs.id, code: degree_level_configs.code, title: degree_level_configs.title })
      .from(degree_level_configs).orderBy(asc(degree_level_configs.id));
    return rows.map(r => ({ id: r.id, code: r.code, title: r.title }));
  }
  if (domain === 'TERM') {
    const rows = await db.select({ id: academic_terms.id, code: academic_terms.termCode, title: academic_terms.title })
      .from(academic_terms).orderBy(asc(academic_terms.termCode));
    return rows.map(r => ({ id: r.id, code: r.code, title: r.title }));
  }
  if (domain === 'COURSE') {
    const rows = await db.select({ id: courses.id, code: courses.code, title: courses.title }).from(courses).orderBy(asc(courses.code)).limit(3000);
    return rows.map(r => ({ id: r.id, code: r.code, title: r.title }));
  }
  if (domain === 'DEPARTMENT') {
    const rows = await db.select({ id: departments.id, title: departments.name }).from(departments).orderBy(asc(departments.name));
    return rows.map(r => ({ id: r.id, code: String(r.id), title: r.title }));
  }
  return [];
}

// ── شباهت متنی برای پیشنهاد خودکار ──
const STOP = ['رشته', 'گرایش', 'مهندسی', 'کارشناسی', 'ارشد', 'دکتری', 'ناپیوسته', 'پیوسته', 'دانشکده', 'گروه', 'درس', 'واحد'];

function canon(s: string): string {
  return norm(s)
    .toLowerCase()
    .replace(/[یي]/g, 'ی').replace(/[كک]/g, 'ک').replace(/[ۀهة]/g, 'ه').replace(/[أإآا]/g, 'ا')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string): string[] {
  return canon(s).split(' ').filter(t => t.length > 1 && !STOP.includes(t));
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** امتیاز شباهت ۰..۱۰۰ — ترکیب تطابق دقیق کد، اشتراک توکن‌ها و فاصلهٔ ویرایشی */
export function similarity(legacyCode: string, legacyTitle: string, opt: TargetOption): number {
  const lc = canon(legacyCode);
  const oc = canon(opt.code);
  if (lc && oc && lc === oc) return 100;

  const lt = canon(legacyTitle);
  const ot = canon(opt.title);
  if (!lt || !ot) return lc && oc && (lc.endsWith(oc) || oc.endsWith(lc)) ? 60 : 0;
  if (lt === ot) return 98;

  const a = new Set(tokens(legacyTitle));
  const b = new Set(tokens(opt.title));
  let inter = 0;
  a.forEach(t => { if (b.has(t)) inter++; });
  const jaccard = a.size + b.size ? inter / (a.size + b.size - inter) : 0;

  const dist = levenshtein(lt, ot);
  const lev = 1 - dist / Math.max(lt.length, ot.length);

  const score = Math.round((jaccard * 0.6 + Math.max(lev, 0) * 0.4) * 100);
  return Math.max(0, Math.min(97, score));
}

/** بهترین پیشنهاد برای یک کد قدیمی */
export function suggest(legacyCode: string, legacyTitle: string, options: TargetOption[]): { opt: TargetOption; score: number } | null {
  let best: { opt: TargetOption; score: number } | null = null;
  for (const opt of options) {
    const score = similarity(legacyCode, legacyTitle, opt);
    if (!best || score > best.score) best = { opt, score };
  }
  return best && best.score > 0 ? best : null;
}

export const AUTO_CONFIRM_SCORE = 90;   // ≥ این امتیاز خودکار «تأییدشده» می‌شود
export const SUGGEST_MIN_SCORE = 45;    // ≥ این امتیاز «پیشنهاد» ثبت می‌شود

export type MapRow = {
  id: number; sourceCode: string; domain: string; legacyCode: string; legacyTitle: string | null;
  targetId: number | null; targetCode: string | null; targetTitle: string | null;
  confidence: string | null; status: string; note: string | null;
};

export async function listMaps(sourceCode: string, domain?: MapDomain): Promise<MapRow[]> {
  const where = domain
    ? and(eq(legacy_code_maps.sourceCode, sourceCode), eq(legacy_code_maps.domain, domain))
    : eq(legacy_code_maps.sourceCode, sourceCode);
  return db.select().from(legacy_code_maps).where(where).orderBy(asc(legacy_code_maps.domain), asc(legacy_code_maps.legacyCode)) as Promise<MapRow[]>;
}

/** ثبت/به‌روزرسانی یک کد قدیمی (بدون بازنویسی تطبیق‌های تأییدشدهٔ کاربر) */
export async function upsertLegacyCode(params: {
  sourceCode: string; domain: MapDomain; legacyCode: string; legacyTitle?: string;
}): Promise<'inserted' | 'existing'> {
  const { sourceCode, domain, legacyCode, legacyTitle } = params;
  const res = await db.insert(legacy_code_maps).values({
    sourceCode, domain, legacyCode, legacyTitle: legacyTitle || null, status: 'UNMAPPED',
  }).onConflictDoNothing().returning({ id: legacy_code_maps.id });
  if (res.length) return 'inserted';
  if (legacyTitle) {
    await db.update(legacy_code_maps)
      .set({ legacyTitle })
      .where(and(
        eq(legacy_code_maps.sourceCode, sourceCode),
        eq(legacy_code_maps.domain, domain),
        eq(legacy_code_maps.legacyCode, legacyCode),
      ));
  }
  return 'existing';
}

/** اجرای پیشنهاد خودکار روی کدهای بی‌نگاشت یک دامنه */
export async function autoSuggestDomain(sourceCode: string, domain: MapDomain): Promise<{ suggested: number; confirmed: number; untouched: number }> {
  const options = await targetOptions(domain);
  const rows = await db.select().from(legacy_code_maps)
    .where(and(
      eq(legacy_code_maps.sourceCode, sourceCode),
      eq(legacy_code_maps.domain, domain),
      inArray(legacy_code_maps.status, ['UNMAPPED', 'SUGGESTED']),
    ));

  let suggested = 0; let confirmed = 0; let untouched = 0;
  for (const r of rows) {
    const best = suggest(r.legacyCode, r.legacyTitle ?? '', options);
    if (!best || best.score < SUGGEST_MIN_SCORE) { untouched++; continue; }
    const auto = best.score >= AUTO_CONFIRM_SCORE;
    await db.update(legacy_code_maps).set({
      targetId: best.opt.id, targetCode: best.opt.code, targetTitle: best.opt.title,
      confidence: String(best.score), status: auto ? 'CONFIRMED' : 'SUGGESTED', updatedAt: new Date(),
    }).where(eq(legacy_code_maps.id, r.id));
    auto ? confirmed++ : suggested++;
  }
  return { suggested, confirmed, untouched };
}

/** نگاشت آمادهٔ مصرف موتورها: legacyCode → {targetId, targetCode} (فقط تأییدشده‌ها) */
export async function resolverFor(sourceCode: string, domain: MapDomain): Promise<Map<string, { id: number | null; code: string | null; title: string | null }>> {
  const rows = await db.select().from(legacy_code_maps).where(and(
    eq(legacy_code_maps.sourceCode, sourceCode),
    eq(legacy_code_maps.domain, domain),
    eq(legacy_code_maps.status, 'CONFIRMED'),
  ));
  const m = new Map<string, { id: number | null; code: string | null; title: string | null }>();
  for (const r of rows) m.set(norm(r.legacyCode), { id: r.targetId, code: r.targetCode, title: r.targetTitle });
  return m;
}

/** آمار میز کار: چند کد در هر دامنه و چقدرش تطبیق خورده */
export async function mappingStats(sourceCode: string): Promise<{ domain: MapDomain; title: string; total: number; confirmed: number; suggested: number; unmapped: number }[]> {
  const rows = await db.select({
    domain: legacy_code_maps.domain, status: legacy_code_maps.status,
  }).from(legacy_code_maps).where(eq(legacy_code_maps.sourceCode, sourceCode));

  return MAP_DOMAINS.map(d => {
    const mine = rows.filter(r => r.domain === d.id);
    return {
      domain: d.id, title: d.title, total: mine.length,
      confirmed: mine.filter(r => r.status === 'CONFIRMED').length,
      suggested: mine.filter(r => r.status === 'SUGGESTED').length,
      unmapped: mine.filter(r => r.status === 'UNMAPPED').length,
    };
  });
}
