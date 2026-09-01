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
