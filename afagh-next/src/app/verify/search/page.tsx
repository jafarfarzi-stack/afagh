import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function VerifySearchPage({
  searchParams,
}: {
  searchParams: { code?: string };
}) {
  const code = searchParams.code ? encodeURIComponent(searchParams.code.trim()) : '';
  if (code) {
    redirect(`/verify/${code}`);
  }
  redirect('/verify');
}
