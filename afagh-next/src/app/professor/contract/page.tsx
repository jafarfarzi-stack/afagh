import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { electronic_documents, users } from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';
import { currentTermFor } from '@/lib/terms';
import { ensureContractDocument } from '@/lib/contract-engine';
import { universityTitle } from '@/lib/professor-data';
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

  const universityId = me.universityId ?? user.universityId ?? null;
  const term = await currentTermFor(universityId);
  if (!term) {
    return (
      <div className="card text-center p-8 space-y-2">
        <p className="text-slate-600 font-bold">نیمسال تحصیلی جاری برای دانشگاه شما تعیین نشده است.</p>
        <p className="text-xs text-slate-500">پس از تعیین نیمسال جاری توسط اداره آموزش، فرم قرارداد تدریس همین‌جا ساخته می‌شود.</p>
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

  if (res.contract.lines.length === 0) {
    return (
      <div className="card text-center p-8 space-y-2">
        <p className="text-slate-600 font-bold">در این نیمسال درسی به شما تخصیص نیافته است.</p>
        <p className="text-xs text-slate-500">
          تا زمانی که جدول دروس مصوب شما خالی باشد، مبلغ و ساعات قرارداد قابل محاسبه نیست.
        </p>
      </div>
    );
  }

  const [doc] = await db
    .select({ hash: electronic_documents.documentHash, signedAt: electronic_documents.signedAt })
    .from(electronic_documents).where(eq(electronic_documents.id, res.documentId)).limit(1);

  const universityTitleText = await universityTitle(universityId);

  const contract: ContractView = {
    ...res.contract,
    signatureStatus: res.signed ? 'SIGNED' : 'PENDING',
    signedAt: doc?.signedAt ? doc.signedAt.toLocaleString('fa-IR') : null,
    digitalHash: doc?.hash ?? null,
  };

  return (
    <ProfessorContractClient
      initialContract={contract}
      universityTitle={universityTitleText ?? ''}
    />
  );
}
