import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { payroll_statements, professor_term_contracts, staff, users } from '@/db/schema';
import { requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const stFa: Record<string, string> = { DRAFT: 'پیش‌نویس', MID_TERM_PAID: 'پرداخت میان‌ترم', FINAL_SETTLED: 'تسویه نهایی' };

export default async function PayrollPage() {
  await requireRole(['ADMIN']);

  const rows = await db
    .select({ id: payroll_statements.id, name: users.firstName, family: users.lastName, staffCode: staff.staffCode, net: payroll_statements.netAmount, gross: payroll_statements.grossAmount, status: payroll_statements.status })
    .from(payroll_statements)
    .innerJoin(professor_term_contracts, eq(professor_term_contracts.id, payroll_statements.contractId))
    .innerJoin(staff, eq(staff.id, professor_term_contracts.staffId))
    .innerJoin(users, eq(users.id, staff.userId));

  const total = rows.reduce((s, r) => s + Number(r.net ?? 0), 0);
  const n = rows.length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="card text-center"><p className="text-2xl font-bold text-indigo-700">{total.toLocaleString('fa-IR')}</p><p className="text-xs text-slate-500">جمع خالص (ري)</p></div>
        <div className="card text-center"><p className="text-2xl font-bold text-slate-700">{n}</p><p className="text-xs text-slate-500">تعداد فیش‌ها</p></div>
      </div>
      <div className="card">
        <h2 className="mb-3 font-bold">نمای کلی حقوق استادان (§۲۲۴۳)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead><tr className="text-xs text-slate-500"><th className="p-2">استاد</th><th className="p-2">کد</th><th className="p-2">ناخالص</th><th className="p-2">خالص</th><th className="p-2">وضعیت</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-slate-400">فیشی صادر نشده است.</td></tr>}
              {rows.map(r => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="p-2">{r.name} {r.family}</td>
                  <td className="p-2 font-mono text-xs" dir="ltr">{r.staffCode}</td>
                  <td className="p-2">{Number(r.gross ?? 0).toLocaleString('fa-IR')}</td>
                  <td className="p-2 font-bold">{Number(r.net ?? 0).toLocaleString('fa-IR')}</td>
                  <td className="p-2"><span className="badge bg-slate-100 text-slate-700">{stFa[r.status ?? ''] ?? r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
