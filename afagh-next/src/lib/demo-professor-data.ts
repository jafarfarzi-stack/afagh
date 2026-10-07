import type { GradingCourseOffering } from '@/app/professor/grades/types';
import type { ProfessorScheduleOffering } from '@/app/professor/schedule/ProfessorScheduleClient';
import type {
  AttendanceCourseOffering,
  ClassSessionItem,
  MakeupSessionRecord,
} from '@/app/professor/attendance/ProfessorAttendanceClient';
import type { ContractView } from '@/app/professor/contract/actions';

export const DEMO_UNIVERSITY_ID = 1;
export const DEMO_TERM_TITLE = 'نیمسال اول ۱۴۰۵–۱۴۰۶ (مهر ۱۴۰۵)';
export const DEMO_TERM_CODE = '1405-1';
export const DEMO_UNIVERSITY_TITLE = 'دانشگاه سراسری';
export const DEMO_CERTIFICATE_UNIVERSITY_TITLE = 'دانشگاه غیرانتفاعی آفاق ارومیه';
export const DEMO_FACULTY_NAME = 'دانشکده مهندسی برق و کامپیوتر';
export const DEMO_DEPARTMENT_NAME = 'گروه مهندسی کامپیوتر و فناوری اطلاعات';
export const DEMO_ACADEMIC_RANK = 'استادیار';
export const DEMO_CONTRACT_TYPE = 'تمام‌وقت';
export const DEMO_PROFESSOR_FALLBACK_NAME = 'دکتر محمد رضایی';
export const DEMO_STAFF_CODE_PRIMARY = 'F-101';
export const DEMO_STAFF_CODE_SECONDARY = 'F-102';
export const DEMO_STAFF_CODE_THIRD = 'F-103';

export type DemoDashboardClass = {
  id: number;
  code: string;
  title: string;
  groupNumber: number;
  units: number;
  enrolled: number;
  capacity: number;
  roomLabel: string;
  timeLabel: string;
  isCoTaught: boolean;
  coTeacherName?: string;
};

export const DEMO_DASHBOARD_SUMMARY = {
  classCount: 5,
  classCountLabel: 'گروه درسی',
  availabilityLabel: 'وضعیت اعلام حضور ترم:',
  availabilityValue: '✓ ثبت و تایید شده',
  contractLabel: 'قرارداد حق‌التدریس:',
  contractValue: 'آماده امضای الکترونیک',
  gradeDeadlineLabel: 'مهلت نهایی‌سازی نمرات:',
  gradeDeadlineValue: '۴۸ ساعت پس از آزمون',
};

export const DEMO_DASHBOARD_CONTRACT = {
  contractNo: 'CON-1405-CE-082',
  signatureStatus: 'در انتظار امضای دیجیتال',
  approvedHoursLabel: '۲۲۴ ساعت در ترم',
  grossAmount: 190400000,
  netAmount: 158032000,
  currency: 'ریال',
};

export const DEMO_DASHBOARD_CLASSES: DemoDashboardClass[] = [
  {
    id: 101,
    code: 'CE-302',
    title: 'سیستم‌های عامل',
    groupNumber: 1,
    units: 3,
    enrolled: 38,
    capacity: 40,
    roomLabel: 'کلاس ۳۰۱ (سمعی و بصری)',
    timeLabel: 'شنبه‌ها ۰۸:۰۰ الی ۱۰:۰۰',
    isCoTaught: false,
  },
  {
    id: 103,
    code: 'CE-204',
    title: 'ساختمان داده‌ها و الگوریتم‌ها',
    groupNumber: 1,
    units: 3,
    enrolled: 42,
    capacity: 45,
    roomLabel: 'کلاس ۳۰۲',
    timeLabel: 'دوشنبه‌ها ۰۸:۰۰ الی ۱۰:۰۰',
    isCoTaught: false,
  },
  {
    id: 104,
    code: 'CE-208',
    title: 'آزمایشگاه و مبانی سیستم‌های عامل',
    groupNumber: 1,
    units: 1,
    enrolled: 22,
    capacity: 25,
    roomLabel: 'آزمایشگاه نرم‌افزار ۲',
    timeLabel: 'دوشنبه‌ها ۱۳:۳۰ (هفته زوج)',
    isCoTaught: true,
    coTeacherName: 'دکتر مریم رضایی',
  },
];

