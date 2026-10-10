import 'server-only';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms,
  course_offerings,
  enrollments,
  notification_deliveries,
  offering_professors,
  staff,
  students,
  users,
} from '@/db/schema';
import { getSetting } from '@/lib/settings';
import { notifyUserMultichannel, type Channel } from '@/lib/messaging';
import { createLogger } from '@/lib/logger';

const log = createLogger({ mod: 'cron.greetings' });

export interface GreetResult {
  birthdays: { found: number; sent: number; skipped: number };
  termStarts: { terms: number; sent: number; skipped: number };
}

/**
 * متن یک پیام کلی از تنظیمات (قابل‌ویرایش در تنظیمات ← پیامک و ربات‌ها).
 * اگر مدیر چیزی ننوشته باشد، همان متن پیش‌فرضِ تعریف‌شده می‌آید.
 * جای‌نگهدارها ({name} و {term}) با مقدار واقعی پر می‌شوند.
 */
async function greetingText(
  key: 'GREET_BIRTHDAY_TEXT' | 'GREET_TERM_TEXT',
  vars: Record<string, string>,
): Promise<string> {
  let t = '';
  try {
    t = (await getSetting(key)).trim();
  } catch {
    t = '';
  }
  if (!t) {
    t = key === 'GREET_BIRTHDAY_TEXT'
      ? '🎂 {name} عزیز، تولدت مبارک! دانشگاه آفاق برایت سالی سرشار از موفقیت آرزو می‌کند.'
      : '🎓 سال تحصیلی جدید ({term}) آغاز شد! دانشگاه آفاق نیمسالی موفق برایتان آرزو می‌کند. برنامهٔ کلاسی خود را در پورتال ببینید.';
  }
  for (const [k, v] of Object.entries(vars)) t = t.split(`{${k}}`).join(v);
  return t;
}

/**
 * تبریک تولد روزانه: کاربران فعال که ماه/روز تولدشان (میلادی) با امروز می‌خواند.
 * ضدتکرار: هر کاربر هر روز فقط یک‌بار (eventCode=BIRTHDAY).
 */
async function runBirthdayGreetings(): Promise<GreetResult['birthdays']> {
  const sentToday = await db
    .select({ userId: notification_deliveries.userId })
    .from(notification_deliveries)
    .where(and(
      eq(notification_deliveries.eventCode, 'BIRTHDAY'),
      gte(notification_deliveries.createdAt, sql`CURRENT_DATE`),
    ));
  const done = new Set(sentToday.map(r => r.userId));

  const cands = (await db
    .select({ id: users.id, firstName: users.firstName })
    .from(users)
    .where(and(
      eq(users.isActive, 1),
      sql`to_char(${users.birthDate}, 'MM-DD') = to_char(NOW(), 'MM-DD')`,
    ))
    .limit(5000)) as { id: number; firstName: string | null }[];

  let sent = 0;
  let skipped = 0;
  const tpl = await greetingText('GREET_BIRTHDAY_TEXT', {});
  for (const u of cands) {
    if (done.has(u.id)) {
      skipped++;
      continue;
    }
    const name = (u.firstName ?? '').trim() || 'دوست عزیز';
    await notifyUserMultichannel({
      userId: u.id,
      eventCode: 'BIRTHDAY',
      text: tpl.split('{name}').join(name),
    });
    sent++;
  }
  return { found: cands.length, sent, skipped };
}

/**
 * تبریک شروع ترم انبوه: ترم‌هایی که تاریخ شروع کلاس‌شان امروز است.
 * گیرندگان (فقط این دو گروه):
 *   • دانشجویانِ در حال تحصیلِ همین ترم (انتخاب واحد کرده و status=ACTIVE)
 *   • استادانِ مدرسِ همین ترم
 * مبنا «ارائه‌های همان ترم» است؛ دانش‌آموختگان، انصرافی‌ها و کسانی که در
 * این ترم درگیر نیستند پیامی نمی‌گیرند.
 * کانال‌ها از تنظیم GREET_TERM_CHANNELS (پیش‌فرض فقط INAPP تا هزینهٔ پیامک نتراشد).
 * ضدتکرار به‌ازای هر کاربر+ترم (eventCode=TERM_START_<termId>).
 */
