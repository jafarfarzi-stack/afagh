'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { notification_templates, staff, students, users } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { sendMessenger, sendTestMessage, type Channel } from '@/lib/messaging';

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
 * تست زندهٔ واقعی. مدیر فقط یک شناسه می‌دهد و سامانه خودش آیدیِ همان پیام‌رسان
 * را از روی حساب پیدا و ارسال می‌کند — لازم نیست chatId دستی وارد شود.
 *
 * شناسه‌های پذیرفته‌شده (به همین ترتیب اولویت):
 *   ۱) کد پرسنلی  ۲) شمارهٔ دانشجویی  ۳) موبایل  ۴) کد ملی  ۵) شناسهٔ چت مستقیم
 *
 * پیام از مسیر واقعی (sendTestMessage) می‌رود؛ یعنی دقیقاً همان مسیری که
 * اعلان‌های کارتابل می‌روند و لاگ تحویل هم ثبت می‌شود.
 */
export async function sendTemplateTestMessage(
  channel: string,
  identifier: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  await requireRole(['ADMIN']);
  if (!TESTABLE.includes(channel as Channel)) {
    return { ok: false, error: 'کانال نامعتبر است.' };
  }
  const raw = toAsciiDigits(String(identifier || '')).replace(/[\s\-@]/g, '').trim();
  if (!raw) {
    return { ok: false, error: 'کد پرسنلی، شمارهٔ دانشجویی یا موبایل را وارد کنید.' };
  }
  if (!/^\d+$/.test(raw)) {
    return { ok: false, error: 'شناسه باید عدد باشد (کد پرسنلی، شمارهٔ دانشجویی یا موبایل).' };
  }

  // ── ① کد پرسنلی (سریع‌ترین و دقیق‌ترین برای استاد) ──
  const byStaff = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, code: staff.staffCode })
    .from(staff)
    .innerJoin(users, eq(users.id, staff.userId))
    .where(eq(staff.staffCode, raw))
    .orderBy(users.id);
  if (byStaff.length) return dispatchToUsers(byStaff, channel as Channel, `کد پرسنلی ${raw}`);

  // ── ② شمارهٔ دانشجویی ──
  const byStudent = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, code: students.studentCode })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .where(eq(students.studentCode, raw))
    .orderBy(users.id);
  if (byStudent.length) return dispatchToUsers(byStudent, channel as Channel, `شمارهٔ دانشجویی ${raw}`);

  // ── ③ موبایل ──
  if (/^09\d{9}$/.test(raw)) {
    const byMobile = await db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, code: users.mobile })
      .from(users)
      .where(eq(users.mobile, raw))
      .orderBy(users.id);
    if (byMobile.length) return dispatchToUsers(byMobile, channel as Channel, `موبایل ${raw}`);
  }

  // ── ④ کد ملی ──
  if (raw.length === 10) {
    const byNc = await db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, code: users.nationalCode })
      .from(users)
      .where(eq(users.nationalCode, raw))
      .orderBy(users.id);
    if (byNc.length) return dispatchToUsers(byNc, channel as Channel, `کد ملی ${raw}`);
  }

  // ── ⑤ هیچ حسابی پیدا نشد → اگر شبیه chatId است، مستقیم همان‌جا بفرست ──
  if (raw.length >= 3 && raw.length <= 15) {
    return dispatchDirectToChannel(raw, channel as Channel);
  }
  return {
    ok: false,
    error: `هیچ کاربری با «${raw}» پیدا نشد — کد پرسنلی، شمارهٔ دانشجویی، موبایل یا کد ملی را بررسی کنید.`,
  };
}

/** ارسال تست به حساب‌های یک شناسه — اول حسابی که در آن کانال لینک شده */
async function dispatchToUsers(
  matched: { id: number; firstName: string | null; lastName: string | null }[],
  channel: Channel,
  label: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    let lastSkip: string | null = null;
    for (const u of matched) {
      const who = `${u.firstName || ''} ${u.lastName || ''}`.trim() || `حساب ${u.id}`;
      const r = await sendTestMessage(u.id, channel);
      if (r.status === 'SENT') {
        return {
          ok: true,
          message: `✅ پیام آزمایشی از طریق ${CHANNEL_FA[channel]} به ${who} (${label}) ارسال شد.`,
        };
      }
      // خطای شبکه/سرویس را رد می‌کنیم تا حساب بعدی امتحان شود؛ فقط وقتی
      // همه رد شدند، گزارش می‌دهیم — وگرنه یک حساب خراب جلوی بقیه را می‌گیرد.
      lastSkip = `${who}: ${r.error ?? r.status}`;
    }
    return {
      ok: false,
      error: `ارسال نشد (${CHANNEL_FA[channel]}) — ${lastSkip ?? 'مقصدی پیدا نشد'}. اگر در /messenger بات را لینک نکرده‌اید، اول آنجا کد بفرستید و منتظر تأیید شوید.`,
    };
  } catch (e) {
    return { ok: false, error: `خطای ارسال: ${(e as Error).message}` };
  }
}

/** ارسال تست مستقیم به یک شناسهٔ مقصد (chatId) در همان کانال انتخابی */
async function dispatchDirectToChannel(
  targetId: string,
  channel: Channel,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const r = await sendMessenger(channel, targetId, '📲 پیام آزمایشی از سامانه جامع دانشگاه آفاق — این پیام یک‌بارمصرف است.');
    if (r.status === 'SENT') {
      return { ok: true, message: `📲 پیام آزمایشی از طریق ${CHANNEL_FA[channel]} مستقیماً به شناسهٔ ${targetId} ارسال شد.` };
    }
    return { ok: false, error: `ارسال نشد (${CHANNEL_FA[channel]} به ${targetId}): ${r.error ?? r.status}` };
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
