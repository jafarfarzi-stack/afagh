import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, universities } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { termContainsToday } from '@/lib/term-scope';
import TermsClient from './TermsClient';

export const dynamic = 'force-dynamic';

export default async function AdminTermsPage() {
  await requireRole(['ADMIN']);

  const unis = await db
    .select({ id: universities.id, code: universities.code, title: universities.title })
    .from(universities)
    .orderBy(universities.code);

  const today = new Date();
  const rows = await db
    .select({
      id: academic_terms.id,
      universityId: academic_terms.universityId,
      termCode: academic_terms.termCode,
      title: academic_terms.title,
      termType: academic_terms.termType,
      academicYear: academic_terms.academicYear,
      startDate: academic_terms.startDate,
      endDate: academic_terms.endDate,
      isCurrent: academic_terms.isCurrent,
    })
    .from(academic_terms)
    .orderBy(desc(academic_terms.sortOrder), desc(academic_terms.termCode));

  const terms = rows.map((r) => ({
    id: r.id,
    universityId: r.universityId,
    termCode: r.termCode,
    title: r.title,
    termType: r.termType,
    academicYear: r.academicYear,
    startDate: r.startDate ? r.startDate.toISOString() : null,
    endDate: r.endDate ? r.endDate.toISOString() : null,
    isCurrent: r.isCurrent === 1,
    containsToday: termContainsToday(r, today),
  }));

  const activeCount = terms.filter((t) => t.isCurrent).length;
  const containingCount = terms.filter((t) => t.containsToday).length;

  return (
    <TermsClient
      today={today.toISOString()}
      universities={unis.map((u) => ({ id: u.id, code: u.code, title: u.title }))}
      terms={terms}
      activeCount={activeCount}
      containingCount={containingCount}
    />
  );
}
