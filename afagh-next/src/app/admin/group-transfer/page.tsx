import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import GroupTransferClient from './GroupTransferClient';

export const dynamic = 'force-dynamic';

/** انتقال دانشجو بین گروه‌های یک درس (با گیت‌های موتور ثبت‌نام + نادیده‌گرفتن با دلیل) */
export default async function GroupTransferPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  const uni = await getCurrentUniversity().catch(() => null);
  const u = uni?.id ?? null;

  const terms = (await db.select({ id: academic_terms.id, title: academic_terms.title, isCurrent: academic_terms.isCurrent })
    .from(academic_terms)
    .where(u ? eq(academic_terms.universityId, u) : undefined)
    .orderBy(desc(academic_terms.id)))
    .map(t => ({ id: t.id, title: t.title, isCurrent: (t.isCurrent ?? 0) === 1 }));

  return <GroupTransferClient terms={terms} />;
}