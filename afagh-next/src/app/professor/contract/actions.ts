'use server';

import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { electronic_documents, users } from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';
import { currentTerm } from '@/lib/payroll-engine';
import {
  attachProfessorIdentity, buildContractDraft, ensureContractDocument,
  issueContractOtp, signContract,
  type ContractDraft,
} from '@/lib/contract-engine';

export type ContractView = ContractDraft & {
  signatureStatus: 'PENDING' | 'SIGNED';
  signedAt: string | null;
  digitalHash: string | null;
};

export type ContractActionState =
  | { ok: true; contract: ContractView; signed: boolean }
  | { ok: false; error: string };

async function identityOf(userId: number): Promise<string> {
  const [row] = await db.select({ nationalCode: users.nationalCode }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.nationalCode ?? '';
}

/** بارگذاری/ساخت قرارداد واقعی استاد (درس‌های واقعی، نرخ و درصدهای واقعی از تنظیمات) */
export async function getContractAction(): Promise<ContractActionState> {
  try {
    const user = await requireRole(['PROFESSOR']);
    const me = await getStaffByUser(user.id);
    if (!me) return { ok: false, error: 'پروندهٔ هیئت علمی یافت نشد.' };
    const term = await currentTerm();
    if (!term) return { ok: false, error: 'ترم جاری تعیین نشده است.' };

    const res = await ensureContractDocument(me.id, term.id, { name: user.name, nationalCode: await identityOf(user.id) });
    if (!res.ok) return { ok: false, error: res.error };

    return {
      ok: true,
      signed: res.signed,
      contract: { ...res.contract, signatureStatus: res.signed ? 'SIGNED' : 'PENDING', signedAt: null, digitalHash: null },
    };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'خطا در دریافت قرارداد.' };
  }
}

/** صدور کد یکبارمصرف امضای قرارداد (پیامک در production؛ نمایش در دمو) */
export async function requestContractOtpAction(): Promise<{ ok: boolean; demoOtp?: string; error?: string }> {
  try {
    const user = await requireRole(['PROFESSOR']);
    const me = await getStaffByUser(user.id);
    if (!me) return { ok: false, error: 'پروندهٔ هیئت علمی یافت نشد.' };
    const term = await currentTerm();
    if (!term) return { ok: false, error: 'ترم جاری تعیین نشده است.' };
    const res = await ensureContractDocument(me.id, term.id, { name: user.name, nationalCode: await identityOf(user.id) });
    if (!res.ok) return { ok: false, error: res.error };
    const otp = await issueContractOtp(me.id, res.documentId);
    return { ok: otp.ok, demoOtp: otp.demoOtp, error: otp.error };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'خطا در صدور کد تأیید.' };
  }
}

/** امضای دیجیتال قرارداد با OTP — هش SHA-256 واقعی سند + زنجیرهٔ امضا در سمت سرور */
export async function signContractAction(otp: string): Promise<{ ok: boolean; error?: string; contract?: ContractView }> {
  try {
    const user = await requireRole(['PROFESSOR']);
    const me = await getStaffByUser(user.id);
    if (!me) return { ok: false, error: 'پروندهٔ هیئت علمی یافت نشد.' };
    const term = await currentTerm();
    if (!term) return { ok: false, error: 'ترم جاری تعیین نشده است.' };

    const res = await ensureContractDocument(me.id, term.id, { name: user.name, nationalCode: await identityOf(user.id) });
    if (!res.ok) return { ok: false, error: res.error };

    const h = await headers();
    const signed = await signContract(me.id, res.documentId, otp, h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local', h.get('user-agent') || '');
    if (!signed.ok) return { ok: false, error: signed.error };

    const [doc] = await db
      .select({ hash: electronic_documents.documentHash, signedAt: electronic_documents.signedAt })
      .from(electronic_documents).where(eq(electronic_documents.id, res.documentId)).limit(1);

    const draft = await buildContractDraft(me.id, term.id);
    if (!draft) return { ok: true };
    const full = attachProfessorIdentity(draft, user.name, await identityOf(user.id));

    return {
      ok: true,
      contract: {
        ...full,
        signatureStatus: 'SIGNED',
        signedAt: doc?.signedAt ? doc.signedAt.toLocaleString('fa-IR') : new Date().toLocaleString('fa-IR'),
        digitalHash: doc?.hash ?? null,
      },
    };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'خطا در امضای قرارداد.' };
  }
}
