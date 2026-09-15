/**
 * ══════════════════════════════════════════════════════════════════
 *  کاتالوگ مجوزها (Permission Catalog)
 *
 *  دادهٔ خام در `permissions-catalog.json` است تا هم این ماژول TypeScript
 *  و هم اسکریپت دادهٔ پایه (`scripts/seed-base.mjs` که JS خالص است) از یک
 *  منبع واحد بخوانند؛ در غیر این صورت کاتالوگ اپ و کاتالوگ دیتابیس به‌مرور
 *  از هم واگرا می‌شدند.
 *
 *  جدول‌های مرتبط: `permissions`، `role_permissions`، `roles`.
 * ══════════════════════════════════════════════════════════════════
 */
import catalog from './permissions-catalog.json';

export interface PermissionDefinition {
  code: string;
  title: string;
  category: string;
  description: string;
}

export const PERMISSION_CATEGORIES: string[] = catalog.categories;

export const PERMISSION_CATALOG: PermissionDefinition[] = catalog.permissions;

/** نگاشت پیش‌فرض نقش→مجوز؛ «*» یعنی همهٔ مجوزها (فقط برای ADMIN). */
export const ROLE_DEFAULT_PERMISSIONS: Record<string, string[] | '*'> =
  catalog.roleDefaults as Record<string, string[] | '*'>;

/** فهرست کدهای پیش‌فرض یک نقش — «*» به کل کاتالوگ باز می‌شود. */
export function defaultPermissionCodesFor(roleCode: string): string[] {
  const v = ROLE_DEFAULT_PERMISSIONS[roleCode];
  if (v === '*') return PERMISSION_CATALOG.map((p) => p.code);
  return v ?? [];
}
