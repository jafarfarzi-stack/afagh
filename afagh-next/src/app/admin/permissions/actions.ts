'use server';

/**
 * ══════════════════════════════════════════════════════════════════
 *  Server Actions صفحهٔ «ماتریس پویا و مدیریت سطوح دسترسی» (RBAC)
 *
 *  پیش از این، کل صفحه Mock بود: نقش‌ها و مجوزها در خودِ کامپوننت hardcode
 *  شده بودند، هیچ اکشن سروری وجود نداشت و تیک‌ها فقط در state مرورگر
 *  می‌نشستند — به همین دلیل «دکمهٔ تأیید» نداشت، با خروج و ورود مجدد همه‌چیز
 *  برمی‌گشت و نقش‌های واقعی سامانه (دانشجو، مدیر گروه، …) اصلاً دیده نمی‌شدند.
 *
 *  حالا همه‌چیز روی جدول‌های واقعی `roles` / `permissions` / `role_permissions`
 *  می‌نشیند و هر تغییر در زنجیرهٔ ممیزی (audit_logs) ثبت می‌شود.
 * ══════════════════════════════════════════════════════════════════
 */

import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { permissions, role_permissions, roles, user_roles } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { assertServerActionOrigin } from '@/lib/security';
import { auditChain } from '@/lib/audit-chain';
import { createLogger } from '@/lib/logger';
import { PERMISSION_CATALOG } from '@/lib/permissions-catalog';

const log = createLogger({ mod: 'permissions' });

const ok = <T,>(data: T) => ({ ok: true as const, data });
const fail = (error: string) => ({ ok: false as const, error });

export interface PermissionRow {
  id: number;
  code: string;
  title: string;
  category: string;
  description: string;
}

export interface RoleRow {
  id: number;
  code: string;
  title: string;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
}

export interface PermissionsWorkspace {
  roles: RoleRow[];
  permissions: PermissionRow[];
  categories: string[];
}

/**
 * کاتالوگ مجوزها را idempotent با فایل مرجع هم‌تراز می‌کند.
 *
 * چرا اینجا؟ نصب‌های قبلی (پیش از افزوده‌شدن این بخش به seed-base) جدول
 * `permissions` خالی دارند و صفحه بدون داده باز می‌شد. این تابع فقط مجوزهای
 * *نبوده* را اضافه می‌کند و هرگز تخصیص‌های نقش را دست نمی‌زند.
 */
async function ensurePermissionCatalog(): Promise<void> {
  const existing = await db.select({ code: permissions.code }).from(permissions);
  const have = new Set(existing.map((r) => r.code));
  const missing = PERMISSION_CATALOG.filter((p) => !have.has(p.code));
  if (missing.length === 0) return;
  await db
    .insert(permissions)
    .values(missing.map((p) => ({ code: p.code, title: p.title, category: p.category, description: p.description })))
    .onConflictDoNothing({ target: permissions.code });
  log.info('permission_catalog_synced', { added: missing.length });
}

/** دادهٔ واقعی صفحه: نقش‌ها + شمار کاربران هر نقش + کاتالوگ مجوزها + ماتریس فعلی */
export async function getPermissionsWorkspaceAction(): Promise<
  { ok: true; data: PermissionsWorkspace } | { ok: false; error: string }
> {
  try {
    await requireRole(['ADMIN']);
    await ensurePermissionCatalog();

    const [roleRows, permRows, matrix, counts] = await Promise.all([
      db.select().from(roles).orderBy(roles.id),
      db.select().from(permissions).orderBy(permissions.id),
      db
        .select({ roleId: role_permissions.roleId, permissionId: role_permissions.permissionId })
        .from(role_permissions),
      db
        .select({ roleId: user_roles.roleId, c: sql<number>`count(*)::int` })
        .from(user_roles)
        .groupBy(user_roles.roleId),
    ]);

    const codeById = new Map(permRows.map((p) => [p.id, p.code]));
    const permsByRole = new Map<number, string[]>();
    for (const m of matrix) {
      const code = codeById.get(m.permissionId);
      if (!code) continue;
      const list = permsByRole.get(m.roleId) ?? [];
      list.push(code);
      permsByRole.set(m.roleId, list);
    }
    const countByRole = new Map(counts.map((c) => [c.roleId, c.c]));

    // دسته‌ها به ترتیب ظهور در کاتالوگ (نه الفبایی) تا چیدمان جدول پایدار بماند
    const categories: string[] = [];
    for (const p of permRows) if (!categories.includes(p.category ?? 'عمومی')) categories.push(p.category ?? 'عمومی');

    return ok({
      roles: roleRows.map((r) => ({
        id: r.id,
        code: r.code,
        title: r.title,
        isSystem: r.isSystem === 1,
        userCount: countByRole.get(r.id) ?? 0,
        permissions: permsByRole.get(r.id) ?? [],
      })),
      permissions: permRows.map((p) => ({
        id: p.id,
        code: p.code,
        title: p.title,
        category: p.category ?? 'عمومی',
        description: p.description ?? '',
      })),
      categories,
    });
  } catch (err: any) {
    log.error('permissions_workspace_failed', { error: String(err?.message ?? err) });
    return fail('بارگذاری ماتریس دسترسی‌ها ناموفق بود: ' + String(err?.message ?? err));
  }
}

/**
 * ذخیرهٔ ماتریس یک نقش — «تأیید تغییر دسترسی».
 *
 * کل مجموعهٔ مجوزهای نقش جایگزین می‌شود (delete + insert در یک تراکنش) تا
 * حالت نهایی دقیقاً همان چیزی باشد که مدیر روی صفحه دیده است.
 */
