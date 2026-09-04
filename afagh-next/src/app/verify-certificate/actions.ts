'use server';

import { verifyCertificate, type CertificateVerification } from '@/lib/verification';
import { clientIp, guardedRateLimit } from '@/lib/rateLimit';

/** استعلام اصالت گواهینامه از درگاه عمومی — فقط از پایگاه داده */
export async function verifyCertificateAction(code: string): Promise<{ ok: true; result: CertificateVerification } | { ok: false; error: string }> {
  // 🔒 M-1: سقف ۱۰ استعلام/۱۰ دقیقه به ازای هر IP (ضد brute-force شمارهٔ سریال)
  const rl = await guardedRateLimit(`verify-cert:${await clientIp()}`, 10, 10 * 60);
  if (!rl.ok) return { ok: false, error: rl.error };

  const trimmed = String(code ?? '').trim();
  if (!trimmed) return { ok: false, error: 'شمارهٔ سریال گواهینامه را وارد کنید.' };
  try {
    const result = await verifyCertificate(trimmed);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'خطا در استعلام.' };
  }
}
