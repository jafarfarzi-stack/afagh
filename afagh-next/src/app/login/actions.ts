'use server';

import { redirect } from 'next/navigation';
import { login, logout } from '@/lib/auth';

/** ورود — نتیجه به client برمی‌گردد تا خطا همان‌جا نشان داده شود */
export async function loginAndReport(nationalCode: string, password: string) {
  return login(nationalCode.trim(), password);
}

export async function logoutAction() {
  await logout();
  redirect('/login');
}
