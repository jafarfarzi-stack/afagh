import { redirect } from 'next/navigation';

/** مسیر قدیمی راهنما — به مرکز راهنمای نقش‌محور منتقل شد. */
export default function ManualRedirect() {
  redirect('/help');
}
