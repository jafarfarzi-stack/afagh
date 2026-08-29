import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { electronic_documents } from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  const user = await requireRole(['PROFESSOR']);
  const me = await getStaffByUser(user.id);
  const docs = me
    ? await db.select().from(electronic_documents).where(eq(electronic_documents.staffId, me.id)).orderBy(desc(electronic_documents.id))
    : [];

  return (
    <div className="card space-y-2">
      <h2 className="font-bold">اسناد الکترونیک (قرارداد / احضاریه)</h2>
      {docs.length === 0 && <p className="text-sm text-slate-500">سندی برای شما ثبت نشده است.</p>}
      {docs.map(d => (
        <Link key={d.id} href={'/professor/documents/' + d.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm hover:bg-slate-100">
          <div>
            <p className="font-medium">{d.title}</p>
            <p className="text-xs text-slate-500">{d.docType === 'CONTRACT' ? 'قرارداد ترمی' : 'احضاریه'} · {new Date(d.createdAt ?? '').toLocaleDateString('fa-IR')}</p>
          </div>
          <span className={'badge ' + (d.signatureStatus === 'SIGNED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}>
            {d.signatureStatus === 'SIGNED' ? 'امضا شده' : 'در انتظار امضا'}
          </span>
        </Link>
      ))}
    </div>
  );
}