export const DEMO_SCHEDULE_BUILDING_NAME = DEMO_FACULTY_NAME;

export const DEMO_SCHEDULE_OFFERINGS: ProfessorScheduleOffering[] = [
  {
    id: 101,
    code: 'CE-302',
    title: 'سیستم‌های عامل',
    units: 3,
    courseType: 'اصلی',
    groupNumber: 1,
    enrolledCount: 38,
    capacity: 40,
    dayOfWeek: 0,
    dayName: 'شنبه',
    startTime: '08:00',
    endTime: '10:00',
    roomName: 'کلاس ۳۰۱ (سمعی و بصری)',
    buildingName: DEMO_SCHEDULE_BUILDING_NAME,
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
    dayOfWeek: 0,
    dayName: 'شنبه',
    startTime: '10:00',
    endTime: '12:00',
    roomName: 'کلاس ۳۰۱ (سمعی و بصری)',
    buildingName: DEMO_SCHEDULE_BUILDING_NAME,
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
    dayOfWeek: 2,
    dayName: 'دوشنبه',
    startTime: '08:00',
    endTime: '10:00',
    roomName: 'کلاس ۳۰۲ (ویدیو پروژکتور)',
    buildingName: DEMO_SCHEDULE_BUILDING_NAME,
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
    dayOfWeek: 2,
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
    dayOfWeek: 4,
    dayName: 'چهارشنبه',
    startTime: '10:00',
    endTime: '12:00',
    roomName: 'کلاس ۳۰۱ (سمعی و بصری)',
    buildingName: DEMO_SCHEDULE_BUILDING_NAME,
    weekType: 'ALL',
    isCoTaught: false,
  },
];

export type DemoGradeStudent = {
  studentId: number;
  studentCode: string;
  fullName: string;
};

export const DEMO_GRADE_STUDENTS: DemoGradeStudent[] = [
  { studentId: 1, studentCode: '401123401', fullName: 'امیرحسین رضایی' },
  { studentId: 2, studentCode: '401123402', fullName: 'سارا کاظمی' },
  { studentId: 3, studentCode: '401123403', fullName: 'محمدحسین حسینی' },
  { studentId: 4, studentCode: '401123404', fullName: 'فاطمه احمدی' },
  { studentId: 5, studentCode: '401123405', fullName: 'علیرضا کریمی' },
  { studentId: 11, studentCode: '402123501', fullName: 'کیان سلطانی' },
  { studentId: 12, studentCode: '402123502', fullName: 'یلدا ابراهیمی' },
];

export const DEMO_GRADES_THEORY_PROF = {
  name: 'دکتر مریم رضایی',
  staffCode: DEMO_STAFF_CODE_SECONDARY,
};

