import 'server-only';
import { db } from '@/db';
import { sql } from 'drizzle-orm';

/**
 * ══════════════════════════════════════════════════════════════════════
 *  ماژول گزارش سالانهٔ «سهام» (IRPHE)
 *  سهمیه‌های سهام از فایل Higher_Education_Institute_Code.xlsx (۱۲ رقمی)
 *  آمده و در جدول `saham_institute_codes` سید شده است.
 * ══════════════════════════════════════════════════════════════════════
 */

export interface SahamMapRow {
  field: string;
  sourceValue: string;
  sahamTitle: string;
}

/** همهٔ نگاشت‌ها به‌صورت «field → (sourceValue → sahamTitle)» */
export async function loadSahamValueMaps(): Promise<Record<string, Record<string, string>>> {
  const rows = (await db.execute<SahamMapRow & Record<string, unknown>>(sql`
    SELECT "field", "sourceValue", "sahamTitle" FROM saham_value_maps WHERE "isActive" = 1
  `)).rows;
  const out: Record<string, Record<string, string>> = {};
  for (const r of rows) {
    (out[r.field] ??= {})[r.sourceValue] = r.sahamTitle;
  }
  return out;
}

/** نگاشت یک مقدار؛ اگر نگاشتی نبود خودِ مقدار برگردانده می‌شود */
export function mapSahamValue(maps: Record<string, Record<string, string>>, field: string, value: unknown): string {
  if (value == null) return '';
  const v = String(value).trim();
  if (!v) return '';
  return maps[field]?.[v] ?? v;
}

/**
 * نام استان/شهر از جدول‌های مرجع geo.
 * سهام «نام» می‌خواهد نه کد؛ شهرها فقط با (استان+کد) یکتا هستند
 * (کد ۱۱ هم در اردبیل هست هم ارومیه!) پس lookup شهر حتماً با استان است.
 */
export interface GeoTitles {
  province: Record<string, string>;
  city: Record<string, string>;
  cityScoped: Record<string, string>;
}

export async function loadGeoTitles(): Promise<GeoTitles> {
  const prov = (await db.execute<{ code: string; title: string } & Record<string, unknown>>(sql`
    SELECT "code", "title" FROM geo_provinces
  `)).rows;
  const city = (await db.execute<{ provinceCode: string; code: string; title: string } & Record<string, unknown>>(sql`
    SELECT "provinceCode", "code", "title" FROM geo_cities
  `)).rows;
  const pm: Record<string, string> = {};
  for (const r of prov) pm[r.code] = r.title;
  const cm: Record<string, string> = {};
  const scoped: Record<string, string> = {};
  for (const r of city) {
    cm[r.code] = r.title;
    scoped[`${r.provinceCode}:${r.code}`] = r.title;
  }
  return { province: pm, city: cm, cityScoped: scoped };
}

/** نام شهر با قید استان (جلوگیری از تداخل کدهای تکراری بین استان‌ها) */
export function cityTitle(geo: GeoTitles, provinceCode: string | null, cityCode: string | null): string {
  if (!provinceCode || !cityCode) return '';
  return geo.cityScoped[`${provinceCode}:${cityCode}`] ?? '';
}

export interface SahamInstituteCode {
  universityId: number;
  facultyId: number | null;
  title: string;
  code: string;
  provinceCode: string | null;
  cityCode: string | null;
  isDefault: number;
}

/**
 * کد واحد/دانشکدهٔ سهام برای هر دانشگاه.
 * دانشگاهی که سطر فعال ندارد → کد پیش‌فرض آفاق (حوزهٔ ستادی) می‌گیرد.
 * (سیاستی که برای مؤسسه‌های منحلِ بدون کد رسمی تصویب شد.)
 */
export async function loadSahamInstituteCodes(): Promise<Map<number, SahamInstituteCode[]>> {
  const rows = (await db.execute<SahamInstituteCode & Record<string, unknown>>(sql`
    SELECT "universityId", "facultyId", "title", "code", "provinceCode", "cityCode", "isDefault"
    FROM saham_institute_codes WHERE "isActive" = 1
  `)).rows;
  const byUni = new Map<number, SahamInstituteCode[]>();
  for (const r of rows) {
    const list = byUni.get(r.universityId) ?? [];
    list.push(r);
    byUni.set(r.universityId, list);
  }
  return byUni;
}

/**
 * انتخاب سطر کد سهام برای یک دانشگاه + دانشکده.
 * فقط تطبیق دقیق دانشکده؛ اگر دانشکده کدی نداشت، خالی برمی‌گردد —
 * حدس «حوزه ستادی» برای دانشجو ممنوع است (دادهٔ غلط بدتر از خالی).
 * تکمیل کدها از صفحهٔ تنظیمات سهام انجام می‌شود.
 */
export function pickSahamCode(
  byUni: Map<number, SahamInstituteCode[]>,
  universityId: number,
  facultyId: number | null,
): SahamInstituteCode | null {
  const list = byUni.get(universityId);
  if (!list?.length || facultyId == null) return null;
  return list.find(r => r.facultyId === facultyId) ?? null;
}