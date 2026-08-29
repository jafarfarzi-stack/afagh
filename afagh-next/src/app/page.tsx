import { redirect } from 'next/navigation';
import { getSessionUser, homeFor } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getSessionUser();
  redirect(user ? homeFor(user.roles) : '/login');
}
