import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, course_offerings, courses, staff, users } from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';
import ProfessorScheduleClient, { ProfessorScheduleOffering } from './ProfessorScheduleClient';

export const dynamic = 'force-dynamic';

export default async function ProfessorSchedulePage() {
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

  // Demo schedule offerings with comprehensive data matching schedule requirements
  const initialOfferings: ProfessorScheduleOffering[] = [
    {
      id: 101,
      code: 'CE-302',
      title: 'سیستم‌های عامل',
      units: 3,
      courseType: 'اصلی',
      groupNumber: 1,
      enrolledCount: 38,
      capacity: 40,
      dayOfWeek: 0, // شنبه
      dayName: 'شنبه',
      startTime: '08:00',
      endTime: '10:00',
      roomName: 'کلاس ۳۰۱ (سمعی و بصری)',
      buildingName: 'دانشکده مهندسی برق و کامپیوتر',
      weekType: 'ALL',
      isCoTaught: false,
    },
    {
      id: 102,
      code: 'CE-302',
      title: 'سیستم‌های عامل',
      units: 3,
      courseType: 'اصلی',
      groupNumber: 2,
      enrolledCount: 36,
      capacity: 40,
      dayOfWeek: 0, // شنبه
      dayName: 'شنبه',
      startTime: '10:00',
      endTime: '12:00',
      roomName: 'کلاس ۳۰۱ (سمعی و بصری)',
      buildingName: 'دانشکده مهندسی برق و کامپیوتر',
      weekType: 'ALL',
      isCoTaught: false,
    },
    {
      id: 103,
      code: 'CE-204',
      title: 'ساختمان داده‌ها و الگوریتم‌ها',
      units: 3,
      courseType: 'اصلی',
      groupNumber: 1,
      enrolledCount: 42,
      capacity: 45,
      dayOfWeek: 2, // دوشنبه
      dayName: 'دوشنبه',
      startTime: '08:00',
      endTime: '10:00',
      roomName: 'کلاس ۳۰۲ (ویدیو پروژکتور)',
      buildingName: 'دانشکده مهندسی برق و کامپیوتر',
      weekType: 'ALL',
      isCoTaught: false,
    },
    {
      id: 104,
      code: 'CE-208',
      title: 'آزمایشگاه سیستم‌های عامل و شبکه',
      units: 1,
      courseType: 'عملی',
      groupNumber: 1,
      enrolledCount: 22,
      capacity: 25,
      dayOfWeek: 2, // دوشنبه
      dayName: 'دوشنبه',
      startTime: '13:30',
      endTime: '15:30',
      roomName: 'آزمایشگاه نرم‌افزار ۲',
      buildingName: 'مجتمع آزمایشگاه‌های مرکزی',
      weekType: 'EVEN',
      isCoTaught: true,
      coRole: 'LAB',
      coPartnerName: 'دکتر مریم رضایی (استاد تئوری)',
    },
    {
      id: 105,
      code: 'CE-410',
      title: 'مهندسی اینترنت و وب پیشرفته',
      units: 3,
      courseType: 'تخصصی',
      groupNumber: 1,
      enrolledCount: 34,
      capacity: 35,
      dayOfWeek: 4, // چهارشنبه
      dayName: 'چهارشنبه',
      startTime: '10:00',
      endTime: '12:00',
      roomName: 'کلاس ۳۰۱ (سمعی و بصری)',
      buildingName: 'دانشکده مهندسی برق و کامپیوتر',
      weekType: 'ALL',
      isCoTaught: false,
    },
  ];

  const professorData = {
    id: me.id,
    name: `${user.firstName} ${user.lastName}`,
    staffCode: me.staffCode,
    academicRank: me.academicRank || 'استادیار',
    contractType: me.staffType || 'تمام‌وقت',
    departmentName: 'گروه مهندسی کامپیوتر و فناوری اطلاعات',
  };

  return (
    <ProfessorScheduleClient
      professor={professorData}
      termTitle={termTitle}
      initialOfferings={initialOfferings}
    />
  );
}
