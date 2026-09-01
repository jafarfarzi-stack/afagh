import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { legacy_financial_records, legacy_sources, legacy_tuition_formulas } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { ENTITIES } from '@/lib/migration/engine';
import { MAP_DOMAINS } from '@/lib/migration/codemap';
import { listCompareRuns } from '@/lib/migration/tuition';
import { gradeStats } from '@/lib/migration/grades';
import MigrationClient from './MigrationClient';

export const dynamic = 'force-dynamic';

const DEFAULT_SOURCE = 'LEGACY';

export default async function MigrationPage() {
  await requireRole(['ADMIN']);

  const [sourcesRaw, formulas, compareRuns, finCount, gStats] = await Promise.all([
    db.select({ code: legacy_sources.code, title: legacy_sources.title }).from(legacy_sources).orderBy(legacy_sources.code),
    db.select().from(legacy_tuition_formulas).where(eq(legacy_tuition_formulas.sourceCode, DEFAULT_SOURCE)).orderBy(legacy_tuition_formulas.formulaCode).limit(200),
    listCompareRuns(15),
    db.select({ n: sql<number>`count(*)::int` }).from(legacy_financial_records).where(eq(legacy_financial_records.sourceCode, DEFAULT_SOURCE)),
    gradeStats(DEFAULT_SOURCE),
  ]);

  const sources = sourcesRaw.length ? sourcesRaw : [{ code: DEFAULT_SOURCE, title: 'سیستم قدیمی (پیش‌فرض)' }];

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="font-bold">انتقال داده از سرورهای قدیمی (ETL)</h2>
        <p className="mt-1 text-xs leading-6 text-slate-500">
          چهار میز کار در یک جا: <b>دادهٔ پایه</b> (دانشجو/درس/ترم/مالی)، <b>تطبیق کدها</b> (رشته، مقطع، ترم، درس و…)،
          <b> فرمول‌های شهریه و مقایسه با دادهٔ مالی قدیمی</b> و <b>نمرات</b>. ورودی همهٔ بخش‌ها فایل
          <b> اکسل (xlsx)</b> یا CSV است و برای هر بخش «قالب اکسل» آمادهٔ دانلود وجود دارد؛ خروجی گزارش‌ها هم اکسل است.
          هیچ داده‌ای بدون مرحلهٔ بازبینی روی سامانه نوشته نمی‌شود.
        </p>
      </div>

      <MigrationClient
        entities={ENTITIES}
        domains={MAP_DOMAINS.map(d => ({ id: d.id, title: d.title, hint: d.hint }))}
        sources={sources}
        formulas={formulas.map(f => ({
          id: f.id, formulaCode: f.formulaCode, title: f.title, termCode: f.termCode,
          degreeCode: f.degreeCode, majorCode: f.majorCode, fixedAmount: f.fixedAmount,
          perUnitTheory: f.perUnitTheory, perUnitPractical: f.perUnitPractical,
          perUnitGeneral: f.perUnitGeneral, expression: f.expression,
        }))}
        compareRuns={compareRuns.map(r => ({
          id: r.id, termCode: r.termCode, tolerance: r.tolerance, totalRows: r.totalRows,
          matched: r.matched, mismatched: r.mismatched, unresolved: r.unresolved,
          sumLegacy: r.sumLegacy, sumComputed: r.sumComputed, sumDiff: r.sumDiff,
          createdAt: r.createdAt ? r.createdAt.toISOString() : null,
        }))}
        financialCount={Number(finCount[0]?.n ?? 0)}
        gradeStats={gStats}
      />
    </div>
  );
}


