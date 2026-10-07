import { cookies } from 'next/headers';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms } from '@/db/schema';

export const TERM_COOKIE = 'afagh_term';

export type TermScope = {
  id: number;
  termCode: string;
  title: string;
  startDate: Date | null;
  endDate: Date | null;
  isCurrent: boolean;
  isEffectiveCurrent: boolean;
};

type TermLike = {
  id: number;
  startDate: Date | null;
  endDate: Date | null;
  isCurrent?: boolean | number | null;
};

export function termContainsToday(term: TermLike, today: Date): boolean {
  if (!term.startDate) return false;
  const start = new Date(term.startDate).getTime();
  const now = today.getTime();
  if (Number.isNaN(start) || now < start) return false;
  if (!term.endDate) return true;
  const end = new Date(term.endDate).getTime();
  if (Number.isNaN(end)) return true;
  return now <= end;
}

function byStartDesc(a: TermLike, b: TermLike): number {
  const av = a.startDate ? new Date(a.startDate).getTime() : 0;
  const bv = b.startDate ? new Date(b.startDate).getTime() : 0;
  return bv - av;
}

export function pickEffectiveTerm<T extends TermLike>(terms: T[], today: Date = new Date()): T | null {
  if (!terms || terms.length === 0) return null;
  const containing = terms.filter((t) => termContainsToday(t, today));
  if (containing.length) return [...containing].sort(byStartDesc)[0];
  const flagged = terms.filter((t) => !!t.isCurrent);
  if (flagged.length) return [...flagged].sort(byStartDesc)[0];
  const started = terms.filter((t) => t.startDate && new Date(t.startDate).getTime() <= today.getTime());
  if (started.length) return [...started].sort(byStartDesc)[0];
  const upcoming = terms
    .filter((t) => t.startDate && new Date(t.startDate).getTime() > today.getTime())
    .sort((a, b) => byStartDesc(b, a));
  return upcoming[0] ?? null;
}

export async function listTermsForUniversity(universityId: number | null | undefined): Promise<TermScope[]> {
  if (!universityId) return [];
  try {
    const rows = await db
      .select({
        id: academic_terms.id,
        termCode: academic_terms.termCode,
        title: academic_terms.title,
        startDate: academic_terms.startDate,
        endDate: academic_terms.endDate,
        isCurrent: academic_terms.isCurrent,
      })
      .from(academic_terms)
      .where(eq(academic_terms.universityId, universityId))
      .orderBy(desc(academic_terms.sortOrder), desc(academic_terms.termCode));
    const effective = pickEffectiveTerm(
      rows.map((r) => ({ ...r, isCurrent: !!r.isCurrent })),
      new Date(),
    );
    return rows.map((r) => ({
      id: r.id,
      termCode: r.termCode,
      title: r.title,
      startDate: r.startDate,
      endDate: r.endDate,
      isCurrent: !!r.isCurrent,
      isEffectiveCurrent: effective ? effective.id === r.id : false,
    }));
  } catch {
    return [];
  }
}

export async function getTermScope(universityId: number | null | undefined): Promise<{
  terms: TermScope[];
  selectedId: number | null;
  effectiveId: number | null;
}> {
  const terms = await listTermsForUniversity(universityId);
  const effectiveId = terms.find((t) => t.isEffectiveCurrent)?.id ?? null;
  const raw = (await cookies()).get(TERM_COOKIE)?.value?.trim();
  const wanted = raw ? Number(raw) : NaN;
  const selectedId = Number.isFinite(wanted) && terms.some((t) => t.id === wanted) ? wanted : null;
  return { terms, selectedId, effectiveId };
}

export async function getSelectedTerm(universityId: number | null | undefined): Promise<TermScope | null> {
  const { terms, selectedId } = await getTermScope(universityId);
  if (selectedId) return terms.find((t) => t.id === selectedId) ?? null;
  return terms.find((t) => t.isEffectiveCurrent) ?? null;
}