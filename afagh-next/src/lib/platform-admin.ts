import { requireRole } from '@/lib/auth';
import { authorizedUniversityIds } from '@/lib/university-scope';

/**
 * فقط حساب پلتفرمی (ADMIN بدون دانشگاه خانگی) — برای ایجاد/حذف دانشگاه و
 * تنظیمات سراسری. ادمین دانشگاهی فقط می‌تواند داده‌های دانشگاه خودش را ببیند/تغییر دهد.
 */
export async function requirePlatformAdmin() {
  const user = await requireRole(['ADMIN']);
  if ((await authorizedUniversityIds()) !== null) {
    throw new Error('این عملیات فقط برای مدیر پلتفرم مجاز است.');
  }
  return user;
}
