import 'server-only';
import { createHash } from 'crypto';
import { desc } from 'drizzle-orm';
import { headers } from 'next/headers';
import { audit_logs } from '@/db/schema';

/**
 * ════════════════════════════════════════════════════════════════════════
 *  لاگ حسابرسی زنجیره‌ای (Immutable Audit Chain — بازبینی Medium)
 *
 *  هر عملیات مالی/حساس در همان تراکنش، یک رکورد audit_logs با
 *  sha256(جزئیات + prevHash + زمان) ثبت می‌کند → زنجیرهٔ غیرقابل‌انکار
 *  (تغییر هر رکورد قبلی، هش‌های بعدی را می‌شکند — همان الگوی audit زنجیره‌ای
 *  موجود در verify/archive).
 *
 *  فقط داخل db.transaction صدا زده می‌شود تا با خود عملیات اتمیک باشد.
 * ════════════════════════════════════════════════════════════════════════
 */

// کپلر Drizzle در نسخه‌های مختلف، تایپ تراکنش را متفاوت می‌نامد؛ برای
// سازگاری با db.transaction(از pg) و appDb(همان تایپ) از «هر tx سازگار» استفاده می‌کنیم.
type Tx = any;

async function clientIpSafe(): Promise<string | null> {
  try {
    const h = await headers();
    return (h.get('x-forwarded-for') || '').split(',')[0]?.trim() || h.get('x-real-ip') || null;
  } catch {
    return null;
  }
}

export interface AuditEntry {
  actorUserId?: number | null;
  action: string;              // e.g. FINANCE_DISCOUNT_APPROVED
  entityType: string;          // e.g. student_discounts
  entityId?: number | null;    // id رکورد
  details?: string | null;     // خلاصهٔ JSON — بدون دادهٔ حساس
}

/** ثبت رکورد حسابرسی در تراکنش جاری — همان تراکنش با خود عملیات */
export async function appendAudit(tx: Tx, entry: AuditEntry): Promise<string> {
  const [last] = await tx.select({ hash: audit_logs.hash }).from(audit_logs).orderBy(desc(audit_logs.id)).limit(1);
  const prevHash = (last?.hash as string | undefined) ?? '';
  const at = new Date().toISOString();
  const payload = JSON.stringify({ ...entry, at, prevHash });
  const hash = createHash('sha256').update(payload).digest('hex');
  await tx.insert(audit_logs).values({
    actorUserId: entry.actorUserId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    details: entry.details ?? null,
    prevHash,
    hash,
    ipAddress: await clientIpSafe(),
  });
  return hash;
}
