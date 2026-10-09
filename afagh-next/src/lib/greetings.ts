import 'server-only';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, notification_deliveries, users } from '@/db/schema';
import { getSetting } from '@/lib/settings';
import { notifyUserMultichannel, type Channel } from '@/lib/messaging';
import { createLogger } from '@/lib/logger';

const log = createLogger({ mod: 'cron.greetings' });

export interface GreetResult {
  birthdays: { found: number; sent: number; skipped: number };
  termStarts: { terms: number; sent: number; skipped: number };
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
  for (const u of cands) {
    if (done.has(u.id)) {
      skipped++;
      continue;
    }
    const name = (u.firstName ?? '').trim();
    await notifyUserMultichannel({
      userId: u.id,
      eventCode: 'BIRTHDAY',
      text: name
        ? `🎂 ${name} عزیز، تولدت مبارک! دانشگاه آفاق برایت سالی سرشار از موفقیت آرزو می‌کند.`
        : '🎂 تولدت مبارک! دانشگاه آفاق برایت سالی سرشار از موفقیت آرزو می‌کند.',
    });
    sent++;
  }
  return { found: cands.length, sent, skipped };
}

/**
 * تبریک شروع ترم انبوه: ترم‌هایی که تاریخ شروع کلاس‌شان امروز است.
 * گیرندگان: همهٔ کاربران فعال همان دانشگاه. کانال‌ها از تنظیم
 * GREET_TERM_CHANNELS (پیش‌فرض فقط INAPP تا هزینهٔ پیامک نتراشد).
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

    const members = (await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.isActive, 1), eq(users.universityId, t.universityId)))
      .limit(60000)) as { id: number }[];

    for (const m of members) {
      if (done.has(m.id)) {
        skipped++;
        continue;
      }
      await notifyUserMultichannel({
        userId: m.id,
        eventCode: code,
        text: `🎓 سال تحصیلی جدید (${t.title}) آغاز شد! دانشگاه آفاق نیمسالی موفق برایتان آرزو می‌کند. برنامهٔ کلاسی خود را در پورتال ببینید.`,
        channels,
      });
      sent++;
    }
    log.info('term_start_greeted', { termId: t.id, sent });
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
