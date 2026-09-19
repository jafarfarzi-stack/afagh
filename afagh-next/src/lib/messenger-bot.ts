import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { users, students, user_roles, roles, enrollments, course_offerings, courses, notification_channels } from '@/db/schema';
import { getSetting } from '@/lib/settings';
import { saveUserChannel } from '@/lib/messaging';
import { toJalaliFromDate } from '@/lib/calendar';
import { createLogger } from '@/lib/logger';
import { verifyPassword } from '@/lib/auth';
import { rateLimit } from '@/lib/rateLimit';

const log = createLogger({ mod: 'messenger-bot' });

// ═══════════════════════════════════════════════════════════════
//  بات یکپارچهٔ پیام‌رسان‌ها — تلگرام / بله / سروش / ایتا / ای‌گپ
//
//  تلگرام، بله و سروش API یکسانی دارند (bot<token>/...).
//  ایتا متفاوت است (<token>/...).
//  همهٔ این‌ها از یک هستهٔ مشترک استفاده می‌کنند.
// ═══════════════════════════════════════════════════════════════

export type MessengerChannel = 'TELEGRAM' | 'BALE' | 'SOROUSH' | 'EITAA' | 'IGAP';

// ──────── پیکربندی API هر پیام‌رسان ────────

interface MessengerConfig {
  tokenKey: string;
  baseKey: string;
  defaultBase: string;
  style: 'BOT' | 'EITAA';
}

const MESSENGER_CONFIGS: Record<MessengerChannel, MessengerConfig> = {
  TELEGRAM: { tokenKey: 'TELEGRAM_TOKEN', baseKey: 'TELEGRAM_API_BASE', defaultBase: 'https://api.telegram.org', style: 'BOT' },
  BALE:     { tokenKey: 'BALE_TOKEN',     baseKey: 'BALE_API_BASE',     defaultBase: 'https://tapi.bale.ai',      style: 'BOT' },
  SOROUSH:  { tokenKey: 'SOROUSH_TOKEN',  baseKey: 'SOROUSH_API_BASE',  defaultBase: 'https://api.soroush.app',   style: 'BOT' },
  EITAA:    { tokenKey: 'EITAA_TOKEN',    baseKey: 'EITAA_API_BASE',    defaultBase: 'https://eitaayar.ir/api',    style: 'EITAA' },
  IGAP:     { tokenKey: 'IGAP_TOKEN',     baseKey: 'IGAP_API_BASE',     defaultBase: 'https://igap.ai/api',        style: 'BOT' },
};

async function getConfig(channel: MessengerChannel) {
  const cfg = MESSENGER_CONFIGS[channel];
  const token = (await getSetting(cfg.tokenKey)).trim();
  const base = ((await getSetting(cfg.baseKey)) || cfg.defaultBase).replace(/\/+$/, '');
  return { token, base, style: cfg.style };
}

// ──────── ارسال پیام ────────

async function sendMessage(channel: MessengerChannel, chatId: string, text: string): Promise<boolean> {
  const { token, base, style } = await getConfig(channel);
  if (!token) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const url = style === 'EITAA' ? `${base}/${token}/sendMessage` : `${base}/bot${token}/sendMessage`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return r.ok;
  } catch (e) {
    log.error('messenger_send_failed', { channel, chatId, error: (e as Error).message });
    return false;
  }
}

// ──────── پیدا کردن کاربر ────────

async function findUserByChatId(channel: MessengerChannel, chatId: string) {
  const [ch] = await db.select().from(notification_channels)
    .where(and(
      eq(notification_channels.channel, channel),
      eq(notification_channels.address, chatId),
      eq(notification_channels.isActive, 1),
    )).limit(1);
  if (!ch) return null;
  const [user] = await db.select().from(users).where(eq(users.id, ch.userId)).limit(1);
  return user ?? null;
}

async function findStudentByUserId(userId: number) {
  const [student] = await db.select().from(students).where(eq(students.userId, userId)).limit(1);
  return student ?? null;
}

async function getUserRoles(userId: number): Promise<string[]> {
  const rows = await db.select({ code: roles.code })
    .from(user_roles)
    .innerJoin(roles, eq(roles.id, user_roles.roleId))
    .where(eq(user_roles.userId, userId));
  return rows.map(r => r.code);
}

// ──────── وضعیت مکالمه ────────
// ⚠️ امنیت اتصال حساب: صرفِ دانستن کد ملی برای هویت‌سنجی کافی نیست — کد ملی
// در ایران محرمانه نیست (روی مدارک متعدد هست/قابل‌حدس‌زدن است). اتصال حساب
// باید هم‌تراز امنیتی ورود وب باشد: کد ملی + رمز عبور واقعی + rate-limit.
type ConversationState = 'idle' | 'awaiting_national_code' | 'awaiting_password';
type ConversationEntry = { state: ConversationState; nationalCode?: string };
const pendingConversations = new Map<string, ConversationEntry>();

