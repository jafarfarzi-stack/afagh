import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, roles, staff, user_roles, users } from '@/db/schema';
import { notifyUserMultichannel } from '@/lib/messaging';

/**
 * ارسال خودکار «درخواست اعلام حضور» به همهٔ اساتید — وقتی ادمین
 * AVAILABILITY_TERM_MODE را روی NEXT میگذارد (درخواست ۱۴۰۵/۰۸/۲۸).
 *
 * ترمِ آیندهٔ هر دانشگاه = اولین ترم بعد از ترمِ فعال بر اساس sortOrder
 * (مثلاً ۱۴۰۲۱ بعد از ۱۴۰۱۵). اطلاعیه فقط درونبرنامهای است (بدون SMS)
 * تا ارسال گروهی هزینه/پیامک نریزد؛ کانالهای بیرونی مسیر خودشان را دارند.
 * خروجی: تعداد اساتیدی که اطلاعیه برایشان ثبت شد.
 */
export async function notifyAvailabilityNextTerm(): Promise<number> {
  const terms = await db
    .select()
    .from(academic_terms)
    .orderBy(asc(academic_terms.sortOrder), asc(academic_terms.id));

  // گروهبندی بر دانشگاه — ترتیب سراسری، ترتیبِ درونهر دانشگاه را هم حفظ میکند
  const groups = new Map<number, typeof terms>();
  for (const t of terms) {
    if (!t.universityId) continue;
    const arr = groups.get(t.universityId) ?? [];
    arr.push(t);
    groups.set(t.universityId, arr);
  }
  const nextByUni = new Map<number, string>();
  for (const [uniId, arr] of groups) {
    const idx = arr.findIndex(t => t.isCurrent === 1);
    const next = idx >= 0 ? arr[idx + 1] : undefined;
    if (next) nextByUni.set(uniId, next.title);
  }
  if (nextByUni.size === 0) return 0;

  // اساتید (نقش PROFESSOR) + دانشگاهِ هر استاد
  const profs = await db
    .selectDistinct({ userId: users.id, uniId: staff.universityId })
    .from(user_roles)
    .innerJoin(roles, eq(roles.id, user_roles.roleId))
    .innerJoin(users, eq(users.id, user_roles.userId))
    .leftJoin(staff, eq(staff.userId, users.id))
    .where(eq(roles.code, 'PROFESSOR'));

  let sent = 0;
  for (const p of profs) {
    const title = p.uniId ? nextByUni.get(p.uniId) : undefined;
    const termPart = title ? ` «${title}»` : ' ترم آینده';
    try {
      await notifyUserMultichannel({
        userId: p.userId,
        eventCode: 'AVAILABILITY_REQUEST',
        text: `📢 درخواست اعلام حضور: لطفاً ماتریس ساعات حضور خود را برای${termPart} در بخش «اعلام حضور» پنل استاد تکمیل کنید.`,
        channels: ['INAPP'],
      });
      sent++;
    } catch {
      // خطای یک اطلاعیه نباید بقیه را متوقف کند
    }
  }
  return sent;
}
