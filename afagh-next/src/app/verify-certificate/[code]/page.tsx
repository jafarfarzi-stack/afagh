import { verifyCertificate } from '@/lib/verification';
import VerifyCertificateClient from '../VerifyCertificateClient';

export const dynamic = 'force-dynamic';

/** استعلام مستقیم با شمارهٔ سریال در نشانی (لینک QR روی گواهینامه) */
export default async function VerifyCertificateByCodePage({ params }: { params: { code: string } }) {
  const code = decodeURIComponent(params.code).trim().toUpperCase();
  const result = await verifyCertificate(code);
  return <VerifyCertificateClient initialCode={code} initialResult={result} />;
}
