import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../src/db/schema';
import { writeAuditEntry } from '../src/lib/audit-writer';
import { verifyAuditChain } from '../src/lib/audit-core';

async function main() {
  if (!process.env.AUDIT_TEST_DATABASE_URL) throw new Error('Set AUDIT_TEST_DATABASE_URL to a disposable test database');
  const name = `audit_test_${randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString: process.env.AUDIT_TEST_DATABASE_URL });
  const pool = new Pool({ connectionString: process.env.AUDIT_TEST_DATABASE_URL, max: 12, options: `-c search_path=${name}` });
  try {
    await admin.query(`CREATE SCHEMA "${name}"`);
    await pool.query(`CREATE TABLE audit_logs (
      id serial PRIMARY KEY, "actorUserId" integer, action varchar(100) NOT NULL,
      "entityType" varchar(50), "entityId" integer, details text, "prevHash" varchar(64),
      hash varchar(64) NOT NULL, "ipAddress" varchar(50), "createdAt" timestamp DEFAULT now()
    ); CREATE TABLE business_changes (id serial PRIMARY KEY)`);
    const db = drizzle(pool, { schema });
    const read = () => db.select().from(schema.audit_logs).orderBy(schema.audit_logs.id);
    // Real concurrent transactions, including an initially empty chain.
    await Promise.all(Array.from({ length: 60 }, (_, i) => db.transaction(async tx => {
      await tx.execute(sql`insert into business_changes default values`);
      await writeAuditEntry(tx, { actorUserId: i, action: 'CONCURRENT', entityType: 'test', details: String(i) });
      if (i % 5 === 0) await writeAuditEntry(tx, { action: 'SECOND', entityType: 'test' });
    })));
    const rows = await read();
    assert.equal(rows.length, 72);
    const verified = verifyAuditChain(rows.map(r => ({ ...r, createdAt: r.createdAt! })));
    assert.equal(verified.ok, true, JSON.stringify(verified));
    assert.equal(verified.verified, 72);
    console.log('PASS: 60 concurrent transactions, 72 linked/recomputable hashes, empty-table race');

    await assert.rejects(db.transaction(async tx => {
      await tx.execute(sql`insert into business_changes default values`);
      await writeAuditEntry(tx, { action: 'ROLLBACK', entityType: 'test' });
      throw new Error('injected failure');
    }), /injected failure/);
    assert.equal((await read()).length, 72);
    assert.equal(Number((await pool.query('select count(*) from business_changes')).rows[0].count), 60);
    console.log('PASS: business change and audit roll back together');

    await assert.rejects(db.transaction(async tx => {
      await tx.execute(sql`insert into business_changes default values`);
      await writeAuditEntry(tx, { action: 'x'.repeat(101), entityType: 'test' });
    }));
    assert.equal(Number((await pool.query('select count(*) from business_changes')).rows[0].count), 60);
    console.log('PASS: audit insertion failure rolls back business change');

    await assert.rejects(db.transaction(tx => writeAuditEntry(tx, { action: 'ISOLATION', entityType: 'test' }), { isolationLevel: 'repeatable read' }), /READ COMMITTED/);
    // Lock must be released after errors; a subsequent transaction succeeds.
    await db.transaction(tx => writeAuditEntry(tx, { action: 'AFTER_ROLLBACK', entityType: 'test' }));
    assert.equal(verifyAuditChain((await read()).map(r => ({ ...r, createdAt: r.createdAt! }))).ok, true);
    console.log('PASS: unsupported isolation rejected, lock released after rollback');
    // Execute the actual raw-pg CLI under non-UTC timezones (not Drizzle's reader).
    const verifierUrl = new URL(process.env.AUDIT_TEST_DATABASE_URL!);
    verifierUrl.searchParams.set('options', `-c search_path=${name}`);
    for (const tz of ['Asia/Tehran', 'America/New_York']) {
      const output = execFileSync(process.execPath, ['--import', 'tsx', 'scripts/verify-audit.ts'], {
        env: { ...process.env, AUDIT_DATABASE_URL: verifierUrl.toString(), TZ: tz }, encoding: 'utf8',
      });
      assert.equal(JSON.parse(output).verified, 73);
    }
    console.log('PASS: real verifier CLI reproduces hashes in Tehran and New York');

  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${name}" CASCADE`);
    await admin.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
