import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { users, students, enrollments, course_offerings, courses, notification_channels } from '@/db/schema';
import { sendToUser, type MessengerChannel } from '@/lib/messenger-bot';
import { notifyUserMultichannel, type Channel } from '@/lib/messaging';
import { getSetting } from '@/lib/settings';
import { createLogger } from '@/lib/logger';
import { toJalaliFromDate } from '@/lib/calendar';

const log = createLogger({ mod: 'messenger.notifications' });

// ═══════════════════════════════════════════════════════════════
//  اعلان‌های خودکار پیام‌رسان‌ها — تلگرام / بله / سروش / ایتا / ای‌گپ
//
//  این ماژول توابعی را فراهم می‌کند که توسط motorهای مختلف
//  (enroll-engine, regulations-engine, و...) فراخوانی شوند
//  تا پیام‌های خودکار ارسال شوند.
// ═══════════════════════════════════════════════════════════════

function jalaliStr(date: Date = new Date()): string {
  const j = toJalaliFromDate(date);
  return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
}

/** ارسال پیام به همهٔ پیام‌رسان‌های فعال کاربر */
async function notifyAllChannels(userId: number, text: string): Promise<void> {
  const channels: MessengerChannel[] = ['TELEGRAM', 'BALE', 'SOROUSH', 'EITAA', 'IGAP'];
  for (const ch of channels) {
    try { await sendToUser(ch, userId, text); } catch { /* ادامه بده */ }
  }
}

// ─────────────────────── انتخاب واحد ───────────────────────

/** ارسال اعلان تأیید انتخاب واحد به دانشجو */
export async function notifyEnrollmentDone(input: {
  userId: number;
  registered: string[];
  waitlisted: string[];
}) {
  const { registered, waitlisted } = input;
  if (!registered.length && !waitlisted.length) return;

  let text = `انتخاب واحد تأیید شد.\n\n`;
  if (registered.length) {
    text += `دروس ثبت‌نام‌شده:\n`;
    for (const r of registered) text += `  - ${r}\n`;
  }
  if (waitlisted.length) {
    text += `\nلیست انتظار:\n`;
    for (const w of waitlisted) text += `  - ${w}\n`;
  }
  text += `\nتاریخ: ${jalaliStr()}\nبرای مشاهده جزئیات /enrollment را ارسال کنید.`;

  try {
    await notifyAllChannels(input.userId, text);
  } catch (e) {
    log.error('notify_enrollment_failed', { userId: input.userId, error: (e as Error).message });
  }
}

// ─────────────────────── ثبت نمره ───────────────────────

/** ارسال اعلان ثبت نمره به دانشجو */
export async function notifyGradeSubmitted(input: {
  userId: number;
  courseTitle: string;
  courseCode: string;
  grade: string | number | null;
  deadlineDate?: string;
}) {
  const gradeStr = input.grade != null ? String(input.grade) : 'ثبت نشده';
  let text = `نمره درس ${input.courseTitle} (${input.courseCode}) ثبت شد.\n\n`;
  text += `نمره: ${gradeStr}\n`;
  if (input.deadlineDate) {
    text += `مهلت اعتراض: ${input.deadlineDate}\n`;
  }
  text += `\nبرای مشاهده همه نمرات /grades را ارسال کنید.`;

  try {
    await notifyAllChannels(input.userId, text);
  } catch (e) {
    log.error('notify_grade_telegram_failed', { userId: input.userId, error: (e as Error).message });
  }
}

// ─────────────────────── مشروطی ───────────────────────

/** ارسال اخطار مشروطی به دانشجو */
export async function notifyProbationWarning(input: {
  userId: number;
  semesterGpa: number;
  totalGpa: number;
  failedCourses?: string[];
}) {
  let text = `⚠️ اخطار آموزشی\n\n`;
  text += `دوست گرامی، وضعیت تحصیلی شما تغییر کرده است:\n\n`;
  text += `معدل نیمسال: ${input.semesterGpa}\n`;
  text += `معدل کل: ${input.totalGpa}\n`;
  if (input.failedCourses?.length) {
    text += `\nدروس مردودی:\n`;
    for (const c of input.failedCourses) text += `  - ${c}\n`;
  }
  text += `\nلطفاً جهت پیگیری به اداره آموزش مراجعه فرمایید.`;

  try {
    await notifyAllChannels(input.userId, text);
  } catch (e) {
    log.error('notify_probation_telegram_failed', { userId: input.userId, error: (e as Error).message });
  }
}

// ─────────────────────── سنوات ───────────────────────

/** ارسال اخطار سنوات تحصیلی */
export async function notifyYearsWarning(input: {
  userId: number;
  currentTermNo: number;
  maxTerms: number;
  remainingTerms: number;
}) {
  let text = `⚠️ اخطار سنوات تحصیلی\n\n`;
  text += `نیمسال فعلی: ${input.currentTermNo} از ${input.maxTerms}\n`;
  text += `نیمسال‌های باقی‌مانده: ${input.remainingTerms}\n`;
  if (input.remainingTerms <= 1) {
    text += `\n⚠️ توجه: شما در آخرین نیمسال مجاز تحصیل خود هستید!\n`;
  }
  text += `\nبرای پیگیری با اداره آموزش تماس بگیرید.`;

  try {
    await notifyAllChannels(input.userId, text);
  } catch (e) {
    log.error('notify_years_telegram_failed', { userId: input.userId, error: (e as Error).message });
  }
}

