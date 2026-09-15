import { desc, sql } from 'drizzle-orm';
import type { db } from '../db';
import { audit_logs } from '../db/schema';
import { computeAuditHash, encodeAuditDetails } from './audit-core';

export type AuditTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export interface AuditEntry {
  actorUserId?: number | null;
  action: string;
  entityType: string;
  entityId?: number | null;
  details?: string | null;
  ipAddress?: string | null;
}

/** Must run inside a READ COMMITTED transaction. All application writers share
 * this transaction-scoped lock, including when the table is empty. The head
 * SELECT runs AFTER acquiring it, using a fresh statement snapshot. */
export async function writeAuditEntry(tx: AuditTx, entry: AuditEntry): Promise<string> {
  const isolation = await tx.execute(sql`show transaction_isolation`);
  if (isolation.rows[0]?.transaction_isolation !== 'read committed') {
    throw new Error('Audit writer requires READ COMMITTED');
  }
  await tx.execute(sql`select pg_advisory_xact_lock(1801675111, 2)`);
  const [last] = await tx.select({ hash: audit_logs.hash }).from(audit_logs).orderBy(desc(audit_logs.id)).limit(1);
  const row = {
    actorUserId: entry.actorUserId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    details: encodeAuditDetails(entry.details ?? null),
    ipAddress: entry.ipAddress?.slice(0, 50) ?? null,
    createdAt: new Date(),
    prevHash: last?.hash ?? '',
  };
  const hash = computeAuditHash(row);
  await tx.insert(audit_logs).values({ ...row, hash });
  return hash;
}