function convKey(channel: MessengerChannel, chatId: string) { return `${channel}:${chatId}`; }

// ═══════════════════════════════════════════════════════════════
//  پردازش آپدیت دریافتی
// ═══════════════════════════════════════════════════════════════

export async function handleMessengerUpdate(channel: MessengerChannel, body: Record<string, unknown>): Promise<void> {
  const msg = body.message as Record<string, unknown> | undefined;
  if (!msg) return;
  const chat = msg.chat as Record<string, unknown> | undefined;
  if (!chat || chat.type !== 'private') return;

  const chatId = String(chat.id);
  const text = String(msg.text ?? '').trim();
  const key = convKey(channel, chatId);

  if (text.startsWith('/start')) await handleStart(channel, chatId, text);
  else if (text.startsWith('/help')) await handleHelp(channel, chatId);
  else if (text.startsWith('/status')) await handleStatus(channel, chatId);
  else if (text.startsWith('/grades')) await handleGrades(channel, chatId);
  else if (text.startsWith('/enrollment') || text.startsWith('/register')) await handleEnrollment(channel, chatId);
  else if (text.startsWith('/unlink')) await handleUnlink(channel, chatId);
  else {
    const entry = pendingConversations.get(key);
    if (entry?.state === 'awaiting_national_code') await handleNationalCodeInput(channel, chatId, text);
    else if (entry?.state === 'awaiting_password') await handlePasswordInput(channel, chatId, text, entry.nationalCode ?? '');
    else await sendMessage(channel, chatId, 'دستور ناشناخته. برای راهنما /help را ارسال کنید.');
  }
}

// ═══════════════════════ حستورات ═══════════════════════

async function handleStart(channel: MessengerChannel, chatId: string, text: string) {
  const key = convKey(channel, chatId);
  const parts = text.split(/\s+/);

  const user = await findUserByChatId(channel, chatId);
  if (user) {
    const roles = await getUserRoles(user.id);
    const roleLabel = roles.includes('STUDENT') ? 'دانشجو' : roles.includes('PROFESSOR') ? 'استاد' : 'کارمند';
    await sendMessage(channel, chatId,
      `سلام ${user.firstName} عزیز!\nشما قبلاً حساب خود را متصل کرده‌اید.\nنقش: ${roleLabel}\n\nدستورات:\n/status — وضعیت کلی\n/grades — نمرات\n/enrollment — انتخاب واحد\n/unlink — قطع اتصال\n/help — راهنما`
    );
    return;
  }

  if (parts.length > 1) {
    // «/start <کدملی>» فقط کد ملی را پیش‌پر می‌کند؛ رمز عبور همچنان در پیام بعدی لازم است.
    const code = parts[1].replace(/\D/g, '');
    if (code.length === 10) {
      pendingConversations.set(key, { state: 'awaiting_password', nationalCode: code });
      await sendMessage(channel, chatId, '🔒 برای اتصال حساب، رمز عبور خود (همان رمز ورود به سامانه) را ارسال کنید.');
      return;
    }
  }

  pendingConversations.set(key, { state: 'awaiting_national_code' });
  await sendMessage(channel, chatId,
    'سلام! به بات دانشگاه آفاق خوش آمدید.\n\nبرای اتصال حساب، ابتدا کد ملی یا شمارهٔ دانشجویی خود را ارسال کنید:'
  );
}

async function handleNationalCodeInput(channel: MessengerChannel, chatId: string, text: string) {
  const key = convKey(channel, chatId);
  const code = text.replace(/\D/g, '');
  if (code.length < 8) {
    await sendMessage(channel, chatId, 'کد ملی/شمارهٔ دانشجویی نامعتبر است. دوباره ارسال کنید یا /start بزنید.');
    return;
  }
  pendingConversations.set(key, { state: 'awaiting_password', nationalCode: code });
  await sendMessage(channel, chatId, '🔒 حالا رمز عبور خود (همان رمز ورود به سامانه) را ارسال کنید.\n(توصیه می‌شود پس از اتصال، همین پیام را از چت حذف کنید.)');
}

/**
 * تأیید نهایی اتصال حساب — کد ملی/شمارهٔ دانشجویی + رمز عبور واقعی، هم‌تراز
 * امنیتی ورود وب. rate-limit بر پایهٔ chatId (نه IP، چون همهٔ درخواست‌های
 * webhook از IP سرور پیام‌رسان می‌آیند، نه کاربر نهایی).
 */
