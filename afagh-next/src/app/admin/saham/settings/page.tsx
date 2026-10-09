import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { requireRole } from '@/lib/auth';
import SettingsClient from './SettingsClient';

export const dynamic = 'force-dynamic';

export interface InstituteCodeRow {
  id: number;
  universityId: number;
  facultyId: number | null;
  title: string;
  code: string;
  provinceCode: string | null;
  cityCode: string | null;
  isDefault: number;
  isActive: number;
}

export default async function SahamSettingsPage() {
  await requireRole(['ADMIN']);

  const [unis, facs, codes, provs, cities] = await Promise.all([
    db.execute<{ id: number; code: string; title: string } & Record<string, unknown>>(sql`
      SELECT id, code, title FROM universities WHERE "isActive" = 1 ORDER BY id`),
    db.execute<{ id: number; universityId: number; name: string } & Record<string, unknown>>(sql`
      SELECT id, "universityId", "name" FROM faculties ORDER BY "universityId", "name"`),
    db.execute<InstituteCodeRow & Record<string, unknown>>(sql`
      SELECT id, "universityId", "facultyId", title, code, "provinceCode", "cityCode", "isDefault", "isActive"
      FROM saham_institute_codes ORDER BY "universityId", "isDefault" DESC, title`),
    db.execute<{ code: string; title: string } & Record<string, unknown>>(sql`
      SELECT code, title FROM geo_provinces ORDER BY code`),
    db.execute<{ provinceCode: string; code: string; title: string } & Record<string, unknown>>(sql`
      SELECT "provinceCode", code, title FROM geo_cities ORDER BY "provinceCode", code`),
  ]);

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="font-bold">⚙️ اطلاعات اولیهٔ مؤسسات برای سهام</h2>
        <p className="mt-1 text-xs leading-6 text-slate-500">
          کد ۱۲ رقمی واحد/دانشکده، نام رسمی، و استان/شهر محل استقرار را <b>برای هر دانشگاه جدا</b> اینجا وارد کنید.
          همین اطلاعات در خروجی هر سه گزارش سهام استفاده می‌شود؛ اگر دانشکده‌ای کد نداشته باشد، ستون کد آن
          ردیف‌ها <b>خالی</b> می‌ماند (حدس زده نمی‌شود).
        </p>
      </div>
      <SettingsClient
        universities={unis.rows}
        faculties={facs.rows}
        initialCodes={codes.rows}
        provinces={provs.rows}
        cities={cities.rows}
      />
    </div>
  );
}
