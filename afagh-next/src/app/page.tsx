import { redirect } from 'next/navigation';
import { getSessionUser, homeFor } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getSessionUser({ allowPendingPasswordChange: true });
  if (!user) redirect('/login');
  if (user.mustChangePassword === 1) redirect('/change-password');
  // کاربر معتبر ولی بدون نقش → پیام روشن به‌جای ریدایرکت بی‌پایان
  if (!user.roles.length) redirect('/login?e=norole');
  redirect(homeFor(user.roles));
}
