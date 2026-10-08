import { db } from '@/db';
import { login_notices, login_slides, universities } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { asc } from 'drizzle-orm';
import LoginShowcaseClient from './LoginShowcaseClient';

export const dynamic = 'force-dynamic';

export default async function LoginShowcasePage() {
  await requireRole(['ADMIN']);
  const [unis, notices, slides] = await Promise.all([
    db.select().from(universities).orderBy(asc(universities.id)),
    db.select().from(login_notices).orderBy(asc(login_notices.sortOrder), asc(login_notices.id)),
    db.select().from(login_slides).orderBy(asc(login_slides.sortOrder), asc(login_slides.id)),
  ]);

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-sm">🖼️ ویترین صفحه ورود</h2>
            <p className="mt-1 text-xs leading-6 text-slate-500">
              اطلاعیه‌ها و اسلایدهای صفحه ورود + ارم و نام دانشگاه‌ها — همه از همین‌جا مدیریت می‌شود.
              «سراسری» یعنی برای همه دانشگاه‌ها نمایش داده می‌شود.
            </p>
          </div>
          <a href="/login" target="_blank" rel="noopener noreferrer" className="btn-primary text-xs">
            👁️ پیش‌نمایش صفحه ورود
          </a>
        </div>
      </div>
      <LoginShowcaseClient
        universities={unis.map(u => ({ id: u.id, code: u.code, title: u.title, logoUrl: u.logoUrl ?? null }))}
        notices={notices.map(n => ({
          id: n.id, universityId: n.universityId, title: n.title, body: n.body,
          kind: n.kind, isActive: n.isActive === 1, sortOrder: n.sortOrder,
        }))}
        slides={slides.map(s => ({
          id: s.id, universityId: s.universityId, title: s.title, subtitle: s.subtitle,
          imageUrl: s.imageUrl, linkUrl: s.linkUrl, isActive: s.isActive === 1, sortOrder: s.sortOrder,
        }))}
      />
    </div>
  );
}
