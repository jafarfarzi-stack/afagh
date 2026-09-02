'use server';

import { verifyCertificate, type CertificateVerification } from '@/lib/verification';

/** استعلام اصالت گواهینامه از درگاه عمومی — فقط از پایگاه داده */
export async function verifyCertificateAction(code: string): Promise<{ ok: true; result: CertificateVerification } | { ok: false; error: string }> {
  const trimmed = String(code ?? '').trim();
  if (!trimmed) return { ok: false, error: 'شمارهٔ سریال گواهینامه را وارد کنید.' };
  try {
    const result = await verifyCertificate(trimmed);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'خطا در استعلام.' };
  }
}
