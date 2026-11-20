import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * این مسیر دیگر صفحهٔ مستقل ندارد؛ همهٔ اسناد به صفحهٔ یکتای `/verify`
 * هدایت می‌شوند (درخواست کاربر: «از این به بعد همه b.afagh.ac.ir/verify»).
 */
export default function Page() {
  redirect('/verify');
}
