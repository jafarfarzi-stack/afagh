import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/db';
import {
  degree_level_configs,
  educational_regulations,
  roles,
  sessions,
  staff,
  students,
  user_roles,
  users,
} from '@/db/schema';

const scrypt = promisify(_scrypt) as (p: string, s: string, k: number, o: object) => Promise<Buffer>;
const SCRYPT_OPTS = { N: Number(process.env.AFAGH_SCRYPT_N || 16384), r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
export const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

/** فرمت هش فاز صفر: salt:hash (scrypt) — همان الگو، مهاجرت‌پذیر */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const calc = await scrypt(password, salt, 32, SCRYPT_OPTS);
  const known = Buffer.from(hash, 'hex');
  return calc.length === known.length && timingSafeEqual(calc, known);
}

export type SessionUser = { id: number; name: string; roles: string[] };

export const SESSION_COOKIE = 'token';
const SESSION_MAX_AGE = 2 * 86400; // دو روز

/**
 * فلگ‌های کوکی نشست — به‌صورت خودکار با پروتکل تطبیق می‌یابد:
 *   • HTTPS → SameSite=None + Secure  (لازم برای iframe و دامنهٔ واسط)
 *   • HTTP  → SameSite=Lax  + بدون Secure
 * چون مرورگر کوکی Secure را روی http ذخیره نمی‌کند و کاربر در حلقهٔ ورود می‌افتد.
 * قابل override با ENV: AFAGH_COOKIE_SECURE=auto|true|false ، AFAGH_COOKIE_SAMESITE=auto|lax|none|strict
 */
export async function sessionCookieOptions(): Promise<{
  httpOnly: true; path: string; maxAge: number; secure: boolean; sameSite: 'lax' | 'none' | 'strict';
}> {
  let isHttps = false;
  try {
    const h = await headers();
    const proto = (h.get('x-forwarded-proto') || h.get('x-forwarded-protocol') || '').split(',')[0].trim().toLowerCase();
    const host = (h.get('host') || '').toLowerCase();
    isHttps = proto === 'https' || (!proto && (h.get('x-forwarded-ssl') === 'on' || host.endsWith('.e2b.app')));
  } catch {
    isHttps = false;
  }

  const secureEnv = (process.env.AFAGH_COOKIE_SECURE || 'auto').toLowerCase();
  const sameSiteEnv = (process.env.AFAGH_COOKIE_SAMESITE || 'auto').toLowerCase();

  let secure = secureEnv === 'true' ? true : secureEnv === 'false' ? false : isHttps;
  let sameSite: 'lax' | 'none' | 'strict' =
    sameSiteEnv === 'none' ? 'none' : sameSiteEnv === 'strict' ? 'strict' : sameSiteEnv === 'lax' ? 'lax' : isHttps ? 'none' : 'lax';

  // SameSite=None بدون Secure توسط مرورگر رد می‌شود
  if (sameSite === 'none' && !secure) sameSite = 'lax';

  return { httpOnly: true, path: '/', maxAge: SESSION_MAX_AGE, secure, sameSite };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, role: roles.code })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(user_roles, eq(user_roles.userId, users.id))
    .leftJoin(roles, eq(roles.id, user_roles.roleId))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())));
  if (!rows.length) return null;
  return { id: rows[0].id, name: rows[0].firstName + ' ' + rows[0].lastName, roles: rows.map(r => r.role).filter(Boolean) as string[] };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const buf = await scrypt(password, salt, 32, SCRYPT_OPTS);
  return `${salt}:${buf.toString('hex')}`;
}

const DEMO_ACCOUNTS: Record<string, { firstName: string; lastName: string; role: string; staffCode?: string; isStudent?: boolean }> = {
  '0000000001': { firstName: 'مدیر', lastName: 'سامانه', role: 'ADMIN' },
  '0011111111': { firstName: 'محمد', lastName: 'رضایی', role: 'PROFESSOR', staffCode: 'F-101' },
  '0022222222': { firstName: 'زهرا', lastName: 'احمدی', role: 'PROFESSOR', staffCode: 'F-102' },
  '0033333333': { firstName: 'حسین', lastName: 'کاظمی', role: 'PROFESSOR', staffCode: 'F-103' },
  '0044444444': { firstName: 'سیدامیر', lastName: 'موسوی', role: 'DEP_HEAD', staffCode: 'F-201' },
  '0055555555': { firstName: 'فاطمه', lastName: 'محمدی', role: 'EDU_EXPERT', staffCode: 'S-301' },
  '0066666666': { firstName: 'علی', lastName: 'نیک‌پور', role: 'VICE_EDU', staffCode: 'S-401' },
  '0077777777': { firstName: 'مریم', lastName: 'صادقی', role: 'FINANCE_EXPERT', staffCode: 'S-501' },
  '0088888888': { firstName: 'ناصر', lastName: 'کریمی', role: 'MILITARY_OFFICER', staffCode: 'S-601' },
  '0099999999': { firstName: 'لیلا', lastName: 'آقایی', role: 'ARCHIVE_EXPERT', staffCode: 'S-701' },
  '0012121212': { firstName: 'علیرضا', lastName: 'مراقب‌زاده', role: 'PROCTOR', staffCode: 'P-801' },
  '0034343434': { firstName: 'سعید', lastName: 'مخزنی', role: 'VAULT_MANAGER', staffCode: 'V-901' },
  '1010101010': { firstName: 'علی', lastName: 'رضایی اصل', role: 'STUDENT', isStudent: true },
  '31412001': { firstName: 'علی', lastName: 'رضایی اصل', role: 'STUDENT', isStudent: true },
  '0012345678': { firstName: 'علی', lastName: 'رضایی اصل', role: 'STUDENT', isStudent: true },
};

