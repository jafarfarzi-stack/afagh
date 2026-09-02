import { asc } from 'drizzle-orm';
import { db } from '@/db';
import { degree_level_configs, tuition_fee_rules } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getSetting } from '@/lib/settings';
import { normalizeEquivFixedMode } from '@/lib/tuition-rules';
import TuitionRulesClient from './TuitionRulesClient';

export const dynamic = 'force-dynamic';

export default async function TuitionRulesPage() {
  await requireRole(['ADMIN', 'FINANCE_EXPERT', 'FINANCE']);

  const [rules, degrees, equivModeRaw] = await Promise.all([
    db.select().from(tuition_fee_rules).orderBy(asc(tuition_fee_rules.id)),
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
        fixedTuition: Number(r.fixedTuition),
        perUnitTuition: Number(r.perUnitTuition),
        effectiveFromYear: r.effectiveFromYear,
        isActive: r.isActive === 1,
        note: r.note,
      }))}
      degrees={degrees.map(d => ({ id: d.id, title: d.title }))}
      equivFixedMode={normalizeEquivFixedMode(equivModeRaw)}
    />
  );
}
