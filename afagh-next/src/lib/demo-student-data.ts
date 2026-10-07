/**
 * دادهٔ نمایشی (SHOWCASE) حساب دموی دانشجو.
 *
 * این ماژول کاملاً مستقل از پایگاه داده است: هیچ `Date.now()`، هیچ کوئری و هیچ
 * مقدار محاسبه‌شده‌ای ندارد و همهٔ مقادیر ثابت‌اند تا خروجی هر بار یکسان بماند.
 *
 * مقادیر از نسخهٔ پیشین پیش از حذف دادهٔ ساختگی بازیابی شده‌اند و فقط برای
 * حساب‌های دمو (که با `isDemoStudentUser` شناسایی می‌شوند) استفاده می‌شوند؛
 * دانشجویان واقعی همیشه دادهٔ واقعی پایگاه داده را می‌بینند.
 */

import type { ExamCardData } from './verification';
import type { VirtualClassSession } from './moodle-bbb';

export type DemoExamCourse = ExamCardData['courses'][number];

export type DemoChartCourse = {
  code: string;
  title: string;
  units: number;
  type: string;
  prereq: string;
};

export type DemoChartSemester = {
  semester: number;
  title: string;
  courses: DemoChartCourse[];
};

export type DemoLiveClass = VirtualClassSession;

export type DemoRecording = {
  title: string;
  meta: string;
};

export type DemoFinanceSummary = {
  fullName: string;
  studentCode: string;
  nationalCode: string;
  majorTitle: string;
  degreeTitle: string;
  entryYear: string;
  balance: 0;
  balanceLabel: string;
  settledLabel: string;
  emptyNote: string;
};

export const DEMO_STUDENT = {
  fullName: 'علی رضایی اصل',
  studentCode: '31412001',
  nationalCode: '1010101010',
  nationalCodeFa: '۱۰۱۰۱۰۱۰۱۰',
  nationalCodeMasked: '۱۰۱۰۱۰**۱۰۱۰',
  majorName: 'مهندسی کامپیوتر',
  degreeTitle: 'کارشناسی پیوسته',
  entryYear: 1403,
  entryYearFa: '۱۴۰۳',
  studyTypeFa: 'روزانه',
  regulationTitle: 'آیین‌نامه آموزشی دوره کارشناسی مصوب ۱۴۰۳',
  termTitle: 'نیمسال اول ۱۴۰۵-۱۴۰۴',
  termCode: '1405-1',
  militaryStatus: 'دارای معافیت تحصیلی',
  statusFa: 'مجاز به ادامه تحصیل',
} as const;

export const DEMO_DASHBOARD = {
  gpa: 18.4,
  gpaText: '۱۸.۴۰',
  gpaNote: 'وضعیت ممتاز و استعداد درخشان',
  passedUnits: 28,
  requiredUnits: 140,
  passedUnitsText: '۲۸',
  requiredUnitsText: '۱۴۰',
  chartProgressText: '۳۰٪ از کل چارت کارشناسی',
  currentTermUnits: 16,
  currentTermCourseCount: 5,
  currentTermCourseCountText: '۵',
  financialStatusText: 'تسویه کامل (تراز ۰ ریال)',
  examCardStatusText: 'صادر و فعال شده',
  examCardSeatNoteText: 'شماره صندلی‌ها در سالن مشخص شد',
} as const;

export const DEMO_CURRICULUM_TOTAL_UNITS_TEXT = '۱۴۰ واحد';

