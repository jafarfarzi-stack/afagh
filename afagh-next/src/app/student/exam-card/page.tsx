import { getSessionUser } from '@/lib/auth';
import { getPublicBaseUrl } from '@/lib/settings';
import { getExamCardData, issueExamTicketToken } from '@/lib/verification';
import ExamCardClient from './ExamCardClient';

export const dynamic = 'force-dynamic';

export default async function StudentExamCardPage() {
  const user = await getSessionUser();
  if (!user) return null;

  /**
   * توکن امضاشدهٔ کارت ورود به جلسه — از پایگاه داده ساخته می‌شود، نه از
   * شناسهٔ کاربر (توکن حدس‌زدنی یعنی هر کسی می‌تواند کارت دیگری را باز کند).
   * در صورت بدهی مالی یا نبود رکورد دانشجو، توکن صادر نمی‌شود و صفحه وضعیت
   * مسدود را نشان می‌دهد.
   */
  const card = await getExamCardData(user.id);

  let examTicket: { token: string; expiresAt: string } | null = null;
  let examTicketBlocked: string | null = null;
  if (!card) {
    examTicketBlocked = 'رکورد دانشجویی شما در سامانه یافت نشد؛ به امور آموزش مراجعه کنید.';
  } else {
    try {
      examTicket = await issueExamTicketToken(user.id);
    } catch (err) {
      examTicketBlocked = (err as Error)?.message || 'صدور کارت ورود به جلسه ممکن نشد.';
    }
  }

  return (
    <ExamCardClient
      user={user}
      publicBaseUrl={await getPublicBaseUrl()}
      examTicket={examTicket}
      examTicketBlocked={examTicketBlocked}
      card={card}
    />
  );
}
