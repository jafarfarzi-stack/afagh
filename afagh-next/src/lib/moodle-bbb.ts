import 'server-only';
import crypto from 'crypto';
import { getBbbConfig } from '@/lib/settings';

export interface VirtualClassSession {
  courseId: number;
  courseCode: string;
  courseTitle: string;
  professorName: string;
  meetingId: string;
  startTime: string;
  endTime: string;
  isRunning: boolean;
  activeParticipantsCount: number;
  recordingsCount: number;
}

/**
 * تولید Checksum امن برای درخواست‌های بیگ‌بلوباتن طبق استاندارد API.
 * کلید مخفی از پیکربندی سامانه (پنل مدیر ← ENV) خوانده می‌شود و هرگز در کد ثابت نیست.
 */
export function generateBbbChecksum(callName: string, queryString: string, secret: string): string {
  const raw = `${callName}${queryString}${secret}`;
  return crypto.createHash('sha1').update(raw).digest('hex');
}

/**
 * دریافت لینک مستقیم ورود به جلسه آنلاین بیگ‌بلوباتن با SSO
 */
export async function getBigBlueButtonJoinUrl({
  meetingId,
  fullName,
  role,
}: {
  meetingId: string;
  fullName: string;
  role: 'MODERATOR' | 'ATTENDEE';
}): Promise<{ ok: boolean; url: string; error?: string }> {
  const cfg = await getBbbConfig();
  if (!cfg.configured) {
    return {
      ok: false,
      url: '',
      error: 'سرویس کلاس مجازی پیکربندی نشده است — پنل مدیر ← پیکربندی سامانه ← کلاس مجازی',
    };
  }

  const queryParams = new URLSearchParams({
    fullName,
    meetingID: meetingId,
    password: role === 'MODERATOR' ? cfg.moderatorPw : cfg.attendeePw,
    redirect: 'true',
    joinViaHtml5: 'true',
  });
  if (cfg.autoRecord) queryParams.set('record', 'true');

  const queryString = queryParams.toString();
  const checksum = generateBbbChecksum('join', queryString, cfg.secret);

  return { ok: true, url: `${cfg.url}/join?${queryString}&checksum=${checksum}` };
}

/**
 * لیست جلسات آنلاین فعال امروز بر اساس چارت درسی
 */
export async function getTodayLiveClasses(): Promise<VirtualClassSession[]> {
  return [
    {
      courseId: 101,
      courseCode: '۱۱۱۲۱۰۱',
      courseTitle: 'ریاضی عمومی ۱ (کلاس مجازی)',
      professorName: 'دکتر جمیل احمدی',
      meetingId: 'AFAGH-ROOM-MATH101',
      startTime: '۰۸:۳۰',
      endTime: '۱۰:۳۰',
      isRunning: true,
      activeParticipantsCount: 28,
      recordingsCount: 8,
    },
    {
      courseId: 102,
      courseCode: '۱۱۱۲۱۰۳',
      courseTitle: 'مبانی برنامه‌نویسی و وب',
      professorName: 'دکتر سارا رضایی',
      meetingId: 'AFAGH-ROOM-PROG103',
      startTime: '۱۰:۴۵',
      endTime: '۱۲:۴۵',
      isRunning: true,
      activeParticipantsCount: 32,
      recordingsCount: 10,
    },
    {
      courseId: 103,
      courseCode: '۱۱۱۲۲۰۱',
      courseTitle: 'ساختمان داده‌ها و الگوریتم‌ها',
      professorName: 'دکتر علی حسینی',
      meetingId: 'AFAGH-ROOM-DATA201',
      startTime: '۱۴:۰۰',
      endTime: '۱۶:۰۰',
      isRunning: false,
      activeParticipantsCount: 0,
      recordingsCount: 6,
    },
  ];
}
