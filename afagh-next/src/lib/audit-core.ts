import { createHash } from 'node:crypto';

export interface AuditFields {
  actorUserId: number | null;
  action: string;
  entityType: string | null;
  entityId: number | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: Date;
  prevHash: string | null;
}

// The envelope versions the new format without modifying historical rows/schema.
export function encodeAuditDetails(details: string | null): string {
  return JSON.stringify({ auditFormat: 'afagh-audit-v2', data: details });
}
export function isAuditV2(details: string | null): boolean {
  try { return JSON.parse(details ?? '').auditFormat === 'afagh-audit-v2'; }
  catch { return false; }
}

/** Exact stored fields in a fixed order. No unpersisted timestamp enters the hash. */
export function computeAuditHash(row: AuditFields): string {
  return createHash('sha256').update(JSON.stringify([
    'afagh-audit-v2', row.actorUserId, row.action, row.entityType,
    row.entityId, row.details, row.ipAddress, row.createdAt.toISOString(), row.prevHash ?? '',
  ])).digest('hex');
}

export type AuditRow = AuditFields & { id: number; hash: string };
/** Input must contain the full chain in ascending id order. Legacy hashes are
 * explicitly unverified; once v2 starts, a downgrade is an error. A trusted
 * external checkpoint is required to detect rewriting or suffix deletion. */
export function verifyAuditChain(rows: AuditRow[]) {
  let previousHash = '';
  let previousId = 0;
  let v2Started = false;
  let verified = 0;
  let legacy = 0;
  const errors: { id: number; reason: string }[] = [];
  for (const row of rows) {
    if (row.id <= previousId) errors.push({ id: row.id, reason: 'order' });
    if ((row.prevHash ?? '') !== previousHash) errors.push({ id: row.id, reason: 'link' });
    if (isAuditV2(row.details)) {
      v2Started = true;
      if (computeAuditHash(row) !== row.hash) errors.push({ id: row.id, reason: 'hash' });
      else verified++;
    } else {
      legacy++;
      if (v2Started) errors.push({ id: row.id, reason: 'format-downgrade' });
    }
    previousHash = row.hash;
    previousId = row.id;
  }
  return { ok: errors.length === 0, verified, legacy, errors, head: previousHash };
}
