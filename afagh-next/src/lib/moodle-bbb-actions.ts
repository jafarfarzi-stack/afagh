'use server';

// اکشن سروری ورود به کلاس مجازی — کلید مخفی BBB هرگز به مرورگر فرستاده نمی‌شود.
//
// 🔒 نقش و نام از سمت سرور تعیین می‌شوند، نه از payload کلاینت:
//    پیش‌تر امضای اکشن `{meetingId, fullName, role}` بود و هر کاربر واردشده
//    (حتی دانشجو) می‌توانست با فراخوانی مستقیم اکشن، `role:'MODERATOR'` بفرستد و
//    URL امضاشده با رمز مدیر اتاق بگیرد (ورود به اتاق فرمان هر کلاس + جعل نام).
//    اکنون: نام از نشست، و MODERATOR فقط برای استادِ همان ارائه (یا نقش‌های
//    آموزشی/مدیریتی پشتیبان) صادر می‌شود؛ در غیر این صورت ATTENDEE.
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { course_offerings, offering_professors, virtual_classrooms } from '@/db/schema';
import { getSessionUser, getStaffByUser } from '@/lib/auth';
import { getBigBlueButtonJoinUrl } from '@/lib/moodle-bbb';

/** نقش‌هایی که برای پشتیبانی کلاس‌ها مجاز به ورود به‌عنوان مدیر اتاق‌اند */
const SUPPORT_ROLES = ['ADMIN', 'VICE_EDU', 'EDU_EXPERT', 'DEP_HEAD'];

export async function joinVirtualClassAction(params: {
  meetingId: string;
}): Promise<{ ok: boolean; url: string; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, url: '', error: 'ابتدا وارد سامانه شوید.' };

  const meetingId = String(params?.meetingId ?? '').trim();
  if (!meetingId) return { ok: false, url: '', error: 'شناسهٔ جلسه نامعتبر است.' };

  let role: 'MODERATOR' | 'ATTENDEE' = 'ATTENDEE';
  try {
    const staff = await getStaffByUser(user.id);
    if (staff) {
      const [room] = await db
        .select({ offeringId: virtual_classrooms.courseOfferingId })
        .from(virtual_classrooms)
        .where(eq(virtual_classrooms.bbbMeetingId, meetingId))
        .limit(1);

      if (room?.offeringId) {
        const [off] = await db
          .select({ professorId: course_offerings.professorId })
          .from(course_offerings)
          .where(eq(course_offerings.id, room.offeringId))
          .limit(1);
        if (off?.professorId === staff.id) {
          role = 'MODERATOR';
        } else {
          const [co] = await db
            .select({ id: offering_professors.id })
            .from(offering_professors)
            .where(and(
              eq(offering_professors.offeringId, room.offeringId),
              eq(offering_professors.staffId, staff.id),
            ))
            .limit(1);
          if (co) role = 'MODERATOR';
        }
      }

      if (user.roles.some(r => SUPPORT_ROLES.includes(r))) role = 'MODERATOR';
    }
  } catch {
    /* در نبود تطبیق، نقش محافظه‌کارانهٔ ATTENDEE می‌ماند */
  }

  return getBigBlueButtonJoinUrl({ meetingId, fullName: user.name, role });
}
