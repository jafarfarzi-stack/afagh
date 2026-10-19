import 'server-only';

import { getPublicBaseUrl } from '@/lib/settings';
import { issueFinanceStatementToken } from '@/lib/verification';
import { qrSvg } from '@/lib/qr';
import { createLogger } from '@/lib/logger';

// خطاهای خام (مثل پیام یکتایی Postgres) می‌توانند کد ملی/شناسه را حمل کنند؛
// به‌جای console.error مستقیم از لاگر می‌فرستیم تا maskSecrets اعمال شود.
const log = createLogger({ mod: 'finance-verify' });

export type FinanceVerify = { url: string; qr: string; expiresAt: string | null } | null;

export async function buildFinanceStatementVerify(
  userId: number,
  student?: { id: number; code: string | null; universityId?: number | null } | null,
): Promise<FinanceVerify> {
  if (!userId) return null;
  try {
    const publicBaseUrl = await getPublicBaseUrl();
    const issued = await issueFinanceStatementToken(userId, student ?? null);
    const url = `${publicBaseUrl}/verify-finance/${encodeURIComponent(issued.token)}`;
    let qr = '';
    try {
      qr = await qrSvg(url, { errorCorrectionLevel: 'Q', size: 128, margin: 4 });
    } catch (err) {
      log.error('qr_failed', { err });
    }
    return { url, qr, expiresAt: issued.expiresAt };
  } catch (err) {
    log.error('token_failed', { err });
    return null;
  }
}