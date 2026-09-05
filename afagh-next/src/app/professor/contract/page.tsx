import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { electronic_documents, users } from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';
import { currentTerm } from '@/lib/payroll-engine';
import { ensureContractDocument } from '@/lib/contract-engine';
import ProfessorContractClient, { type ContractView } from './ProfessorContractClient';

export const dynamic = 'force-dynamic';

/** قرارداد تدریس — همهٔ ارقام از درس‌های واقعی استاد و تنظیمات سامانه محاسبه می‌شود */
export default async function ProfessorContractPage() {
  const user = await requireRole(['PROFESSOR']);
  const me = await getStaffByUser(user.id);

  if (!me) {
    return (
      <div className="card text-center p-8">
        <p className="text-slate-600 font-bold">پروندهٔ هیئت علمی یافت نشد.</p>
      </div>
    );
  }

  const term = await currentTerm();
  if (!term) {
    return (
      <div className="card text-center p-8">
        <p className="text-slate-600 font-bold">ترم جاری تعیین نشده است — با کارشناس آموزش هماهنگ کنید.</p>
      </div>
    );
  }

  const [identity] = await db.select({ nationalCode: users.nationalCode }).from(users).where(eq(users.id, user.id)).limit(1);
  const res = await ensureContractDocument(me.id, term.id, { name: user.name, nationalCode: identity?.nationalCode ?? '' });
  if (!res.ok) {
    return (
      <div className="card text-center p-8">
        <p className="text-rose-700 font-bold">{res.error}</p>
      </div>
    );
  }

  const [doc] = await db
    .select({ hash: electronic_documents.documentHash, signedAt: electronic_documents.signedAt })
    .from(electronic_documents).where(eq(electronic_documents.id, res.documentId)).limit(1);

  const contract: ContractView = {
    ...res.contract,
    signatureStatus: res.signed ? 'SIGNED' : 'PENDING',
    signedAt: doc?.signedAt ? doc.signedAt.toLocaleString('fa-IR') : null,
    digitalHash: doc?.hash ?? null,
  };

  return <ProfessorContractClient initialContract={contract} />;
}
