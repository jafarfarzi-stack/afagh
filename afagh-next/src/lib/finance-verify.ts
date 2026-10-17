import 'server-only';

import { getPublicBaseUrl } from '@/lib/settings';
import { issueFinanceStatementToken } from '@/lib/verification';
import { qrSvg } from '@/lib/qr';

export type FinanceVerify = { url: string; qr: string; expiresAt: string | null } | null;

export async function buildFinanceStatementVerify(userId: number): Promise<FinanceVerify> {
  if (!userId) return null;
  try {
    const publicBaseUrl = await getPublicBaseUrl();
    const issued = await issueFinanceStatementToken(userId);
    const url = `${publicBaseUrl}/verify-finance/${encodeURIComponent(issued.token)}`;
    let qr = '';
    try {
      qr = await qrSvg(url, { errorCorrectionLevel: 'Q', size: 128, margin: 4 });
    } catch (err) {
      console.error('[finance-verify] qr failed', err);
    }
    return { url, qr, expiresAt: issued.expiresAt };
  } catch (err) {
    console.error('[finance-verify] token failed', err);
    return null;
  }
}