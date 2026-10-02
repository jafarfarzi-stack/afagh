#!/usr/bin/env node
/**
 * محاسبه نرخ رشد تجمعی شهریه از tuition_coefficients
 * معادل جداول نرخ رشد در راهنمای سما (Help Mali pages 231-258)
 *
 * منطق:
 * - برای هر دانشگاه، برای هر جفت (entryTerm, currentTerm) که currentTerm >= entryTerm
 * - variableGrowthRate = ضرب تمام variableCoefficient از entryTerm+1 تا currentTerm
 * - fixedGrowthRate = ضرب تمام fixedCoefficient از entryTerm+1 تا currentTerm
 * - اگر entryTerm == currentTerm → هر دو ۱.۰۰۰۰
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function computeGrowthRates() {
  console.log('📊 Computing tuition growth rates...');

  // Get all universities
  const unis = await db.execute(sql`SELECT id FROM universities WHERE "isActive" = 1`);
  
  for (const uni of unis.rows) {
    const uniId = uni.id;
    console.log(`  University ${uniId}...`);

    // Get all financial terms for this university, ordered
    const terms = await db.execute(sql`
      SELECT id, "termCode", "sortOrder"
      FROM financial_terms
      WHERE "universityId" = ${uniId} AND "isActive" = 1
      ORDER BY "sortOrder" ASC NULLS LAST, "termCode" ASC
    `);

    if (terms.rows.length === 0) {
      console.log(`    No financial terms, skipping`);
      continue;
    }

    // Get coefficients for all terms
    const coeffs = await db.execute(sql`
      SELECT "financialTermId", "variable_coefficient", "fixed_coefficient"
      FROM tuition_coefficients
      WHERE "universityId" = ${uniId}
    `);
    const coeffMap = new Map();
    for (const c of coeffs.rows) {
      coeffMap.set(c.financialTermId, {
        variable: parseFloat(c.variable_coefficient || '1'),
        fixed: parseFloat(c.fixed_coefficient || '1'),
      });
    }

    // Compute cumulative growth rates
    const rows = [];
    for (let i = 0; i < terms.rows.length; i++) {
      const entryTerm = terms.rows[i];
      let cumVar = 1.0;
      let cumFix = 1.0;

      // entryTerm -> entryTerm (same term) = 1.0000
      rows.push({
        universityId: uniId,
        entryTermId: entryTerm.id,
        currentTermId: entryTerm.id,
        variableGrowthRate: '1.0000',
        fixedGrowthRate: '1.0000',
      });

      // Subsequent terms
      for (let j = i + 1; j < terms.rows.length; j++) {
        const currentTerm = terms.rows[j];
        const coeff = coeffMap.get(currentTerm.id);
        if (coeff) {
          cumVar *= coeff.variable;
          cumFix *= coeff.fixed;
        }
        rows.push({
          universityId: uniId,
          entryTermId: entryTerm.id,
          currentTermId: currentTerm.id,
          variableGrowthRate: cumVar.toFixed(4),
          fixedGrowthRate: cumFix.toFixed(4),
        });
      }
    }

    // Upsert into tuition_growth_rates
    if (rows.length > 0) {
      await db.transaction(async (tx) => {
        for (const r of rows) {
          await tx.execute(sql`
            INSERT INTO tuition_growth_rates ("universityId", "entryTermId", "currentTermId", "variable_growth_rate", "fixed_growth_rate", "computed_at")
            VALUES (${r.universityId}, ${r.entryTermId}, ${r.currentTermId}, ${r.variableGrowthRate}, ${r.fixedGrowthRate}, NOW())
            ON CONFLICT ("universityId", "entryTermId", "currentTermId")
            DO UPDATE SET "variable_growth_rate" = EXCLUDED."variable_growth_rate",
                          "fixed_growth_rate" = EXCLUDED."fixed_growth_rate",
                          "computed_at" = NOW()
          `);
        }
      });
      console.log(`    ✅ Upserted ${rows.length} growth rate rows`);
    }
  }

  console.log('✅ Growth rates computation complete');
  await pool.end();
}

computeGrowthRates().catch((e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});