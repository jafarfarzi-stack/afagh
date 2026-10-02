#!/usr/bin/env node
/**
 * مهاجرت داده‌های legacy tuition_formulas و tuition_fee_rules به tuition_rules یکپارچه
 * Run with: npm run db:migrate:legacy-tuition
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq, and } from 'drizzle-orm';
import { 
  tuition_formulas, 
  tuition_fee_rules, 
  tuition_rules,
  degree_level_configs,
  majors,
  financial_terms,
  academic_terms,
} from '@/db/schema';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function migrate() {
  console.log('🔄 Migrating legacy tuition data to unified tuition_rules...');

  const unis = await db.execute(sql`SELECT id FROM universities WHERE "isActive" = 1`);
  
  for (const uni of unis.rows) {
    const uniId = uni.id;
    console.log(`  University ${uniId}...`);

    // Get degree levels map
    const degLevels = await db.select({ id: degree_level_configs.id, title: degree_level_configs.title }).from(degree_level_configs);
    const degMap = new Map(degLevels.map(d => [d.id, d.title]));

    // Get majors map
    const maj = await db.select({ id: majors.id, name: majors.name }).from(majors);
    const majMap = new Map(maj.map(m => [m.id, m.name]));

    // Get financial terms map
    const finTerms = await db.select({ id: financial_terms.id, termCode: financial_terms.termCode }).from(financial_terms).where(eq(financial_terms.universityId, uniId));
    const finTermMap = new Map(finTerms.map(t => [t.termCode, t.id]));

    // Get academic terms map
    const acTerms = await db.select({ id: academic_terms.id, termCode: academic_terms.termCode }).from(academic_terms).where(eq(academic_terms.universityId, uniId));
    const acTermMap = new Map(acTerms.map(t => [t.termCode, t.id]));

    // ========== 1. Migrate tuition_formulas ==========
    const formulas = await db.select().from(tuition_formulas).where(eq(tuition_formulas.universityId, uniId));
    console.log(`    tuition_formulas: ${formulas.length} rows`);

    for (const f of formulas) {
      // Map entryYearFrom/To to financial term IDs
      let entryTermId = null;
      let currentTermId = null;
      if (f.entryYearFrom) {
        const termCode = String(f.entryYearFrom) + '1'; // approximate
        entryTermId = finTermMap.get(termCode) ?? null;
      }
      // currentTermId = latest financial term
      if (finTerms.length > 0) currentTermId = finTerms[finTerms.length - 1].id;

      const code = f.code || `FORMULA-${f.id}`;
      const title = f.title || `فرمول ${degMap.get(f.degreeLevelId) ?? ''} ${majMap.get(f.majorId) ?? ''}`;

      await db.insert(tuition_rules).values({
        code,
        title,
        degreeLevelId: f.degreeLevelId,
        majorId: f.majorId,
        termType: 'NORMAL',
        offeringType: 'NORMAL',
        entryYearFrom: f.entryYearFrom,
        entryYearTo: f.entryYearTo,
        entryTermId,
        currentTermId,
        fixedAmount: f.fixedAmount,
        perUnitTheory: f.perUnitTheory,
        perUnitPractical: f.perUnitPractical,
        perUnitGeneral: f.perUnitGeneral,
        priority: f.priority,
        isActive: f.isActive,
        universityId: uniId,
      }).onConflictDoNothing();
    }

    // ========== 2. Migrate tuition_fee_rules ==========
    const feeRules = await db.select().from(tuition_fee_rules).where(eq(tuition_fee_rules.universityId, uniId));
    console.log(`    tuition_fee_rules: ${feeRules.length} rows`);

    for (const r of feeRules) {
      let entryTermId = null;
      let currentTermId = null;
      if (r.effectiveFromYear) {
        const termCode = String(r.effectiveFromYear) + '1';
        entryTermId = finTermMap.get(termCode) ?? null;
      }
      if (finTerms.length > 0) currentTermId = finTerms[finTerms.length - 1].id;

      // tuition_fee_rules has fixedTuition + perUnitTuition (no theory/practical split)
      // We'll put perUnitTuition in all three perUnit fields as approximation
      await db.insert(tuition_rules).values({
        code: `FEE-${r.id}`,
        title: `قانون شهریه ${r.id} (legacy)`,
        degreeLevelId: r.degreeLevelId,
        majorId: null,
        termType: r.termType,
        offeringType: r.offeringType,
        entryYearFrom: r.effectiveFromYear,
        entryYearTo: null,
        entryTermId,
        currentTermId,
        fixedAmount: r.fixedTuition,
        perUnitTheory: r.perUnitTuition,
        perUnitPractical: r.perUnitTuition,
        perUnitGeneral: r.perUnitTuition,
        priority: 100,
        isActive: r.isActive,
        universityId: uniId,
      }).onConflictDoNothing();
    }
  }

  console.log('✅ Legacy tuition migration complete');
  await pool.end();
}

migrate().catch((e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});