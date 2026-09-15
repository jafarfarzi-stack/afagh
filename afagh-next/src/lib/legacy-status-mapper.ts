import { db } from '@/db';
import { legacyStatusMappings } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export interface ResolvedGradeStatus {
  targetStatusCode: string;
  targetTitle: string;
  symbol: string;
  isPassed: boolean;
  isEffectiveInGpa: boolean;
  isEffectiveInTermGpa: boolean;
  countsTowardsTenure: boolean;
  requiresCommissionApproval: boolean;
  isUnknownCode?: boolean;
}

export class LegacyStatusMapper {
  private static cache: Map<string, Map<string, ResolvedGradeStatus>> = new Map();

  /**
   * بارگذاری کامل نگاشت‌ها از دیتابیس به حافظه (برای استفاده در عملیات مهاجرت)
   */
  public static async loadMappings(systemSource: string = 'SAMA'): Promise<void> {
    const records = await db
      .select()
      .from(legacyStatusMappings)
      .where(
        and(
          eq(legacyStatusMappings.systemSource, systemSource),
          eq(legacyStatusMappings.isActive, true)
        )
      );

    const systemMap = new Map<string, ResolvedGradeStatus>();
    for (const r of records) {
      systemMap.set(String(r.sourceCode).trim().toLowerCase(), {
        targetStatusCode: r.targetStatusCode,
        targetTitle: r.targetTitle,
        symbol: r.symbol,
        isPassed: r.isPassed,
        isEffectiveInGpa: r.isEffectiveInGpa,
        isEffectiveInTermGpa: r.isEffectiveInTermGpa,
        countsTowardsTenure: r.countsTowardsTenure,
        requiresCommissionApproval: r.requiresCommissionApproval,
      });
    }
    this.cache.set(systemSource, systemMap);
  }

  /**
   * نگاشت کد خام سما به وضعیت آفاق
   */
  public static resolveStatus(params: {
    systemSource?: string;
    rawCode: string | number | null | undefined;
    rawTitle?: string | null;
    rawScore?: string | number | null;
  }): ResolvedGradeStatus {
    const sys = params.systemSource || 'SAMA';
    const cleanCode = String(params.rawCode ?? '').trim().toLowerCase();
    const systemMap = this.cache.get(sys);

    // ۱. نگاشت مستقیم از جدول
    if (systemMap && systemMap.has(cleanCode)) {
      return systemMap.get(cleanCode)!;
    }

    // ۲. نگاشت بر اساس کلمات کلیدی عنوان
    const title = String(params.rawTitle || '').trim();
    if (title.includes('تک‌درس') || title.includes('معادل')) {
      return {
        targetStatusCode: 'EQUIV',
        targetTitle: 'وضعیت معادل',
        symbol: 'معادل',
        isPassed: true,
        isEffectiveInGpa: false,
        isEffectiveInTermGpa: false,
        countsTowardsTenure: false,
        requiresCommissionApproval: true,
      };
    }

    if (title.includes('حذف آموزشی') || cleanCode === 'آ.ح' || cleanCode === 'ح') {
      return {
        targetStatusCode: 'ACADEMIC_DROP',
        targetTitle: 'حذف آموزشی',
        symbol: 'آ.ح',
        isPassed: false,
        isEffectiveInGpa: false,
        isEffectiveInTermGpa: false,
        countsTowardsTenure: false,
        requiresCommissionApproval: true,
      };
    }

    // ۳. وضعیت ناشناخته (Fallback)
    return {
      targetStatusCode: 'RAW_UNKNOWN',
      targetTitle: title || `وضعیت ناشناخته (${cleanCode})`,
      symbol: cleanCode || '?',
      isPassed: false,
      isEffectiveInGpa: false,
      isEffectiveInTermGpa: false,
      countsTowardsTenure: true,
      requiresCommissionApproval: false,
      isUnknownCode: true,
    };
  }
}
