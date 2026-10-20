import { asc, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import { courses, equivalence_clusters } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import EquivalenceClustersClient from './EquivalenceClustersClient';

export const dynamic = 'force-dynamic';

export default async function AdminEquivalenceClustersPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU']);

  const university = await getCurrentUniversity().catch(() => null);
  const universityId = university?.id ?? null;

  const clusterWhere = universityId == null
    ? undefined
    : or(eq(equivalence_clusters.universityId, universityId), isNull(equivalence_clusters.universityId));
  const courseWhere = universityId == null ? undefined : eq(courses.universityId, universityId);

  const [clusterRows, courseRows] = await Promise.all([
    db
      .select({
        id: equivalence_clusters.id,
        clusterTitle: equivalence_clusters.clusterTitle,
        isGeneralService: equivalence_clusters.isGeneralService,
        universityId: equivalence_clusters.universityId,
      })
      .from(equivalence_clusters)
      .where(clusterWhere)
      .orderBy(asc(equivalence_clusters.clusterTitle)),
    db
      .select({
        id: courses.id,
        code: courses.code,
        title: courses.title,
        units: courses.units,
        clusterId: courses.clusterId,
      })
      .from(courses)
      .where(courseWhere)
      .orderBy(asc(courses.code)),
  ]);

  return (
    <div dir="rtl" className="min-h-screen bg-sky-50/70 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-5">
        <header className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h1 className="text-lg font-extrabold text-slate-900">🧩 خوشه‌های دروس هم‌ارز</h1>
          <p className="mt-1 text-xs text-slate-600 leading-relaxed">
            دروسی که یک محتوا با کدهای متفاوت دارند در یک خوشه قرار می‌گیرند؛ گذراندن هر عضو، پیش‌نیازهای اعضای دیگر را هم برآورده می‌کند و ظرفیت و امتحان آن‌ها مشترک می‌شود.
          </p>
        </header>

        <EquivalenceClustersClient
          clusters={clusterRows.map(c => ({ ...c, isGeneralService: c.isGeneralService ?? 0 }))}
          courses={courseRows.map(c => ({ ...c, units: Number(c.units ?? 0) }))}
        />
      </div>
    </div>
  );
}
