import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { degree_level_configs, majors, student_cards, students, universities, users } from '@/db/schema';
import { requireRoleOrPermission } from '@/lib/permissions-enforcer';
import { getCurrentUniversity } from '@/lib/university-scope';
import { getPublicBaseUrl, getSetting } from '@/lib/settings';
import { qrSvg } from '@/lib/qr';
import StudentCardView, { StudentCardBackView } from '@/components/StudentCardView';
import { getCardDesign } from '@/lib/student-card-designs';
import PrintButton from '@/components/PrintButton';
import { verifyEntry, refCodeOf } from '@/lib/verify-url';
import { toShamsi } from '@/lib/shamsi';

export const dynamic = 'force-dynamic';

/**
 * کارت دانشجویی چاپی — با QR گیت حراست.
 *
 * توکن امنیتی کارت (`student_cards.secureToken`) همان چیزی است که نگهبانی در
 * `/id/[token]` استعلام می‌کند؛ QR کارت مستقیماً همان نشانی را رمز می‌کند تا با
 * یک اسکن، هویت و عکس و وضعیت کارت تأیید شود.
 */
export default async function StudentCardPrintPage({ params }: { params: Promise<{ studentId: string }> }) {
 await requireRoleOrPermission(
 ['ADMIN', 'EDU_EXPERT', 'ARCHIVE_EXPERT', 'MILITARY_OFFICER', 'GRADUATEAFFAIRS'],
 ['students:view_dossier'],
 );

 const { studentId: rawId } = await params;
 const studentId = Number(rawId || 0);
 const uni = await getCurrentUniversity().catch(() => null);

 const [row] = await db
 .select({
 studentId: students.id,
 userId: students.userId,
 studentCode: students.studentCode,
 entryYear: students.entryYear,
 status: students.status,
 firstName: users.firstName,
 lastName: users.lastName,
 nationalCode: users.nationalCode,
 hasPhoto: users.photoKey,
 majorName: majors.name,
 degreeTitle: degree_level_configs.title,
 uniTitle: universities.title,
 uniLogo: universities.logoUrl,
 cardToken: student_cards.secureToken,
 cardStatus: student_cards.printStatus,
 cardDesignId: student_cards.designId,
 cardIssuedAt: student_cards.issuedAt,
 cardExpiresAt: student_cards.expiresAt,
 })
 .from(students)
 .innerJoin(users, eq(users.id, students.userId))
 .leftJoin(majors, eq(majors.id, students.majorId))
 .leftJoin(degree_level_configs, eq(degree_level_configs.id, students.degreeLevelId))
 .leftJoin(universities, eq(universities.id, students.universityId))
 .leftJoin(student_cards, eq(student_cards.studentId, students.id))
 .where(eq(students.id, studentId))
 .limit(1);

 if (!row) {
 return <div className="p-8 text-center text-sm font-bold text-rose-700" dir="rtl">دانشجو یافت نشد.</div>;
 }
 if (uni && row.uniTitle && uni.title !== row.uniTitle) {
 return <div className="p-8 text-center text-sm font-bold text-rose-700" dir="rtl">این دانشجو به دانشگاه فعال تعلق ندارد.</div>;
 }

 let qr = '';
 let verifyUrl = '';
 if (row.cardToken) {
 try {
 const base = await getPublicBaseUrl();
 verifyUrl = `${base}/id/${encodeURIComponent(row.cardToken)}`;
 qr = await qrSvg(verifyUrl, { errorCorrectionLevel: 'Q', size: 128, margin: 4 });
 } catch (err) {
 console.warn('[student-card] qr failed', err);
 }
 }
 const logo = row.uniLogo || (await getSetting('UNIVERSITY_LOGO').catch(() => '')) || null;
 const validUntil = row.cardExpiresAt ? toShamsi(row.cardExpiresAt.toISOString()) : null;

 // طراحیِ ثبت‌شده روی همین کارت (انتخاب‌شده هنگام صدور) — در نبودش، پیش‌فرض
 const { design } = await getCardDesign(row.cardDesignId);
 const verifySuffix = verifyUrl
 ? ` — سامانه: ${verifyEntry(verifyUrl)} · کد رهگیری: ${refCodeOf(verifyUrl)}`
 : '';

 const cardData = {
 firstName: row.firstName ?? '',
 lastName: row.lastName ?? '',
 studentCode: row.studentCode ?? '',
 nationalCode: row.nationalCode,
 majorName: row.majorName,
 degreeTitle: row.degreeTitle,
 entryYear: row.entryYear,
 status: row.cardStatus,
 validUntil,
 uniTitle: row.uniTitle || uni?.title || '',
 logoUrl: logo,
 photoUserId: row.userId,
 hasPhoto: !!row.hasPhoto,
 qrSvg: qr,
 };

 return (
 <div className="mx-auto max-w-3xl space-y-4 p-4" dir="rtl">
 <div className="flex items-center justify-between print:hidden">
 <h1 className="text-sm font-black text-slate-800">🪪 کارت دانشجویی — {row.firstName} {row.lastName}</h1>
 <div className="flex gap-2">
 <Link prefetch={false} href="/admin/student-cards" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700">بازگشت</Link>
 <PrintButton />
 </div>
 </div>

 {!row.cardToken && (
 <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-900">
 برای این دانشجو کارتی صادر نشده است؛ ابتدا از فهرست «صدور و مدیریت کارت دانشجویی» کارت صادر کنید تا QR فعال شود.
 </div>
 )}

 <div className="print-area space-y-4">
 <StudentCardView
 design={{ ...design.front, footer: `${design.front.footer}${verifySuffix}` }}
 data={cardData}
 />
 {design.back.enabled && (
 <div className="mt-6 print:mt-0 print:break-before-page">
 <p className="mb-1 text-2xs font-bold text-slate-500 print:hidden">پشت کارت</p>
 <StudentCardBackView
 design={design.back}
 data={cardData}
 widthMm={design.front.widthMm}
 heightMm={design.front.heightMm}
 />
 </div>
 )}
 </div>
 </div>
 );
}
