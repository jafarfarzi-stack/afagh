import { getSessionUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import MessengerConnectClient from './MessengerConnectClient';

export const dynamic = 'force-dynamic';

/** اتصال پیام‌رسان با کد یک‌بارمصرف (بدون رمز عبور در چت) — همهٔ نقش‌ها */
export default async function MessengerConnectPage() {
  const me = await getSessionUser();
  if (!me) redirect('/login');
  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-8" dir="rtl">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="card">
          <h1 className="font-black text-base sm:text-lg">🔗 اتصال پیام‌رسان برای اعلان‌ها</h1>
          <p className="mt-1 text-xs leading-6 text-slate-500">
            نمره، کلاس جبرانی و فیش حقوقی را در پیام‌رسان بگیرید. رمز عبورتان را <b>هیچ‌وقت</b> در چت ننویسید —
            اتصال با کد یک‌بارمصرف (۱۰ دقیقه اعتبار) انجام می‌شود.
          </p>
        </div>
        <MessengerConnectClient />
      </div>
    </div>
  );
}