export function demoGradesOfferings(
  labProfName: string,
  labProfStaffCode: string,
): GradingCourseOffering[] {
  return [
    {
      id: 101,
      code: 'CE-302',
      title: 'سیستم‌های عامل',
      groupNumber: 1,
      units: 3,
      courseType: 'اصلی',
      isCoTaught: false,
      rubric: { midterm: 5, homework: 3, participation: 2, practical: 0, finalExam: 10 },
      students: [
        { studentId: 1, studentCode: '401123401', fullName: 'امیرحسین رضایی', midtermScore: 4.5, homeworkScore: 3, participationScore: 2, practicalScore: 0, finalExamScore: 8.5, calculatedFinalScore: 18.0, status: 'TEMPORARY' },
        { studentId: 2, studentCode: '401123402', fullName: 'سارا کاظمی', midtermScore: 4.0, homeworkScore: 2.5, participationScore: 2, practicalScore: 0, finalExamScore: 9.0, calculatedFinalScore: 17.5, status: 'TEMPORARY' },
        { studentId: 3, studentCode: '401123403', fullName: 'محمدحسین حسینی', midtermScore: 2.0, homeworkScore: 1.5, participationScore: 1, practicalScore: 0, finalExamScore: 4.5, calculatedFinalScore: 9.0, status: 'TEMPORARY' },
        { studentId: 4, studentCode: '401123404', fullName: 'فاطمه احمدی', midtermScore: 5.0, homeworkScore: 3.0, participationScore: 2, practicalScore: 0, finalExamScore: 9.5, calculatedFinalScore: 19.5, status: 'TEMPORARY' },
        { studentId: 5, studentCode: '401123405', fullName: 'علیرضا کریمی', midtermScore: 3.5, homeworkScore: 2.0, participationScore: 1.5, practicalScore: 0, finalExamScore: 6.5, calculatedFinalScore: 13.5, status: 'TEMPORARY' },
      ],
      appeals: [
        {
          id: 501,
          studentId: 3,
          studentCode: '401123403',
          fullName: 'محمدحسین حسینی',
          currentGrade: 9.0,
          studentMessage: 'استاد محترم، بنده تمرین سری دوم و کوئیز میان‌ترم را در سامانه ارسال کرده بودم ولی در نمره نهایی اعمال نشده است. در صورت امکان مجدداً بررسی فرمایید.',
          status: 'OPEN',
          createdAt: '۱۴۰۵/۰۹/۱۰ - ساعت ۱۴:۳۰',
        },
      ],
    },
    {
      id: 104,
      code: 'CE-208',
      title: 'آزمایشگاه و مبانی سیستم‌های عامل',
      groupNumber: 1,
      units: 2,
      courseType: 'عملی',
      isCoTaught: true,
      coTaughtDetails: {
        theoryProfName: DEMO_GRADES_THEORY_PROF.name,
        theoryProfStaffCode: DEMO_GRADES_THEORY_PROF.staffCode,
        theoryWeightRatio: 0.60,
        theoryWeightMarks: 12,
        theorySigned: false,
        labProfName: labProfName,
        labProfStaffCode: labProfStaffCode || DEMO_STAFF_CODE_PRIMARY,
        labWeightRatio: 0.40,
        labWeightMarks: 8,
        labSigned: false,
        currentProfRole: 'LAB',
      },
      rubric: { midterm: 0, homework: 0, participation: 0, practical: 20, finalExam: 0 },
      students: [
        { studentId: 1, studentCode: '401123401', fullName: 'امیرحسین رضایی', theoryProfScore: 17.25, labProfScore: 18.25, calculatedFinalScore: 17.65, status: 'TEMPORARY' },
        { studentId: 2, studentCode: '401123402', fullName: 'سارا کاظمی', theoryProfScore: 16.0, labProfScore: 18.75, calculatedFinalScore: 17.1, status: 'TEMPORARY' },
        { studentId: 5, studentCode: '401123405', fullName: 'علیرضا کریمی', theoryProfScore: 13.0, labProfScore: 15.0, calculatedFinalScore: 13.8, status: 'TEMPORARY' },
      ],
      appeals: [
        {
          id: 502,
          studentId: 5,
          studentCode: '401123405',
          fullName: 'علیرضا کریمی',
          currentGrade: 13.8,
          appealSection: 'PRACTICAL',
          studentMessage: 'استاد محترم آزمایشگاه، پروژه عملی سیستم‌های عامل را تحویل داده بودم ولی نمره عملی ۱۵ منظور شده است. لطفاً بازبینی فرمایید.',
          status: 'OPEN',
          createdAt: '۱۴۰۵/۰۹/۱۲ - ساعت ۱۱:۰۰',
        },
      ],
    },
    {
      id: 103,
      code: 'CE-204',
      title: 'ساختمان داده‌ها و الگوریتم‌ها',
      groupNumber: 1,
      units: 3,
      courseType: 'اصلی',
      isCoTaught: false,
      rubric: { midterm: 6, homework: 4, participation: 0, practical: 0, finalExam: 10 },
      students: [
        { studentId: 11, studentCode: '402123501', fullName: 'کیان سلطانی', midtermScore: 5.5, homeworkScore: 4.0, finalExamScore: 9.0, calculatedFinalScore: 18.5, status: 'DRAFT' },
        { studentId: 12, studentCode: '402123502', fullName: 'یلدا ابراهیمی', midtermScore: 5.0, homeworkScore: 3.5, finalExamScore: 8.0, calculatedFinalScore: 16.5, status: 'DRAFT' },
      ],
      appeals: [],
    },
  ];
}

