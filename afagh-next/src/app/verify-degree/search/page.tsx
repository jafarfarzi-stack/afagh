import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** فرم ‎/verify-degree‎ به اینجا GET می‌زند؛ کد را به مسیر استعلام می‌برد. */
export default async function VerifyDegreeSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code: raw } = await searchParams;
  const code = (raw ?? '').trim();
  redirect(code ? `/verify-degree/${encodeURIComponent(code)}` : '/verify-degree');
}
