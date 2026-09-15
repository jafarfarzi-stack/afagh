// ============================================================================
// Afagh ERP - Educational Regulation Engine (موتور اجرای آیین‌نامه‌های آموزشی)
// پشتیبانی از آیین‌نامه‌های سال‌محور (۱۳۹۰، ۱۳۹۳، ۱۴۰۲) و حذف پویای نمرات مردود
// ============================================================================

import { db } from '@/db';
import { educational_regulations, degree_level_configs } from '@/db/schema';
import { eq, and, lte, gte, or, isNull, desc } from 'drizzle-orm';

export type DegreeLevel = 'ASSOCIATE' | 'BACHELOR' | 'MASTER' | 'DOCTORAL';
export type FailedCourseGpaPolicy = 'KEEP_ALWAYS' | 'EXCLUDE_IF_PASSED';

export interface RegulationRuleConfig {
  passingGradeThreshold: number;
  probationGpaThreshold: number;
  maxAllowedProbations: number;
  maxConsecutiveProbations?: number;
  maxStudySemesters: number;
  failedCourseGpaPolicy: FailedCourseGpaPolicy;
  remedialAffectsGpa: boolean;
  maxDirectStudyUnits: number;
  maxTermUnitsNormal: number;
  maxTermUnitsProbation: number;
  maxTermUnitsHonors: number;
  maxGraduationTermUnits: number;
}

export interface CourseAttemptRecord {
  courseCode: string;
  courseTitle: string;
  termCode: string;
  termIndex: number;
  units: number;
  score: number | null;
  status: 'passed' | 'failed' | 'dropped' | 'exempt' | 'in_progress';
  isRemedial?: boolean;
}

export interface EvaluatedCourseResult extends CourseAttemptRecord {
  isEffectiveInGpa: boolean;
  exclusionReason?: string;
}

export interface ResolvedStudentRegulationResult {
  regulationId: string | number;
  regulationTitle: string;
  config: RegulationRuleConfig;
  isOverridden: boolean;
  commissionNumber?: string | null;
  overrideReason?: string | null;
}

export class RegulationEngine {
  /**
   * آیین‌نامهٔ پیش‌فرض بر اساس مقطع و سال ورود
   */
  public static getDefaultRegulationConfig(degreeLevel: DegreeLevel, entryYear: number): RegulationRuleConfig {
    const isMaster = degreeLevel === 'MASTER';
    const isDoctoral = degreeLevel === 'DOCTORAL';

    if (isMaster) {
      return {
        passingGradeThreshold: 12.0,
        probationGpaThreshold: 14.0,
        maxAllowedProbations: 2,
        maxConsecutiveProbations: 2,
        maxStudySemesters: entryYear >= 1394 ? 4 : 5,
        failedCourseGpaPolicy: entryYear >= 1394 ? 'EXCLUDE_IF_PASSED' : 'KEEP_ALWAYS',
        remedialAffectsGpa: false,
        maxDirectStudyUnits: 4,
        maxTermUnitsNormal: 14,
        maxTermUnitsProbation: 8,
        maxTermUnitsHonors: 14,
        maxGraduationTermUnits: 14,
      };
    }

    if (isDoctoral) {
      return {
        passingGradeThreshold: 14.0,
        probationGpaThreshold: 16.0,
        maxAllowedProbations: 1,
        maxConsecutiveProbations: 1,
        maxStudySemesters: 8,
        failedCourseGpaPolicy: 'KEEP_ALWAYS',
        remedialAffectsGpa: false,
        maxDirectStudyUnits: 0,
        maxTermUnitsNormal: 10,
        maxTermUnitsProbation: 6,
        maxTermUnitsHonors: 10,
        maxGraduationTermUnits: 10,
      };
    }

    // کارشناسی / کاردانی
    if (entryYear >= 1402) {
      return {
        passingGradeThreshold: 10.0,
        probationGpaThreshold: 12.0,
        maxAllowedProbations: 3,
        maxConsecutiveProbations: 3,
        maxStudySemesters: 8,
        failedCourseGpaPolicy: 'EXCLUDE_IF_PASSED',
        remedialAffectsGpa: false,
        maxDirectStudyUnits: 6,
        maxTermUnitsNormal: 20,
        maxTermUnitsProbation: 14,
        maxTermUnitsHonors: 24,
        maxGraduationTermUnits: 24,
      };
    } else if (entryYear >= 1393) {
      return {
        passingGradeThreshold: 10.0,
        probationGpaThreshold: 12.0,
        maxAllowedProbations: 4,
        maxConsecutiveProbations: 3,
        maxStudySemesters: 8,
        failedCourseGpaPolicy: 'EXCLUDE_IF_PASSED',
        remedialAffectsGpa: false,
        maxDirectStudyUnits: 6,
        maxTermUnitsNormal: 20,
        maxTermUnitsProbation: 14,
        maxTermUnitsHonors: 24,
        maxGraduationTermUnits: 24,
      };
    } else {
      // قدیمی (قبل از ۱۳۹۳)
      return {
        passingGradeThreshold: 10.0,
        probationGpaThreshold: 12.0,
        maxAllowedProbations: 4,
        maxConsecutiveProbations: 3,
        maxStudySemesters: 10,
        failedCourseGpaPolicy: 'KEEP_ALWAYS',
        remedialAffectsGpa: false,
        maxDirectStudyUnits: 4,
        maxTermUnitsNormal: 20,
        maxTermUnitsProbation: 14,
        maxTermUnitsHonors: 24,
        maxGraduationTermUnits: 24,
      };
    }
  }