export const DEMO_ATTENDANCE_TODAY_JALALI = '۱۴۰۵/۰۹/۰۸';
export const DEMO_ATTENDANCE_DEFAULT_OFFERING_ID = 101;
export const DEMO_ATTENDANCE_DEFAULT_SESSION_NO = 7;
export const DEMO_ATTENDANCE_DEFAULT_ROOM_ID = 101;
export const DEMO_ATTENDANCE_PROFESSOR_FALLBACK_NAME = DEMO_PROFESSOR_FALLBACK_NAME;

export const DEMO_BIOMETRIC_BANNER = {
  title: 'موتور تطبیق هوشمند تردد بیومتریک و پیوستگی کلاس‌ها:',
  statusLabel: '✓ فعال (Chain Matching)',
  detail: 'اثر انگشت در گیت ورودی (ساعت ۰۷:۴۸) ثبت شده است. برای کلاس‌های متوالی پشت‌سرهم، سیستم به طور خودکار حضور شما را تایید کرده و نیازی به ثبت مکرر اثر انگشت نیست.',
  ipLabel: 'IP: 192.168.10.45 (شبکه داخلی دانشگاه)',
  payrollNote: 'در فیش حقوقی لحاظ شد.',
};

export const DEMO_MAKEUP_FORM_DEFAULTS = {
  replacedSessionNo: 4,
  sessionDate: '۱۴۰۵/۰۹/۰۸',
  sessionTime: '۱۳:۳۰ الی ۱۵:۳۰',
  topic: 'جلسه جبرانی: مدیریت بن‌بست و الگوریتم‌های بانکدار در سیستم‌عامل',
  reason: 'هم‌پوشانی با شرکت در سمینار تخصصی دانشگاه',
};

export const DEMO_MAKEUP_FALLBACK_START_TIME = '۱۳:۳۰';
export const DEMO_MAKEUP_FALLBACK_END_TIME = '۱۵:۳۰';

export function demoMakeupSessionNo(replacedSessionNo: number): number {
  return 100 + replacedSessionNo;
}

export const DEMO_ATTENDANCE_ROOMS: { id: number; name: string; capacity: number; type: string }[] = [
  { id: 101, name: 'کلاس ۳۰۱ (سمعی و بصری)', capacity: 40, type: 'THEORY' },
  { id: 102, name: 'کلاس ۳۰۲ (ویدیو پروژکتور)', capacity: 45, type: 'THEORY' },
  { id: 103, name: 'آزمایشگاه نرم‌افزار ۲', capacity: 25, type: 'LAB' },
  { id: 104, name: 'کلاس ۳۰۴', capacity: 30, type: 'THEORY' },
];

type DemoAttendanceSessionSeed = {
  sessionNo: number;
  sessionDate: string;
  startTime: string;
  endTime: string;
  roomName: string;
  topic: string;
  isHeld: boolean;
  isMakeUp: boolean;
  replacedSessionNo?: number;
  overrides?: Record<number, { status: 'PRESENT' | 'ABSENT' | 'EXCUSED' | 'LATE'; lateMinutes?: number }>;
};

const allPresent = (studentIds: number[]): ClassSessionItem['studentStatuses'] => {
  const out: ClassSessionItem['studentStatuses'] = {};
  for (const id of studentIds) out[id] = { status: 'PRESENT' };
  return out;
};

function buildSession(
  offeringId: number,
  studentIds: number[],
  seed: DemoAttendanceSessionSeed,
): ClassSessionItem {
  const statuses = allPresent(studentIds);
  for (const [id, att] of Object.entries(seed.overrides ?? {})) {
    statuses[Number(id)] = att;
  }
  const isVerified = seed.isHeld && !seed.isMakeUp;
  return {
    id: offeringId * 1000 + seed.sessionNo,
    sessionNo: seed.sessionNo,
    sessionDate: seed.sessionDate,
    startTime: seed.startTime,
    endTime: seed.endTime,
    roomName: seed.roomName,
    topic: seed.topic,
    isHeld: seed.isHeld,
    isMakeUp: seed.isMakeUp,
    replacedSessionNo: seed.replacedSessionNo,
    professorStatus: seed.isMakeUp ? 'APPROVED_MAKEUP' : isVerified ? 'VERIFIED_PRESENT' : 'UPCOMING',
    verificationDetail: seed.isMakeUp
      ? `تخصیص مستقیم کلاس ${seed.roomName} توسط استاد در ${DEMO_ATTENDANCE_TODAY_JALALI}`
      : isVerified
        ? 'حضور استاد در این جلسه ثبت شده است.'
        : 'جلسه در انتظار برگزاری/ثبت',
    professorCheck: isVerified
      ? {
          verificationMethod: 'BIOMETRIC_CHAIN_MATCHING',
          ipAddress: '192.168.10.45',
          recordedAt: `${seed.sessionDate} - ساعت ۰۷:۴۸`,
        }
      : null,
    studentStatuses: statuses,
  };
}

