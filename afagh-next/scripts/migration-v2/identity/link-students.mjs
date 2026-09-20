#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════
 *  CLI: اجرای پیوند کلیه دانشجویان به لایه اشخاص مستقل
 *  استفاده:
 *    node scripts/migration-v2/identity/link-students.mjs [--uni <id>] [--batch 200] [--limit 1000]
 * ══════════════════════════════════════════════════════════════════════
 */
import { getPool, closePool } from '../core/db.mjs';
import { linkAllStudents } from './student-linker.mjs';

const rawArgs = process.argv.slice(2);
const args = {};
for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i].startsWith('--')) {
    const key = rawArgs[i].slice(2);
    args[key] = (rawArgs[i + 1] && !rawArgs[i + 1].startsWith('--')) ? rawArgs[++i] : 'true';
  }
}

const uniId = args.uni ? parseInt(args.uni, 10) : null;
const batch = args.batch ? parseInt(args.batch, 10) : 200;
const limit = args.limit ? parseInt(args.limit, 10) : 0;
const dbUrl = args.db || process.env.DATABASE_URL;

async function run() {
  console.log('--- Migration V2: Student Identity Linking ---');
  console.log(`University ID: ${uniId ?? 'ALL'}, Batch Size: ${batch}, Limit: ${limit || 'NONE'}`);

  const pool = getPool(dbUrl);
  try {
    const stats = await linkAllStudents(pool, {
      universityId: uniId,
      batchSize: batch,
      limit,
      onProgress: (done, total, currentStats) => {
        const pct = ((done / total) * 100).toFixed(1);
        console.log(`[Progress] ${done}/${total} (${pct}%) - Linked: ${currentStats.linked}, ReviewRequired: ${currentStats.reviewRequired}, NewPending: ${currentStats.newPersonPending}, Errors: ${currentStats.errors}`);
      },
    });

    console.log('\n--- Finished Student Identity Linking ---');
    console.table(stats);
  } catch (err) {
    console.error('Fatal error during identity linking:', err);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

run();
