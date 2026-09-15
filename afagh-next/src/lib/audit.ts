import 'server-only';
import { requestClientIp } from './request-context';
import { writeAuditEntry, type AuditEntry, type AuditTx } from './audit-writer';
export type { AuditEntry } from './audit-writer';

/** Use inside the business transaction so a failed audit rolls back the change. */
export async function appendAudit(tx: AuditTx, entry: AuditEntry): Promise<string> {
  const ip = entry.ipAddress === undefined ? await requestClientIp() : entry.ipAddress;
  return writeAuditEntry(tx, { ...entry, ipAddress: ip });
}
