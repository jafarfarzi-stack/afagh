import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/db';
import { roles, sessions, staff, students, user_roles, users } from '@/db/schema';

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

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get('token')?.value;
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

export async function login(nationalCode: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const [u] = await db.select().from(users).where(eq(users.nationalCode, nationalCode)).limit(1);
  if (!u || !u.isActive) return { ok: false, error: 'کاربر یافت نشد.' };
  if (!(await verifyPassword(password, u.passwordHash))) return { ok: false, error: 'رمز نادرست است.' };
  const token = randomBytes(32).toString('hex');
  await db.insert(sessions).values({ token, userId: u.id, expiresAt: new Date(Date.now() + 2 * 86400000) });
  // SameSite=None برای کارکردن در iframe پیش‌نمایش (دامنهٔ واسط)؛ Secure از طریق پروکسی HTTPS
  (await cookies()).set('token', token, { httpOnly: true, sameSite: 'none', secure: true, path: '/', maxAge: 2 * 86400 });
  return { ok: true };
}

export async function logout() {
  const store = await cookies();
  const token = store.get('token')?.value;
  if (token) await db.delete(sessions).where(eq(sessions.token, token));
  store.delete('token');
}

/** گیت نقش در layout ها — ریدایرکت به پورتال درست (سه داشبورد ایزوله — سند §۲۸۶۵) */
export async function requireRole(allowed: string[]): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect('/login');
  if (!u.roles.some(r => allowed.includes(r) || r === 'ADMIN')) redirect(homeFor(u.roles));
  return u;
}

export function homeFor(roles: string[]): string {
  if (roles.length === 0) return '/login'; // نقشی ندارد → برگرد به ورود (ضدحلقه)
  if (roles.includes('STUDENT')) return '/student';
  if (roles.includes('DEP_HEAD')) return '/group-manager';
  if (roles.includes('PROFESSOR')) return '/professor';
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
