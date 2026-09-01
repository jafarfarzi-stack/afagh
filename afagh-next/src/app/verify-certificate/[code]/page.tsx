import VerifyCertificateClient from '../VerifyCertificateClient';
import { sampleCertificates } from '../page';

export const dynamic = 'force-dynamic';

export default async function VerifyCertificateByCodePage({
  params,
}: {
  params: { code: string };
}) {
  const code = decodeURIComponent(params.code).toUpperCase();
  return <VerifyCertificateClient initialCode={code} sampleCertificates={sampleCertificates} />;
}