export async function saveRolePermissionsAction(input: { roleId: number; codes: string[] }) {
  const og = await assertServerActionOrigin();
  if (!og.ok) return fail(og.error);
  const actor = await requireRole(['ADMIN']);

  const roleId = Number(input?.roleId);
  if (!Number.isInteger(roleId) || roleId <= 0) return fail('شناسهٔ نقش نامعتبر است.');

  const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!role) return fail('نقش یافت نشد.');

  const requested = Array.from(new Set((input?.codes ?? []).map((c) => String(c).trim()).filter(Boolean)));

  const permRows = requested.length
    ? await db.select({ id: permissions.id, code: permissions.code }).from(permissions).where(inArray(permissions.code, requested))
    : [];
  const unknown = requested.filter((c) => !permRows.some((p) => p.code === c));
  if (unknown.length) return fail(`این مجوزها در کاتالوگ سامانه تعریف نشده‌اند: ${unknown.join('، ')}`);

  // 🔒 گارد قفل‌شدن مدیر: نقش ADMIN نباید مجوزهای مدیریتی خود را از دست بدهد،
  //    وگرنه هیچ‌کس دیگر نمی‌تواند وارد همین صفحه شود و ماتریس را برگرداند.
  if (role.code === 'ADMIN' && !requested.includes('system:manage_roles')) {
    return fail('مجوز «مدیریت نقش و دسترسی» را نمی‌توان از نقش مدیر ارشد برداشت (خطر قفل‌شدن سامانه).');
  }

  const [before] = await db
    .select({ codes: sql<string[]>`coalesce(array_agg(${permissions.code}), '{}')` })
    .from(role_permissions)
    .innerJoin(permissions, eq(permissions.id, role_permissions.permissionId))
    .where(eq(role_permissions.roleId, roleId));

  try {
    await db.transaction(async (tx) => {
      await tx.delete(role_permissions).where(eq(role_permissions.roleId, roleId));
      if (permRows.length) {
        await tx
          .insert(role_permissions)
          .values(permRows.map((p) => ({ roleId, permissionId: p.id })))
          .onConflictDoNothing();
      }
      await auditChain(tx, actor.id, 'ROLE_PERMISSIONS_UPDATED', 'roles', roleId, {
        roleCode: role.code,
        before: (before?.codes ?? []).slice().sort(),
        after: requested.slice().sort(),
      });
    });
  } catch (err: any) {
    log.error('save_role_permissions_failed', { roleId, error: String(err?.message ?? err) });
    return fail('ذخیرهٔ دسترسی‌ها ناموفق بود: ' + String(err?.message ?? err));
  }

  log.info('role_permissions_saved', { roleId, roleCode: role.code, count: permRows.length });
  return ok({ roleId, count: permRows.length });
}

/** تعریف نقش سازمانی جدید (غیرسیستمی) */
export async function createRoleAction(input: { code: string; title: string }) {
  const og = await assertServerActionOrigin();
  if (!og.ok) return fail(og.error);
  const actor = await requireRole(['ADMIN']);

  const code = String(input?.code ?? '').trim().toUpperCase().replace(/\s+/g, '_');
  const title = String(input?.title ?? '').trim();
  if (!code || !title) return fail('کد و عنوان نقش الزامی است.');
  if (!/^[A-Z][A-Z0-9_]{2,31}$/.test(code)) {
    return fail('کد نقش باید ۳ تا ۳۲ نویسهٔ لاتین بزرگ، رقم یا زیرخط باشد و با حرف شروع شود (مثل: REGISTRATION_STAFF).');
  }

  const [dup] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, code)).limit(1);
  if (dup) return fail(`نقشی با کد «${code}» از قبل وجود دارد.`);

  try {
    const created = await db.transaction(async (tx) => {
      const [row] = await tx.insert(roles).values({ code, title, isSystem: 0 }).returning({ id: roles.id });
      await auditChain(tx, actor.id, 'ROLE_CREATED', 'roles', row.id, { code, title });
      return row;
    });
    log.info('role_created', { id: created.id, code });
    return ok({ id: created.id, code, title });
  } catch (err: any) {
    log.error('create_role_failed', { code, error: String(err?.message ?? err) });
    return fail('ایجاد نقش ناموفق بود: ' + String(err?.message ?? err));
  }
}

/** حذف نقش سازمانی — فقط نقش غیرسیستمی و بدون کاربر */
export async function deleteRoleAction(input: { roleId: number }) {
  const og = await assertServerActionOrigin();
  if (!og.ok) return fail(og.error);
  const actor = await requireRole(['ADMIN']);

  const roleId = Number(input?.roleId);
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!role) return fail('نقش یافت نشد.');
  if (role.isSystem === 1) return fail('نقش‌های سیستمی سامانه قابل حذف نیستند.');

  const [used] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(user_roles)
    .where(eq(user_roles.roleId, roleId));
  if ((used?.c ?? 0) > 0) return fail(`این نقش به ${used.c} کاربر تخصیص یافته است؛ ابتدا نقش کاربران را تغییر دهید.`);

  try {
    await db.transaction(async (tx) => {
      await tx.delete(role_permissions).where(eq(role_permissions.roleId, roleId));
      await tx.delete(roles).where(eq(roles.id, roleId));
      await auditChain(tx, actor.id, 'ROLE_DELETED', 'roles', roleId, { code: role.code, title: role.title });
    });
  } catch (err: any) {
    log.error('delete_role_failed', { roleId, error: String(err?.message ?? err) });
    return fail('حذف نقش ناموفق بود: ' + String(err?.message ?? err));
  }

  log.info('role_deleted', { roleId, code: role.code });
  return ok({ roleId });
}
