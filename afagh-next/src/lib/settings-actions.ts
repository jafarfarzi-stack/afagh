'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { resetSettings, saveSettings, SETTING_BY_KEY } from '@/lib/settings';
import { SECRET_MASK } from '@/lib/settings-shared';

export interface SettingsActionResult {
  ok: boolean;
  message: string;
}

/**
 * ذخیرهٔ تنظیمات از پنل مدیر.
 * مقادیر محرمانه اگر دست‌نخورده (••••) باشند، بازنویسی نمی‌شوند.
 */
export async function saveSettingsAction(values: Record<string, string>): Promise<SettingsActionResult> {
  try {
    await requireRole(['ADMIN']);
  } catch {
    return { ok: false, message: 'دسترسی لازم را ندارید.' };
  }

  const clean: Record<string, string> = {};
  for (const [key, raw] of Object.entries(values || {})) {
    const def = SETTING_BY_KEY[key];
    if (!def || def.envOnly) continue;
    const v = String(raw ?? '');
    if (def.type === 'secret' && v === SECRET_MASK) continue; // بدون تغییر
    if (def.type === 'url' && v.trim() && !/^https?:\/\//i.test(v.trim())) {
      return { ok: false, message: `نشانی «${def.label}» باید با http:// یا https:// شروع شود.` };
    }
    if (def.type === 'number' && v.trim() && !Number.isFinite(Number(v))) {
      return { ok: false, message: `مقدار «${def.label}» باید عدد باشد.` };
    }
    clean[key] = v;
  }

  const n = await saveSettings(clean);
  revalidatePath('/admin/settings');
  return { ok: true, message: `${n} تنظیم ذخیره شد.` };
}

/**
 * بارگذاری ارم دانشگاه (UNIVERSITY_LOGO) — PNG/JPG تا ۲MB در public/uploads.
 * در داکر این مسیر باید volume باشد تا با rebuild نپرد.
 */
export async function uploadLogoAction(fd: FormData): Promise<SettingsActionResult> {
  try {
    await requireRole(['ADMIN']);
  } catch {
    return { ok: false, message: 'دسترسی لازم را ندارید.' };
  }
  const file = fd.get('logo');
  if (!file || typeof file === 'string') return { ok: false, message: 'فایلی انتخاب نشده است.' };
  const allowed = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowed.includes(file.type)) return { ok: false, message: 'فقط PNG/JPG/WebP مجاز است.' };
  if (file.size > 2 * 1024 * 1024) return { ok: false, message: 'حجم فایل بیش از ۲ مگابایت است.' };
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const dir = join(process.cwd(), 'public', 'uploads');
  await mkdir(dir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(join(dir, `logo.${ext}`), buf);
  // پسوند قبلی متفاوت بود؟ پاکش کن تا فقط یک لوگو بماند
  for (const e of ['png', 'jpg', 'webp']) {
    if (e === ext) continue;
    try {
      const { unlink } = await import('node:fs/promises');
      await unlink(join(dir, `logo.${e}`));
    } catch { /* نبود */ }
  }
  await saveSettings({ UNIVERSITY_LOGO: `/uploads/logo.${ext}` });
  revalidatePath('/admin/settings');
  return { ok: true, message: 'ارم دانشگاه بارگذاری شد.' };
}

/** بازگرداندن یک کلید به مقدار ENV/پیش‌فرض */
export async function resetSettingAction(key: string): Promise<SettingsActionResult> {
  try {
    await requireRole(['ADMIN']);
  } catch {
    return { ok: false, message: 'دسترسی لازم را ندارید.' };
  }
  await resetSettings([key]);
  revalidatePath('/admin/settings');
  return { ok: true, message: 'به مقدار ENV/پیش‌فرض بازگشت.' };
}
