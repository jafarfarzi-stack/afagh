// ═══ تطبیق عکس افراد با صاحبانشان (منطق خالص، بدون DB و بدون Object Storage) ═══
//
// سیستم قدیمی عکس‌ها را در یک پوشه نگه می‌دارد و در جدول اشخاص فقط «نام فایل
// عکس» را دارد. گاهی هم نام فایل خودِ کد شخص است (1024.jpg) یا کد ملی. این
// ماژول همهٔ این حالت‌ها را می‌سنجد تا کاربر مجبور نباشد هزاران عکس را دستی
// وصل کند — و مهم‌تر: تضمین می‌کند یک عکس به شخص اشتباه نچسبد.

import { norm } from './normalize';

/** پسوندهای تصویری پذیرفته‌شده (svg عمداً نیست: می‌تواند اسکریپت اجرا کند) */
export const PHOTO_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
};

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** یک نفر از دید تطبیق عکس — همان چیزی که از دیتابیس می‌خوانیم */
export type PhotoPerson = {
  userId: number;
  fullName: string;
  nationalCode: string | null;
  /** نام فایل عکس که هنگام انتقالِ اشخاص از اکسل خوانده شده */
  photoFileName: string | null;
  /** کدهای این شخص: شماره دانشجویی، کد استادی، شماره پرسنلی… */
  codes: string[];
  hasPhoto: boolean;
};

export type PhotoEntry = { path: string; size: number };

export type PhotoMatch = {
  path: string;
  userId: number;
  /** چرا این عکس به این شخص وصل شد — برای گزارش شفاف به کاربر */
  by: 'photoFileName' | 'nationalCode' | 'code';
  replaces: boolean;   // شخص از قبل عکس داشت
};

export type PhotoPlan = {
  matches: PhotoMatch[];
  /** فایل‌هایی که صاحبشان پیدا نشد */
  orphans: { path: string; reason: string }[];
  /** فایل‌های نادیده‌گرفته‌شده (پوشه، فرمت غیرمجاز، حجم زیاد، تکراری) */
  skipped: { path: string; reason: string }[];
  /** افرادی که در فایل ZIP عکسی برایشان نبود */
  missing: { userId: number; fullName: string; expected: string | null }[];
};

/** «IMG_0012.JPG» → «img_0012» (بدون پسوند، بدون مسیر، بدون صفر ابتدایی اضافه) */
export function photoKeyOf(path: string): string {
  const base = path.split('/').pop() ?? path;
  const dot = base.lastIndexOf('.');
  return norm(dot > 0 ? base.slice(0, dot) : base).toLowerCase();
}

export function extOf(path: string): string {
  const base = path.split('/').pop() ?? path;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/** ورودی‌های بی‌ربطِ آرشیو (متادیتای مک، پوشه‌ها، فایل‌های مخفی) */
export function isJunkEntry(path: string): boolean {
  const base = path.split('/').pop() ?? '';
  return path.endsWith('/') || path.startsWith('__MACOSX/') || base.startsWith('.') || base === '';
}

/**
 * نقشهٔ «عکس → صاحبش» را می‌سازد.
 *
 * ترتیب اولویت عمدی است: نام فایلِ اعلام‌شده در اکسل معتبرترین سند است، بعد
 * کد ملی (یکتای کشوری)، و در آخر کدهای داخلی. اگر یک نام فایل به دو نفر
 * بخورد، هیچ‌کدام انتخاب نمی‌شوند — چسباندن عکس به شخص اشتباه از نچسباندن
 * بدتر است.
 */
export function planPhotoImport(entries: PhotoEntry[], people: PhotoPerson[]): PhotoPlan {
  const byFileName = new Map<string, number[]>();
  const byNationalCode = new Map<string, number[]>();
  const byCode = new Map<string, number[]>();
  const push = (m: Map<string, number[]>, k: string, id: number) => {
    if (!k) return;
    const cur = m.get(k);
    if (cur) { if (!cur.includes(id)) cur.push(id); } else m.set(k, [id]);
  };

  for (const p of people) {
    if (p.photoFileName) push(byFileName, photoKeyOf(p.photoFileName), p.userId);
    if (p.nationalCode) push(byNationalCode, norm(p.nationalCode).toLowerCase(), p.userId);
    for (const c of p.codes) push(byCode, norm(c).toLowerCase(), p.userId);
  }

  const info = new Map(people.map(p => [p.userId, p]));
  const plan: PhotoPlan = { matches: [], orphans: [], skipped: [], missing: [] };
  const taken = new Map<number, string>();   // userId → مسیر عکسی که قبلاً برایش انتخاب شد

  for (const e of entries) {
    if (isJunkEntry(e.path)) { plan.skipped.push({ path: e.path, reason: 'ورودی غیرفایل یا متادیتای آرشیو' }); continue; }
    const ext = extOf(e.path);
    if (!PHOTO_EXT[ext]) { plan.skipped.push({ path: e.path, reason: `پسوند «${ext || 'بدون پسوند'}» تصویر مجاز نیست` }); continue; }
    if (e.size <= 0) { plan.skipped.push({ path: e.path, reason: 'فایل خالی است' }); continue; }
    if (e.size > MAX_PHOTO_BYTES) { plan.skipped.push({ path: e.path, reason: `حجم ${(e.size / 1048576).toFixed(1)} مگابایت بیش از حد مجاز (۵ مگابایت)` }); continue; }

    const k = photoKeyOf(e.path);
    let hit: { ids: number[]; by: PhotoMatch['by'] } | null = null;
    if (byFileName.has(k)) hit = { ids: byFileName.get(k)!, by: 'photoFileName' };
    else if (byNationalCode.has(k)) hit = { ids: byNationalCode.get(k)!, by: 'nationalCode' };
    else if (byCode.has(k)) hit = { ids: byCode.get(k)!, by: 'code' };

    if (!hit) { plan.orphans.push({ path: e.path, reason: 'هیچ شخصی با این نام فایل، کد ملی یا کد پیدا نشد' }); continue; }
    if (hit.ids.length > 1) {
      plan.orphans.push({ path: e.path, reason: `به ${hit.ids.length} نفر می‌خورد — مبهم است و وصل نشد` });
      continue;
    }
    const userId = hit.ids[0];
    const prev = taken.get(userId);
    if (prev) {
      plan.skipped.push({ path: e.path, reason: `برای همین شخص قبلاً «${prev}» انتخاب شده بود` });
      continue;
    }
    taken.set(userId, e.path);
    plan.matches.push({ path: e.path, userId, by: hit.by, replaces: info.get(userId)?.hasPhoto ?? false });
  }

  for (const p of people) {
    if (!taken.has(p.userId) && !p.hasPhoto) {
      plan.missing.push({ userId: p.userId, fullName: p.fullName, expected: p.photoFileName });
    }
  }
  return plan;
}
