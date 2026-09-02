import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { db } from '@/db';
import { asc } from 'drizzle-orm';
import {
  degree_level_configs, majors, tuition_discount_types,
  tuition_formulas, tuition_sponsors,
} from '@/db/schema';
import RulesClient from './RulesClient';

export const dynamic = 'force-dynamic';

const FINANCE = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'];

export default async function FinanceRulesPage() {
  await requireRole(FINANCE);

  const [discountTypes, sponsors, formulas, degreeRows, majorRows] = await Promise.all([
    db.select().from(tuition_discount_types).orderBy(asc(tuition_discount_types.title)),
    db.select().from(tuition_sponsors).orderBy(asc(tuition_sponsors.title)),
    db.select().from(tuition_formulas).orderBy(asc(tuition_formulas.priority), asc(tuition_formulas.id)),
    db.select({ id: degree_level_configs.id, title: degree_level_configs.title })
      .from(degree_level_configs).orderBy(asc(degree_level_configs.title)),
    db.select({ id: majors.id, title: majors.name }).from(majors).orderBy(asc(majors.name)),
  ]);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-extrabold text-slate-800 text-base sm:text-lg">⚙️ تعاریف موتور مالی</h1>
          <p className="text-xs text-slate-500 mt-1">
            انواع تخفیف شهریه، بنیادهای حامی و فرمول‌های تخصیص — هیچ‌کدام در کد سخت‌کد نیستند
          </p>
        </div>
        <Link href="/admin/finance" className="rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700">
          بازگشت به کارتابل
        </Link>
      </div>

      <RulesClient
        discountTypes={discountTypes.map((d) => ({
          id: d.id, code: d.code, title: d.title, kind: d.kind,
          defaultPercent: Number(d.defaultPercent), defaultAmount: Number(d.defaultAmount),
          maxPercent: d.maxPercent === null ? null : Number(d.maxPercent),
          requiresApproval: d.requiresApproval === 1, requiresDocument: d.requiresDocument === 1,
          isActive: d.isActive === 1, note: d.note,
        }))}
        sponsors={sponsors.map((s) => ({
          id: s.id, code: s.code, title: s.title, contactInfo: s.contactInfo,
          settlementMethod: s.settlementMethod, isActive: s.isActive === 1, note: s.note,
        }))}
        formulas={formulas.map((f) => ({
          id: f.id, code: f.code, title: f.title,
          degreeLevelId: f.degreeLevelId, majorId: f.majorId,
          entryYearFrom: f.entryYearFrom, entryYearTo: f.entryYearTo,
          fixedAmount: Number(f.fixedAmount), perUnitTheory: Number(f.perUnitTheory),
          perUnitPractical: Number(f.perUnitPractical), perUnitGeneral: Number(f.perUnitGeneral),
          priority: f.priority, isActive: f.isActive === 1, note: f.note,
        }))}
        degrees={degreeRows}
        majorsOptions={majorRows}
      />
    </div>
  );
}
