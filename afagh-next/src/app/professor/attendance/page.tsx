import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms } from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';
import ProfessorAttendanceClient, { AttendanceCourseOffering } from './ProfessorAttendanceClient';

export const dynamic = 'force-dynamic';

export default async function ProfessorAttendancePage({
  searchParams,
}: {
  searchParams: { offeringId?: string };
}) {
  const user = await requireRole(['PROFESSOR']);
  const me = await getStaffByUser(user.id);

  if (!me) {
    return (
      <div className="card text-center p-8">
        <p className="text-slate-600 font-bold">پروندهٔ هیئت علمی یافت نشد.</p>
      </div>
    );
  }

  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1));
  const termTitle = term?.title || 'نیمسال اول ۱۴۰۵–۱۴۰۶ (مهر ۱۴۰۵)';
  const defaultOfferingId = searchParams.offeringId ? Number(searchParams.offeringId) : undefined;

  // Realistic sample offerings with student rosters
  const initialOfferings: AttendanceCourseOffering[] = [
    {
      id: 101,
      code: 'CE-302',
      title: 'سیستم‌های عامل',
      groupNumber: 1,
      units: 3,
      roomName: 'کلاس ۳۰۱ (سمعی و بصری)',
      scheduleTime: 'شنبه‌ها ۰۸:۰۰ الی ۱۰:۰۰',
      students: [
        { studentId: 1, studentCode: '401123401', fullName: 'امیرحسین رضایی', totalPriorAbsents: 1, status: 'PRESENT' },
        { studentId: 2, studentCode: '401123402', fullName: 'سارا کاظمی', totalPriorAbsents: 0, status: 'PRESENT' },
        { studentId: 3, studentCode: '401123403', fullName: 'محمدحسین حسینی', totalPriorAbsents: 3, status: 'ABSENT' },
        { studentId: 4, studentCode: '401123404', fullName: 'فاطمه احمدی', totalPriorAbsents: 0, status: 'PRESENT' },
        { studentId: 5, studentCode: '401123405', fullName: 'علیرضا کریمی', totalPriorAbsents: 2, status: 'LATE', lateMinutes: 15 },
        { studentId: 6, studentCode: '401123406', fullName: 'زهرا موسوی', totalPriorAbsents: 1, status: 'PRESENT' },
        { studentId: 7, studentCode: '401123407', fullName: 'مهدی نوری', totalPriorAbsents: 4, status: 'ABSENT', note: 'غیبت مکرر' },
        { studentId: 8, studentCode: '401123408', fullName: 'نیلوفر رحیمی', totalPriorAbsents: 0, status: 'PRESENT' },
        { studentId: 9, studentCode: '401123409', fullName: 'پویا صادقی', totalPriorAbsents: 1, status: 'EXCUSED', note: 'گواهی پزشکی' },
        { studentId: 10, studentCode: '401123410', fullName: 'مریم یوسفی', totalPriorAbsents: 0, status: 'PRESENT' },
      ],
    },
    {
      id: 103,
      code: 'CE-204',
      title: 'ساختمان داده‌ها و الگوریتم‌ها',
      groupNumber: 1,
      units: 3,
      roomName: 'کلاس ۳۰۲ (ویدیو پروژکتور)',
      scheduleTime: 'دوشنبه‌ها ۰۸:۰۰ الی ۱۰:۰۰',
      students: [
        { studentId: 11, studentCode: '402123501', fullName: 'کیان سلطانی', totalPriorAbsents: 0, status: 'PRESENT' },
        { studentId: 12, studentCode: '402123502', fullName: 'یلدا ابراهیمی', totalPriorAbsents: 1, status: 'PRESENT' },
        { studentId: 13, studentCode: '402123503', fullName: 'دانیال مرادی', totalPriorAbsents: 2, status: 'PRESENT' },
        { studentId: 14, studentCode: '402123504', fullName: 'شیدا فرهادی', totalPriorAbsents: 0, status: 'PRESENT' },
      ],
    },
    {
      id: 104,
      code: 'CE-208',
      title: 'آزمایشگاه سیستم‌های عامل و شبکه',
      groupNumber: 1,
      units: 1,
      roomName: 'آزمایشگاه نرم‌افزار ۲',
      scheduleTime: 'دوشنبه‌ها ۱۳:۳۰ الی ۱۵:۳۰ (هفته زوج)',
      students: [
        { studentId: 1, studentCode: '401123401', fullName: 'امیرحسین رضایی', totalPriorAbsents: 0, status: 'PRESENT' },
        { studentId: 2, studentCode: '401123402', fullName: 'سارا کاظمی', totalPriorAbsents: 0, status: 'PRESENT' },
        { studentId: 5, studentCode: '401123405', fullName: 'علیرضا کریمی', totalPriorAbsents: 1, status: 'PRESENT' },
      ],
    },
  ];

  const professorData = {
    id: me.id,
    name: `${user.firstName} ${user.lastName}`,
    staffCode: me.staffCode,
  };

  return (
    <ProfessorAttendanceClient
      professor={professorData}
      termTitle={termTitle}
      initialOfferings={initialOfferings}
      defaultOfferingId={defaultOfferingId}
    />
  );
}