export function demoAttendanceOfferings(): AttendanceCourseOffering[] {
  const agentStudents = [1, 2, 3, 4, 5];
  const labStudents = [1, 2, 5];
  const dataStudents = [11, 12];

  const agentSessions: DemoAttendanceSessionSeed[] = [
    { sessionNo: 1, sessionDate: '۱۴۰۵/۰۷/۰۵', startTime: '۰۸:۰۰', endTime: '۱۰:۰۰', roomName: 'کلاس ۳۰۱ (سمعی و بصری)', topic: 'جلسهٔ ۱ — سیستم‌های عامل: معرفی درس و ساختار عامل‌ها', isHeld: true, isMakeUp: false },
    { sessionNo: 2, sessionDate: '۱۴۰۵/۰۷/۱۲', startTime: '۰۸:۰۰', endTime: '۱۰:۰۰', roomName: 'کلاس ۳۰۱ (سمعی و بصری)', topic: 'جلسهٔ ۲ — سیستم‌های عامل: محیط‌ها و معماری‌های عامل', isHeld: true, isMakeUp: false, overrides: { 4: { status: 'LATE', lateMinutes: 15 } } },
    { sessionNo: 3, sessionDate: '۱۴۰۵/۰۷/۱۹', startTime: '۰۸:۰۰', endTime: '۱۰:۰۰', roomName: 'کلاس ۳۰۱ (سمعی و بصری)', topic: 'جلسهٔ ۳ — سیستم‌های عامل: استدلال و نمایش دانش', isHeld: true, isMakeUp: false, overrides: { 3: { status: 'ABSENT' } } },
    { sessionNo: 4, sessionDate: '۱۴۰۵/۰۷/۲۶', startTime: '۰۸:۰۰', endTime: '۱۰:۰۰', roomName: 'کلاس ۳۰۱ (سمعی و بصری)', topic: 'جلسهٔ ۴ — سیستم‌های عامل: برنامه‌ریزی و جست‌وجوی حالت‌فضا', isHeld: true, isMakeUp: false, overrides: { 5: { status: 'LATE', lateMinutes: 20 } } },
    { sessionNo: 5, sessionDate: '۱۴۰۵/۰۸/۰۲', startTime: '۰۸:۰۰', endTime: '۱۰:۰۰', roomName: 'کلاس ۳۰۱ (سمعی و بصری)', topic: 'جلسهٔ ۵ — سیستم‌های عامل: شبکه‌های اجتماعی و بازار', isHeld: true, isMakeUp: false, overrides: { 2: { status: 'EXCUSED' } } },
    { sessionNo: 6, sessionDate: '۱۴۰۵/۰۸/۰۹', startTime: '۰۸:۰۰', endTime: '۱۰:۰۰', roomName: 'کلاس ۳۰۱ (سمعی و بصری)', topic: 'جلسهٔ ۶ — سیستم‌های عامل: چندعاملی و هماهنگی', isHeld: true, isMakeUp: false, overrides: { 3: { status: 'ABSENT' } } },
    { sessionNo: 7, sessionDate: '۱۴۰۵/۰۹/۰۸', startTime: '۰۸:۰۰', endTime: '۱۰:۰۰', roomName: 'کلاس ۳۰۱ (سمعی و بصری)', topic: 'جلسهٔ ۷ — سیستم‌های عامل: یادگیری تقویتی کاربردی', isHeld: true, isMakeUp: false, overrides: { 3: { status: 'ABSENT' } } },
    { sessionNo: 104, sessionDate: '۱۴۰۵/۰۹/۲۹', startTime: '۱۳:۳۰', endTime: '۱۵:۳۰', roomName: 'کلاس ۳۰۱ (سمعی و بصری)', topic: DEMO_MAKEUP_FORM_DEFAULTS.topic, isHeld: false, isMakeUp: true, replacedSessionNo: 4 },
  ];

  const labSessions: DemoAttendanceSessionSeed[] = [
    { sessionNo: 1, sessionDate: '۱۴۰۵/۰۷/۱۲', startTime: '۱۳:۳۰', endTime: '۱۵:۳۰', roomName: 'آزمایشگاه نرم‌افزار ۲', topic: 'جلسهٔ ۱ — آزمایشگاه سیستم‌های عامل و شبکه: راه‌اندازی محیط آزمایش', isHeld: true, isMakeUp: false },
    { sessionNo: 2, sessionDate: '۱۴۰۵/۰۷/۲۶', startTime: '۱۳:۳۰', endTime: '۱۵:۳۰', roomName: 'آزمایشگاه نرم‌افزار ۲', topic: 'جلسهٔ ۲ — پیاده‌سازی یک عامل ساده در شبکهٔ محلی', isHeld: true, isMakeUp: false, overrides: { 5: { status: 'ABSENT' } } },
    { sessionNo: 3, sessionDate: '۱۴۰۵/۰۸/۰۹', startTime: '۱۳:۳۰', endTime: '۱۵:۳۰', roomName: 'آزمایشگاه نرم‌افزار ۲', topic: 'جلسهٔ ۳ — سنجش کارایی و تحلیل پیام‌ها', isHeld: true, isMakeUp: false },
    { sessionNo: 4, sessionDate: '۱۴۰۵/۰۹/۰۵', startTime: '۱۳:۳۰', endTime: '۱۵:۳۰', roomName: 'آزمایشگاه نرم‌افزار ۲', topic: 'جلسهٔ ۴ — سناریوی چندعاملی پایانی', isHeld: true, isMakeUp: false },
  ];

  const dataSessions: DemoAttendanceSessionSeed[] = [
    { sessionNo: 1, sessionDate: '۱۴۰۵/۰۷/۱۲', startTime: '۰۸:۰۰', endTime: '۱۰:۰۰', roomName: 'کلاس ۳۰۲ (ویدیو پروژکتور)', topic: 'جلسهٔ ۱ — ساختمان داده‌ها و الگوریتم‌ها: تحلیل الگوریتم‌های بازگشتی', isHeld: true, isMakeUp: false },
    { sessionNo: 2, sessionDate: '۱۴۰۵/۰۷/۲۶', startTime: '۰۸:۰۰', endTime: '۱۰:۰۰', roomName: 'کلاس ۳۰۲ (ویدیو پروژکتور)', topic: 'جلسهٔ ۲ — ساختمان داده‌ها و الگوریتم‌ها: ساختارهای داده‌ای پایه', isHeld: true, isMakeUp: false, overrides: { 12: { status: 'LATE', lateMinutes: 10 } } },
    { sessionNo: 3, sessionDate: '۱۴۰۵/۰۸/۰۹', startTime: '۰۸:۰۰', endTime: '۱۰:۰۰', roomName: 'کلاس ۳۰۲ (ویدیو پروژکتور)', topic: 'جلسهٔ ۳ — ساختمان داده‌ها و الگوریتم‌ها: درخت‌های AVL', isHeld: true, isMakeUp: false },
  ];

  const studentInfo = DEMO_GRADE_STUDENTS.map(s => ({ id: s.studentId, studentCode: s.studentCode, fullName: s.fullName }));

  const pick = (ids: number[]) =>
    ids.map(id => studentInfo.find(s => s.id === id)).filter((s): s is (typeof studentInfo)[number] => !!s);

  return [
    {
      id: 101,
      code: 'CE-302',
      title: 'سیستم‌های عامل',
      groupNumber: 1,
      units: 3,
      roomName: 'کلاس ۳۰۱ (سمعی و بصری)',
      scheduleTime: 'شنبه‌ها ۰۸:۰۰ الی ۱۰:۰۰',
      students: pick(agentStudents),
      sessions: agentSessions.map(seed => buildSession(101, agentStudents, seed)),
    },
    {
      id: 103,
      code: 'CE-204',
      title: 'ساختمان داده‌ها و الگوریتم‌ها',
      groupNumber: 1,
      units: 3,
      roomName: 'کلاس ۳۰۲ (ویدیو پروژکتور)',
      scheduleTime: 'دوشنبه‌ها ۰۸:۰۰ الی ۱۰:۰۰',
      students: pick(dataStudents),
      sessions: dataSessions.map(seed => buildSession(103, dataStudents, seed)),
    },
    {
      id: 104,
      code: 'CE-208',
      title: 'آزمایشگاه و مبانی سیستم‌های عامل',
      groupNumber: 1,
      units: 2,
      roomName: 'آزمایشگاه نرم‌افزار ۲',
      scheduleTime: 'دوشنبه‌ها ۱۳:۳۰ الی ۱۵:۳۰ (هفته زوج)',
      students: pick(labStudents),
      sessions: labSessions.map(seed => buildSession(104, labStudents, seed)),
    },
  ];
}

