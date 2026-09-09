import { Pool } from 'pg';
import { verifyAuditChain, type AuditRow } from '../src/lib/audit-core';
async function main() {
  const url = process.env.AUDIT_DATABASE_URL;
  if (!url) throw new Error('Set AUDIT_DATABASE_URL (read-only DB access recommended)');
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    // One SELECT: consistent statement snapshot, no mutation of historical data.
    const result = await pool.query<AuditRow>(`SELECT *, "createdAt" AT TIME ZONE 'UTC' AS "createdAt" FROM audit_logs ORDER BY id`);
    const report = verifyAuditChain(result.rows);
    console.log(JSON.stringify({ ...report, note: 'Legacy hashes unverified. Head must be externally anchored to detect full rewriting or tail deletion.' }, null, 2));
    if (!report.ok) process.exitCode = 1;
  } finally { await pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
