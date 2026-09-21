import { db } from '@/db';
import { geo_provinces, geo_cities, geo_districts, geo_countries } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * ماژول مدیریت و تبدیل کدینگ‌های جغرافیایی (کشور، استان، شهر، بخش)
 */

export interface GeoLocationResolved {
  provinceTitle: string | null;
  cityTitle: string | null;
  districtTitle: string | null;
  countryTitle: string | null;
}

/** نرمال‌سازی حروف فارسی (ی و ک) */
export function normalizePersian(str?: string | null): string {
  if (!str) return '';
  return str
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * دریافت لیست تمام استان‌ها
 */
export async function getGeoProvinces() {
  return await db.select().from(geo_provinces).orderBy(geo_provinces.title);
}

/**
 * دریافت لیست شهرهای یک استان (یا همه)
 */
export async function getGeoCities(provinceCode?: string) {
  if (provinceCode) {
    return await db
      .select()
      .from(geo_cities)
      .where(eq(geo_cities.provinceCode, provinceCode))
      .orderBy(geo_cities.title);
  }
  return await db.select().from(geo_cities).orderBy(geo_cities.title);
}

/**
 * دریافت لیست بخش‌ها
 */
export async function getGeoDistricts(provinceCode?: string, cityCode?: string) {
  if (provinceCode && cityCode) {
    return await db
      .select()
      .from(geo_districts)
      .where(and(eq(geo_districts.provinceCode, provinceCode), eq(geo_districts.cityCode, cityCode)))
      .orderBy(geo_districts.title);
  }
  return await db.select().from(geo_districts).orderBy(geo_districts.title);
}

/**
 * حل عنوان شهر و استان بر اساس کدها
 */
export async function resolveGeoLocation(params: {
  provinceCode?: string | null;
  cityCode?: string | null;
  districtCode?: string | null;
  countryCode?: string | null;
}): Promise<GeoLocationResolved> {
  const result: GeoLocationResolved = {
    provinceTitle: null,
    cityTitle: null,
    districtTitle: null,
    countryTitle: null,
  };

  const pCode = params.provinceCode?.trim();
  const cCode = params.cityCode?.trim();
  const dCode = params.districtCode?.trim();
  const cntryCode = params.countryCode?.trim();

  if (pCode) {
    const [p] = await db.select().from(geo_provinces).where(eq(geo_provinces.code, pCode)).limit(1);
    if (p) result.provinceTitle = p.title;
  }

  if (cCode) {
    if (pCode) {
      const [c] = await db
        .select()
        .from(geo_cities)
        .where(and(eq(geo_cities.provinceCode, pCode), eq(geo_cities.code, cCode)))
        .limit(1);
      if (c) result.cityTitle = c.title;
    } else {
      const [c] = await db.select().from(geo_cities).where(eq(geo_cities.code, cCode)).limit(1);
      if (c) result.cityTitle = c.title;
    }
  }

  if (dCode && pCode && cCode) {
    const [d] = await db
      .select()
      .from(geo_districts)
      .where(and(eq(geo_districts.provinceCode, pCode), eq(geo_districts.cityCode, cCode), eq(geo_districts.code, dCode)))
      .limit(1);
    if (d) result.districtTitle = d.title;
  }

  if (cntryCode) {
    const [cntry] = await db.select().from(geo_countries).where(eq(geo_countries.code, cntryCode)).limit(1);
    if (cntry) result.countryTitle = cntry.title;
  }

  return result;
}
