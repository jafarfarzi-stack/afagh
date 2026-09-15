import { db } from '@/db';
import { legacyEntityMappings } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export type EntityType =
  | 'DEGREE_LEVEL'
  | 'FACULTY'
  | 'DEPARTMENT'
  | 'MAJOR'
  | 'TERM'
  | 'STUDENT_STATUS'
  | 'GRADE_STATUS'
  | 'QUOTA';

export class UniversalCrosswalkService {
  private static cache: Map<string, Map<string, { targetId: string; targetTitle: string; metadata: any }>> = new Map();

  /**
   * بارگذاری کامل نگاشت‌ها از دیتابیس قبل از شروع عملیات مهاجرت
   */
  public static async initialize(systemSource: string = 'SAMA_AFAGH'): Promise<void> {
    const mappings = await db
      .select()
      .from(legacyEntityMappings)
      .where(
        and(
          eq(legacyEntityMappings.systemSource, systemSource),
          eq(legacyEntityMappings.isActive, true)
        )
      );

    const systemCache = new Map<string, { targetId: string; targetTitle: string; metadata: any }>();
    for (const m of mappings) {
      const key = `${m.entityType}:${String(m.sourceCode).trim().toLowerCase()}`;
      systemCache.set(key, {
        targetId: m.targetIdentifier,
        targetTitle: m.targetTitle,
        metadata: m.metadata,
      });
    }
    this.cache.set(systemSource, systemCache);
  }

  /**
   * تبدیل کد قدیمی به شناسهٔ معتبر در سیستم جدید
   */
  public static translate(params: {
    entityType: EntityType;
    sourceCode: string | number | null | undefined;
    systemSource?: string;
    fallbackDefault?: string;
  }): { targetId: string; targetTitle?: string; metadata?: any } {
    const sys = params.systemSource || 'SAMA_AFAGH';
    const cleanCode = String(params.sourceCode ?? '').trim().toLowerCase();
    const key = `${params.entityType}:${cleanCode}`;
    const systemMap = this.cache.get(sys);

    if (systemMap && systemMap.has(key)) {
      const matched = systemMap.get(key)!;
      return {
        targetId: matched.targetId,
        targetTitle: matched.targetTitle,
        metadata: matched.metadata,
      };
    }

    // اگر نگاشتی پیدا نشد، مقدار پیش‌فرض برگردان
    return {
      targetId: params.fallbackDefault || cleanCode,
      targetTitle: `تبدیل‌نشده (${cleanCode})`,
    };
  }
}