async function ensureDemoUser(nc: string) {
  const demo = DEMO_ACCOUNTS[nc];
  if (!demo) return null;

  let [u] = await db.select().from(users).where(eq(users.nationalCode, nc)).limit(1);
  if (!u && demo.isStudent) {
    const [st] = await db
      .select({ user: users })
      .from(students)
      .innerJoin(users, eq(users.id, students.userId))
      .where(eq(students.studentCode, nc))
      .limit(1);
    if (st) u = st.user;
  }

  if (u) {
    // Ensure active and password is 123456
    const isPassValid = await verifyPassword('123456', u.passwordHash).catch(() => false);
    if (!isPassValid || !u.isActive) {
      const newHash = await hashPassword('123456');
      await db.update(users).set({ passwordHash: newHash, isActive: 1 }).where(eq(users.id, u.id));
      u.passwordHash = newHash;
      u.isActive = 1;
    }
    return u;
  }

  // Provision missing demo user
  const passwordHash = await hashPassword('123456');
  const [created] = await db
    .insert(users)
    .values({
      nationalCode: nc,
      firstName: demo.firstName,
      lastName: demo.lastName,
      passwordHash,
      isActive: 1,
    })
    .returning();

  if (created) {
    let [roleRow] = await db.select().from(roles).where(eq(roles.code, demo.role)).limit(1);
    if (!roleRow) {
      const [newRole] = await db.insert(roles).values({ code: demo.role, title: demo.role }).returning();
      roleRow = newRole;
    }
    if (roleRow) {
      await db.insert(user_roles).values({ userId: created.id, roleId: roleRow.id }).catch(() => {});
    }

    if (demo.staffCode) {
      await db.insert(staff).values({
        userId: created.id,
        staffCode: demo.staffCode,
        staffType: demo.role === 'PROFESSOR' ? 'هیئت علمی' : 'اداری',
      }).catch(() => {});
    } else if (demo.isStudent) {
      // مقطع و آیین‌نامه در schema اجباری‌اند؛ اولین ردیف موجود به‌عنوان پیش‌فرض دمو استفاده می‌شود
      const [degree] = await db.select({ id: degree_level_configs.id }).from(degree_level_configs).limit(1);
      const [regulation] = await db.select({ id: educational_regulations.id }).from(educational_regulations).limit(1);
      if (degree && regulation) {
        await db.insert(students).values({
          userId: created.id,
          studentCode: nc === '0012345678' ? '31412001' : nc,
          degreeLevelId: degree.id,
          regulationId: regulation.id,
          status: 'ACTIVE',
          entryYear: 1403,
          currentTermNo: 3,
        }).catch(() => {});
      }
    }
  }

  return created ?? null;
}

export async function login(nationalCode: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const clean = nationalCode.trim();
  let [u] = await db.select().from(users).where(eq(users.nationalCode, clean)).limit(1);
  if (!u) {
    // جستجو بر اساس شماره دانشجویی
    const [st] = await db
      .select({ user: users })
      .from(students)
      .innerJoin(users, eq(users.id, students.userId))
      .where(eq(students.studentCode, clean))
      .limit(1);
    if (st) u = st.user;
  }
  if (!u && DEMO_ACCOUNTS[clean]) {
    u = (await ensureDemoUser(clean)) as any;
  }
  if (!u || !u.isActive) return { ok: false, error: 'کاربر یافت نشد.' };
  if (!(await verifyPassword(password, u.passwordHash))) return { ok: false, error: 'رمز نادرست است.' };
  const token = randomBytes(32).toString('hex');
  await db.insert(sessions).values({ token, userId: u.id, expiresAt: new Date(Date.now() + SESSION_MAX_AGE * 1000) });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, await sessionCookieOptions());
  return { ok: true };
}

export async function logout() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.token, token));
  cookieStore.delete(SESSION_COOKIE);
}

/** گیت نقش در layout ها — ریدایرکت به پورتال درست (سه داشبورد ایزوله — سند §۲۸۶۵) */
export async function requireRole(allowed: string[]): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect('/login');
  if (!u.roles.some(r => allowed.includes(r) || r === 'ADMIN')) redirect(homeFor(u.roles));
  return u;
}

export function homeFor(roles: string[]): string {
  // نقشی ندارد → برگرد به ورود با پیام روشن (جلوگیری از حلقهٔ بی‌پایان ورود)
  if (roles.length === 0) return '/login?e=norole';
  if (roles.includes('STUDENT')) return '/student';
  if (roles.includes('PROCTOR') && !roles.includes('ADMIN') && !roles.includes('EDU_EXPERT')) return '/proctor';
  if (roles.includes('PROFESSOR') && !roles.includes('ADMIN') && !roles.includes('EDU_EXPERT')) return '/professor';
  if (roles.includes('FINANCE_EXPERT') || roles.includes('FINANCE')) return '/admin/payroll';
  if (roles.includes('VAULT_MANAGER')) return '/admin/exams';
  if (roles.includes('MILITARY_OFFICER')) return '/admin/students';
  if (roles.includes('ARCHIVE_EXPERT')) return '/admin/archive';
  return '/admin';
}

export async function getStudentByUser(userId: number) {
  const [s] = await db.select().from(students).where(eq(students.userId, userId)).limit(1);
  return s ?? null;
}
export async function getStaffByUser(userId: number) {
  const [s] = await db.select().from(staff).where(eq(staff.userId, userId)).limit(1);
  return s ?? null;
}