  /**
   * اجرای آیین‌نامه روی تاریخچهٔ دروس دانشجو — محاسبهٔ معدل و حذف پویای دروس مردود
   */
  public static evaluateTranscriptCourses(
    allAttempts: CourseAttemptRecord[],
    config: RegulationRuleConfig
  ): {
    evaluatedCourses: EvaluatedCourseResult[];
    cumulativeGpa: number;
    totalPassedUnits: number;
    effectiveGpaUnits: number;
  } {
    const sorted = [...allAttempts].sort((a, b) => a.termIndex - b.termIndex);

    // ساخت مجموعهٔ دروس قبول‌شدهٔ قبلی
    const passedCourseCodes = new Set<string>();
    for (const att of sorted) {
      if (att.status === 'passed' && att.score !== null && att.score >= config.passingGradeThreshold) {
        passedCourseCodes.add(att.courseCode);
      }
    }

    let totalWeightedScore = 0;
    let effectiveGpaUnits = 0;
    let totalPassedUnits = 0;
    const evaluatedCourses: EvaluatedCourseResult[] = [];

    for (const att of sorted) {
      let isEffective = true;
      let exclusionReason: string | undefined;

      if (att.status === 'dropped' || att.status === 'exempt' || att.score === null) {
        isEffective = false;
        exclusionReason = 'غیرمؤثر / حذف';
      } else if (att.isRemedial && !config.remedialAffectsGpa) {
        isEffective = false;
        exclusionReason = 'تک‌درس جبرانی واحد در معدل';
      } else if (
        att.status === 'failed' &&
        config.failedCourseGpaPolicy === 'EXCLUDE_IF_PASSED' &&
        passedCourseCodes.has(att.courseCode)
      ) {
        isEffective = false;
        exclusionReason = 'آیین‌نامه حذف نمرهٔ مردود بعد از قبول مجدد';
      }

      if (isEffective && att.score !== null) {
        totalWeightedScore += att.score * att.units;
        effectiveGpaUnits += att.units;
      }
      if (att.status === 'passed' && att.score !== null && att.score >= config.passingGradeThreshold) {
        totalPassedUnits += att.units;
      }

      evaluatedCourses.push({
        ...att,
        isEffectiveInGpa: isEffective,
        exclusionReason,
      });
    }

    const cumulativeGpa = effectiveGpaUnits > 0 ? Number((totalWeightedScore / effectiveGpaUnits).toFixed(2)) : 0;

    return {
      evaluatedCourses,
      cumulativeGpa,
      totalPassedUnits,
      effectiveGpaUnits,
    };
  }

