import { requireRole } from '@/lib/auth';
import { getMyClasses } from './actions';
import ProfBroadcastClient from './ProfBroadcastClient';

export const dynamic = 'force-dynamic';

/** پیام استاد به دانشجویان کلاس خودش — فقط کلاس‌هایی که خودش درس می‌دهد */
export default async function ProfBroadcastPage() {
  await requireRole(['PROFESSOR']);
  const classes = await getMyClasses().catch(() => []);

  return (
    <div className="max-w-3xl mx-auto space-y-4" dir="rtl">
      <div className="card">
        <h1 className="font-black text-base sm:text-lg">📣 پیام به دانشجویان کلاس</h1>
        <p className="mt-1 text-xs leading-6 text-slate-500">
          فقط به کلاس‌هایی که خودتان درس می‌دهید. پیام در صندوق پورتال همهٔ
          ثبت‌نام‌شدگان می‌رود و اگر پیام‌رسان وصل کرده باشند، همان‌جا هم می‌گیرند.
        </p>
      </div>
      <ProfBroadcastClient classes={classes} />
    </div>
  );
}
