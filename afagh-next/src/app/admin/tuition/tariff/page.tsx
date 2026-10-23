import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { faculties, majors, tuition_term_tariff } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { MALI_TYPE_LABELS } from '@/lib/mali-types';
import { getCurrentUniversity } from '@/lib/university-scope';
import TariffClient, { type TariffGroup } from './TariffClient';

export const dynamic = 'force-dynamic';

export default async function AnnualTariffPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  await requireRole(['ADMIN', 'FINANCE_EXPERT', 'FINANCE']);
  const uni = await getCurrentUniversity().catch(() => null);
  if (!uni) {
    return <div className="p-6 text-sm text-rose-700">دانشگاه فعال مشخص نیست.</div>;
  }

  const sp = await searchParams;
  const yearRows = await db
    .selectDistinct({ termYear: tuition_term_tariff.termYear })
    .from(tuition_term_tariff)
    .where(eq(tuition_term_tariff.universityId, uni.id))
    .orderBy(desc(tuition_term_tariff.termYear));
  const years = yearRows
    .map((y) => Number(y.termYear))
    .filter((y) => Number.isFinite(y) && y > 0);
  const wanted = Number(sp?.year ?? 0);
  const year = years.includes(wanted) ? wanted : years[0] ?? 0;

  const rows = year
    ? await db
        .select({
          uPriceCode: tuition_term_tariff.uPriceCode,
          maliType: tuition_term_tariff.maliType,
          th: tuition_term_tariff.thPrice,
          op: tuition_term_tariff.opPrice,
          entryYear: tuition_term_tariff.entryYear,
          majorCode: majors.majorCode,
          majorTitle: majors.name,
          facultyTitle: faculties.name,
          source: tuition_term_tariff.source,
        })
        .from(tuition_term_tariff)
        .leftJoin(majors, eq(majors.id, tuition_term_tariff.majorId))
        .leftJoin(faculties, eq(faculties.id, majors.facultyId))
        .where(and(
          eq(tuition_term_tariff.universityId, uni.id),
          eq(tuition_term_tariff.termYear, year),
        ))
        .orderBy(asc(tuition_term_tariff.uPriceCode), asc(tuition_term_tariff.maliType))
    : [];

  // گروه‌بندی: کد قیمت → نرخ هر نوع درس + رشته‌ها/ورودی‌های همان گروه
  const groupRates = new Map<string, Map<number, { maliType: number; th: number; op: number }>>();
  const groupMajors = new Map<string, Map<string, { code: string; title: string; faculty: string; entryYears: Set<number> }>>();
  const groupSource = new Map<string, string>();
  for (const r of rows) {
    const code = String(r.uPriceCode ?? '—');
    const rates = groupRates.get(code) || new Map();
    if (!rates.has(Number(r.maliType))) {
      rates.set(Number(r.maliType), { maliType: Number(r.maliType), th: Number(r.th), op: Number(r.op) });
    }
    groupRates.set(code, rates);
    if (!groupSource.has(code)) groupSource.set(code, String(r.source ?? ''));
    const byMajor = groupMajors.get(code) || new Map();
    const mkey = String(r.majorCode ?? '');
    const entry = byMajor.get(mkey) || {
      code: mkey,
      title: String(r.majorTitle ?? ''),
      faculty: String(r.facultyTitle ?? ''),
      entryYears: new Set<number>(),
    };
    entry.entryYears.add(Number(r.entryYear));
    byMajor.set(mkey, entry);
    groupMajors.set(code, byMajor);
  }

  const groups: TariffGroup[] = [...groupRates.entries()]
    .map(([code, rates]) => ({
      uPriceCode: code,
      source: groupSource.get(code) ?? '',
      rates: [...rates.values()].sort((a, b) => a.maliType - b.maliType),
      majors: [...(groupMajors.get(code) ?? new Map()).values()]
        .map((m) => ({
          code: m.code,
          title: m.title,
          faculty: m.faculty,
          entryYears: [...m.entryYears].sort((a, b) => a - b),
        }))
        .sort((a, b) => a.code.localeCompare(b.code, 'fa')),
    }))
    .sort((a, b) => a.uPriceCode.localeCompare(b.uPriceCode));

  return (
    <TariffClient
      universityTitle={uni.title}
      years={years}
      year={year}
      groups={groups}
      labels={MALI_TYPE_LABELS}
    />
  );
}
