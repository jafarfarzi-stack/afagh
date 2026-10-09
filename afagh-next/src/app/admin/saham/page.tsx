import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { requireRole } from '@/lib/auth';
import SahamClient from './SahamClient';

export const dynamic = 'force-dynamic';

export interface SahamStat {
  universityId: number;
  code: string;
  title: string;
  isDissolved: boolean;
  students: number;
  sahamCodeCount: number;
  /** درصد پر بودن ستون‌های تازهٔ سهام (چک سلامت بک‌فیل) */
  fill: {
    studyType: number;
    teachingMode: number;
    maritalStatus: number;
    birthProvince: number;
    residenceProvince: number;
  };
}

export default async function SahamPage() {
  await requireRole(['ADMIN']);

  const stats = (await db.execute<{
    id: number; code: string; title: string; kind: string;
    students: number; sahamCodes: number;
    studyType: number; teachingMode: number; maritalStatus: number;
    birthProvince: number; residenceProvince: number;
  }>(sql`
    SELECT u.id, u.code, u.title, u.kind,
      (SELECT count(*)::int FROM students s WHERE s."universityId" = u.id) AS "students",
      (SELECT count(*)::int FROM saham_institute_codes c
        WHERE c."universityId" = u.id AND c."isActive" = 1)          AS "sahamCodes",
      (SELECT count(*)::int FROM students s WHERE s."universityId" = u.id AND s."studyType"     IS NOT NULL) AS "studyType",
      (SELECT count(*)::int FROM students s WHERE s."universityId" = u.id AND s."teachingMode"  IS NOT NULL) AS "teachingMode",
      (SELECT count(*)::int FROM students s WHERE s."universityId" = u.id AND s."maritalStatus" IS NOT NULL) AS "maritalStatus",
      (SELECT count(*)::int FROM students s WHERE s."universityId" = u.id AND s."birthProvince"  IS NOT NULL) AS "birthProvince",
      (SELECT count(*)::int FROM students s WHERE s."universityId" = u.id AND s."residenceProvince" IS NOT NULL) AS "residenceProvince"
    FROM universities u
    WHERE u."isActive" = 1
    ORDER BY u.id
  `)).rows.map(r => ({
    universityId: r.id,
    code: r.code,
    title: r.title,
    isDissolved: r.kind === 'DISSOLVED',
    students: r.students,
    sahamCodeCount: r.sahamCodes,
    fill: {
      studyType: r.studyType,
      teachingMode: r.teachingMode,
      maritalStatus: r.maritalStatus,
      birthProvince: r.birthProvince,
      residenceProvince: r.residenceProvince,
    },
  }));

  const totalStudents = stats.reduce((a, s) => a + s.students, 0);

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="font-bold">📤 گزارش سالانهٔ سهام (سامانهٔ آماری مؤسسات آموزش عالی)</h2>
        <p className="mt-1 text-xs leading-6 text-slate-500">
          سهام هر سال چهار فایل اکسل با <b>سرستون ثابت</b> می‌گیرد و مقادیرش <b>متنی</b> است؛ داده‌های
          نامعتبر را به‌عنوان «نام مطابقت نداشت» به شما برمی‌گرداند. خروجی این صفحه دقیقاً همان قالب رسمی
          است: <b>۵۲ ستون</b>، کد ۱۲ رقمی واحد و شماره‌ها به‌صورت متن.
          <br />
          فعلاً <b>گزارش دانشجویان</b> فعال است؛ گزارش دانش‌آموختگان/آموزشگران/کارکنان به‌مرور افزوده می‌شود.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="card !p-3 text-center">
          <div className="text-2xl font-black text-slate-700">{totalStudents.toLocaleString('fa-IR')}</div>
          <div className="text-[11px] text-slate-500">دانشجوی قابل گزارش</div>
        </div>
        <div className="card !p-3 text-center">
          <div className="text-2xl font-black text-slate-700">{stats.filter(s => s.sahamCodeCount > 0).length.toLocaleString('fa-IR')}</div>
          <div className="text-[11px] text-slate-500">دانشگاه دارای کد سهام</div>
        </div>
        <div className="card !p-3 text-center">
          <div className="text-2xl font-black text-amber-600">
            {stats.filter(s => s.fill.birthProvince === 0 && s.students > 0).length.toLocaleString('fa-IR')}
          </div>
          <div className="text-[11px] text-slate-500">دانشگاه بدون استان تولد</div>
        </div>
      </div>

      <SahamClient stats={stats} />
    </div>
  );
}