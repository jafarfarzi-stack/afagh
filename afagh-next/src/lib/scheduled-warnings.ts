import 'server-only';
import { and, eq, inArray, lte } from 'drizzle-orm';
import { db } from '@/db';
import { students, users } from '@/db/schema';
import { scheduled_warnings } from '@/db/schema-warnings';
import { notifyUserMultichannel, type Channel } from '@/lib/messaging';
import { getSetting } from '@/lib/settings';
import { createLogger } from '@/lib/logger';

const log = createLogger({ mod: 'scheduled-warnings' });

// ══════════════════════════════════════════════════════════════════════
//  هشدارهای زمان‌بندی‌شدهٔ دانشجو — موتور ارسال
//
//  سیستم قدیم (سما) هشدارهایی مثل یادآوری شهریه، غیبت زیاد و نقص مدارک
//  را در موعد مقرر می‌فرستاد. در آفاق این ماژول با اتصال به
//  notifyUserMultichannel همان کار را روی همهٔ کانال‌های فعال انجام می‌دهد:
//  داخل‌پورتال + پیامک + تلگرام/بله/ایتا/سروش/ای‌گپ (هرکدام فعال باشند).
//
//  اجرا: runPendingWarnings() توسط کرون /api/cron/scheduled-warnings
//  هر SCHED_WARNINGS_INTERVAL_MIN دقیقه (پیشفرض ۱۵).
// ══════════════════════════════════════════════════════════════════════

export const WARNING_STATUSES = ['pending', 'sent', 'cancelled'] as const;
export type WarningStatus = (typeof WARNING_STATUSES)[number];

export const WARNING_TYPES = [
  'TUITION_DEADLINE',    // یادآوری سررسید شهریه
  'LOW_ATTENDANCE',      // هشدار غیبت زیاد
  'MISSING_DOCS',        // نقص مدارک
  'EXAM_REMINDER',       // یادآوری امتحان
  'ENROLL_DEADLINE',     // مهلت انتخاب واحد
  'CUSTOM',              // هشدار دلخواه
] as const;
export type WarningType = (typeof WARNING_TYPES)[number];

export function isWarningType(v: string): v is WarningType {
  return (WARNING_TYPES as readonly string[]).includes(v);
}
export function isWarningStatus(v: string): v is WarningStatus {
  return (WARNING_STATUSES as readonly string[]).includes(v);
}

export const STATUS_BADGE: Record<WarningStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  sent: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-gray-200 text-gray-600',
};
export function statusBadgeClass(s: string): string {
  return STATUS_BADGE[s as WarningStatus] ?? 'bg-gray-100 text-gray-700';
}

export const WARNING_TYPE_LABEL: Record<WarningType, string> = {
  TUITION_DEADLINE: 'یادآوری شهریه',
  LOW_ATTENDANCE: 'هشدار غیبت',
  MISSING_DOCS: 'نقص مدارک',
  EXAM_REMINDER: 'یادآوری امتحان',
  ENROLL_DEADLINE: 'مهلت انتخاب واحد',
  CUSTOM: 'دلخواه',
};
export function warningTypeLabel(t: string | null): string {
  return t && isWarningType(t) ? WARNING_TYPE_LABEL[t] : (t || '—');
}

export const SCHED_WARNINGS_PAGE_SIZE = 50;

/** نتیجهٔ یک دور اجرای پویش */
export interface WarnRunResult {
  due: number;
  sent: number;
  skipped: number;
  failed: number;
}

/** گروه‌های کانال از تنظیم SCHED_WARN_CHANNELS (پیشفرض: همهٔ کانال‌های فعال) */
async function warnChannels(): Promise<Channel[] | undefined> {
  const raw = ((await getSetting('SCHED_WARN_CHANNELS')) || '').trim();
  if (!raw) return undefined; // undefined → خودِ notifyUserMultichannel همهٔ کانال‌های فعال را می‌فرستد
  const list = raw.split(',').map(c => c.trim().toUpperCase()).filter(Boolean) as Channel[];
  return list.length ? list : undefined;
}