export const DEMO_CHART: DemoChartSemester[] = [
  {
    semester: 1,
    title: 'نیمسال اول (ترم ۱)',
    courses: [
      { code: '1112101', title: 'ریاضی عمومی ۱', units: 3, type: 'پایه', prereq: '—' },
      { code: '1112103', title: 'مبانی برنامه‌نویسی', units: 4, type: 'تخصصی', prereq: '—' },
      { code: '1112105', title: 'آزمایشگاه فیزیک', units: 1, type: 'عمومی', prereq: '—' },
      { code: '1112106', title: 'اندیشه اسلامی ۱', units: 2, type: 'عمومی', prereq: '—' },
      { code: '1112107', title: 'زبان انگلیسی ۱', units: 3, type: 'عمومی', prereq: '—' },
      { code: '1112108', title: 'تربیت بدنی ۱', units: 2, type: 'عمومی', prereq: '—' },
    ],
  },
  {
    semester: 2,
    title: 'نیمسال دوم (ترم ۲ — ترم جاری پیشنهادی)',
    courses: [
      { code: '1112102', title: 'ریاضی عمومی ۲', units: 3, type: 'پایه', prereq: 'ریاضی عمومی ۱' },
      { code: '1112104', title: 'برنامه‌نویسی پیشرفته', units: 3, type: 'تخصصی', prereq: 'مبانی برنامه‌نویسی' },
      { code: '1112201', title: 'ساختمان داده', units: 3, type: 'تخصصی', prereq: 'مبانی برنامه‌نویسی، ریاضی ۱' },
      { code: '1112202', title: 'مفاهیم ابتدایی ریاضیات', units: 3, type: 'پایه', prereq: '—' },
    ],
  },
  {
    semester: 3,
    title: 'نیمسال سوم (ترم ۳)',
    courses: [
      { code: '1112301', title: 'معماری کامپیوتر', units: 3, type: 'تخصصی', prereq: 'برنامه‌نویسی پیشرفته' },
      { code: '1112302', title: 'پایگاه داده', units: 3, type: 'تخصصی', prereq: 'ساختمان داده' },
    ],
  },
  {
    semester: 4,
    title: 'نیمسال چهارم (ترم ۴)',
    courses: [
      { code: '1112303', title: 'شبکه‌های کامپیوتری', units: 3, type: 'تخصصی', prereq: 'معماری کامپیوتر' },
    ],
  },
];

export const DEMO_EXAM = {
  examDate: '1405/10/18',
  examDateFa: '۱۴۰۵/۱۰/۱۸',
  examTime: '۰۸:۳۰ الی ۱۰:۳۰',
  room: 'سالن امتحانات مرکزی',
  hallName: 'سالن امتحانات مرکزی',
  statusText: 'صادر و فعال شده',
} as const;

export const DEMO_EXAM_COURSES: DemoExamCourse[] = [
  {
    enrollmentId: -101,
    courseCode: '1112101',
    courseTitle: 'ریاضی عمومی ۱',
    units: 3,
    professorName: 'دکتر جمیل احمدی',
    classRoomName: 'کلاس ۳۰۴ (ساختمان آموزش)',
    examDate: DEMO_EXAM.examDate,
    examTime: DEMO_EXAM.examTime,
    examHall: DEMO_EXAM.hallName,
    seatNumber: 18,
    hasEvaluated: true,
  },
  {
    enrollmentId: -102,
    courseCode: '1112103',
    courseTitle: 'مبانی برنامه‌نویسی',
    units: 4,
    professorName: 'دکتر سارا رضایی',
    classRoomName: 'سایت تخصصی کامپیوتر ۱۰۲',
    examDate: DEMO_EXAM.examDate,
    examTime: DEMO_EXAM.examTime,
    examHall: DEMO_EXAM.hallName,
    seatNumber: 24,
    hasEvaluated: true,
  },
  {
    enrollmentId: -103,
    courseCode: '1112105',
    courseTitle: 'فیزیک عمومی ۱',
    units: 3,
    professorName: 'دکتر علی حسینی',
    classRoomName: 'کلاس ۲۰۲ (ساختمان آموزش)',
    examDate: DEMO_EXAM.examDate,
    examTime: DEMO_EXAM.examTime,
    examHall: DEMO_EXAM.hallName,
    seatNumber: 30,
    hasEvaluated: true,
  },
  {
    enrollmentId: -104,
    courseCode: '1112107',
    courseTitle: 'زبان انگلیسی عمومی',
    units: 3,
    professorName: 'استاد مرادی',
    classRoomName: 'کلاس ۳۰۱ (ساختمان ابن‌سینا)',
    examDate: DEMO_EXAM.examDate,
    examTime: DEMO_EXAM.examTime,
    examHall: DEMO_EXAM.hallName,
    seatNumber: 36,
    hasEvaluated: true,
  },
];

export function demoExamCardData(studentId: number): ExamCardData {
  return {
    studentId,
    studentCode: DEMO_STUDENT.studentCode,
    fullName: DEMO_STUDENT.fullName,
    nationalIdMasked: DEMO_STUDENT.nationalCodeMasked,
    majorName: DEMO_STUDENT.majorName,
    entryYear: DEMO_STUDENT.entryYear,
    termTitle: DEMO_STUDENT.termTitle,
    debt: 0,
    isFinancialCleared: true,
    courses: DEMO_EXAM_COURSES,
  };
}