async function handlePasswordInput(channel: MessengerChannel, chatId: string, password: string, nationalCode: string) {
  const key = convKey(channel, chatId);
  pendingConversations.delete(key);

  const rl = await rateLimit(`bot-link:${channel}:${chatId}`, 5, 10 * 60);
  if (!rl.ok) {
    await sendMessage(channel, chatId, `تلاش بیش از حد برای اتصال حساب. ${Math.ceil(rl.retryAfterSec / 60)} دقیقهٔ دیگر با /start دوباره تلاش کنید.`);
    return;
  }

  let [user] = await db.select().from(users).where(eq(users.nationalCode, nationalCode)).limit(1);
  if (!user) {
    const [st] = await db.select({ u: users }).from(students)
      .innerJoin(users, eq(users.id, students.userId))
      .where(eq(students.studentCode, nationalCode)).limit(1);
    if (st) user = st.u;
  }

  // پیام یکسان برای «کاربر نیست» و «رمز غلط است» تا کسی نتواند با آزمون‌وخطا
  // موجودیت یک کد ملی را حدس بزند (شمارش کاربر معتبر).
  const genericFail = async () => {
    await sendMessage(channel, chatId, '❌ کد ملی/شمارهٔ دانشجویی یا رمز عبور نادرست است. برای تلاش مجدد /start بزنید.');
  };

  if (!user || !user.isActive) { await genericFail(); return; }
  if (!(await verifyPassword(password, user.passwordHash))) { await genericFail(); return; }

  await saveUserChannel(user.id, channel, chatId);
  const userRoles = await getUserRoles(user.id);
  const roleLabel = userRoles.includes('STUDENT') ? 'دانشجو' : userRoles.includes('PROFESSOR') ? 'استاد' : 'کارمند';

  log.info('account_linked', { channel, userId: user.id, chatId, role: roleLabel });

  await sendMessage(channel, chatId,
    `✅ حساب شما متصل شد!\n\nنام: ${user.firstName} ${user.lastName}\nنقش: ${roleLabel}\n\nدستورات:\n/status — وضعیت کلی\n/grades — نمرات\n/enrollment — انتخاب واحد\n/help — راهنما`
  );
}

async function handleHelp(channel: MessengerChannel, chatId: string) {
  await sendMessage(channel, chatId,
    'راهنمای بات دانشگاه آفاق\n\n' +
    'دستورات:\n' +
    '/start — اتصال حساب (با کد ملی + رمز عبور)\n' +
    '/status — وضعیت کلی\n' +
    '/grades — نمرات آخرین ترم\n' +
    '/enrollment — وضعیت انتخاب واحد\n' +
    '/unlink — قطع اتصال\n' +
    '/help — راهنما\n\n' +
    'اعلان‌های خودکار:\n' +
    'ثبت نمره، انتخاب واحد، مشروطی، سنوات و اعلانات آموزشی'
  );
}

async function handleUnlink(channel: MessengerChannel, chatId: string) {
  const user = await findUserByChatId(channel, chatId);
  if (!user) { await sendMessage(channel, chatId, 'حسابی متصل نیست.'); return; }
  await db.delete(notification_channels).where(and(
    eq(notification_channels.userId, user.id),
    eq(notification_channels.channel, channel),
  ));
  log.info('account_unlinked', { channel, userId: user.id, chatId });
  await sendMessage(channel, chatId, 'اتصال قطع شد.\nبرای اتصال مجدد /start بزنید.');
}

async function handleStatus(channel: MessengerChannel, chatId: string) {
  const user = await findUserByChatId(channel, chatId);
  if (!user) { await sendMessage(channel, chatId, 'ابتدا حساب را متصل کنید:\n/start'); return; }

  const student = await findStudentByUserId(user.id);
  if (!student) {
    const r = await getUserRoles(user.id);
    const label = r.includes('PROFESSOR') ? 'استاد' : 'کارمند';
    await sendMessage(channel, chatId, `${user.firstName} ${user.lastName}\nنقش: ${label}\nبرای جزئیات به پورتال مراجعه کنید.`);
    return;
  }

  const statusMap: Record<string, string> = { ACTIVE: 'فعال', GRADUATED: 'فارغ‌التحصیل', SUSPENDED: 'تعلیق', WITHDRAWN: 'انصراف', PROBATION: 'مشروط' };
  const [cnt] = await db.select({ count: enrollments.id }).from(enrollments)
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .where(and(eq(enrollments.studentId, student.id), eq(enrollments.status, 'REGISTERED')));

  await sendMessage(channel, chatId,
    `وضعیت آموزشی — ${user.firstName} ${user.lastName}\n\n` +
    `کد دانشجویی: ${student.studentCode}\n` +
    `سال ورود: ${student.entryYear}\n` +
    `نیمسال: ${student.currentTermNo ?? '-'}\n` +
    `وضعیت: ${statusMap[student.status] ?? student.status}\n` +
    `دروس ثبت‌شده: ${cnt?.count ?? 0}`
  );
}

