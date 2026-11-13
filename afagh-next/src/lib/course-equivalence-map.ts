// ════════════════════════════════════════════════════════════════════════════
//  هم‌ارزیِ درس در همان دانشگاه — «این دو کد، یک درس‌اند»
// ────────────────────────────────────────────────────────────────────────────
//  ستون `courses.equivalentCourseCodes` از دیرباز در دیتابیس هست (میراث
//  «دروس هم‌ارز / متضاد» سیستم قدیم) و اعتبارسنج برنامهٔ درسی هم آن را
//  می‌شناسد — ولی **هیچ‌کدام از موتورهای اجرایی** (فارغ‌التحصیلی، پیش‌نیاز)
//  آن را نمی‌خواندند. نتیجه: اگر یک درس در چارت با کد A تعریف شده باشد و
//  دانشجو همان درس را با کد B (هم‌ارزِ اعلام‌شده) پاس کرده باشد، «پاس‌نشده»
//  شمرده می‌شد.
//
//  این ماژول همان حلقهٔ گم‌شده است: یک ایندکسِ متقارن و متعدی از هم‌ارزی
//  می‌سازد تا مجموعهٔ «دروس پاس‌شده» با معادل‌هایشان گسترده شود.
//
//  چرا متعدی: اگر A~B و B~C اعلام شده باشد، A و C هم یک درس‌اند — همان
//  چیزی که در جدول هم‌ارزیِ سیستم قدیم به‌صورت زنجیره‌ای ثبت می‌شد. اگر
//  فقط یک‌گام اعمال می‌شد، نتیجه به «جهتِ نوشتنِ» هر ردیف وابسته می‌ماند
//  (A~B بله، B~A نه) که باگ خاموش می‌سازد.
//
//  ⚠ این ماژول هیچ‌چیز را حذف یا ادغام نمی‌کند — فقط «کدام کدها هم‌ارزند»
//    را پاسخ می‌دهد. ادغامِ ردیف‌های تکراری کار `scripts/merge-duplicate-courses`
//    است و همیشه با بکاپ و گزارش انجام می‌شود.
// ════════════════════════════════════════════════════════════════════════════

/** حداقلِ شکلِ یک درس برای ساخت ایندکس هم‌ارزی */
export interface EquivCourseRow {
  id: number;
  code: string;
  equivalentCourseCodes?: string | null;
}

/** جداکننده‌های مجاز در فیلد هم‌ارزی: کاما فارسی/لاتین، لوله، فاصله، نقطه‌ویرگول */
const SEP = /[,،|;\s]+/;

/**
 * «99055, 91003 | 45003» → ['99055','91003','45003']
 * کدها بزرگ‌حرف و بدون فاصله برمی‌گردند؛ خالی‌ها حذف می‌شوند.
 */
