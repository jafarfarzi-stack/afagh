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
 * سهام «نام» می‌خواهد نه کد؛ کد ۱۲ در geo_provinces = آذربایجان غربی است.
 */
export async function loadGeoTitles(): Promise<{ province: Record<string, string>; city: Record<string, string> }> {
  const prov = (await db.execute<{ code: string; title: string }>(sql`
    SELECT "code", "title" FROM geo_provinces
  `)).rows;
  const city = (await db.execute<{ code: string; title: string }>(sql`
    SELECT "code", "title" FROM geo_cities
  `)).rows;
  const pm: Record<string, string> = {};
  for (const r of prov) pm[r.code] = r.title;
  const cm: Record<string, string> = {};
  for (const r of city) cm[r.code] = r.title;
  return { province: pm, city: cm };
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

/** انتخاب سطر کد سهام برای یک دانشگاه + دانشکده (با fallback) */
export function pickSahamCode(
  byUni: Map<number, SahamInstituteCode[]>,
  universityId: number,
  facultyId: number | null,
): SahamInstituteCode | null {
  const list = byUni.get(universityId);
  if (list?.length) {
    if (facultyId != null) {
      const hit = list.find(r => r.facultyId === facultyId);
      if (hit) return hit;
    }
    const def = list.find(r => r.isDefault === 1);
    if (def) return def;
    return list[0];
  }
  // fallback به آفاق
  const afagh = byUni.get(1) ?? [];
  return afagh.find(r => r.isDefault === 1) ?? afagh[0] ?? null;
}