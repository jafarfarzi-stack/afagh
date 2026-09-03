'use server';

import { redirect } from 'next/navigation';
import { changePassword, login, logout } from '@/lib/auth';

/** ورود — نتیجه به client برمی‌گردد تا خطا همان‌جا نشان داده شود */
export async function loginAndReport(nationalCode: string, password: string) {
  return login(nationalCode.trim(), password);
}

/** تغییر رمز (حلقهٔ تسویهٔ mustChangePassword) — نتیجه به client برمی‌گردد */
export async function changePasswordAction(currentPassword: string, newPassword: string) {
  return changePassword(currentPassword, newPassword);
}

export async function logoutAction() {
  await logout();
  redirect('/login');
}
