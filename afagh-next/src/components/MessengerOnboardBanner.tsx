import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { notification_channels } from '@/db/schema';
import { getSessionUser } from '@/lib/auth';
import { getSetting } from '@/lib/settings';

/**
 * بنر عضویت پیام‌رسان — فقط وقتی نشان داده می‌شود که لازم باشد:
 * · هیچ اتصالی ندارد → راهنمای کامل (آدرس بات + کد صحت‌سنجی)
 * · اتصال دارد ولی تأیید نشده → فقط «کد را بده»
 * · متصل و تأییدشده → هیچ‌چیز (سکوت)
 */
export default async function MessengerOnboardBanner() {
  const me = await getSessionUser();
  if (!me) return null;

  let rows: { channel: string; isActive: number | null; verifiedAt: Date | null }[] = [];
  try {
    rows = (await db
      .select({
        channel: notification_channels.channel,
        isActive: notification_channels.isActive,
        verifiedAt: notification_channels.verifiedAt,
      })
      .from(notification_channels)
      .where(eq(notification_channels.userId, me.id))) as typeof rows;
  } catch {
    return null;
  }

  const verified = rows.some(r => (r.isActive ?? 0) === 1 && r.verifiedAt);
  if (verified) return null;

  const hasAny = rows.length > 0;
  const [soroushBot, baleBot] = await Promise.all([
    getSetting('SOROUSH_BOT_USERNAME').catch(() => ''),
    getSetting('BALE_BOT_USERNAME').catch(() => ''),
  ]);

  return (
    <div className="rounded-2xl border border-indigo-300 bg-indigo-50/80 p-4 text-xs leading-6 text-indigo-900" dir="rtl">
      {hasAny ? (
        <>
          <p className="font-black">📩 اتصال پیام‌رسان شما ناقص است — فقط کد صحت‌سنجی مانده:</p>
          <p className="mt-1 text-indigo-800">
            در صفحهٔ اتصال، کد یک‌بارمصرف بگیرید و در بات بفرستید، بعد همان‌جا تأیید کنید.
          </p>
          <Link
            href="/messenger"
            className="mt-2 inline-block rounded-xl bg-indigo-700 px-4 py-2 text-xs font-black text-white hover:bg-indigo-800"
          >
            دریافت کد و تأیید ←
          </Link>
        </>
      ) : (
        <>
          <p className="font-black">🔔 اعلان‌های مهم (نمره، کلاس، فیش) را در پیام‌رسان بگیرید:</p>
          <ol className="mt-1 list-decimal space-y-0.5 pr-5 text-indigo-800">
            <li>
              در پیام‌رسان عضو بات شوید:
              {soroushBot ? <> سروش <span className="font-mono font-bold" dir="ltr">@{soroushBot}</span></> : ' سروش'}
              {baleBot ? <> · بله <span className="font-mono font-bold" dir="ltr">@{baleBot}</span></> : ''}
            </li>
            <li>در همین سامانه، صفحهٔ «اتصال پیام‌رسان»، کد صحت‌سنجی بگیرید و در بات بفرستید.</li>
            <li>به صفحه برگردید و «تأیید نهایی» را بزنید — تمام.</li>
          </ol>
          <Link
            href="/messenger"
            className="mt-2 inline-block rounded-xl bg-indigo-700 px-4 py-2 text-xs font-black text-white hover:bg-indigo-800"
          >
            شروع اتصال در ۳۰ ثانیه ←
          </Link>
        </>
      )}
    </div>
  );
}
