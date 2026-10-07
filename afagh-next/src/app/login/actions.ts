'use server';

import { redirect } from 'next/navigation';
import { changePassword, chooseLoginAccount, login, logout } from '@/lib/auth';
import { assertServerActionOrigin } from '@/lib/security';

/** ورود — نتیجه به client برمی‌گردد تا خطا همان‌جا نشان داده شود */
export async function loginAndReport(identifier: string, password: string) {
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  return login(identifier.trim(), password);
}

/** انتخاب حساب وقتی یک شناسه چند حسابِ هم‌رمز دارد */
export async function chooseLoginAccountAction(token: string, userId: number) {
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  return chooseLoginAccount(token, userId);
}

/** تغییر رمز (حلقهٔ تسویهٔ mustChangePassword) — نتیجه به client برمی‌گردد */
export async function changePasswordAction(currentPassword: string, newPassword: string) {
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  return changePassword(currentPassword, newPassword);
}

export async function logoutAction() {
  await logout();
  redirect('/login');
}
