'use server';

import { revalidatePath } from 'next/cache';
import { requirePlatformAdmin } from '@/lib/platform-admin';
import { resetSettings, saveSettings, SETTING_BY_KEY } from '@/lib/settings';
import { SECRET_MASK } from '@/lib/settings-shared';
import { magicMatches } from '@/lib/safe-input';

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
    await requirePlatformAdmin();
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
    // گارد SSRF: همهٔ کلیدهای نشانی/وب‌هوک باید https بدون userinfo باشند؛
    // برای مقاصد fetch سرور، DNS هم باید به IP عمومی تفکیک شود.
    if ((def.type === 'url' || /(_BASE_URL|_URL|WEBHOOK)$/i.test(key)) && v.trim()) {
      const { assertSafeUrl, LINK_ONLY_KEYS } = await import('@/lib/ssrf-guard');
      try {
        await assertSafeUrl(v, { settingKey: key, dnsCheck: !LINK_ONLY_KEYS.has(key) });
      } catch (e) {
        return { ok: false, message: e instanceof Error ? `نشانی «${def.label}» ناامن است: ${e.message}` : `نشانی «${def.label}» ناامن است.` };
      }
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
    await requirePlatformAdmin();
  } catch {
    return { ok: false, message: 'دسترسی لازم را ندارید.' };
  }
  const file = fd.get('logo');
  if (!file || typeof file === 'string') return { ok: false, message: 'فایلی انتخاب نشده است.' };
  const allowed = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowed.includes(file.type)) return { ok: false, message: 'فقط PNG/JPG/WebP مجاز است.' };
  if (file.size > 2 * 1024 * 1024) return { ok: false, message: 'حجم فایل بیش از ۲ مگابایت است.' };
  const buf = Buffer.from(await file.arrayBuffer());
  if (!magicMatches(file.type, buf)) return { ok: false, message: 'محتوای فایل با نوع ادعاشده مطابقت ندارد.' };
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const dir = join(process.cwd(), 'public', 'uploads');
  await mkdir(dir, { recursive: true });
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
    await requirePlatformAdmin();
  } catch {
    return { ok: false, message: 'دسترسی لازم را ندارید.' };
  }
  await resetSettings([key]);
  revalidatePath('/admin/settings');
  return { ok: true, message: 'به مقدار ENV/پیش‌فرض بازگشت.' };
}