export function demoAttendanceMakeupHistory(professorName: string): MakeupSessionRecord[] {
  return [
    {
      id: 8801,
      offeringId: 101,
      courseTitle: 'سیستم‌های عامل',
      groupNumber: 1,
      professorName,
      replacedSessionNo: 4,
      sessionDate: '۱۴۰۵/۰۹/۲۹',
      sessionTime: '۱۳:۳۰ الی ۱۵:۳۰',
      roomName: 'کلاس ۳۰۱ (سمعی و بصری)',
      topic: DEMO_MAKEUP_FORM_DEFAULTS.topic,
      reason: DEMO_MAKEUP_FORM_DEFAULTS.reason,
      status: 'APPROVED_DIRECT',
      allocatedAt: '۱۴۰۵/۰۹/۰۳ ساعت ۱۰:۱۵',
    },
  ];
}

export const DEMO_AVAILABILITY_SUMMARY = {
  trackingCodeLabel: 'کد رهگیری ثبت:',
  trackingCode: 'REQ-AVL-140501',
  processStatusLabel: 'وضعیت فرآیند:',
  processStatus: 'تحویل به مدیر گروه آموزشی',
  nextNoticeLabel: 'اطلاع‌رسانی بعدی:',
  nextNotice: 'اعلان انتشار برنامه هفتگی نهایی',
};

