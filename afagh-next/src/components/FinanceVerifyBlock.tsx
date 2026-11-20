import VerifyQrBlock from '@/components/VerifyQrBlock';

type Props = { url: string; qr?: string; expiresAt?: string | null; code?: string | null };

/**
 * بلوک رسمیت کارنامهٔ مالی — چیدمانِ افقی (QR کنارِ متن)، همان طرحی که
 * تأیید شده بود. فقط نشانیِ کاملِ حاوی توکن چاپ نمی‌شود؛ به‌جایش مبدأ + مسیر
 * («…/verify-finance») با کدِ کوتاهِ قابلِ استعلام می‌آید.
 */
export default function FinanceVerifyBlock({ url, qr, expiresAt, code }: Props) {
  return (
    <VerifyQrBlock
      title="استعلام برخط اصالت این کارنامه"
      url={url}
      qr={qr}
      expiresAt={expiresAt}
      shortUrl
      code={code}
    />
  );
}
