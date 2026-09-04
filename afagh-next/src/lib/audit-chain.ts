/**
 * زنجیرهٔ هش ممیزی (Audit Chain) — مشترک بین موتورها
 *
 * هر رکورد به رکورد قبلی گره می‌خورد (prevHash → hash)؛ برای جلوگیری از
 * race در نوشتن‌های همزمان، آخرین ردیف قفل می‌شود (FOR UPDATE) تا زنجیره
 * همیشه خطی و قابل راستی‌آزمایی بماند.
 *
 * همان الگویی که موتور حقوق استفاده می‌کند؛ این‌جا به‌صورت ماژول مشترک برای
 * موتور امتحانات تا از تکرار کد جلوگیری شود.
 */
import 'server-only';
import crypto from 'crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { audit_logs } from '@/db/schema';

export type AuditTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function auditChain(
  tx: AuditTx,
  actorUserId: number | null,
  action: string,
  entityType: string,
  entityId: number | null,
  details: Record<string, unknown>,
) {
  const [last] = await tx
    .select({ hash: audit_logs.hash })
    .from(audit_logs)
    .orderBy(sql`${audit_logs.id} desc`)
    .limit(1)
    .for('update');
  const prevHash = last?.hash ?? '';
  const hash = crypto
    .createHash('sha256')
    .update(`${prevHash}|${action}|${entityType}|${entityId ?? ''}|${JSON.stringify(details)}`)
    .digest('hex');
  await tx.insert(audit_logs).values({
    actorUserId,
    action,
    entityType,
    entityId,
    details: JSON.stringify(details),
    prevHash,
    hash,
  });
  return hash;
}