export const DEMO_DASHBOARD_LIVE_CLASSES = [
  {
    id: -101,
    courseTitle: 'ریاضی عمومی ۱ (کلاس مجازی)',
    professorName: 'دکتر جمیل احمدی',
    meetingId: 'AFAGH-ROOM-MATH101',
    timeText: '۰۸:۳۰ الی ۱۰:۳۰',
    participantsText: '۲۸ شرکت‌کننده فعال',
    isRunning: true,
    stateText: 'در حال برگزاری',
  },
  {
    id: -102,
    courseTitle: 'مبانی برنامه‌نویسی و وب',
    professorName: 'دکتر سارا رضایی',
    meetingId: 'AFAGH-ROOM-PROG103',
    timeText: 'شروع از ۱۰:۴۵',
    participantsText: '',
    isRunning: false,
    stateText: 'شروع از ۱۰:۴۵',
  },
] as const;

export const DEMO_LIVE_SESSIONS: DemoLiveClass[] = [
  {
    courseId: 101,
    courseCode: '۱۱۱۲۱۰۱',
    courseTitle: 'ریاضی عمومی ۱ (کلاس مجازی)',
    professorName: 'دکتر جمیل احمدی',
    meetingId: 'AFAGH-ROOM-MATH101',
    startTime: '۰۸:۳۰',
    endTime: '۱۰:۳۰',
    isRunning: true,
    activeParticipantsCount: 28,
    recordingsCount: 8,
  },
  {
    courseId: 102,
    courseCode: '۱۱۱۲۱۰۳',
    courseTitle: 'مبانی برنامه‌نویسی و وب',
    professorName: 'دکتر سارا رضایی',
    meetingId: 'AFAGH-ROOM-PROG103',
    startTime: '۱۰:۴۵',
    endTime: '۱۲:۴۵',
    isRunning: true,
    activeParticipantsCount: 32,
    recordingsCount: 10,
  },
  {
    courseId: 103,
    courseCode: '۱۱۱۲۲۰۱',
    courseTitle: 'ساختمان داده‌ها و الگوریتم‌ها',
    professorName: 'دکتر علی حسینی',
    meetingId: 'AFAGH-ROOM-DATA201',
    startTime: '۱۴:۰۰',
    endTime: '۱۶:۰۰',
    isRunning: false,
    activeParticipantsCount: 0,
    recordingsCount: 6,
  },
];

export const DEMO_RECORDINGS: DemoRecording[] = [
  { title: 'جلسه ۸: حل تمرین و میان‌ترم', meta: 'مدت: ۹۰ دقیقه · کیفیت 1080p' },
  { title: 'جلسه ۷: مفاهیم پایه و معماری سیستم', meta: 'مدت: ۸۵ دقیقه · کیفیت 1080p' },
];

export const DEMO_FINANCE: DemoFinanceSummary = {
  fullName: DEMO_STUDENT.fullName,
  studentCode: DEMO_STUDENT.studentCode,
  nationalCode: DEMO_STUDENT.nationalCode,
  majorTitle: DEMO_STUDENT.majorName,
  degreeTitle: DEMO_STUDENT.degreeTitle,
  entryYear: DEMO_STUDENT.entryYearFa,
  balance: 0,
  balanceLabel: 'ریال',
  settledLabel: 'حساب شما تسویه است',
  emptyNote:
    'برای این حساب دمو هیچ تراکنش مالی (شهریه، تخفیف، پرداخت، چک یا وام) ثبت نشده است؛ کارنامهٔ مالی خالی نمایش داده می‌شود.',
};

/**
 * پیام صادقانه برای وقتی که کاربر دمو نیمسال مشخصی را انتخاب می‌کند.
 * دادهٔ نمایشی فقط یک نیمسال ثابت دارد، پس به‌جای نمایش دادهٔ ساختگیِ
 * نیمسال دیگر، پیام روشن نمایش داده می‌شود.
 */
export function demoTermFilterNotice(termTitle: string): string {
  return `دادهٔ نمایشی حساب دمو فقط برای «${DEMO_STUDENT.termTitle}» آماده است؛ برای نیمسال «${termTitle}» رکوردی در این حساب نمایشی ثبت نشده است. برای دیدن دادهٔ نمایشی، فیلتر نیمسال را پاک کنید.`;
}