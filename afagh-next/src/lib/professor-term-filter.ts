import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms } from '@/db/schema';
import { getTermScope, type TermScope } from '@/lib/term-scope';
import { currentTermFor, type AcademicTermRow } from '@/lib/terms';
import { DEMO_TERM_TITLE } from '@/lib/demo-professor-data';

export type ProfessorTermFilter = {
  terms: TermScope[];
  selectedTerm: TermScope | null;
  term: AcademicTermRow | null;
};

export async function professorTermFilter(universityId?: number | null): Promise<ProfessorTermFilter> {
  const scope = await getTermScope(universityId);
  const selectedTerm = scope.selectedId ? scope.terms.find(t => t.id === scope.selectedId) ?? null : null;

  if (!selectedTerm) {
    return { terms: scope.terms, selectedTerm: null, term: await currentTermFor(universityId) };
  }

  const rows = await db
    .select()
    .from(academic_terms)
    .where(
      and(
        eq(academic_terms.id, selectedTerm.id),
        universityId ? eq(academic_terms.universityId, universityId) : undefined,
      ),
    )
    .limit(1);

  return { terms: scope.terms, selectedTerm, term: rows[0] ?? null };
}

export function demoProfessorTermFilterNotice(termTitle: string): string {
  return `دادهٔ نمایشی حساب دموی استاد فقط برای «${DEMO_TERM_TITLE}» آماده است؛ برای نیمسال «${termTitle}» رکوردی در این حساب نمایشی ثبت نشده است. برای دیدن دادهٔ نمایشی، فیلتر نیمسال را پاک کنید.`;
}
