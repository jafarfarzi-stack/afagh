'use server';

import { revalidatePath } from 'next/cache';
import { randomBytes } from 'crypto';
import { requirePlatformAdmin } from '@/lib/platform-admin';
import { saveSettingsWithAudit } from '@/lib/settings-audit';
import { checkUpload } from '@/lib/safe-input';
import { putArchiveObject, ObjectStoreBucketMissingError } from '@/lib/objectStore';
import {
  CARD_ASSET_PREFIX,
  CARD_DEFAULT_DESIGN_KEY,
  CARD_DESIGNS_KEY,
  MAX_CARD_DESIGNS,
  cardAssetUrl,
  getCardDesigns,
  isValidDesignId,
  newDesignId,
  normalizeDesign,
  type SavedCardDesign,
} from '@/lib/student-card-designs';

export type CardDesignActionResult = {
  ok: boolean;
  message: string;
  id?: string;
  design?: SavedCardDesign;
};

async function persist(designs: SavedCardDesign[], defaultId: string, actorId: number): Promise<void> {
  await saveSettingsWithAudit(
    {
      [CARD_DESIGNS_KEY]: JSON.stringify(designs),
      [CARD_DEFAULT_DESIGN_KEY]: defaultId,
    },
    actorId,
  );
  revalidatePath('/admin/student-cards/design');
  revalidatePath('/admin/student-cards');
}

/**
 * ذخیرهٔ یک طراحی (جدید یا ویرایشی).
 * اعتبارسنجی/نرمال‌سازی سمت سرور انجام می‌شود؛ خروجی، طراحیِ نرمال‌شده است
 * تا کلاینت دقیقاً همان چیزی را نگه دارد که ذخیره شده (بدون dirty کاذب).
 */
export async function saveCardDesignAction(input: {
  id?: string;
  title: string;
  front: unknown;
  back: unknown;
  makeDefault?: boolean;
}): Promise<CardDesignActionResult> {
  let admin;
  try {
    admin = await requirePlatformAdmin();
  } catch {
    return { ok: false, message: 'برای ذخیرهٔ طراحیِ سراسری، دسترسی مدیر کل سامانه لازم است.' };
  }

  const { designs, defaultId } = await getCardDesigns();
  const id = isValidDesignId(input.id) ? input.id : newDesignId();
  const design = normalizeDesign({
    id,
    title: input.title,
    front: input.front,
    back: input.back,
    updatedAt: new Date().toISOString(),
  });
  if (!design) return { ok: false, message: 'طراحی نامعتبر است.' };

  const idx = designs.findIndex(d => d.id === id);
  let next: SavedCardDesign[];
  if (idx >= 0) {
    next = designs.slice();
    next[idx] = design;
  } else {
    if (designs.length >= MAX_CARD_DESIGNS) {
      return { ok: false, message: `حداکثر ${MAX_CARD_DESIGNS} طراحی ذخیره می‌شود؛ یکی را حذف کنید.` };
    }
    next = [...designs, design];
  }

  const nextDefault = input.makeDefault ? id : defaultId;
  await persist(next, nextDefault, admin.id);
  return { ok: true, message: 'طراحی ذخیره شد.', id, design };
}

/** حذف طراحی — حداقل یک طراحی باید بماند */
export async function deleteCardDesignAction(id: string): Promise<CardDesignActionResult> {
  let admin;
  try {
    admin = await requirePlatformAdmin();
  } catch {
    return { ok: false, message: 'برای حذف طراحی، دسترسی مدیر کل سامانه لازم است.' };
  }
  const { designs, defaultId } = await getCardDesigns();
  if (designs.length <= 1) return { ok: false, message: 'حداقل یک طراحی باید باقی بماند.' };
  const next = designs.filter(d => d.id !== id);
  if (next.length === designs.length) return { ok: false, message: 'طراحی یافت نشد.' };
  await persist(next, defaultId === id ? next[0].id : defaultId, admin.id);
  return { ok: true, message: 'طراحی حذف شد.' };
}

/** تعیین طراحی پیش‌فرضِ صدور */
export async function setDefaultCardDesignAction(id: string): Promise<CardDesignActionResult> {
  let admin;
  try {
    admin = await requirePlatformAdmin();
  } catch {
    return { ok: false, message: 'برای تغییر پیش‌فرض، دسترسی مدیر کل سامانه لازم است.' };
  }
  const { designs } = await getCardDesigns();
  if (!designs.some(d => d.id === id)) return { ok: false, message: 'طراحی یافت نشد.' };
  await persist(designs, id, admin.id);
  return { ok: true, message: 'طراحی پیش‌فرض تغییر کرد.' };
}

/**
 * بارگذاری تصویر طراحی (پس‌زمینه/امضا) در Object Storage.
 * فقط تصویر، حداکثر ۵ مگابایت، با بررسی magic-bytes؛ کلید در پیشوند
 * `card-design/` می‌ماند تا مسیر سرو فقط همین دارایی‌ها را بخواند.
 */
export async function uploadCardAssetAction(
  formData: FormData,
): Promise<{ ok: boolean; message: string; url?: string }> {
  try {
    await requirePlatformAdmin();
  } catch {
    return { ok: false, message: 'برای بارگذاری تصویر، دسترسی مدیر کل سامانه لازم است.' };
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'فایلی انتخاب نشده است.' };
  if (file.size > 5 * 1024 * 1024) return { ok: false, message: 'حجم تصویر باید کمتر از ۵ مگابایت باشد.' };
  if (!String(file.type || '').startsWith('image/')) return { ok: false, message: 'فقط فایل تصویری مجاز است.' };

  const buf = Buffer.from(await file.arrayBuffer());
  const check = checkUpload(file.name, file.type, buf);
  if (!check.ok) return { ok: false, message: check.error };
  if (!check.mime.startsWith('image/')) return { ok: false, message: 'فقط فایل تصویری مجاز است.' };

  const kind = (String(formData.get('kind') || 'bg').toLowerCase().replace(/[^a-z]/g, '').slice(0, 12)) || 'bg';
  const key = `${CARD_ASSET_PREFIX}${kind}-${Date.now()}-${randomBytes(4).toString('hex')}.${check.ext}`;
  try {
    await putArchiveObject(key, buf, check.mime);
  } catch (err) {
    const missing = err instanceof ObjectStoreBucketMissingError;
    return {
      ok: false,
      message: missing
        ? 'فضای ذخیره‌سازی تصاویر در دسترس نیست؛ با مدیر زیرساخت تماس بگیرید.'
        : 'بارگذاری تصویر ناموفق بود؛ دوباره تلاش کنید.',
    };
  }
  return { ok: true, message: 'تصویر بارگذاری شد.', url: cardAssetUrl(key) };
}
