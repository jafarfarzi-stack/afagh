import { db } from '@/db';
import { degree_level_configs, educational_regulations } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import RegulationsClient, { DegreeLevelItem, RegulationItem } from './RegulationsClient';
import {
  DEFAULT_BACHELOR_REGULATION_1403,
  DEFAULT_BACHELOR_REGULATION_1390,
  DEFAULT_MASTER_REGULATION_1403,
} from '@/lib/regulations-engine';

export const dynamic = 'force-dynamic';

export default async function AdminRegulationsPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT']);

  let degreeLevelsList: DegreeLevelItem[] = [];
  try {
    const rawDegreeLevels = await db.select().from(degree_level_configs);
    degreeLevelsList = rawDegreeLevels.map(d => ({
      id: d.id,
      levelName: d.code,
      title: d.title || d.code,
      defaultPassingGrade: d.defaultPassingGrade,
      conditionalGpaThreshold: d.conditionalGpaThreshold,
      maxUnitsPerTerm: d.maxUnitsPerTerm,
    }));
  } catch (err) {
    console.error('Failed to fetch degree level configs:', err);
  }

  let regulationsList: RegulationItem[] = [];
  try {
    const rawRegulations = await db
      .select({
        id: educational_regulations.id,
        title: educational_regulations.title,
        degreeLevelId: educational_regulations.degreeLevelId,
        degreeLevelTitle: degree_level_configs.title,
        effectiveFromYear: educational_regulations.effectiveFromYear,
        effectiveToYear: educational_regulations.effectiveToYear,
        rulesConfig: educational_regulations.rulesConfig,
        createdAt: educational_regulations.createdAt,
      })
      .from(educational_regulations)
      .leftJoin(degree_level_configs, eq(degree_level_configs.id, educational_regulations.degreeLevelId));

    if (rawRegulations && rawRegulations.length > 0) {
      regulationsList = rawRegulations.map(r => {
        let parsedConfig = DEFAULT_BACHELOR_REGULATION_1403;
        try {
          if (r.rulesConfig) {
            parsedConfig = JSON.parse(r.rulesConfig);
          }
        } catch {
          // fallback
        }
        return {
          id: r.id,
          title: r.title,
          degreeLevelId: r.degreeLevelId,
          degreeLevelTitle: r.degreeLevelTitle || 'کارشناسی پیوسته',
          effectiveFromYear: r.effectiveFromYear,
          effectiveToYear: r.effectiveToYear,
          rulesConfig: parsedConfig,
          createdAt: r.createdAt,
        };
      });
    }
  } catch (err) {
    console.error('Failed to fetch educational regulations:', err);
  }

  // If no regulations in DB, seed default ones so user has out-of-the-box working records
  if (regulationsList.length === 0 && degreeLevelsList.length > 0) {
    const bachelorDeg = degreeLevelsList[0]?.id || 1;
    regulationsList = [
      {
        id: 1,
        title: 'آیین‌نامه یکپارچه آموزشی کارشناسی (مصوب ۱۳۹۷ به بعد)',
        degreeLevelId: bachelorDeg,
        degreeLevelTitle: 'کارشناسی پیوسته',
        effectiveFromYear: 1397,
        effectiveToYear: null,
        rulesConfig: DEFAULT_BACHELOR_REGULATION_1403,
      },
      {
        id: 2,
        title: 'آیین‌نامه آموزشی کارشناسی (مصوب ۱۳۹۰)',
        degreeLevelId: bachelorDeg,
        degreeLevelTitle: 'کارشناسی پیوسته',
        effectiveFromYear: 1390,
        effectiveToYear: 1396,
        rulesConfig: DEFAULT_BACHELOR_REGULATION_1390,
      },
      {
        id: 3,
        title: 'آیین‌نامه جامع دوره کارشناسی ارشد ناپیوسته (مصوب ۱۴۰۳)',
        degreeLevelId: degreeLevelsList[1]?.id || bachelorDeg,
        degreeLevelTitle: 'کارشناسی ارشد',
        effectiveFromYear: 1403,
        effectiveToYear: null,
        rulesConfig: DEFAULT_MASTER_REGULATION_1403,
      },
    ];
  }

  return <RegulationsClient regulations={regulationsList} degreeLevels={degreeLevelsList} />;
}
