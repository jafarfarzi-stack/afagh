'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { sendTestMessage, type Channel } from '@/lib/messaging';

const TESTABLE: Channel[] = ['SMS', 'BALE', 'EITAA', 'TELEGRAM', 'SOROUSH', 'IGAP'];

const CHANNEL_FA: Record<string, string> = {
  SMS: 'پیامک SMS',
  BALE: 'پیام‌رسان بله',
  EITAA: 'پیام‌رسان ایتا',
  TELEGRAM: 'تلگرام',
  SOROUSH: 'سروش',
  IGAP: 'ای‌گپ',
};

/** نرمال‌سازی ارقام فارسی/عربی به لاتین */
function toAsciiDigits(s: string): string {
  return s.replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/**
 * تست زندهٔ واقعی: به کاربرِ دارای این موبایل، از مسیر واقعی ارسال
 * (همان sendTestMessage مشترک همهٔ فرایندها) پیام آزمایشی می‌فرستد
 * و نتیجهٔ صادقانه (SENT/SKIPPED/FAILED + دلیل) را برمی‌گرداند.
 */
export async function sendTemplateTestMessage(
  channel: string,
  mobile: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  await requireRole(['ADMIN']);
  if (!TESTABLE.includes(channel as Channel)) {
    return { ok: false, error: 'کانال نامعتبر است.' };
  }
  const m = toAsciiDigits(String(mobile || '')).replace(/[\s-]/g, '');
  if (!/^09\d{9}$/.test(m)) {
    return { ok: false, error: 'شماره موبایل معتبر وارد کنید (مثل 09123456789).' };
  }
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.mobile, m)).limit(1);
  if (!user) {
    return { ok: false, error: `کاربری با موبایل ${m} در سامانه یافت نشد — اول باید حساب داشته باشد (اتصال بات هم در /messenger انجام می‌شود).` };
  }
  try {
    const r = await sendTestMessage(user.id, channel as Channel);
    if (r.status === 'SENT') {
      return { ok: true, message: `📲 پیام آزمایشی واقعی از طریق ${CHANNEL_FA[channel]} به ${m} ارسال شد.` };
    }
    return { ok: false, error: `ارسال نشد (${CHANNEL_FA[channel]}): ${r.error ?? r.status}` };
  } catch (e) {
    return { ok: false, error: `خطای ارسال: ${(e as Error).message}` };
  }
}