/**
 * ارسال هشدارهای سررسیدشده — هر ردیفِ pending با sendAt <= NOW.
 * ضدتکرار: فقط ردیف‌های در همین اجرا «sent» می‌شوند؛ اگر ارسال شکست بخورد
 * ردیف pending می‌ماند تا دور بعد دوباره تلاش شود (failed اما pending).
 */
export async function runPendingWarnings(): Promise<WarnRunResult> {
  const now = new Date();
  const due = await db
    .select({
      id: scheduled_warnings.id,
      studentId: scheduled_warnings.studentId,
      warningType: scheduled_warnings.warningType,
      title: scheduled_warnings.title,
      message: scheduled_warnings.message,
      universityId: scheduled_warnings.universityId,
      userId: students.userId,
      studentName: users.firstName,
    })
    .from(scheduled_warnings)
    .innerJoin(students, eq(students.id, scheduled_warnings.studentId))
    .leftJoin(users, eq(users.id, students.userId))
    .where(and(
      eq(scheduled_warnings.status, 'pending'),
      lte(scheduled_warnings.sendAt, now),
    ))
    .limit(500);

  if (!due.length) return { due: 0, sent: 0, skipped: 0, failed: 0 };

  const channels = await warnChannels();
  const typeLabelOf = (t: string | null) => warningTypeLabel(t);
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const w of due) {
    if (!w.userId) {
      // دانشجو بدون کاربرِ متصل — قابل ارسال نیست؛ ردیف را لغو می‌کنیم تا هر دور دوباره تلاش نشود.
      await db.update(scheduled_warnings)
        .set({ status: 'cancelled', sentAt: now })
        .where(eq(scheduled_warnings.id, w.id));
      skipped++;
      continue;
    }
    const title = (w.title || '').trim() || typeLabelOf(w.warningType);
    const body = [title, (w.message || '').trim()].filter(Boolean).join('\n');
    try {
      await notifyUserMultichannel({
        userId: w.userId,
        eventCode: `SCHED_WARN_${(w.warningType || 'CUSTOM').slice(0, 20)}`,
        text: body,
        ...(channels ? { channels } : {}),
      });
      await db.update(scheduled_warnings)
        .set({ status: 'sent', sentAt: new Date() })
        .where(eq(scheduled_warnings.id, w.id));
      sent++;
    } catch (e) {
      failed++;
      log.warn('warn_send_failed', { id: w.id, studentId: w.studentId, error: (e as Error)?.message });
    }
  }

  const result: WarnRunResult = { due: due.length, sent, skipped, failed };
  log.info('sched_warnings_run', result);
  return result;
}

/** شمارش هشدارهای در انتظار (برای نوار ادمین) */
export async function pendingWarningsCount(universityId?: number | null): Promise<number> {
  const rows = await db
    .select({ id: scheduled_warnings.id })
    .from(scheduled_warnings)
    .where(and(
      eq(scheduled_warnings.status, 'pending'),
      universityId ? eq(scheduled_warnings.universityId, universityId) : undefined,
    ))
    .limit(1000);
  return rows.length;
}

/** لغو گروهی هشدارهای در انتظارِ یک دانشجو (مثلاً پس از پرداخت شهریه) */
export async function cancelWarningsForStudent(studentId: number, type?: WarningType): Promise<number> {
  const rows = await db
    .select({ id: scheduled_warnings.id })
    .from(scheduled_warnings)
    .where(and(
      eq(scheduled_warnings.studentId, studentId),
      eq(scheduled_warnings.status, 'pending'),
      type ? eq(scheduled_warnings.warningType, type) : undefined,
    ));
  if (!rows.length) return 0;
  await db.update(scheduled_warnings)
    .set({ status: 'cancelled' })
    .where(inArray(scheduled_warnings.id, rows.map(r => r.id)));
  return rows.length;
}
