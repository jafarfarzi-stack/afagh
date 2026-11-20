import VerifyQrBlock from '@/components/VerifyQrBlock';

type Props = { url: string; qr?: string; expiresAt?: string | null; code?: string | null };

/**
 * بلوک رسمیت کارنامهٔ مالی — همان `VerifyQrBlock` با چیدمانِ فشردهٔ عمودی.
 *
 * ⚠ نشانیِ کامل (با توکنِ ۱۰۰+ کاراکتری) عمداً چاپ نمی‌شود؛ فقط دامنه + کدِ
 * کوتاهِ استعلام + اعتبار می‌آید و توکن داخل QR می‌ماند.
 */
export default function FinanceVerifyBlock({ url, qr, expiresAt, code }: Props) {
  return (
    <VerifyQrBlock
      title="استعلام اصالت"
      url={url}
      qr={qr}
      expiresAt={expiresAt}
      shortUrl
      compact
      code={code}
    />
  );
}