  /**
   * ارزیابی وضعیت تحصیلی — شناسایی مشروطی، اخراج، سنوات
   */
  public static evaluateAcademicStanding(params: {
    entryYear: number;
    currentTermIndex: number;
    termGpas: number[];
    config: RegulationRuleConfig;
  }): {
    academicStatus: 'مشمول اخراج (ارسال به کمیسیون)' | 'محروم' | 'مشروط' | 'عادی';
    probationCount: number;
    consecutiveProbations: number;
    remainingSemesters: number;
    isTenureExceeded: boolean;
    alerts: string[];
  } {
    const { termGpas, config, currentTermIndex } = params;
    const alerts: string[] = [];
    let probationCount = 0;
    let consecutiveProbations = 0;
    let maxConsecutive = 0;

    for (const gpa of termGpas) {
      if (gpa < config.probationGpaThreshold) {
        probationCount++;
        consecutiveProbations++;
        if (consecutiveProbations > maxConsecutive) {
          maxConsecutive = consecutiveProbations;
        }
      } else {
        consecutiveProbations = 0;
      }
    }

    const remainingSemesters = Math.max(0, config.maxStudySemesters - currentTermIndex);
    const isTenureExceeded = currentTermIndex > config.maxStudySemesters;

    if (isTenureExceeded) {
      alerts.push(`سقف سنوات (${config.maxStudySemesters} نیمسال) تمام شده. ثبت‌نام مشمول اخراج نیست.`);
    }

    const maxConsecutiveLimit = config.maxConsecutiveProbations || 3;
    const isExpulsionRisk =
      probationCount >= config.maxAllowedProbations || maxConsecutive >= maxConsecutiveLimit;

    if (isExpulsionRisk) {
      alerts.push(
        `تعداد مشروطی (${probationCount} بار / ${maxConsecutive} متوالی) شما را در معرض اخراج قرار می‌دهد.`
      );
    }

    const lastGpa = termGpas[termGpas.length - 1] || 0;
    let academicStatus: 'عادی' | 'مشروط' | 'محروم' | 'مشمول اخراج (ارسال به کمیسیون)' = 'عادی';

    if (isExpulsionRisk) {
      academicStatus = 'مشمول اخراج (ارسال به کمیسیون)';
    } else if (lastGpa < config.probationGpaThreshold) {
      academicStatus = 'مشروط';
    } else if (lastGpa >= 17.0) {
      academicStatus = 'محروم';
    }

    return {
      academicStatus,
      probationCount,
      consecutiveProbations: maxConsecutive,
      remainingSemesters,
      isTenureExceeded,
      alerts,
    };
  }

  /**
   * شناسایی و دریافت آیین‌نامهٔ مخصوص یک دانشجو (با پشتیبانی از انتخاب دستی کمیسیون)
   */
  public static async resolveStudentRegulation(params: {
    studentId: string;
    degreeLevel: DegreeLevel;
    entryYear: number;
    overrideRegulationId?: string | number | null;
    commissionNumber?: string | null;
    overrideReason?: string | null;
  }): Promise<ResolvedStudentRegulationResult> {
    const { degreeLevel, entryYear, overrideRegulationId, commissionNumber, overrideReason } = params;

    // ۱. آیا آیین‌نامهٔ خاص (انتخاب دستی کمیسیون) ثبت شده؟
    if (overrideRegulationId) {
      try {
        const customRecords = await db
          .select()
          .from(educational_regulations)
          .where(eq(educational_regulations.id, overrideRegulationId as number))
          .limit(1);
        if (customRecords.length > 0) {
          const customReg = customRecords[0];
          return {
            regulationId: customReg.id,
            regulationTitle: customReg.title,
            config: JSON.parse(customReg.rulesConfig) as RegulationRuleConfig,
            isOverridden: true,
            commissionNumber,
            overrideReason,
          };
        }
      } catch (error) {
        console.error('Error fetching custom override regulation from DB:', error);
      }
    }

    // ۲. آیین‌نامهٔ استاندارد بر اساس سال ورود و مقطع
    try {
      // resolve degreeLevel code from degree_level_configs
      const levelRecord = await db
        .select()
        .from(degree_level_configs)
        .where(eq(degree_level_configs.code, degreeLevel))
        .limit(1);

      if (levelRecord.length > 0) {
        const records = await db
          .select()
          .from(educational_regulations)
          .where(
            and(
              eq(educational_regulations.degreeLevelId, levelRecord[0].id),
              lte(educational_regulations.effectiveFromYear, entryYear),
              or(
                isNull(educational_regulations.effectiveToYear),
                gte(educational_regulations.effectiveToYear, entryYear)
              )
            )
          )
          .orderBy(desc(educational_regulations.effectiveFromYear))
          .limit(1);

        if (records.length > 0 && records[0].rulesConfig) {
          return {
            regulationId: records[0].id,
            regulationTitle: records[0].title,
            config: JSON.parse(records[0].rulesConfig) as RegulationRuleConfig,
            isOverridden: false,
          };
        }
      }
    } catch (error) {
      console.error('Error fetching standard regulation by entry year:', error);
    }

    // ۳. فallback به آیین‌نامهٔ پیش‌فرض
    return {
      regulationId: 'default-fallback',
      regulationTitle: `آیین‌نامهٔ پیش‌فرض ${degreeLevel}`,
      config: RegulationEngine.getDefaultRegulationConfig(degreeLevel, entryYear),
      isOverridden: false,
    };
  }
}
