'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { notification_templates, users } from '@/db/schema';
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

export interface SavedTemplateRow {
  eventCode: string;
  title: string;
  templateText: string;
  variables: { tag: string; label: string; sampleValue: string }[];
  channels: string;
  isActive: boolean;
}

/** خواندن همهٔ قالب‌های ذخیره‌شده */
export async function listNotificationTemplates(): Promise<SavedTemplateRow[]> {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  const rows = await db.select().from(notification_templates);
  return rows.map(r => {
    let variables: SavedTemplateRow['variables'] = [];
    try {
      const v = JSON.parse(r.variables ?? '[]');
      if (Array.isArray(v)) variables = v.filter(x => x && typeof x.tag === 'string');
    } catch { /* json خراب → خالی */ }
    return {
      eventCode: r.eventCode,
      title: r.title ?? r.eventCode,
      templateText: r.templateText,
      variables,
      channels: r.channels ?? r.channel ?? 'SMS',
      isActive: (r.isActive ?? 1) === 1,
    };
  });
}

/** ذخیرهٔ واقعی یک قالب (درج/به‌روزرسانی بر اساس eventCode) */
export async function saveNotificationTemplate(input: {
  eventCode: string;
  title: string;
  templateText: string;
  variables: { tag: string; label: string; sampleValue: string }[];
  channels: string;
  isActive: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole(['ADMIN']);
  const eventCode = String(input.eventCode || '').trim().slice(0, 60);
  const title = String(input.title || '').trim().slice(0, 150);
  const templateText = String(input.templateText || '');
  if (!eventCode) return { ok: false, error: 'کد رویداد لازم است.' };
  if (!templateText.trim()) return { ok: false, error: 'متن قالب خالی است.' };
  const variables = (input.variables || [])
    .filter(v => v && typeof v.tag === 'string' && v.tag.trim())
    .slice(0, 40)
    .map(v => ({ tag: v.tag.trim().slice(0, 60), label: String(v.label ?? '').slice(0, 100), sampleValue: String(v.sampleValue ?? '').slice(0, 200) }));
  await db.insert(notification_templates).values({
    eventCode,
    title: title || eventCode,
    templateText,
    variables: JSON.stringify(variables),
    channels: String(input.channels || 'SMS').slice(0, 100),
    isActive: input.isActive ? 1 : 0,
  }).onConflictDoUpdate({
    target: notification_templates.eventCode,
    set: {
      title: title || eventCode,
      templateText,
      variables: JSON.stringify(variables),
      channels: String(input.channels || 'SMS').slice(0, 100),
      isActive: input.isActive ? 1 : 0,
      updatedAt: new Date(),
    },
  });
  return { ok: true };
}
