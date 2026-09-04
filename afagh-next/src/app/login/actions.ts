'use server';

import { redirect } from 'next/navigation';
import { changePassword, login, logout } from '@/lib/auth';
import { assertServerActionOrigin } from '@/lib/security';

/** ورود — نتیجه به client برمی‌گردد تا خطا همان‌جا نشان داده شود */
export async function loginAndReport(nationalCode: string, password: string) {
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  return login(nationalCode.trim(), password);
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
