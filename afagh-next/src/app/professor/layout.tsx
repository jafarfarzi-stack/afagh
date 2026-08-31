import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { electronic_documents } from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';
import { logoutAction } from '../login/actions';

export default async function ProfessorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['PROFESSOR']);
  const me = await getStaffByUser(user.id);
  const pending = me ? await db.select({ id: electronic_documents.id }).from(electronic_documents).where(eq(electronic_documents.staffId, me.id)) : [];
  const pendingCount = pending.length; // بنر یادآور اسناد بی‌امضا (§۲۹۲۶)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between p-4">
          <div>
            <p className="font-bold">داشبورد استاد</p>
            <p className="text-xs opacity-70">{user.name}{me ? ' · ' + me.staffCode : ''}</p>
          </div>
          <form action={logoutAction}><button className="text-xs underline opacity-70">خروج</button></form>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-4 px-4 pb-3 text-sm flex-wrap items-center">
          <Link href="/professor" className="opacity-90 hover:opacity-100">کلاس‌های من</Link>
          <Link href="/professor/availability" className="opacity-90 hover:opacity-100 font-bold text-amber-300">
            🗓️ فرم اعلام ساعات حضور نیمسال
          </Link>
          <Link href="/professor/documents" className="opacity-90 hover:opacity-100">
            اسناد و امضا {pendingCount > 0 && <span className="mr-1 rounded-full bg-amber-500 px-2 text-xs text-slate-900">{pendingCount}</span>}
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl p-4">{children}</main>
    </div>
  );
}