export const DEMO_AVAILABILITY_TERM = {
  id: 0,
  code: DEMO_TERM_CODE,
  title: DEMO_TERM_TITLE,
  isCurrent: true,
};

export const DEMO_LIVE_SESSIONS: import('./moodle-bbb').VirtualClassSession[] = [
  {
    courseId: 101,
    courseCode: 'CE-302',
    courseTitle: 'سیستم‌های عامل',
    professorName: DEMO_PROFESSOR_FALLBACK_NAME,
    meetingId: 'afagh-demo-ce302-1405',
    startTime: '08:00',
    endTime: '10:00',
    isRunning: true,
    activeParticipantsCount: 31,
    recordingsCount: 6,
  },
  {
    courseId: 103,
    courseCode: 'CE-204',
    courseTitle: 'ساختمان داده‌ها و الگوریتم‌ها',
    professorName: DEMO_PROFESSOR_FALLBACK_NAME,
    meetingId: 'afagh-demo-ce204-1405',
    startTime: '10:00',
    endTime: '12:00',
    isRunning: false,
    activeParticipantsCount: 0,
    recordingsCount: 5,
  },
  {
    courseId: 104,
    courseCode: 'CE-208',
    courseTitle: 'آزمایشگاه و مبانی سیستم‌های عامل',
    professorName: DEMO_PROFESSOR_FALLBACK_NAME,
    meetingId: 'afagh-demo-ce208-1405',
    startTime: '13:30',
    endTime: '15:30',
    isRunning: false,
    activeParticipantsCount: 0,
    recordingsCount: 3,
  },
];

export const DEMO_CONTRACT_DOCUMENT_CODE = 'AF-CON-1405';
export const DEMO_CONTRACT_DOCUMENT_VERSION = '۲٫۱';
export const DEMO_CONTRACT_UNIVERSITY_SEAL_CODE = 'DIGITAL-SIG-UNIV-1405';
export const DEMO_CONTRACT_PAYMENT_NOTE =
  '۵۰٪ از مبلغ قرارداد پس از برگزاری موفق امتحانات میان‌ترم و ثبت حضور و غیاب منظم به عنوان پیش‌پرداخت، و ۵۰٪ باقیمانده پس از تحویل نهایی نمرات در سامانه گلستان/آفاق و پاسخ‌دهی به کلیه اعتراضات دانشجویان تسویه خواهد شد.';