// ─────────────────────── اعلانات آموزشی ───────────────────────

/** ارسال اعلان آموزشی به یک دانشجو */
export async function notifyAcademicAnnouncement(input: {
  userId: number;
  title: string;
  body: string;
}) {
  let text = `📢 ${input.title}\n\n${input.body}`;
  text += `\n\nتاریخ: ${jalaliStr()}`;

  try {
    await notifyAllChannels(input.userId, text);
  } catch (e) {
    log.error('notify_announcement_telegram_failed', { userId: input.userId, error: (e as Error).message });
  }
}

/** ارسال اعلان آموزشی به همه دانشجویان */
export async function broadcastAcademicAnnouncement(input: {
  title: string;
  body: string;
}): Promise<{ sent: number; failed: number }> {
  // گرفتن همه کاربران دانشجو که تلگرام فعال دارند
  const rows = await db.select({ address: notification_channels.address, userId: notification_channels.userId })
    .from(notification_channels)
    .innerJoin(users, eq(users.id, notification_channels.userId))
    .where(and(
      eq(notification_channels.channel, 'TELEGRAM'),
      eq(notification_channels.isActive, 1),
      eq(users.isActive, 1),
    ));

  let text = `📢 ${input.title}\n\n${input.body}\n\nتاریخ: ${jalaliStr()}`;
  let sent = 0, failed = 0;

  for (const r of rows) {
    if (!r.address) continue;
    try {
      await notifyAllChannels(r.userId, text);
      sent++;
    } catch {
      failed++;
    }
  }

  log.info('broadcast_announcement', { title: input.title, sent, failed });
  return { sent, failed };
}

// ─────────────────────── وضعیت سفارش/درخواست ───────────────────────

/** ارسال اعلان تغییر وضعیت درخواست دانشجو */
export async function notifyRequestStatus(input: {
  userId: number;
  requestType: string;
  status: 'APPROVED' | 'REJECTED' | 'RETURNED';
  trackingCode?: string;
}) {
  const statusLabels: Record<string, string> = {
    APPROVED: 'تأیید شد',
    REJECTED: 'رد شد',
    RETURNED: 'برگشت داده شد',
  };

  let text = `تغییر وضعیت درخواست\n\n`;
  text += `نوع درخواست: ${input.requestType}\n`;
  text += `وضعیت: ${statusLabels[input.status]}\n`;
  if (input.trackingCode) {
    text += `کد رهگیری: ${input.trackingCode}\n`;
  }
  text += `\nتاریخ: ${jalaliStr()}`;

  try {
    await notifyAllChannels(input.userId, text);
  } catch (e) {
    log.error('notify_request_telegram_failed', { userId: input.userId, error: (e as Error).message });
  }
}

// ─────────────────────── حذف درس ───────────────────────

/** ارسال اعلان حذف درس */
export async function notifyCourseDropped(input: {
  userId: number;
  courseTitle: string;
  courseCode: string;
}) {
  let text = `حذف درس\n\n`;
  text += `درس ${input.courseTitle} (${input.courseCode}) از لیست انتخاب واحد شما حذف شد.\n`;
  text += `\nتاریخ: ${jalaliStr()}`;

  try {
    await notifyAllChannels(input.userId, text);
  } catch (e) {
    log.error('notify_drop_telegram_failed', { userId: input.userId, error: (e as Error).message });
  }
}

// ─────────────────────── لیست انتظار ───────────────────────

/** ارسال اعلان ارتقا از لیست انتظار */
export async function notifyWaitlistPromoted(input: {
  userId: number;
  courseTitle: string;
  courseCode: string;
}) {
  let text = `ارتقا از لیست انتظار\n\n`;
  text += `دانشجوی گرامی، شما از لیست انتظار درس ${input.courseTitle} (${input.courseCode}) خارج شدید و ثبت‌نام شما نهایی شد.\n`;
  text += `\nتاریخ: ${jalaliStr()}\nبرای مشاهده /enrollment را ارسال کنید.`;

  try {
    await notifyAllChannels(input.userId, text);
  } catch (e) {
    log.error('notify_waitlist_telegram_failed', { userId: input.userId, error: (e as Error).message });
  }
}

// ─────────────────────── یادآوری مالی ───────────────────────

/** ارسال یادآوری چک/شهریه */
export async function notifyFinanceReminder(input: {
  userId: number;
  type: 'CHEQUE_DUE' | 'TUITION_DUE' | 'PAYMENT_RECEIVED';
  amount?: string;
  dueDate?: string;
  details?: string;
}) {
  const typeLabels: Record<string, string> = {
    CHEQUE_DUE: 'یادآوری سررسید چک',
    TUITION_DUE: 'یادآوری شهریه',
    PAYMENT_RECEIVED: 'تأیید پرداخت',
  };

  let text = `${typeLabels[input.type]}\n\n`;
  if (input.amount) text += `مبلغ: ${input.amount}\n`;
  if (input.dueDate) text += `سررسید: ${input.dueDate}\n`;
  if (input.details) text += `${input.details}\n`;
  text += `\nتاریخ: ${jalaliStr()}`;

  try {
    await notifyAllChannels(input.userId, text);
  } catch (e) {
    log.error('notify_finance_telegram_failed', { userId: input.userId, error: (e as Error).message });
  }
}