async function handleGrades(channel: MessengerChannel, chatId: string) {
  const user = await findUserByChatId(channel, chatId);
  if (!user) { await sendMessage(channel, chatId, 'ابتدا حساب را متصل کنید:\n/start'); return; }
  const student = await findStudentByUserId(user.id);
  if (!student) { await sendMessage(channel, chatId, 'اطلاعات دانشجویی یافت نشد.'); return; }

  const rows = await db.select({
    title: courses.title, code: courses.code, units: courses.units,
    grade: enrollments.gradeValue, gradeStatus: enrollments.gradeStatus,
  }).from(enrollments)
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(eq(enrollments.studentId, student.id));

  if (!rows.length) { await sendMessage(channel, chatId, 'هنوز نمره‌ای ثبت نشده.'); return; }

  const gs: Record<string, string> = { PENDING: 'معلق', FINALIZED: 'نهایی', CONTESTED: 'معترض' };
  let text = `نمرات ${user.firstName}:\n\n`;
  for (const r of rows) {
    text += `${r.code} — ${r.title}\n  واحد: ${r.units} | نمره: ${r.grade ?? '-'} | ${gs[r.gradeStatus] ?? r.gradeStatus}\n\n`;
  }
  await sendMessage(channel, chatId, text);
}

async function handleEnrollment(channel: MessengerChannel, chatId: string) {
  const user = await findUserByChatId(channel, chatId);
  if (!user) { await sendMessage(channel, chatId, 'ابتدا حساب را متصل کنید:\n/start'); return; }
  const student = await findStudentByUserId(user.id);
  if (!student) { await sendMessage(channel, chatId, 'اطلاعات دانشجویی یافت نشد.'); return; }

  const rows = await db.select({
    title: courses.title, code: courses.code, units: courses.units,
    status: enrollments.status, waitlistPosition: enrollments.waitlistPosition,
  }).from(enrollments)
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(and(eq(enrollments.studentId, student.id), eq(enrollments.status, 'REGISTERED')));

  if (!rows.length) { await sendMessage(channel, chatId, 'هیچ درسی ثبت نشده.'); return; }

  const sl: Record<string, string> = { REGISTERED: 'ثبت‌شده', WAITLISTED: 'لیست انتظار', DROPPED: 'حذف‌شده' };
  let total = 0;
  let text = `انتخاب واحد ${user.firstName}:\n\n`;
  for (const r of rows) {
    const u = Number(r.units ?? 0);
    total += u;
    const w = r.waitlistPosition ? ` (نوبت: ${r.waitlistPosition})` : '';
    text += `${r.code} — ${r.title}\n  واحد: ${u} | ${sl[r.status] ?? r.status}${w}\n\n`;
  }
  text += `مجموع: ${total} واحد`;
  await sendMessage(channel, chatId, text);
}

// ═══════════════════ ارسال خودکار ═══════════════════

/** ارسال پیام به یک کاربر */
export async function sendToUser(channel: MessengerChannel, userId: number, text: string): Promise<boolean> {
  const [ch] = await db.select().from(notification_channels)
    .where(and(
      eq(notification_channels.userId, userId),
      eq(notification_channels.channel, channel),
      eq(notification_channels.isActive, 1),
    )).limit(1);
  if (!ch?.address) return false;
  return sendMessage(channel, ch.address, text);
}

/** تنظیم وب‌هوک */
export async function setupMessengerWebhook(channel: MessengerChannel, webhookUrl: string): Promise<{ ok: boolean; error?: string }> {
  const { token, base, style } = await getConfig(channel);
  if (!token) return { ok: false, error: `${channel}_TOKEN تنظیم نشده.` };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    const url = style === 'EITAA' ? `${base}/${token}/setWebhook` : `${base}/bot${token}/setWebhook`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message'] }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const data = await r.json() as { ok: boolean; description?: string };
    return { ok: data.ok, error: data.description };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ═══════════════════ کپی توابع telegram-bot برای سازگاری ═══════════════════

/** @deprecated از sendToUser استفاده کنید */
export const sendTelegramToUser = sendToUser;

/** @deprecated از handleMessengerUpdate استفاده کنید */
export const handleTelegramUpdate = (body: Record<string, unknown>) => handleMessengerUpdate('TELEGRAM', body);

/** @deprecated از setupMessengerWebhook استفاده کنید */
export const setTelegramWebhook = (url: string) => setupMessengerWebhook('TELEGRAM', url);
