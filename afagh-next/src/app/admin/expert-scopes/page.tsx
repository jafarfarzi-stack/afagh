import { requireRole } from '@/lib/auth';
import { getScopeSelect, listExpertCandidates } from './actions';
import ExpertScopesClient from './ExpertScopesClient';

export const dynamic = 'force-dynamic';

/** تخصیص دامنهٔ دسترسی به کارشناسان آموزش (دانشگاه/دانشکده/گروه/رشته) */
export default async function ExpertScopesPage() {
  await requireRole(['ADMIN']);
  const [sel, cands] = await Promise.all([
    getScopeSelect().catch(() => null),
    listExpertCandidates().catch(() => ({ ok: false as const, error: 'خطا' })),
  ]);
  if (!sel) return <div className="card p-6 text-slate-500">خطا در بارگذاری.</div>;
  return <ExpertScopesClient select={sel} initialCandidates={(cands as any).items ?? []} />;
}