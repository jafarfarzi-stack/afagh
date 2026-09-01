'use server';

// اکشن سروری ورود به کلاس مجازی — کلید مخفی BBB هرگز به مرورگر فرستاده نمی‌شود
import { getSessionUser } from '@/lib/auth';
import { getBigBlueButtonJoinUrl } from '@/lib/moodle-bbb';

export async function joinVirtualClassAction(params: {
  meetingId: string;
  fullName: string;
  role: 'MODERATOR' | 'ATTENDEE';
}): Promise<{ ok: boolean; url: string; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, url: '', error: 'ابتدا وارد سامانه شوید.' };
  return getBigBlueButtonJoinUrl(params);
}
