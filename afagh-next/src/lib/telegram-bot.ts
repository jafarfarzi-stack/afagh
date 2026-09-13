import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { users, students, user_roles, roles, enrollments, course_offerings, courses, academic_terms, notification_channels } from '@/db/schema';
import { getSetting } from '@/lib/settings';
import { createLogger } from '@/lib/logger';
import { saveUserChannel } from '@/lib/messaging';
import { toJalaliFromDate } from '@/lib/calendar';

const log = createLogger({ mod: 'telegram-bot' });

// ═══════════════════════════════════════════════════════════════
//  بات تلگرام دانشگاه آفاق — پردازش پیام‌ها و دستورات
//
//  دانشجو با ارسال /start و کد ملی خود، حساب تلگرامش را
//  به پروفایل دانشگاهی متصل می‌کند. سپس می‌تواند با دستورات
//  مختلف وضعیت آموزشی خود را مشاهده کند.
// ═══════════════════════════════════════════════════════════════

export interface TelegramMessage {
  message_id: number;
  from: {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  chat: { id: number; type: string };
  text?: string;
  date: number;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

// ──────── وضعیت مکالمه (برای فرآیند /start) ────────

type ConversationState = 'idle' | 'awaiting_national_code';

const pendingConversations = new Map<number, ConversationState>();
const pendingVerification = new Map<number, { nationalCode: string; userId: number; firstName: string }>();

// ──────── ارسال پیام به تلگرام ────────

async function sendTelegramMessage(chatId: number, text: string): Promise<boolean> {
  const token = (await getSetting('TELEGRAM_TOKEN')).trim();
  if (!token) return false;
  const base = ((await getSetting('TELEGRAM_API_BASE')) || 'https://api.telegram.org').replace(/\/+$/, '');
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const r = await fetch(`${base}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return r.ok;
  } catch (e) {
    log.error('telegram_send_failed', { chatId, error: (e as Error).message });
    return false;
  }
}

// ──────── پیدا کردن کاربر از chat_id ────────

async function findUserByChatId(chatId: number) {
  const [ch] = await db.select().from(notification_channels)
    .where(and(
      eq(notification_channels.channel, 'TELEGRAM'),
      eq(notification_channels.address, String(chatId)),
      eq(notification_channels.isActive, 1),
    )).limit(1);
  if (!ch) return null;
  const [user] = await db.select().from(users).where(eq(users.id, ch.userId)).limit(1);
  return user ?? null;
}

// ──────── پیدا کردن دانشجو از userId ────────

async function findStudentByUserId(userId: number) {
  const [student] = await db.select().from(students).where(eq(students.userId, userId)).limit(1);
  return student ?? null;
}

// ──────── بررسی نقش کاربر ────────

async function getUserRoles(userId: number): Promise<string[]> {
  const rows = await db.select({ code: roles.code })
    .from(user_roles)
    .innerJoin(roles, eq(roles.id, user_roles.roleId))
    .where(eq(user_roles.userId, userId));
  return rows.map(r => r.code);
}

// ═══════════════════════════════════════════════════════════════
//  پردازش پیام دریافتی از تلگرام
// ═══════════════════════════════════════════════════════════════

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg || msg.chat.type !== 'private') return;
  const chatId = msg.chat.id;
  const text = msg.text?.trim() ?? '';

  if (text.startsWith('/start')) await handleStart(chatId, text);
  else if (text.startsWith('/help')) await handleHelp(chatId);
  else if (text.startsWith('/status')) await handleStatus(chatId);
  else if (text.startsWith('/grades')) await handleGrades(chatId);
  else if (text.startsWith('/enrollment') || text.startsWith('/register')) await handleEnrollment(chatId);
  else if (text.startsWith('/unlink')) await handleUnlink(chatId);
  else {
    const state = pendingConversations.get(chatId);
    if (state === 'awaiting_national_code') await handleNationalCodeInput(chatId, text);
    else await sendTelegramMessage(chatId, 'دستور ناشناخته. برای راهنما /help را ارسال کنید.');
  }
}

// ═════════════════════════════ حستورات ═══════════════════════════════

/**
 * /start — شروع فرآیند اتصال حساب تلگرام
 * اگر کد ملی همراه باشد، مستقیم پردازش می‌شود.
 */
async function handleStart(chatId: number, text: string) {
  const parts = text.split(/\s+/);
  if (parts.length > 1) {
    await handleLinkWithCode(chatId, parts[1]);
    return;
  }

  const user = await findUserByChatId(chatId);
  if (user) {
    const roles = await getUserRoles(user.id);
    const roleLabel = roles.includes('STUDENT') ? 'دانشجو' : roles.includes('PROFESSOR') ? 'استاد' : 'کارمند';
    await sendTelegramMessage(chatId,
      `سلام ${user.firstName} عزیز!\nشما قبلاً حساب خود را متصل کرده‌اید.\nنقش: ${roleLabel}\n\nدستورات موجود:\n/status — وضعیت کلی\n/grades — نمرات\n/enrollment — وضعیت انتخاب واحد\n/unlink — قطع اتصال\n/help — راهنما`
    );
    return;
  }

  pendingConversations.set(chatId, 'awaiting_national_code');
  await sendTelegramMessage(chatId,
    'سلام! به بات دانشگاه آفاق خوش آمدید.\n\n' +
    'برای اتصال حساب تلگرام خود، لطفاً کد ملی ۱۰ رقمی خود را ارسال کنید:'
  );
}

/**
 * پردازش ورودی کد ملی
 */
async function handleNationalCodeInput(chatId: number, text: string) {
  pendingConversations.delete(chatId);
  const code = text.replace(/\D/g, '');
  if (code.length !== 10) {
    await sendTelegramMessage(chatId, 'کد ملی باید ۱۰ رقم باشد. لطفاً دوباره تلاش کنید.\n/start');
    return;
  }
  await handleLinkWithCode(chatId, code);
}

/**
 * اتصال حساب تلگرام با کد ملی
 */
async function handleLinkWithCode(chatId: number, nationalCode: string) {
  const code = nationalCode.replace(/\D/g, '');
  if (code.length !== 10) {
    await sendTelegramMessage(chatId, 'کد ملی نامعتبر است. لطفاً ۱۰ رقم وارد کنید.');
    return;
  }

  const [user] = await db.select().from(users).where(eq(users.nationalCode, code)).limit(1);
  if (!user) {
    await sendTelegramMessage(chatId, 'کاربری با این کد ملی در سامانه یافت نشد.\nلطفاً از صحت کد ملی اطمینان حاصل کنید.');
    return;
  }

  if (!user.isActive) {
    await sendTelegramMessage(chatId, 'حساب شما غیرفعال است. با مدیر سامانه تماس بگیرید.');
    return;
  }

  await saveUserChannel(user.id, 'TELEGRAM', String(chatId));

  const userRoles = await getUserRoles(user.id);
  const roleLabel = userRoles.includes('STUDENT') ? 'دانشجو' : userRoles.includes('PROFESSOR') ? 'استاد' : 'کارمند';

  log.info('telegram_account_linked', { userId: user.id, chatId, role: roleLabel });

  await sendTelegramMessage(chatId,
    `حساب شما با موفقیت متصل شد!\n\n` +
    `نام: ${user.firstName} ${user.lastName}\n` +
    `نقش: ${roleLabel}\n\n` +
    `اکنون می‌توانید از دستورات زیر استفاده کنید:\n` +
    `/status — وضعیت کلی\n` +
    `/grades — نمرات\n` +
    `/enrollment — وضعیت انتخاب واحد\n` +
    `/help — راهنما`
  );
}

/**
 * /help — راهنما
 */
async function handleHelp(chatId: number) {
  await sendTelegramMessage(chatId,
    'راهنمای بات دانشگاه آفاق\n\n' +
    'دستورات:\n' +
    '/start — اتصال حساب (با کد ملی)\n' +
    '/status — مشاهده وضعیت کلی\n' +
    '/grades — مشاهده نمرات آخرین ترم\n' +
    '/enrollment — وضعیت انتخاب واحد\n' +
    '/unlink — قطع اتصال حساب تلگرام\n' +
    '/help — نمایش این راهنما\n\n' +
    'اعلان‌های خودکار:\n' +
    'ثبت نمره، انتخاب واحد، مشروطی، سنوات و اعلانات آموزشی به صورت خودکار ارسال می‌شوند.'
  );
}

/**
 * /unlink — قطع اتصال حساب
 */
async function handleUnlink(chatId: number) {
  const user = await findUserByChatId(chatId);
  if (!user) {
    await sendTelegramMessage(chatId, 'حسابی متصل نیست.');
    return;
  }
  await db.delete(notification_channels)
    .where(and(
      eq(notification_channels.userId, user.id),
      eq(notification_channels.channel, 'TELEGRAM'),
    ));
  pendingConversations.delete(chatId);
  log.info('telegram_account_unlinked', { userId: user.id, chatId });
  await sendTelegramMessage(chatId, 'اتصال حساب تلگرام شما قطع شد.\nبرای اتصال مجدد /start را ارسال کنید.');
}

/**
 * /status — وضعیت کلی دانشجو
 */
async function handleStatus(chatId: number) {
  const user = await findUserByChatId(chatId);
  if (!user) {
    await sendTelegramMessage(chatId, 'ابتدا حساب خود را متصل کنید:\n/start');
    return;
  }

  const student = await findStudentByUserId(user.id);
  if (!student) {
    const roles = await getUserRoles(user.id);
    if (roles.includes('PROFESSOR')) {
      await sendTelegramMessage(chatId,
        `استاد ${user.firstName} ${user.lastName}\n\nشما به عنوان استاد در سامانه ثبت شده‌اید.\nبرای مشاهده کلاس‌ها به پورتال مراجعه کنید.`
      );
    } else {
      await sendTelegramMessage(chatId,
        `${user.firstName} ${user.lastName} عزیز\nحساب شما در سامانه فعال است.\nبرای مشاهده جزئیات به پورتال مراجعه کنید.`
      );
    }
    return;
  }

  const jalali = toJalaliFromDate(new Date());
  const termLabel = `${jalali.jy}/${String(jalali.jm).padStart(2, '0')}`;

  const statusMap: Record<string, string> = {
    ACTIVE: 'فعال',
    GRADUATED: 'فارغ‌التحصیل',
    SUSPENDED: 'تعلیق',
    WITHDRAWN: 'انصراف',
    PROBATION: 'مشروط',
  };

  const [enrollCount] = await db.select({ count: enrollments.id })
    .from(enrollments)
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .where(and(
      eq(enrollments.studentId, student.id),
      eq(enrollments.status, 'REGISTERED'),
    ));

  await sendTelegramMessage(chatId,
    `وضعیت آموزشی — ${user.firstName} ${user.lastName}\n\n` +
    `کد دانشجویی: ${student.studentCode}\n` +
    `سال ورود: ${student.entryYear}\n` +
    `نیمسال جاری: ${student.currentTermNo ?? '-'}\n` +
    `وضعیت: ${statusMap[student.status] ?? student.status}\n` +
    `تعداد دروس ثبت‌نام‌شده: ${enrollCount?.count ?? 0}\n` +
    `tarikhچirsch: ${termLabel}`
  );
}

/**
 * /grades — نمرات آخرین ترم
 */
async function handleGrades(chatId: number) {
  const user = await findUserByChatId(chatId);
  if (!user) {
    await sendTelegramMessage(chatId, 'ابتدا حساب خود را متصل کنید:\n/start');
    return;
  }

  const student = await findStudentByUserId(user.id);
  if (!student) {
    await sendTelegramMessage(chatId, 'اطلاعات دانشجویی یافت نشد.');
    return;
  }

  const rows = await db.select({
    courseTitle: courses.title,
    courseCode: courses.code,
    units: courses.units,
    grade: enrollments.gradeValue,
    gradeStatus: enrollments.gradeStatus,
  })
    .from(enrollments)
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(eq(enrollments.studentId, student.id));

  if (!rows.length) {
    await sendTelegramMessage(chatId, 'هنوز نمره‌ای ثبت نشده است.');
    return;
  }

  const gradeStatusMap: Record<string, string> = {
    PENDING: 'معلق',
    FINALIZED: 'نهایی',
    CONTESTED: 'معترض',
  };

  let text = `نمرات ${user.firstName} ${user.lastName}:\n\n`;
  for (const r of rows) {
    const grade = r.grade != null ? String(r.grade) : '-';
    const status = gradeStatusMap[r.gradeStatus] ?? r.gradeStatus;
    text += `${r.courseCode} — ${r.courseTitle}\n`;
    text += `  واحد: ${r.units} | نمره: ${grade} | وضعیت: ${status}\n\n`;
  }

  await sendTelegramMessage(chatId, text);
}

/**
 * /enrollment — وضعیت انتخاب واحد
 */
async function handleEnrollment(chatId: number) {
  const user = await findUserByChatId(chatId);
  if (!user) {
    await sendTelegramMessage(chatId, 'ابتدا حساب خود را متصل کنید:\n/start');
    return;
  }

  const student = await findStudentByUserId(user.id);
  if (!student) {
    await sendTelegramMessage(chatId, 'اطلاعات دانشجویی یافت نشد.');
    return;
  }

  const rows = await db.select({
    courseTitle: courses.title,
    courseCode: courses.code,
    units: courses.units,
    status: enrollments.status,
    waitlistPosition: enrollments.waitlistPosition,
  })
    .from(enrollments)
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(and(
      eq(enrollments.studentId, student.id),
      eq(enrollments.status, 'REGISTERED'),
    ));

  if (!rows.length) {
    await sendTelegramMessage(chatId, 'هیچ درسی در نیمسال جاری ثبت نشده است.');
    return;
  }

  const statusLabel: Record<string, string> = {
    REGISTERED: 'ثبت‌شده',
    WAITLISTED: 'در لیست انتظار',
    DROPPED: 'حذف‌شده',
  };

  let totalUnits = 0;
  let text = `انتخاب واحد ${user.firstName} ${user.lastName}:\n\n`;
  for (const r of rows) {
    const u = Number(r.units ?? 0);
    totalUnits += u;
    const st = statusLabel[r.status] ?? r.status;
    const waitInfo = r.waitlistPosition ? ` (نوبت: ${r.waitlistPosition})` : '';
    text += `${r.courseCode} — ${r.courseTitle}\n`;
    text += `  واحد: ${u} | وضعیت: ${st}${waitInfo}\n\n`;
  }
  text += `مجموع واحدها: ${totalUnits}`;

  await sendTelegramMessage(chatId, text);
}

// ═══════════════════════════════════════════════════════════════
//  توابع عمومی برای ارسال پیام خودکار
// ═══════════════════════════════════════════════════════════════

/** ارسال پیام به یک کاربر خاص از طریق تلگرام (اگر متصل باشد) */
export async function sendTelegramToUser(userId: number, text: string): Promise<boolean> {
  const [ch] = await db.select().from(notification_channels)
    .where(and(
      eq(notification_channels.userId, userId),
      eq(notification_channels.channel, 'TELEGRAM'),
      eq(notification_channels.isActive, 1),
    )).limit(1);
  if (!ch?.address) return false;
  return sendTelegramMessage(Number(ch.address), text);
}

/** ارسال پیام به همه دانشجویان متصل به تلگرام */
export async function broadcastTelegram(text: string): Promise<{ sent: number; failed: number }> {
  const rows = await db.select({ address: notification_channels.address })
    .from(notification_channels)
    .where(and(
      eq(notification_channels.channel, 'TELEGRAM'),
      eq(notification_channels.isActive, 1),
    ));
  let sent = 0, failed = 0;
  for (const r of rows) {
    if (!r.address) continue;
    const ok = await sendTelegramMessage(Number(r.address), text);
    ok ? sent++ : failed++;
  }
  return { sent, failed };
}

/** تنظیم وب‌هوک تلگرام */
export async function setTelegramWebhook(webhookUrl: string): Promise<{ ok: boolean; error?: string }> {
  const token = (await getSetting('TELEGRAM_TOKEN')).trim();
  if (!token) return { ok: false, error: 'TELEGRAM_TOKEN تنظیم نشده است.' };
  const base = ((await getSetting('TELEGRAM_API_BASE')) || 'https://api.telegram.org').replace(/\/+$/, '');
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    const r = await fetch(`${base}/bot${token}/setWebhook`, {
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
