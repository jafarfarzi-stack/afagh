/**
 * Runtime Permission Enforcement Middleware
 * Field/Form-level RBAC enforcement (not just matrix definition)
 * Usage: import { requirePermission, canAccessField, withPermissionCheck } from '@/lib/permissions-enforcer'
 */

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { eq, and } from 'drizzle-orm';
import { users, roles, role_permissions, permissions, user_roles } from '@/db/schema';

export type PermissionCode = string; // e.g., 'finance:student:edit', 'grades:enter', 'enrollment:approve'
export type ResourceType = 'page' | 'api' | 'field' | 'action' | 'button';

interface PermissionCache {
  userPermissions: Map<number, Set<string>>;
  lastRefresh: number;
}

const cache: PermissionCache = { userPermissions: new Map(), lastRefresh: 0 };
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Refresh permission cache from database */
export async function refreshPermissionCache(): Promise<void> {
  const rows = await db.select({
    userId: user_roles.userId,
    permissionCode: permissions.code,
  })
    .from(user_roles)
    .innerJoin(roles, eq(roles.id, user_roles.roleId))
    .innerJoin(role_permissions, eq(role_permissions.roleId, roles.id))
    .innerJoin(permissions, eq(permissions.id, role_permissions.permissionId))
    .where(eq(roles.isSystem, 1)); // or filter by universityId if needed

  const newMap = new Map<number, Set<string>>();
  for (const row of rows) {
    if (!newMap.has(row.userId)) newMap.set(row.userId, new Set());
    newMap.get(row.userId)!.add(row.permissionCode);
  }
  cache.userPermissions = newMap;
  cache.lastRefresh = Date.now();
}

/** Get permissions for a user (with caching) */
export async function getUserPermissions(userId: number): Promise<Set<string>> {
  if (Date.now() - cache.lastRefresh > CACHE_TTL_MS || cache.userPermissions.size === 0) {
    await refreshPermissionCache();
  }
  return cache.userPermissions.get(userId) ?? new Set();
}

/** Check if user has a specific permission */
export async function hasPermission(userId: number, permissionCode: PermissionCode): Promise<boolean> {
  const perms = await getUserPermissions(userId);
  return perms.has(permissionCode);
}

/** Get current user ID from session (server-side) */
export async function getCurrentUserId(): Promise<number | null> {
  const { getSession } = await import('@/lib/auth');
  const session = await getSession();
  return session?.userId ?? null;
}

/** Server-side permission guard for API routes */
export async function requirePermissionApi(permissionCode: PermissionCode): Promise<number> {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('UNAUTHENTICATED');
  }
  const allowed = await hasPermission(userId, permissionCode);
  if (!allowed) {
    throw new Error('FORBIDDEN');
  }
  return userId;
}

/** Server-side permission guard for pages (redirects) */
export async function requirePermissionPage(permissionCode: PermissionCode, redirectTo = '/admin'): Promise<number> {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect('/login');
  }
  const allowed = await hasPermission(userId, permissionCode);
  if (!allowed) {
    redirect(redirectTo);
  }
  return userId;
}

/** Field-level access check */
export async function canAccessField(userId: number, resource: string, field: string, action: 'read' | 'write'): Promise<boolean> {
  // Check specific field permission: e.g., 'student:field:gpa:write'
  const fieldPerm = `${resource}:field:${field}:${action}`;
  if (await hasPermission(userId, fieldPerm)) return true;
  
  // Fallback to resource-level permission: e.g., 'student:write'
  const resourcePerm = `${resource}:${action}`;
  if (await hasPermission(userId, resourcePerm)) return true;
  
  // Fallback to wildcard
  if (await hasPermission(userId, `${resource}:*`)) return true;
  if (await hasPermission(userId, `*:${action}`)) return true;
  
  return false;
}

/** Component-level permission check (for client components via server action) */
export async function checkPermissionAction(permissionCode: PermissionCode): Promise<{ allowed: boolean }> {
  try {
    await requirePermissionApi(permissionCode);
    return { allowed: true };
  } catch {
    return { allowed: false };
  }
}

/** Higher-order function for API route handlers */
export function withPermissionCheck<T extends (...args: unknown[]) => Promise<unknown>>(
  handler: T,
  permissionCode: PermissionCode
): T {
  return (async (...args: unknown[]) => {
    await requirePermissionApi(permissionCode);
    return handler(...args);
  }) as T;
}

/** Permission codes catalog (matches permissions-catalog.json) */
export const PERMISSIONS = {
  // Finance
  FINANCE_VIEW: 'finance:view',
  FINANCE_STUDENT_VIEW: 'finance:student:view',
  FINANCE_STUDENT_EDIT: 'finance:student:edit',
  FINANCE_DISCOUNT_APPROVE: 'finance:discount:approve',
  FINANCE_SPONSORSHIP_APPROVE: 'finance:sponsorship:approve',
  FINANCE_CHEQUE_MANAGE: 'finance:cheque:manage',
  FINANCE_LOAN_MANAGE: 'finance:loan:manage',
  FINANCE_POS_SALE: 'finance:pos:sale',
  FINANCE_POS_VOID: 'finance:pos:void',
  FINANCE_REPORT_VIEW: 'finance:report:view',
  FINANCE_SETTINGS: 'finance:settings',
  
  // Tuition
  TUITION_RULE_VIEW: 'tuition:rule:view',
  TUITION_RULE_EDIT: 'tuition:rule:edit',
  TUITION_COEFFICIENT_EDIT: 'tuition:coefficient:edit',
  
  // Enrollment
  ENROLLMENT_STUDENT_VIEW: 'enrollment:student:view',
  ENROLLMENT_STUDENT_APPROVE: 'enrollment:student:approve',
  ENROLLMENT_CAPACITY_MANAGE: 'enrollment:capacity:manage',
  
  // Grades
  GRADES_VIEW: 'grades:view',
  GRADES_ENTER: 'grades:enter',
  GRADES_APPROVE: 'grades:approve',
  GRADES_APPEAL: 'grades:appeal',
  
  // Students
  STUDENT_VIEW: 'student:view',
  STUDENT_EDIT: 'student:edit',
  STUDENT_FINANCE_VIEW: 'student:finance:view',
  STUDENT_FINANCE_EDIT: 'student:finance:edit',
  
  // Reports
  REPORT_FINANCE_EXPORT: 'report:finance:export',
  REPORT_ACADEMIC_EXPORT: 'report:academic:export',
  
  // Admin
  ADMIN_USER_MANAGE: 'admin:user:manage',
  ADMIN_ROLE_MANAGE: 'admin:role:manage',
  ADMIN_PERMISSION_MANAGE: 'admin:permission:manage',
  ADMIN_SYSTEM_SETTINGS: 'admin:system:settings',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

/** Helper to check permission by key */
export async function checkPerm(userId: number, key: PermissionKey): Promise<boolean> {
  return hasPermission(userId, PERMISSIONS[key]);
}

/** Clear cache (call after role/permission changes) */
export function clearPermissionCache(): void {
  cache.userPermissions.clear();
  cache.lastRefresh = 0;
}