export const DEMO_CONTRACT_DOCUMENT_DATE = '۱۴۰۵/۰۷/۰۱';

export const DEMO_CONTRACT_LINES: ContractView['lines'] = [
  { offeringId: 101, code: 'CE-302', title: 'سیستم‌های عامل', groupNumber: 1, theoryUnits: 3, practicalUnits: 0, weeklyHours: 3, termTotalHours: 48 },
  { offeringId: 102, code: 'CE-302', title: 'سیستم‌های عامل', groupNumber: 2, theoryUnits: 3, practicalUnits: 0, weeklyHours: 3, termTotalHours: 48 },
  { offeringId: 103, code: 'CE-204', title: 'ساختمان داده‌ها و الگوریتم‌ها', groupNumber: 1, theoryUnits: 3, practicalUnits: 0, weeklyHours: 3, termTotalHours: 48 },
  { offeringId: 104, code: 'CE-208', title: 'آزمایشگاه سیستم‌های عامل و شبکه', groupNumber: 1, theoryUnits: 0, practicalUnits: 2, weeklyHours: 2, termTotalHours: 32 },
  { offeringId: 105, code: 'CE-410', title: 'مهندسی اینترنت و وب پیشرفته', groupNumber: 1, theoryUnits: 3, practicalUnits: 0, weeklyHours: 3, termTotalHours: 48 },
];

export const DEMO_CONTRACT_HOURLY_RATE = 850000;
export const DEMO_CONTRACT_TOTAL_TERM_HOURS = 224;
export const DEMO_CONTRACT_TOTAL_UNITS = 14;
export const DEMO_CONTRACT_GROSS_AMOUNT = 190400000;
export const DEMO_CONTRACT_TAX_PERCENT = 10;
export const DEMO_CONTRACT_TAX_DEDUCTION = 19040000;
export const DEMO_CONTRACT_INSURANCE_PERCENT = 7;
export const DEMO_CONTRACT_INSURANCE_DEDUCTION = 13328000;
export const DEMO_CONTRACT_NET_AMOUNT = 158032000;

export function demoContractView(input: {
  professorName: string;
  nationalCode: string;
  staffCode: string;
  academicRank: string;
}): ContractView {
  return {
    contractNo: DEMO_CONTRACT_DOCUMENT_CODE,
    contractDate: DEMO_CONTRACT_DOCUMENT_DATE,
    termTitle: DEMO_TERM_TITLE,
    professorName: input.professorName,
    nationalCode: input.nationalCode,
    staffCode: input.staffCode,
    bankAccountNo: '010123456789',
    staffType: DEMO_CONTRACT_TYPE,
    academicRank: input.academicRank || DEMO_ACADEMIC_RANK,
    degree: 'دکتری مهندسی کامپیوتر',
    departmentName: DEMO_DEPARTMENT_NAME,
    cooperationType: DEMO_CONTRACT_TYPE,
    hourlyRate: DEMO_CONTRACT_HOURLY_RATE,
    lines: DEMO_CONTRACT_LINES,
    totalTermHours: DEMO_CONTRACT_TOTAL_TERM_HOURS,
    totalUnits: DEMO_CONTRACT_TOTAL_UNITS,
    grossAmount: DEMO_CONTRACT_GROSS_AMOUNT,
    taxRatePercent: DEMO_CONTRACT_TAX_PERCENT,
    taxDeduction: DEMO_CONTRACT_TAX_DEDUCTION,
    insuranceRatePercent: DEMO_CONTRACT_INSURANCE_PERCENT,
    insuranceDeduction: DEMO_CONTRACT_INSURANCE_DEDUCTION,
    netAmount: DEMO_CONTRACT_NET_AMOUNT,
    midtermPayment: Math.round(DEMO_CONTRACT_NET_AMOUNT / 2),
    finalPayment: DEMO_CONTRACT_NET_AMOUNT - Math.round(DEMO_CONTRACT_NET_AMOUNT / 2),
    signatureStatus: 'PENDING',
    signedAt: null,
    digitalHash: null,
  };
}

