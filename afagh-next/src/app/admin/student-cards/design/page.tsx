import Link from 'next/link';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { degree_level_configs, majors, students, universities, users } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getPublicBaseUrl, getSettings } from '@/lib/settings';
import { getCurrentUniversity } from '@/lib/university-scope';
import { qrSvg } from '@/lib/qr';
import { toShamsi } from '@/lib/shamsi';
import { parseCardDesign, type CardData } from '@/components/StudentCardView';
import CardDesignerClient from './CardDesignerClient';

export const dynamic = 'force-dynamic';

const DESIGN_KEYS = [
  'STUDENT_CARD_TEMPLATE',
  'STUDENT_CARD_ACCENT',
  'STUDENT_CARD_HEADER',
  'STUDENT_CARD_FOOTER',
  'STUDENT_CARD_FIELDS',
  'STUDENT_CARD_SHOW_PHOTO',
  'STUDENT_CARD_SHOW_QR',
  'STUDENT_CARD_SHOW_LOGO',
] as const;

/**
 * فرمِ حرفه‌ای «طراحی کارت دانشجو» — با پیش‌نمایشِ زنده.
 *
 * طراحی (قالب/رنگ/فیلدها/عکس/QR/آرم) در تنظیمات ذخیره می‌شود و صفحهٔ چاپ
 * کارت (`card/[studentId]`) دقیقاً از همان‌ها می‌خواند؛ پس آنچه این‌جا
 * می‌بینید همان چیزی است که دانشجو تحویل می‌گیرد.
 */
export default async function CardDesignPage() {
  await requireRole(['ADMIN']);

  const uni = await getCurrentUniversity().catch(() => null);
  const values = await getSettings(DESIGN_KEYS);
  const design = parseCardDesign(values);

  // ── نمونهٔ واقعی برای پیش‌نمایش (اولین دانشجوی فعالِ همین دانشگاه) ──
  let sample: CardData = {
    firstName: 'نام',
    lastName: 'دانشجو',
    studentCode: '401234567',
    nationalCode: '0012345678',
    majorName: 'مهندسی کامپیوتر',
    degreeTitle: 'کارشناسی',
    entryYear: 1404,
    status: 'PENDING',
    validUntil: toShamsi(new Date(Date.now() + 365 * 864e5).toISOString()),
    uniTitle: uni?.title ?? 'دانشگاه آفاق',
    logoUrl: null,
    photoUserId: null,
    hasPhoto: false,
  };
  try {
    if (uni?.id) {
      const [row] = await db
        .select({
          firstName: users.firstName,
          lastName: users.lastName,
          studentCode: students.studentCode,
          nationalCode: users.nationalCode,
          majorName: majors.name,
          degreeTitle: degree_level_configs.title,
          entryYear: students.entryYear,
          status: students.status,
          photoUserId: students.userId,
          hasPhoto: users.photoKey,
          uniTitle: universities.title,
          logoUrl: universities.logoUrl,
        })
        .from(students)
        .innerJoin(users, eq(users.id, students.userId))
        .leftJoin(majors, eq(majors.id, students.majorId))
        .leftJoin(degree_level_configs, eq(degree_level_configs.id, students.degreeLevelId))
        .leftJoin(universities, eq(universities.id, students.universityId))
        .where(and(eq(students.universityId, uni.id), eq(students.status, 'ACTIVE')))
        .orderBy(desc(students.id))
        .limit(1);
      if (row) {
        sample = {
          ...sample,
          ...row,
          hasPhoto: !!row.hasPhoto,
          validUntil: toShamsi(new Date(Date.now() + 365 * 864e5).toISOString()),
        };
      }
    }
  } catch {
    /* پیش‌نمایش با دادهٔ نمونه ادامه می‌یابد */
  }

  try {
    const base = await getPublicBaseUrl();
    sample.qrSvg = await qrSvg(`${base}/id/sample-preview`, { errorCorrectionLevel: 'Q', size: 128, margin: 4 });
  } catch {
    sample.qrSvg = null;
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="card !p-4 flex flex-wrap items-center justify-between gap-3 bg-white border-slate-300 shadow-sm">
        <div>
          <h1 className="text-base font-extrabold text-slate-900">🎨 طراحی کارت دانشجویی</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            قالب، رنگ، فیلدها و اجزای کارت را این‌جا طراحی کنید؛ پیش‌نمایش زنده در کنار فرم است و چاپ کارت‌ها از همین طراحی استفاده می‌کند.
          </p>
        </div>
        <Link
          prefetch={false}
          href="/admin/student-cards"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          بازگشت به فهرست کارت‌ها
        </Link>
      </div>

      <CardDesignerClient initial={design} sample={sample} />
    </div>
  );
}
