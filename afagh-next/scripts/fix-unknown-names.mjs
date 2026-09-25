#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════════════
 *  حل نام «نامشخص» دانشجویان — یکمرحله‌ای، idempotent، چند-پایگاه‌داده
 *
 *  استفاده:
 *    node scripts/fix-unknown-names.mjs                    # dry-run روی DATABASE_URL
 *    node scripts/fix-unknown-names.mjs --apply             # apply روی یک پایگاه‌داده
 *    node scripts/fix-unknown-names.mjs --dbs "url1,url2" --apply   # یکمرحله‌ای، همهٔ پایگاه‌ها
 *    node scripts/fix-unknown-names.mjs --db url1 --db url2 --apply     # (--db تکراری)
 *    node scripts/fix-unknown-names.mjs --out ./out --apply
 *
 *  ورودی:
 *    --apply      اقدام واقعی (بدونش فقط مرور)
 *    --dbs        لیست کاما-سپارهٔ URLهای پایگاه‌داده
 *    --db         URL پایگاه‌داده (--db تکراریِ قابلاستفاده)
 *    --out        مسیر خروجی TSV (پیش‌فرض: resolutions.tsv در cwd)
 *
 *  خروجی:
 *    - گزارش لكل پایگاه‌داده در ترمینال
 *    - فایل TSV: resolutions.tsv (یک‌پایگاه) یا resolutions-<index>.tsv (چند-پایگاه)
 *
 *  idempotent: فقط ردیف‌هایی که firstName='نامشخص' یا '' هستند را لمس می‌کند؛
 *  اجرای دوباره تغییری ایجاد نمی‌کند.
 * ════════════════════════════════════════════════════════════════════════════════
 */

import { Pool } from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { norm, isFamilyParticle, hasFamilySuffix, HARDCODED, COMPOUND_PREFIX, VALID_COMPOUND_FN_PREFIXES, buildDictionary, resolveName, solve } from './lib/name-resolver.mjs';

// ── آرگومان‌ها ──
const raw = process.argv.slice(2);
const dbs = [];
let apply = false, outDir = process.cwd();
for (let i = 0; i < raw.length; i++) {
  if (raw[i] === '--dbs') { dbs.push(...raw[++i].split(',')); }
  else if (raw[i] === '--db') { dbs.push(raw[++i]); }
  else if (raw[i] === '--apply') { apply = true; }
  else if (raw[i] === '--out') { outDir = raw[++i]; }
}
const urls = dbs.length > 0 ? dbs.filter(u => u) :
  [process.env.DATABASE_URL || 'postgresql://afagh:afagh@localhost:5432/afagh_db'];

if (urls.length === 0) {
  console.error('No database URL provided. Use --dbs, --db, or set DATABASE_URL.');
  process.exit(1);
}

