import { requireRole } from '@/lib/auth';
import { ENTITIES } from '@/lib/migration/engine';
import MigrationClient from './MigrationClient';

export const dynamic = 'force-dynamic';

export default async function MigrationPage() {
  await requireRole(['ADMIN']);
  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="font-bold">مهاجرت داده از سیستم قدیمی (ETL)</h2>
        <p className="mt-1 text-xs leading-6 text-slate-500">
          فایل CSV خروجی سیستم قدیمی (گلستان/اکسل) را برای هر نوع داده بارگذاری کنید — ارقام فارسی، جداکنندهٔ هزارگان و تاریخ شمسی خودکار تبدیل می‌شوند.
          اول <b>تحلیل اولیه</b> بگیرید؛ پس از رفع خطاها <b>ثبت نهایی</b> کنید. تکرار بی‌خطر است: ردیف‌های موجود نادیده گرفته می‌شوند. ترتیب پیشنهادی: دانشجویان ← دروس ← ترم‌ها ← نمرات ← مالی.
        </p>
      </div>
      <MigrationClient entities={ENTITIES} />
    </div>
  );
}
