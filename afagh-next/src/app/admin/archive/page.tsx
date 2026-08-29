import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { document_categories, document_types, student_documents, users } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import ArchiveClient from './ArchiveClient';

export const dynamic = 'force-dynamic';

const stFa: Record<string, string> = { PENDING: 'در انتظار', VERIFIED: 'تاییدشده', REJECTED: 'ردشده' };
const stColor: Record<string, string> = { PENDING: 'bg-slate-100 text-slate-700', VERIFIED: 'bg-emerald-100 text-emerald-800', REJECTED: 'bg-red-100 text-red-700' };

export default async function ArchivePage() {
  await requireRole(['ADMIN', 'ARCHIVE_EXPERT']);

  const rows = await db
    .select({
      id: student_documents.id,
      fileName: student_documents.fileName,
      mimeType: student_documents.mimeType,
      status: student_documents.verificationStatus,
      reason: student_documents.rejectionReason,
      uploadedAt: student_documents.uploadedAt,
      firstName: users.firstName, lastName: users.lastName, nationalCode: users.nationalCode,
      category: document_categories.title,
      type: document_types.title,
    })
    .from(student_documents)
    .innerJoin(users, eq(users.id, student_documents.personUserId))
    .leftJoin(document_categories, eq(document_categories.id, student_documents.categoryId))
    .leftJoin(document_types, eq(document_types.id, student_documents.typeId))
    .orderBy(desc(student_documents.id));

  const cats = await db.select().from(document_categories);
  const types = await db.select().from(document_types);

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="font-bold">بایگانی الکترونیک مدارک — Object Storage (§۲۴۳۸)</h2>
        <p className="mt-1 text-xs text-slate-500">
          فایل‌ها در MinIO (باکت afagh-archive) نگهداری می‌شوند؛ دیتابیس فقط URL و هش دارد. مشاهده = لینک امضاشدهٔ ۵ دقیقه‌ای.
        </p>
      </div>
      <ArchiveClient
        rows={rows.map(r => ({
          id: r.id, fileName: r.fileName, status: r.status ?? 'PENDING', reason: r.reason,
          uploadedAt: r.uploadedAt ? r.uploadedAt.toISOString() : null,
          student: r.firstName + ' ' + r.lastName, nationalCode: r.nationalCode,
          category: r.category ?? '—', type: r.type ?? '—',
        }))}
        stFa={stFa} stColor={stColor}
        cats={cats.map(c => ({ id: c.id, title: c.title }))}
        types={types.map(t => ({ id: t.id, title: t.title, categoryId: t.categoryId }))}
      />
    </div>
  );
}
