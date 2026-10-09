'use server';

import { getSessionUser } from '@/lib/auth';
import { confirmLinkToken, mintLinkTokenFor } from '@/lib/messenger-link-tokens';
import type { MessengerChannel } from '@/lib/messenger-bot';

// ═══════════════════════════════════════════════════════════════
//  کنش‌های اتصال پیام‌رسان (توکن‌محور — بدون رمز عبور در چت)
//
//  ۱) mintLinkTokenAction: کاربر واردشده → کد انسانی + دیپ‌لینک (۱۰ دقیقه اعتبار)
//  ۲) confirmLinkAction: پس از ارسال /start در بات → تأیید نهایی + verifiedAt
// ═══════════════════════════════════════════════════════════════

/** صدور کد اتصال برای یک کانال (نیازمند ورود) */
export async function mintLinkTokenAction(channel: string) {
  const me = await getSessionUser();
  if (!me) return { ok: false as const, error: 'ابتدا وارد سامانه شوید.' };
  return mintLinkTokenFor(me.id, channel as MessengerChannel);
}

/** تأیید نهایی اتصال پس از ارسال /start در بات (نیازمند ورود) */
export async function confirmLinkAction(tokenOrCode: string) {
  const me = await getSessionUser();
  if (!me) return { ok: false as const, error: 'ابتدا وارد سامانه شوید.' };
  return confirmLinkToken(me.id, tokenOrCode);
}
