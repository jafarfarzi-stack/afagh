import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms } from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';
import ProfessorAttendanceClient, { AttendanceCourseOffering, ClassSessionItem } from './ProfessorAttendanceClient';

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

  // Helper to generate 16 realistic sessions for a course
  const generateOfferingSessions = (startDayStr: string, roomName: string): ClassSessionItem[] => {
    const dates = [
      '۱۴۰۵/۰۷/۰۵', '۱۴۰۵/۰۷/۱۲', '۱۴۰۵/۰۷/۱۹', '۱۴۰۵/۰۷/۲۶',
      '۱۴۰۵/۰۸/۰۳', '۱۴۰۵/۰۸/۱۰', '۱۴۰۵/۰۸/۱۷', '۱۴۰۵/۰۸/۲۴',
      '۱۴۰۵/۰۹/۰۱', '۱۴۰۵/۰۹/۰۸', '۱۴۰۵/۰۹/۱۵', '۱۴۰۵/۰۹/۲۲',
      '۱۴۰۵/۰۹/۲۹', '۱۴۰۵/۱۰/۰۶', '۱۴۰۵/۱۰/۱۳', '۱۴۰۵/۱۰/۲۰',
    ];

    const topics = [
      'فصل ۱: مفاهیم پایه، تاریخچه و معماری سیستم‌های عامل',
      'فصل ۲: ساختار سیستم‌های کامپیوتری و فراخوان‌های سیستمی (System Calls)',
      'فصل ۳: فرآیندها (Process Control Block)، مدل‌های نخ‌بندی (Threads)',
      'فصل ۴: زمان‌بندی پردازنده (CPU Scheduling) — الگوریتم‌های FCFS، SJF و Round Robin',
      'فصل ۵: همگام‌سازی فرآیندها (Synchronization)، سمافورها (Semaphores) و قفل‌ها',
      'فصل ۶: مسئله فیلسوفان غذاخورنده و تولیدکننده-مصرف‌کننده',
      'فصل ۷: بن‌بست (Deadlock)، شرایط کینه‌توزی و الگوریتم بانکدار دایکسترا',
      'فصل ۸: آزمون میان‌ترم و حل مسائل دوره‌ای',
      'فصل ۹: مدیریت حافظه اصلی (Memory Management)، قطعه‌بندی و آدرس‌دهی',
      'فصل ۱۰: حافظه مجازی (Virtual Memory) و صفحه‌بندی بر اساس تقاضا (Demand Paging)',
      'فصل ۱۱: الگوریتم‌های جایگزینی صفحه (LRU, FIFO, Optimal Page Replacement)',
      'فصل ۱۲: سیستم فایل (File Systems)، ساختار دایرکتوری‌ها و متدهای تخصیص دیسک',
      'فصل ۱۳: زمان‌بندی دیسک (Disk Scheduling - SCAN, C-SCAN, LOOK)',
      'فصل ۱۴: حفاظت، امنیت و مکانیزم‌های کنترل دسترسی (Access Control)',
      'فصل ۱۵: بررسی موردی سیستم‌عامل لینوکس و ساختار کرنل',
      'فصل ۱۶: جمع‌بندی ترم، رفع اشکال و آمادگی آزمون پایان‌ترم',
    ];

    return dates.map((date, idx) => {
      const sessionNo = idx + 1;
      const isHeld = sessionNo <= 7;
      
      // Session 4 is marked as absent to demonstrate make-up workflow
      const professorStatus = sessionNo === 4
        ? 'ABSENT'
        : isHeld
        ? 'VERIFIED_PRESENT'
        : 'UPCOMING';

      const verificationDetail = sessionNo === 4
        ? 'عدم ثبت گیت تردد ورود — غیبت استاد ثبت شده'
        : isHeld
        ? `ثبت اثر انگشت گیت تردد ورودی در ساعت ۰۷:۵${sessionNo % 10}`
        : 'جلسه در انتظار برگزاری';

      return {
        id: 200 + sessionNo,
        sessionNo,
        sessionDate: date,
        startTime: '۰۸:۰۰',
        endTime: '۱۰:۰۰',
        roomName,
        topic: topics[idx],
        isHeld,
        isMakeUp: false,
        professorStatus,
        verificationDetail,
        studentStatuses: {
          1: { status: 'PRESENT' },
          2: { status: 'PRESENT' },
          3: { status: sessionNo === 2 || sessionNo === 5 || sessionNo === 7 ? 'ABSENT' : 'PRESENT' },
          4: { status: 'PRESENT' },
          5: { status: sessionNo === 3 ? 'LATE' : 'PRESENT', lateMinutes: 15 },
          6: { status: 'PRESENT' },
          7: { status: sessionNo === 1 || sessionNo === 3 || sessionNo === 6 || sessionNo === 7 ? 'ABSENT' : 'PRESENT' },
          8: { status: 'PRESENT' },
          9: { status: sessionNo === 7 ? 'EXCUSED' : 'PRESENT', note: sessionNo === 7 ? 'گواهی پزشکی' : undefined },
          10: { status: 'PRESENT' },
        },
      };
    });
  };

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
        { id: 1, studentCode: '401123401', fullName: 'امیرحسین رضایی' },
        { id: 2, studentCode: '401123402', fullName: 'سارا کاظمی' },
        { id: 3, studentCode: '401123403', fullName: 'محمدحسین حسینی' },
        { id: 4, studentCode: '401123404', fullName: 'فاطمه احمدی' },
        { id: 5, studentCode: '401123405', fullName: 'علیرضا کریمی' },
        { id: 6, studentCode: '401123406', fullName: 'زهرا موسوی' },
        { id: 7, studentCode: '401123407', fullName: 'مهدی نوری' },
        { id: 8, studentCode: '401123408', fullName: 'نیلوفر رحیمی' },
        { id: 9, studentCode: '401123409', fullName: 'پویا صادقی' },
        { id: 10, studentCode: '401123410', fullName: 'مریم یوسفی' },
      ],
      sessions: generateOfferingSessions('۱۴۰۵/۰۷/۰۵', 'کلاس ۳۰۱ (سمعی و بصری)'),
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
        { id: 11, studentCode: '402123501', fullName: 'کیان سلطانی' },
        { id: 12, studentCode: '402123502', fullName: 'یلدا ابراهیمی' },
        { id: 13, studentCode: '402123503', fullName: 'دانیال مرادی' },
        { id: 14, studentCode: '402123504', fullName: 'شیدا فرهادی' },
      ],
      sessions: generateOfferingSessions('۱۴۰۵/۰۷/۰۷', 'کلاس ۳۰۲ (ویدیو پروژکتور)'),
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
        { id: 1, studentCode: '401123401', fullName: 'امیرحسین رضایی' },
        { id: 2, studentCode: '401123402', fullName: 'سارا کاظمی' },
        { id: 5, studentCode: '401123405', fullName: 'علیرضا کریمی' },
      ],
      sessions: generateOfferingSessions('۱۴۰۵/۰۷/۰۷', 'آزمایشگاه نرم‌افزار ۲'),
    },
  ];

  const professorData = {
    id: me.id,
    name: user.name || 'دکتر جمیل احمدی',
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
