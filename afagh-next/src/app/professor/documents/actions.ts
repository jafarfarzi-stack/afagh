'use server';

// موتور امضای الکترونیک — سند §۲۹۲۶–۲۹۹۰: OTP پنج‌رقمی، هش SHA-256، قفل ۵ تلاش، ممیزی زنجیره‌ای
import { randomInt } from 'crypto';
import { headers } from 'next/headers';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { audit_logs, doc_sign_otps, document_signatures, electronic_documents, notifications } from '@/db/schema';
import { getStaffByUser, requireRole, sha256 } from '@/lib/auth';

const OTP_TTL_SECONDS = 120;
const MAX_ATTEMPTS = 5;

async function meCtx() {
  const user = await requireRole(['PROFESSOR']);
  const me = await getStaffByUser(user.id);
  if (!me) throw new Error('پروندهٔ هیئت علمی یافت نشد');
  return { user, me };
}

export async function sendOtpAction(documentId: number): Promise<{ ok: boolean; error?: string; expiresInSeconds: number; devOtp?: string }> {
  const { user, me } = await meCtx();
  const [doc] = await db.select().from(electronic_documents).where(eq(electronic_documents.id, documentId));
  if (!doc || doc.staffId !== me.id) return { ok: false, error: 'سند یافت نشد.', expiresInSeconds: 0 };
  if (doc.signatureStatus === 'SIGNED') return { ok: false, error: 'این سند قبلاً امضا شده است.', expiresInSeconds: 0 };

  const otp = String(randomInt(10000, 100000)); // پنج‌رقمی — §۲۹۲۶
  await db.insert(doc_sign_otps).values({
    staffId: me.id, documentId,
    otpHash: sha256(otp + ':' + documentId),
    expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
  });
  await db.insert(notifications).values({ userId: user.id, eventCode: 'SIGN_OTP_SENT', payload: JSON.stringify({ documentId }) });
  // در پروداکشن: ارسال با SMS Provider؛ در توسعه کد برگردانده می‌شود تا گردش کار قابل آزمایش باشد
  return { ok: true, expiresInSeconds: OTP_TTL_SECONDS, devOtp: process.env.NODE_ENV === 'production' ? undefined : otp };
}

export async function verifySignAction(documentId: number, otp: string): Promise<{ ok: boolean; error?: string; signedAt?: string }> {
  const { user, me } = await meCtx();
  const [doc] = await db.select().from(electronic_documents).where(eq(electronic_documents.id, documentId));
  if (!doc || doc.staffId !== me.id) return { ok: false, error: 'سند یافت نشد.' };
  if (doc.signatureStatus === 'SIGNED') return { ok: false, error: 'این سند قبلاً امضا شده است.' };

  const [row] = await db.select().from(doc_sign_otps)
    .where(and(eq(doc_sign_otps.documentId, documentId), eq(doc_sign_otps.staffId, me.id)))
    .orderBy(desc(doc_sign_otps.id)).limit(1);
  if (!row) return { ok: false, error: 'ابتدا کد تأیید را درخواست کنید.' };
  if (row.isUsed) return { ok: false, error: 'این کد مصرف شده است؛ دوباره درخواست دهید.' };
  if (row.lockedAt) return { ok: false, error: 'به دلیل تلاش‌های ناموفق، کد قفل شد. کد جدید بگیرید.' };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, error: 'کد منقضی شد؛ دوباره درخواست دهید.' };

  if (sha256(otp + ':' + documentId) !== row.otpHash) {
    const attempts = (row.attempts ?? 0) + 1;
    await db.update(doc_sign_otps).set(attempts >= MAX_ATTEMPTS ? { attempts, lockedAt: new Date() } : { attempts }).where(eq(doc_sign_otps.id, row.id));
    return { ok: false, error: attempts >= MAX_ATTEMPTS ? 'تلاش‌ها بیش از حد مجاز — کد قفل شد.' : 'کد نادرست است (' + attempts + '/' + MAX_ATTEMPTS + ').' };
  }

  const h = await headers();
  const ip = (h.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
  const ua = h.get('user-agent') || '';
  const now = new Date();

  // تراکنش اتمیک: مصرف OTP + امضا + وضعیت سند + ممیزی زنجیره‌ای
  await db.transaction(async tx => {
    await tx.update(doc_sign_otps).set({ isUsed: 1 }).where(eq(doc_sign_otps.id, row.id));
    await tx.insert(document_signatures).values({ documentId, staffId: me.id, signedAt: now, ipAddress: ip, userAgent: ua, otpUsed: otp });
    await tx.update(electronic_documents).set({ signatureStatus: 'SIGNED' }).where(eq(electronic_documents.id, documentId));
    const [last] = await tx.select({ hash: audit_logs.hash }).from(audit_logs).orderBy(desc(audit_logs.id)).limit(1);
    const prevHash = last?.hash ?? '';
    await tx.insert(audit_logs).values({
      actorUserId: user.id, action: 'ELECTRONIC_SIGN', entityType: 'electronic_documents', entityId: documentId,
      details: JSON.stringify({ ip, ua: ua.slice(0, 120) }), prevHash,
      hash: sha256(prevHash + '|ELECTRONIC_SIGN|' + documentId + '|' + now.toISOString()),
      ipAddress: ip,
    });
    await tx.insert(notifications).values({ userId: user.id, eventCode: 'DOC_SIGNED', payload: JSON.stringify({ documentId, title: doc.title }) });
  });
  return { ok: true, signedAt: now.toISOString() };
}
