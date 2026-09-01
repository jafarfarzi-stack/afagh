import crypto from 'crypto';

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

const BBB_SECRET = process.env.BIGBLUEBUTTON_SECRET || 'afagh_bbb_secret_salt_2026';
const BBB_URL = process.env.BIGBLUEBUTTON_URL || 'https://vc.afagh.ac.ir/bigbluebutton/api';

/**
 * تولید Checksum امن برای درخواست‌های بیگ‌بلوباتن طبق استاندارد API
 */
export function generateBbbChecksum(callName: string, queryString: string): string {
  const raw = `${callName}${queryString}${BBB_SECRET}`;
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
}): Promise<{ ok: boolean; url: string }> {
  const password = role === 'MODERATOR' ? 'mp_mod_1405' : 'ap_att_1405';
  const queryParams = new URLSearchParams({
    fullName,
    meetingID: meetingId,
    password,
    redirect: 'true',
    joinViaHtml5: 'true',
  });

  const queryString = queryParams.toString();
  const checksum = generateBbbChecksum('join', queryString);
  const finalUrl = `${BBB_URL}/join?${queryString}&checksum=${checksum}`;

  return {
    ok: true,
    url: finalUrl,
  };
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