async function runTermStartGreetings(): Promise<GreetResult['termStarts']> {
  const rawChannels = ((await getSetting('GREET_TERM_CHANNELS')) || 'INAPP').toUpperCase();
  const channels = rawChannels.split(',').map(c => c.trim()).filter(Boolean) as Channel[];

  const terms = (await db
    .select({ id: academic_terms.id, universityId: academic_terms.universityId, title: academic_terms.title })
    .from(academic_terms)
    .where(and(
      sql`${academic_terms.startDate}::date = CURRENT_DATE`,
      inArray(academic_terms.termType, ['NORMAL', 'SUMMER']),
    ))
    .limit(20)) as { id: number; universityId: number | null; title: string }[];

  let sent = 0;
  let skipped = 0;
  for (const t of terms) {
    if (!t.universityId) continue;
    const code = `TERM_START_${t.id}`;
    const doneRows = await db
      .select({ userId: notification_deliveries.userId })
      .from(notification_deliveries)
      .where(and(
        eq(notification_deliveries.eventCode, code),
        gte(notification_deliveries.createdAt, sql`CURRENT_DATE - INTERVAL '2 days'`),
      ));
    const done = new Set(doneRows.map(r => r.userId));

    // ── گیرندگان: دانشجویانِ در حال تحصیلِ ترم + استادانِ مدرسِ همان ترم ──
    // دقیقاً همان دو گروهی که در آن لحظه درگیر ترم‌اند:
    //   دانشجو → در این ترم انتخاب واحد کرده و وضعیتش ACTIVE است
    //   استاد  → در این ترم درسی ارائه می‌کند
    // با JOIN مستقیم روی ارائه‌های همان ترم (نه کشیدن هزاران شناسه به حافظه).
    const stuMembers = (await db
      .selectDistinct({ id: users.id })
      .from(students)
      .innerJoin(enrollments, eq(enrollments.studentId, students.id))
      .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
      .innerJoin(users, eq(users.id, students.userId))
      .where(and(
        eq(course_offerings.termId, t.id),
        eq(students.status, 'ACTIVE'),
        eq(users.isActive, 1),
      ))
      .limit(60000)) as { id: number }[];

    // استادانِ مدرسِ همین ترم
    const profMembers = (await db
      .selectDistinct({ id: users.id })
      .from(staff)
      .innerJoin(offering_professors, eq(offering_professors.staffId, staff.id))
      .innerJoin(course_offerings, eq(course_offerings.id, offering_professors.offeringId))
      .innerJoin(users, eq(users.id, staff.userId))
      .where(and(
        eq(course_offerings.termId, t.id),
        eq(users.isActive, 1),
      ))
      .limit(60000)) as { id: number }[];

    const allMembers = [...stuMembers, ...profMembers];
    const tpl = await greetingText('GREET_TERM_TEXT', { term: t.title });
    for (const m of allMembers) {
      if (done.has(m.id)) {
        skipped++;
        continue;
      }
      done.add(m.id); // یک نفر اگر هم دانشجو و هم استادِ ترم باشد، یک‌بار پیام بگیرد
      await notifyUserMultichannel({
        userId: m.id,
        eventCode: code,
        text: tpl,
        channels,
      });
      sent++;
    }
    log.info('term_start_greeted', { termId: t.id, sent, students: stuMembers.length, professors: profMembers.length });
  }
  return { terms: terms.length, sent, skipped };
}

export async function runGreetingScans(): Promise<GreetResult> {
  const birthdays = await runBirthdayGreetings().catch(e => {
    log.error('birthday_scan_failed', { error: (e as Error).message });
    return { found: 0, sent: 0, skipped: 0 };
  });
  const termStarts = await runTermStartGreetings().catch(e => {
    log.error('termstart_scan_failed', { error: (e as Error).message });
    return { terms: 0, sent: 0, skipped: 0 };
  });
  return { birthdays, termStarts };
}
