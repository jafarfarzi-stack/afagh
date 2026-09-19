import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { degree_level_configs, tuition_rules } from '@/db/schema';
import { getCurrentUniversity } from '@/lib/university-scope';
import { requireRole } from '@/lib/auth';
import { getSetting } from '@/lib/settings';
import { normalizeEquivFixedMode } from '@/lib/tuition-rules';
import TuitionRulesClient from './TuitionRulesClient';

export const dynamic = 'force-dynamic';

export default async function TuitionRulesPage() {
  await requireRole(['ADMIN', 'FINANCE_EXPERT', 'FINANCE']);

  const uni = await getCurrentUniversity().catch(() => null);
  const [rules, degrees, equivModeRaw] = await Promise.all([
    db.select().from(tuition_rules).where(uni ? eq(tuition_rules.universityId, uni.id) : undefined).orderBy(asc(tuition_rules.id)),
    db.select().from(degree_level_configs).orderBy(asc(degree_level_configs.id)),
    getSetting('EQUIV_FIXED_TUITION_MODE'),
  ]);

  return (
    <TuitionRulesClient
      rules={rules.map(r => ({
        id: r.id,
        degreeLevelId: r.degreeLevelId,
        termType: r.termType,
        offeringType: r.offeringType,
        fixedTuition: Number(r.fixedAmount),
        perUnitTuition: Number(r.perUnitTheory),
        effectiveFromYear: r.entryYearFrom,
        isActive: r.isActive === 1,
        note: r.note,
      }))}
      degrees={degrees.map(d => ({ id: d.id, title: d.title }))}
      equivFixedMode={normalizeEquivFixedMode(equivModeRaw)}
    />
  );
}