export function parseEquivalentCodes(raw: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of String(raw ?? '').split(SEP)) {
    const c = part.trim().toUpperCase();
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/** همان لیست، به‌صورت متنِ قابل ذخیره در ستون (بدون تکرار، ترتیب پایدار) */
export function joinEquivalentCodes(codes: readonly string[]): string | null {
  const seen: string[] = [];
  for (const c of codes) {
    const v = String(c ?? '').trim().toUpperCase();
    if (v && !seen.includes(v)) seen.push(v);
  }
  return seen.length ? seen.join(',') : null;
}

/** ادغام دو لیست هم‌ارزی (برای افزودن یک جفت بدون پاک‌کردنِ لیست موجود) */
export function mergeEquivalentCodes(
  existing: string | null | undefined,
  add: readonly string[],
  selfCode?: string
): string | null {
  const self = String(selfCode ?? '').trim().toUpperCase();
  const out = parseEquivalentCodes(existing);
  for (const c of add) {
    const v = String(c ?? '').trim().toUpperCase();
    if (!v || v === self || out.includes(v)) continue;
    out.push(v);
  }
  return out.length ? out.join(',') : null;
}

// ─────────────────────────────── Union-Find ───────────────────────────────

class Dsu {
  private parent = new Map<number, number>();
  find(x: number): number {
    const p = this.parent.get(x);
    if (p == null) { this.parent.set(x, x); return x; }
    if (p === x) return x;
    const root = this.find(p);
    this.parent.set(x, root); // فشرده‌سازی مسیر
    return root;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

export interface EquivalenceIndex {
  /** courseId → مجموعهٔ شناسهٔ دروس هم‌ارز (بدون خودِ درس) */
  byId: Map<number, Set<number>>;
  /** کدهایی که در فیلد هم‌ارزی آمده‌اند ولی در بانک دروس وجود ندارند */
  missingCodes: string[];
  /** تعداد جفت‌های مستقیمِ خوانده‌شده (قبل از بستار متعدی) */
  directPairs: number;
}

/**
 * ایندکس هم‌ارزی از فهرست دروس می‌سازد.
 *
 * خروجی متقارن است: اگر فقط A لیستش B را داشته باشد، B هم A را به‌عنوان
 * هم‌ارز می‌گیرد. این تقارن، منبعِ اصلی باگ‌های «از یک طرف کار می‌کند» است.
 */
export function buildEquivalenceIndex(rows: readonly EquivCourseRow[]): EquivalenceIndex {
  const byCode = new Map<string, number>();
  for (const r of rows) {
    if (r?.code) byCode.set(String(r.code).trim().toUpperCase(), r.id);
  }

  const dsu = new Dsu();
  const missing = new Set<string>();
  let directPairs = 0;

  for (const r of rows) {
    const list = parseEquivalentCodes(r.equivalentCourseCodes);
    if (!list.length) continue;
    const selfCode = String(r.code).trim().toUpperCase();
    for (const code of list) {
      if (code === selfCode) continue; // خودارجاعی = بی‌معنا
      const otherId = byCode.get(code);
      if (otherId == null) { missing.add(code); continue; }
      dsu.union(r.id, otherId);
      directPairs++;
    }
  }

  // گروه‌بندی بر اساس ریشه
  const groups = new Map<number, number[]>();
  for (const r of rows) {
    const root = dsu.find(r.id);
    const g = groups.get(root) ?? [];
    g.push(r.id);
    groups.set(root, g);
  }

  const byId = new Map<number, Set<number>>();
  for (const g of groups.values()) {
    if (g.length < 2) continue; // تک‌عضوی = هم‌ارزی ندارد
    for (const id of g) {
      byId.set(id, new Set(g.filter((x) => x !== id)));
    }
  }

  return { byId, missingCodes: [...missing].sort(), directPairs };
}

/**
 * مجموعهٔ «پاس‌شده» را با هم‌ارزها گسترش می‌دهد.
 *
 * واحدها شمرده نمی‌شوند — این تابع فقط «کدام درس‌ها را پاس کرده» را کامل
 * می‌کند؛ محاسبهٔ واحد و معدل همچنان بر پایهٔ ثبت‌نام‌های واقعی است (وگرنه
 * یک درس دو بار واحد می‌داد).
 */
export function expandPassedCourseIds(
  passed: Iterable<number>,
  index: EquivalenceIndex | Map<number, Set<number>>
): Set<number> {
  const map = index instanceof Map ? index : index.byId;
  const out = new Set<number>();
  for (const id of passed) {
    out.add(id);
    const eq = map.get(id);
    if (eq) for (const e of eq) out.add(e);
  }
  return out;
}

// ─────────────────── تشخیص «درس تکراری» در یک چارت ───────────────────

export interface DuplicateCandidate {
  /** شناسهٔ ردیف‌های curriculum_courses */
  rowIdA: number;
  rowIdB: number;
  courseIdA: number;
  courseIdB: number;
  codeA: string;
  codeB: string;
  title: string;
  term: number | null;
  unitsA: number;
  unitsB: number;
  roleA: string | null;
  roleB: string | null;
}

/**
 * کلید مقایسهٔ عنوان: ی/ک یکسان، بدون نیم‌فاصله، بدون نشانه، ارقام فارسی/عربی
 * به لاتین، کوچک. «شيمي عمومي 2» و «شیمی عمومی ۲» باید یک کلید بدهند — وگرنه
 * تشخیصِ درس تکراری نصفِ موارد را از دست می‌دهد.
 */
export function titleKey(title: string | null | undefined): string {
  return String(title ?? '')
    .replace(/[يى]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/[\u200c\u200d\u064b-\u065f]/g, '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();
}

export interface TitleRow {
  rowId: number;
  courseId: number;
  code: string;
  title: string;
  units: number;
  role: string | null;
  term: number | null;
}

/**
 * جفت‌های «یک عنوان، دو کد» در **یک ترم از یک نسخه**.
 *
 * فقط وقتی جفت می‌سازد که عنوان‌ها یکی و کدها متفاوت باشند. عمداً هیچ
 * حذفی انجام نمی‌دهد: تصمیمِ «کدام بماند» سیاست است، نه تشخیص.
 */
export function findDuplicatePairs(rows: readonly TitleRow[]): DuplicateCandidate[] {
  const buckets = new Map<string, TitleRow[]>();
  for (const r of rows) {
    const k = titleKey(r.title);
    if (!k) continue;
    const key = `${r.term ?? 'null'}|${k}`;
    const arr = buckets.get(key) ?? [];
    arr.push(r);
    buckets.set(key, arr);
  }

  const out: DuplicateCandidate[] = [];
  for (const arr of buckets.values()) {
    if (arr.length < 2) continue;
    // فقط جفت‌هایی که کدشان متفاوت است
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (arr[i].courseId === arr[j].courseId) continue;
        out.push({
          rowIdA: arr[i].rowId, rowIdB: arr[j].rowId,
          courseIdA: arr[i].courseId, courseIdB: arr[j].courseId,
          codeA: arr[i].code, codeB: arr[j].code,
          title: arr[i].title, term: arr[i].term,
          unitsA: arr[i].units, unitsB: arr[i].units,
          roleA: arr[i].role, roleB: arr[j].role,
        });
      }
    }
  }
  return out;
}

export interface KeepDecision {
  keepCode: string;
  dropCode: string;
  reason: string;
}

export interface KeepInput {
  codeA: string;
  codeB: string;
  /** تعداد کاتالوگ‌هایی از **همین رشته** که هر کد در آن‌ها آمده */
  catalogsA: number;
  catalogsB: number;
  /** تعداد قبولی‌های ثبت‌شده برای هر کد (کل دانشگاه) */
  passedA: number;
  passedB: number;
  unitsA: number;
  unitsB: number;
}

/**
 * کدام کد بماند؟ — قاعدهٔ قطعی و قابل بازتولید:
 *   ۱) کدی که در کاتالوگ‌های بیشتری از همان رشته آمده (سازگاری درون‌رشته‌ای)
 *   ۲) کدی که دانشجویان بیشتری آن را پاس کرده‌اند (کمترین اختلال در سوابق)
 *   ۳) کدی که واحد بیشتری دارد (جمع واحد برنامه را بی‌دلیل کم نمی‌کنیم)
 *   ۴) کد عددی کوچک‌تر (قطعیِ نهایی)
 *
 * هر چهار معیار «بیشتر/کوچک‌تر بهتر» هستند تا نتیجه به ترتیب ورودی وابسته نباشد.
 */
export function chooseKeep(input: KeepInput): KeepDecision {
  const a = String(input.codeA);
  const b = String(input.codeB);

  if (input.catalogsA !== input.catalogsB) {
    const keepA = input.catalogsA > input.catalogsB;
    return {
      keepCode: keepA ? a : b,
      dropCode: keepA ? b : a,
      reason: `در کاتالوگ‌های بیشتری از این رشته آمده (${Math.max(input.catalogsA, input.catalogsB)} در برابر ${Math.min(input.catalogsA, input.catalogsB)})`,
    };
  }
  if (input.passedA !== input.passedB) {
    const keepA = input.passedA > input.passedB;
    return {
      keepCode: keepA ? a : b,
      dropCode: keepA ? b : a,
      reason: `دانشجویان بیشتری آن را پاس کرده‌اند (${Math.max(input.passedA, input.passedB)} در برابر ${Math.min(input.passedA, input.passedB)})`,
    };
  }
  if (input.unitsA !== input.unitsB) {
    const keepA = input.unitsA > input.unitsB;
    return {
      keepCode: keepA ? a : b,
      dropCode: keepA ? b : a,
      reason: `واحد بیشتر (${Math.max(input.unitsA, input.unitsB)} در برابر ${Math.min(input.unitsA, input.unitsB)})`,
    };
  }
  const [na, nb] = [Number(a), Number(b)];
  const keepA = Number.isFinite(na) && Number.isFinite(nb) ? na < nb : a < b;
  return {
    keepCode: keepA ? a : b,
    dropCode: keepA ? b : a,
    reason: 'قطعیِ نهایی: کد کوچک‌تر',
  };
}
