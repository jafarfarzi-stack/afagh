import 'server-only';
import { appendAudit } from './audit';
import type { AuditTx } from './audit-writer';
export type { AuditTx } from './audit-writer';

/** Compatibility adapter: every engine now uses the same serialized writer. */
export async function auditChain(
  tx: AuditTx, actorUserId: number | null, action: string,
  entityType: string, entityId: number | null, details: Record<string, unknown>,
) {
  return appendAudit(tx, { actorUserId, action, entityType, entityId, details: JSON.stringify(details) });
}
