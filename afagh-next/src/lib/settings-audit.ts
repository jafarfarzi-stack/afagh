import 'server-only';
import { db } from '@/db';
import { system_settings } from '@/db/schema';
import { SETTING_BY_KEY, getSetting, invalidateSettingsCache } from '@/lib/settings';
import { appendAudit } from '@/lib/audit';

/**
 * ذخیرهٔ تنظیمات + ثبت ممیزی در «یک تراکنش» واحد — شکستِ ممیزی، خودِ نوشتن را
 * هم برمی‌گرداند (سند `appendAudit`). فقط کلیدهایی که مقدارشان واقعاً تغییر
 * کرده است ردیف ممیزی می‌گیرند (action=setting_update)، با جزئیات {key, from, to}.
 *
 * نکته: منطق نرمال‌سازی مقدار (trim + بازگشت select به پیش‌فرض) همانند
 * `saveSettings` تکرار شده است، چون آن تابع تراکنش نمی‌پذیرد و در
 * `settings.ts` قابل تغییر نیست.
 */
export async function saveSettingsWithAudit(
  entries: Record<string, string>,
  actorUserId: number,
): Promise<number> {
  const toWrite: { key: string; value: string }[] = [];
  const changes: { key: string; from: string; to: string }[] = [];
  for (const [key, raw] of Object.entries(entries)) {
    const def = SETTING_BY_KEY[key];
    if (!def || def.envOnly) continue;
    let value = String(raw ?? '').trim();
    // select: فقط مقدارهای مجاز ذخیره می‌شوند (خارج از فهرست → پیش‌فرض)
    if (def.type === 'select' && def.options?.length && !def.options.some(o => o.value === value)) {
      value = def.default;
    }
    const from = await getSetting(key);
    toWrite.push({ key, value });
    if (value !== from) changes.push({ key, from, to: value });
  }
  if (!toWrite.length) return 0;

  await db.transaction(async tx => {
    for (const { key, value } of toWrite) {
      await tx
        .insert(system_settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: system_settings.key, set: { value } });
    }
    for (const ch of changes) {
      await appendAudit(tx, {
        actorUserId,
        action: 'setting_update',
        entityType: 'settings',
        entityId: null, // system_settings کلید متنی دارد، شناسهٔ عددی ندارد
        details: JSON.stringify({ key: ch.key, from: ch.from, to: ch.to }),
      });
    }
  });
  invalidateSettingsCache();
  return toWrite.length;
}
