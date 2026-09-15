import { db } from '@/db';
import { universities, samin_connections } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import UniversitiesClient from './UniversitiesClient';

export const dynamic = 'force-dynamic';

export default async function UniversitiesPage() {
  await requireRole(['ADMIN']);
  const unis = await db.select().from(universities).orderBy(universities.code);
  const conns = await db.select().from(samin_connections);

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="font-bold text-sm">مدیریت دانشگاه‌ها (چندمستأجری)</h2>
        <p className="mt-1 text-xs leading-6 text-slate-500">
          هر دانشگاه (آفاق + منحل‌شده‌ها) یک ردیف با کد یکتاست. آینده: دانشگاه جدید = فقط «افزودن» از همین‌جا — سپس در
          <b> انتقال داده</b> فایل سما و در <b>ثمین</b> کلید سجاد آن دانشگاه را وصل کنید.
        </p>
      </div>
      <UniversitiesClient
        universities={unis.map(u => ({ id: u.id, code: u.code, title: u.title, kind: u.kind, status: u.status, saminCode: u.saminCode, province: u.province, dissolvedAt: u.dissolvedAt, isActive: u.isActive }))}
        connections={conns.map(c => ({ universityId: c.universityId, apiBaseUrl: c.apiBaseUrl, authBaseUrl: c.authBaseUrl, clientId: c.clientId, username: c.username, isEnabled: c.isEnabled, lastSyncAt: c.lastSyncAt ? c.lastSyncAt.toISOString() : null, hasSecret: !!c.clientSecretEnc }))}
      />
    </div>
  );
}