// ── تابع اجرای روی یک پایگاه‌داده ──
async function processDb(url, index) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`[${index}/${urls.length}] ${url}`);
  console.log('═'.repeat(70));

  let pool;
  try { pool = new Pool({ connectionString: url, max: 5 }); }
  catch (err) { console.error(`  ✗ Connect failed: ${err.message}`); return { ok: false, error: err.message }; }

  try {
    // ---- Build dictionary ----
    const dict = await buildDictionary(pool);
    console.log(`Dictionary: ${dict.firstNamesSet.size} first-name tokens, ${dict.lastTokenSet.size} family-name tokens, ${dict.compoundFirstSet.size} compound first names.`);

    // ---- Load problem rows ----
    const rows = await pool.query(`
      SELECT DISTINCT u.id, u."lastName", u."personId", s.id as "studentId", s."universityId", s."studentCode"
      FROM users u
      JOIN students s ON s."userId" = u.id
      WHERE u."firstName" IN ('نامشخص', '')
      ORDER BY s."universityId", s."studentCode"
    `);
    console.log(`Found ${rows.rows.length} student-user records with firstName IN ('نامشخص','').\n`);

    let resolvedCount = 0;
    let skippedCount = 0;
    const updates = [];
    const skippedList = [];
    const reviewList = [];
    const uniCounts = {};

    for (const r of rows.rows) {
      let rawName = (r.lastName || '').trim();

      if (!rawName || rawName === 'نامشخص' || /^نامشخص\d*$/.test(rawName)) {
        skippedCount++;
        skippedList.push({ id: r.id, uni: r.universityId, code: r.studentCode, raw: rawName, reason: 'no_real_name' });
        continue;
      }

      // underscore-separated: family_first_name
      if (rawName.includes('_')) {
        const parts = rawName.split('_').map(p => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          updates.push({ id: r.id, personId: r.personId, studentId: r.studentId, fn: parts[parts.length - 1], ln: parts.slice(0, -1).join(' '), raw: rawName, uni: r.universityId, code: r.studentCode, score: 'fixed' });
          resolvedCount++; continue;
        }
      }

      // leading dash -> strip
      if (rawName.startsWith('-')) rawName = rawName.replace(/^-+/, '').trim();

      // hardcoded concatenated names
      const hk = HARDCODED[rawName];
      if (hk) {
        updates.push({ id: r.id, personId: r.personId, studentId: r.studentId, fn: hk.fn, ln: hk.ln, raw: rawName, uni: r.universityId, code: r.studentCode, score: 'hard' });
        resolvedCount++; continue;
      }

      const parts = rawName.split(/\s+/).filter(Boolean);
      if (parts.length === 0) { skippedCount++; skippedList.push({ id: r.id, uni: r.universityId, code: r.studentCode, raw: rawName, reason: 'empty' }); continue; }

      if (parts.length === 1) {
        // Only keep if we can give a REAL first name; otherwise skip (don't write 'نامشخص')
        if (dict.firstNamesSet.has(norm(parts[0]))) {
          updates.push({ id: r.id, personId: r.personId, studentId: r.studentId, fn: parts[0], ln: 'نامشخص', raw: rawName, uni: r.universityId, code: r.studentCode, score: 'single-name' });
          resolvedCount++;
        } else {
          skippedCount++;
          skippedList.push({ id: r.id, uni: r.universityId, code: r.studentCode, raw: parts[0], reason: 'single-unknown' });
        }
        continue;
      }

      // Multi-token: use shared resolver (same logic as import guard)
      const resolved = resolveName(rawName, r.universityId, dict);
      if (!resolved) {
        skippedCount++;
        skippedList.push({ id: r.id, uni: r.universityId, code: r.studentCode, raw: rawName, reason: 'unresolvable' });
        continue;
      }

      // Review list: show best vs chosen when near-tie
      const ranked = solve(parts, r.universityId, dict);
      const best = ranked[0];
      let chosen = best;
      if (ranked.length >= 2 && best.score - ranked[1].score <= 1) {
        const prioTop = ranked.filter(c => c.prio === best.prio);
        chosen = prioTop.length && prioTop[0].score > best.score - 2 ? prioTop[0] : best;
        reviewList.push({
          id: r.id, uni: r.universityId, code: r.studentCode, raw: rawName,
          best: `${best.fn.join(' ')} / ${best.ln.join(' ')} (${best.score})`,
          chosen: `${chosen.fn.join(' ')} / ${chosen.ln.join(' ')} (${chosen.score})`,
        });
      }

      updates.push({ id: r.id, personId: r.personId, studentId: r.studentId, fn: resolved.fn, ln: resolved.ln, raw: rawName, uni: r.universityId, code: r.studentCode, score: resolved.kind });
      resolvedCount++;
    }

    for (const u of updates) uniCounts[u.uni] = (uniCounts[u.uni] || 0) + 1;
    console.log(`Resolved: ${resolvedCount}. Skipped (no real name): ${skippedCount}.`);
    console.log('By university:', uniCounts);

    if (skippedList.length) {
      console.log('\nSkipped rows (left unchanged):');
      for (const s of skippedList) console.log(`  uni=${s.uni} STNO=${s.code} raw="${s.raw}" (${s.reason})`);
    }

    const pick = (uni, n) => updates.filter(u => u.uni === uni).slice(0, n);
    console.log('\nUni 1 (AFAGH) samples:');
    for (const u of pick(1, 25)) console.log(`  ${u.code} | "${u.raw}" => First: "${u.fn}", Last: "${u.ln}"`);
    if (urls.length > 1) {
      console.log('\nUni 2 (ZARINE) samples:');
      for (const u of pick(2, 15)) console.log(`  ${u.code} | "${u.raw}" => First: "${u.fn}", Last: "${u.ln}"`);
      console.log('\nUni 3 (ALLAMEH) samples:');
      for (const u of pick(3, 15)) console.log(`  ${u.code} | "${u.raw}" => First: "${u.fn}", Last: "${u.ln}"`);
      console.log('\nUni 4 (SHAMS) samples:');
      for (const u of pick(4, 20)) console.log(`  ${u.code} | "${u.raw}" => First: "${u.fn}", Last: "${u.ln}"`);
      console.log('\nUni 5 (NAZHAND) samples:');
      for (const u of pick(5, 25)) console.log(`  ${u.code} | "${u.raw}" => First: "${u.fn}", Last: "${u.ln}"`);
    }

    if (reviewList.length) {
      let changed = 0;
      for (const r of reviewList) {
        if (r.best.split(' / ')[0].trim() !== r.chosen.split(' / ')[0].trim()) changed++;
      }
      console.log(`\n${reviewList.length} ambiguous rows; ${changed} differ from raw best.`);
      for (const r of reviewList) console.log(`  uni=${r.uni} ${r.code} "${r.raw}" | best: ${r.best} | chosen: ${r.chosen}`);
    }

    // ---- TSV output ----
    const suffix = urls.length > 1 ? `-${index}` : '';
    const outPath = join(outDir, `resolutions${suffix}.tsv`);
    const tsv = ['uni\tcode\traw\tfirstName\tlastName\tscore'];
    for (const u of updates) tsv.push([u.uni, u.code, u.raw, u.fn, u.ln, u.score].join('\t'));
    mkdirSync(outDir, { recursive: true });
    writeFileSync(outPath, tsv.join('\n'), 'utf8');
    console.log(`\nResolution table written to ${outPath}`);

    // ---- Apply ----
    if (apply) {
      console.log('\nApplying updates to database (users, persons, person_source_identities)...');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        let uCount = 0;
        for (const u of updates) {
          await client.query(`UPDATE users SET "firstName" = $1, "lastName" = $2 WHERE id = $3`, [u.fn, u.ln, u.id]);
          if (u.personId) {
            await client.query(`
              UPDATE persons
              SET "canonicalFirstName" = CASE WHEN "canonicalFirstName" = 'نامشخص' OR "canonicalFirstName" IS NULL THEN $1 ELSE "canonicalFirstName" END,
                  "canonicalLastName" = CASE WHEN "canonicalLastName" = $3 OR "canonicalLastName" = 'نامشخص' OR "canonicalLastName" IS NULL THEN $2 ELSE "canonicalLastName" END
              WHERE id = $4
            `, [u.fn, u.ln, u.raw, u.personId]);
          }
          if (u.studentId) {
            await client.query(`
              UPDATE person_source_identities
              SET "sourceFirstName" = $1, "sourceLastName" = $2,
                  "normalizedFirstName" = $1, "normalizedLastName" = $2
              WHERE "studentId" = $3
            `, [u.fn, u.ln, u.studentId]);
          }
          uCount++;
        }
        await client.query('COMMIT');
        console.log(`Successfully updated ${uCount} records!`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error applying, transaction rolled back:', err);
        return { ok: false, error: err.message };
      } finally {
        client.release();
      }
    } else {
      console.log('\nRun with --apply to write these changes to the database.');
    }

    await pool.end();
    return { ok: true, resolvedCount, skippedCount, updates: updates.length };
  } catch (err) {
    console.error(`Error processing ${url}:`, err);
    try { await pool.end(); } catch {}
    return { ok: false, error: err.message };
  }
}

// ── اجرا ──
async function main() {
  console.log(`Unknown-name resolver | mode: ${apply ? 'APPLY' : 'DRY-RUN'} | ${urls.length} database(s)`);
  const results = [];
  for (let i = 0; i < urls.length; i++) {
    const r = await processDb(urls[i], i + 1);
    results.push({ url: urls[i], ...r });
  }
  console.log(`\n${'═'.repeat(70)}\nSummary:`);
  let totalOk = 0, totalErr = 0;
  for (const r of results) {
    const status = r.ok ? '✓' : '✗';
    console.log(`  ${status} ${r.url} → resolved=${r.resolvedCount ?? '-'}, skipped=${r.skippedCount ?? '-'}`);
    if (r.ok) totalOk++; else totalErr++;
  }
  if (totalErr) { console.error(`\n${totalErr} database(s) failed.`); process.exitCode = 1; }
  else console.log('\nAll databases processed successfully.');
}

main().catch(err => { console.error(err); process.exitCode = 1; });
