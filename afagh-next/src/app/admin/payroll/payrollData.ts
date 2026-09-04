/**
 * payrollData — تایپ‌ها و دادهٔ اولیهٔ شبیه‌ساز ماژول حقوق و دستمزد اساتید
 * (استخراج‌شده از PayrollEngineClient در گام جراحی معماری)
 */


export type FacultyContractType = 'FULL_TIME_FACULTY' | 'ADJUNCT';
export type PayrollStatus = 'DRAFT' | 'DEPT_HEAD_APPROVED' | 'DEAN_APPROVED' | 'FINANCE_SETTLED';

export const faNum = (n: any) =>
  n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

export interface CourseExamAggregationItem {
  id: number;
  courseCode: string;
  courseTitle: string;
  professorName: string;
  totalHallsCount: number;
  receivedHallsCount: number;
  totalExpectedSheets: number;
  totalDeliveredSheets: number;
  isFullyCollected: boolean;
  notificationSent: boolean;
  pickupQrStatus: string;
  pickupDate?: string;
  gradeDeadline: string;
  papersReturnedToArchive: boolean;
  archiveReturnDate?: string;
}

export interface CoursePayrollBreakdown {
  id: number;
  courseCode: string;
  courseTitle: string;
  degreeLevel: 'کارشناسی' | 'کارشناسی ارشد' | 'دکتری تخصصی';
  courseType: 'نظری' | 'عملی / آزمایشگاهی' | 'کارآموزی و پروژه' | 'پایان‌نامه';
  units: number;
  studentsCount: number;
  multiplier: number;
  teachingSharePercent: number; // e.g. 100 or 50 for co-teaching
  equivalentUnits: number;
  notes?: string;
}

export interface ProfessorPayrollRecord {
  id: number;
  staffId: number;
  staffCode: string;
  nationalCode: string;
  name: string;
  academicRank: 'مربی' | 'استادیار' | 'دانشیار' | 'استاد تمام';
  degree: 'کارشناسی ارشد' | 'دکتری تخصصی (Ph.D.)';
  departmentName: string;
  contractType: FacultyContractType;
  baseDutyUnits: number; // 10.0 for full-time faculty, 0 for adjunct
  baseRatePerUnit: number; // in Rials
  courses: CoursePayrollBreakdown[];
  totalEquivalentUnits: number;
  overloadUnits: number; // max(0, totalEquivalentUnits - baseDutyUnits)
  grossAmount: number; // in Rials
  classAbsencePenaltyUnits: number;
  classAbsencePenaltyAmount: number; // in Rials
  examAbsencePenaltyAmount: number; // in Rials (from Exam Minutes)
  lateGradePenaltyAmount: number; // in Rials
  taxRate: number; // e.g. 0.10 (10%)
  taxAmount: number; // in Rials
  totalDeductions: number; // in Rials
  netAmount: number; // in Rials
  status: PayrollStatus;
  iban: string;
  bankName: string;
  evaluatedScore: number;
  gradesFinalized: boolean;
  contractSigned: boolean;
  appointmentSigned: boolean;
  computedAt: string;
  approvedByDeptHeadAt?: string;
  approvedByDeanAt?: string;
  settledAt?: string;
}

export interface BaseRateItem {
  id: number;
  academicRank: string;
  degree: string;
  ratePerUnit: number; // in Rials
  ratePerHour: number; // in Rials
  effectiveYear: number;
}

export interface MultiplierRuleItem {
  id: number;
  ruleKey: string;
  ruleTitle: string;
  category: 'COURSE_TYPE' | 'DEGREE_LEVEL' | 'CLASS_SIZE' | 'THESIS';
  multiplier: number;
  description: string;
  isActive: boolean;
}

export interface BiometricAttendanceLogItem {
  id: number;
  staffCode: string;
  profName: string;
  sessionDate: string;
  courseTitle: string;
  groupNumber: number;
  classTime: string;
  isBackToBack: boolean;
  gatePunchTime?: string;
  verificationMethod:
    | 'GATE_FINGERPRINT'
    | 'CHAIN_MATCHING_CONTINUOUS'
    | 'STUDENT_ROLLCALL'
    | 'CLASS_PC_LOGIN'
    | 'UNJUSTIFIED_ABSENCE';
  verificationDetail: string;
  ipAddress: string;
  isFlaggedSuspicious: boolean;
  payrollPenaltyAmount: number;
}

export interface TeachingAppointmentDecree {
  id: number;
  decreeNo: string;
  staffCode: string;
  profName: string;
  academicRank: string;
  departmentName: string;
  termTitle: string;
  issueDate: string;
  coursesList: Array<{ code: string; title: string; group: number; units: number; weeklyHours: number }>;
  totalWeeklyHours: number;
  totalTermHours: number;
  signatureStatus: 'PENDING' | 'SIGNED';
  signedAt?: string;
  ipAddress?: string;
  otpUsed?: string;
  documentHash?: string;
}

export type PayrollTabType =
  | 'STATEMENTS_CARTABLE'
  | 'ATTENDANCE_BIOMETRIC_CHAIN'
  | 'ELECTRONIC_DECREES'
  | 'INSURANCE_AND_ADVANCES'
  | 'EXAM_AGGREGATION_CHAIN'
  | 'BASE_RATES'
  | 'MULTIPLIERS'
  | 'CONTRACTS'
  | 'BANK_DISKETTE';

// ==========================================
// INITIAL DATA
// ==========================================

export const INITIAL_BASE_RATES: BaseRateItem[] = [
  { id: 1, academicRank: 'مربی', degree: 'کارشناسی ارشد', ratePerUnit: 25000000, ratePerHour: 1562500, effectiveYear: 1405 },
  { id: 2, academicRank: 'استادیار', degree: 'دکتری تخصصی (Ph.D.)', ratePerUnit: 38000000, ratePerHour: 2375000, effectiveYear: 1405 },
  { id: 3, academicRank: 'دانشیار', degree: 'دکتری تخصصی (Ph.D.)', ratePerUnit: 49000000, ratePerHour: 3062500, effectiveYear: 1405 },
  { id: 4, academicRank: 'استاد تمام', degree: 'دکتری تخصصی (Ph.D.)', ratePerUnit: 62000000, ratePerHour: 3875000, effectiveYear: 1405 },
];

export const INITIAL_MULTIPLIERS: MultiplierRuleItem[] = [
  { id: 1, ruleKey: 'THEORY_COURSE', ruleTitle: 'دروس نظری استاندارد', category: 'COURSE_TYPE', multiplier: 1.00, description: 'ضریب پایه تدریس دروس تئوری طبق سرفصل وزارت علوم', isActive: true },
  { id: 2, ruleKey: 'PRACTICAL_LAB_COURSE', ruleTitle: 'دروس عملی، کارگاهی و آزمایشگاهی', category: 'COURSE_TYPE', multiplier: 1.50, description: 'ضریب ترغیبی به ازای هر واحد عملی و تجهیز آزمایشگاه', isActive: true },
  { id: 3, ruleKey: 'PROJECT_INTERNSHIP', ruleTitle: 'کارآموزی و پروژه پایانی', category: 'COURSE_TYPE', multiplier: 0.50, description: 'نظارت بر کارآموزی و هدایت پروژه کارشناسی', isActive: true },
  { id: 4, ruleKey: 'MASTER_LEVEL', ruleTitle: 'تدریس در مقطع کارشناسی ارشد', category: 'DEGREE_LEVEL', multiplier: 1.20, description: 'ضریب دشواری و تخصصی بودن دروس تحصیلات تکمیلی', isActive: true },
  { id: 5, ruleKey: 'PHD_LEVEL', ruleTitle: 'تدریس در مقطع دکتری تخصصی', category: 'DEGREE_LEVEL', multiplier: 1.50, description: 'ضریب سمینار و دروس پیشرفته دکتری', isActive: true },
  { id: 6, ruleKey: 'CROWDED_CLASS', ruleTitle: 'کلاس‌های پرجمعیت (بیش از ۴۰ دانشجو)', category: 'CLASS_SIZE', multiplier: 1.15, description: 'حق‌الزحمه اضافی برای تصحیح برگه و پاسخگویی به جمعیت بالا', isActive: true },
  { id: 7, ruleKey: 'MS_THESIS_GUIDE', ruleTitle: 'راهنمایی پایان‌نامه کارشناسی ارشد', category: 'THESIS', multiplier: 1.00, description: 'به ازای هر دانشجوی ارشد تا مرحله دفاع (معادل ۱ واحد)', isActive: true },
  { id: 8, ruleKey: 'PHD_DISSERTATION_GUIDE', ruleTitle: 'راهنمایی رساله دکتری تخصصی', category: 'THESIS', multiplier: 2.00, description: 'به ازای هر دانشجوی دکتری (معادل ۲ واحد معادل ترم)', isActive: true },
];

export const INITIAL_PAYROLL_RECORDS: ProfessorPayrollRecord[] = [
  {
    id: 1,
    staffId: 101,
    staffCode: '۱۱۰۲',
    nationalCode: '۰۰۱۱۱۱۱۱۱۱',
    name: 'دکتر جمیل احمدی',
    academicRank: 'استادیار',
    degree: 'دکتری تخصصی (Ph.D.)',
    departmentName: 'مهندسی کامپیوتر',
    contractType: 'FULL_TIME_FACULTY',
    baseDutyUnits: 10.0,
    baseRatePerUnit: 38000000,
    evaluatedScore: 4.85,
    gradesFinalized: true,
    contractSigned: true,
    appointmentSigned: true,
    computedAt: '۱۴۰۵/۱۰/۲۸ - ۱۰:۳۰',
    status: 'DEAN_APPROVED',
    approvedByDeptHeadAt: '۱۴۰۵/۱۰/۲۸ - ۱۲:۰۰',
    approvedByDeanAt: '۱۴۰۵/۱۰/۲۹ - ۰۹:۱۵',
    iban: 'IR120170000000123456789001',
    bankName: 'بانک ملی ایران',
    courses: [
      { id: 1, courseCode: '1112101', courseTitle: 'ریاضی عمومی ۱', degreeLevel: 'کارشناسی', courseType: 'نظری', units: 3, studentsCount: 30, multiplier: 1.0, teachingSharePercent: 100, equivalentUnits: 3.0 },
      { id: 2, courseCode: '1112201', courseTitle: 'ساختمان داده‌ها', degreeLevel: 'کارشناسی', courseType: 'نظری', units: 3, studentsCount: 35, multiplier: 1.0, teachingSharePercent: 100, equivalentUnits: 3.0 },
      { id: 3, courseCode: '1112302', courseTitle: 'سیستم‌های عامل پیشرفته', degreeLevel: 'کارشناسی ارشد', courseType: 'نظری', units: 3, studentsCount: 15, multiplier: 1.2, teachingSharePercent: 100, equivalentUnits: 3.6 },
      { id: 4, courseCode: '1112401', courseTitle: 'آزمایشگاه شبکه‌های کامپیوتری', degreeLevel: 'کارشناسی', courseType: 'عملی / آزمایشگاهی', units: 2, studentsCount: 22, multiplier: 1.5, teachingSharePercent: 100, equivalentUnits: 3.0 },
      { id: 5, courseCode: '1112999', courseTitle: 'راهنمایی پایان‌نامه ارشد (۲ دانشجو)', degreeLevel: 'کارشناسی ارشد', courseType: 'پایان‌نامه', units: 2, studentsCount: 2, multiplier: 1.0, teachingSharePercent: 100, equivalentUnits: 2.0 },
    ],
    totalEquivalentUnits: 14.6,
    overloadUnits: 4.6,
    grossAmount: 174800000,
    classAbsencePenaltyUnits: 0,
    classAbsencePenaltyAmount: 0,
    examAbsencePenaltyAmount: 0,
    lateGradePenaltyAmount: 0,
    taxRate: 0.10,
    taxAmount: 17480000,
    totalDeductions: 17480000,
    netAmount: 157320000,
  },
  {
    id: 2,
    staffId: 102,
    staffCode: '۱۱۰۵',
    nationalCode: '۰۰۲۲۲۲۲۲۲۲',
    name: 'دکتر سارا رضایی',
    academicRank: 'استادیار',
    degree: 'دکتری تخصصی (Ph.D.)',
    departmentName: 'مهندسی کامپیوتر',
    contractType: 'FULL_TIME_FACULTY',
    baseDutyUnits: 10.0,
    baseRatePerUnit: 38000000,
    evaluatedScore: 4.70,
    gradesFinalized: false,
    contractSigned: true,
    appointmentSigned: true,
    computedAt: '۱۴۰۵/۱۰/۲۸ - ۱۰:۳۰',
    status: 'DEPT_HEAD_APPROVED',
    approvedByDeptHeadAt: '۱۴۰۵/۱۰/۲۸ - ۱۵:۴۰',
    iban: 'IR550180000000123456789002',
    bankName: 'بانک تجارت',
    courses: [
      { id: 1, courseCode: '1112103', courseTitle: 'مبانی برنامه‌نویسی', degreeLevel: 'کارشناسی', courseType: 'نظری', units: 4, studentsCount: 30, multiplier: 1.0, teachingSharePercent: 100, equivalentUnits: 4.0 },
      { id: 2, courseCode: '1112202', courseTitle: 'برنامه‌نویسی پیشرفته', degreeLevel: 'کارشناسی', courseType: 'عملی / آزمایشگاهی', units: 3, studentsCount: 30, multiplier: 1.5, teachingSharePercent: 100, equivalentUnits: 4.5 },
      { id: 3, courseCode: '1112303', courseTitle: 'پایگاه داده‌ها', degreeLevel: 'کارشناسی', courseType: 'نظری', units: 3, studentsCount: 45, multiplier: 1.15, teachingSharePercent: 100, equivalentUnits: 3.45 },
      { id: 4, courseCode: '1112402', courseTitle: 'هوش مصنوعی پیشرفته', degreeLevel: 'کارشناسی ارشد', courseType: 'نظری', units: 3, studentsCount: 18, multiplier: 1.2, teachingSharePercent: 100, equivalentUnits: 3.6 },
    ],
    totalEquivalentUnits: 15.55,
    overloadUnits: 5.55,
    grossAmount: 210900000,
    classAbsencePenaltyUnits: 0,
    classAbsencePenaltyAmount: 0,
    examAbsencePenaltyAmount: 0,
    lateGradePenaltyAmount: 0,
    taxRate: 0.10,
    taxAmount: 21090000,
    totalDeductions: 21090000,
    netAmount: 189810000,
  },
  {
    id: 3,
    staffId: 103,
    staffCode: '۱۱۹۰',
    nationalCode: '۰۰۳۳۳۳۳۳۳۳',
    name: 'استاد مهدی کاظمی (مدعو)',
    academicRank: 'مربی',
    degree: 'کارشناسی ارشد',
    departmentName: 'مهندسی کامپیوتر',
    contractType: 'ADJUNCT',
    baseDutyUnits: 0.0,
    baseRatePerUnit: 25000000,
    evaluatedScore: 3.10,
    gradesFinalized: false,
    contractSigned: false,
    appointmentSigned: false,
    computedAt: '۱۴۰۵/۱۰/۲۸ - ۱۰:۳۰',
    status: 'DRAFT',
    iban: 'IR770190000000123456789003',
    bankName: 'بانک ملت',
    courses: [
      { id: 1, courseCode: '1112301', courseTitle: 'طراحی الگوریتم‌ها', degreeLevel: 'کارشناسی', courseType: 'نظری', units: 3, studentsCount: 28, multiplier: 1.0, teachingSharePercent: 100, equivalentUnits: 3.0 },
      { id: 2, courseCode: '1112108', courseTitle: 'مبانی فناوری اطلاعات (گروه ۲)', degreeLevel: 'کارشناسی', courseType: 'نظری', units: 3, studentsCount: 42, multiplier: 1.15, teachingSharePercent: 100, equivalentUnits: 3.45 },
    ],
    totalEquivalentUnits: 6.45,
    overloadUnits: 6.45,
    grossAmount: 161250000,
    classAbsencePenaltyUnits: 0.5,
    classAbsencePenaltyAmount: 12500000,
    examAbsencePenaltyAmount: 15000000,
    lateGradePenaltyAmount: 5000000,
    taxRate: 0.10,
    taxAmount: 16125000,
    totalDeductions: 48625000,
    netAmount: 112625000,
  },
  {
    id: 4,
    staffId: 104,
    staffCode: '۱۱۰۴',
    nationalCode: '۰۰۴۴۴۴۴۴۴۴',
    name: 'دکتر علی حسینی',
    academicRank: 'دانشیار',
    degree: 'دکتری تخصصی (Ph.D.)',
    departmentName: 'مهندسی کامپیوتر',
    contractType: 'FULL_TIME_FACULTY',
    baseDutyUnits: 10.0,
    baseRatePerUnit: 49000000,
    evaluatedScore: 4.40,
    gradesFinalized: true,
    contractSigned: true,
    appointmentSigned: true,
    computedAt: '۱۴۰۵/۱۰/۲۸ - ۱۰:۳۰',
    status: 'FINANCE_SETTLED',
    approvedByDeptHeadAt: '۱۴۰۵/۱۰/۲۸ - ۱۱:۰۰',
    approvedByDeanAt: '۱۴۰۵/۱۰/۲۸ - ۱۶:۰۰',
    settledAt: '۱۴۰۵/۱۰/۲۹ - ۱۰:۰۰',
    iban: 'IR330120000000123456789004',
    bankName: 'بانک صادرات ایران',
    courses: [
      { id: 1, courseCode: '1112105', courseTitle: 'فیزیک عمومی ۱', degreeLevel: 'کارشناسی', courseType: 'نظری', units: 3, studentsCount: 25, multiplier: 1.0, teachingSharePercent: 100, equivalentUnits: 3.0 },
      { id: 2, courseCode: '1112204', courseTitle: 'مدار منطقی', degreeLevel: 'کارشناسی', courseType: 'نظری', units: 3, studentsCount: 35, multiplier: 1.0, teachingSharePercent: 70, equivalentUnits: 2.1 },
      { id: 3, courseCode: '1112501', courseTitle: 'محاسبات موازی و ابری', degreeLevel: 'دکتری تخصصی', courseType: 'نظری', units: 3, studentsCount: 8, multiplier: 1.5, teachingSharePercent: 100, equivalentUnits: 4.5 },
      { id: 4, courseCode: '1112502', courseTitle: 'راهنمایی رساله دکتری (۱ دانشجو)', degreeLevel: 'دکتری تخصصی', courseType: 'پایان‌نامه', units: 2, studentsCount: 1, multiplier: 2.0, teachingSharePercent: 100, equivalentUnits: 4.0 },
    ],
    totalEquivalentUnits: 13.6,
    overloadUnits: 3.6,
    grossAmount: 176400000,
    classAbsencePenaltyUnits: 0,
    classAbsencePenaltyAmount: 0,
    examAbsencePenaltyAmount: 0,
    lateGradePenaltyAmount: 0,
    taxRate: 0.10,
    taxAmount: 17640000,
    totalDeductions: 17640000,
    netAmount: 158760000,
  },
  {
    id: 5,
    staffId: 105,
    staffCode: '۱۱۸۵',
    nationalCode: '۰۰۵۵۵۵۵۵۵۵',
    name: 'استاد نیلوفر مهدوی (مدعو)',
    academicRank: 'استادیار',
    degree: 'دکتری تخصصی (Ph.D.)',
    departmentName: 'مهندسی صنایع',
    contractType: 'ADJUNCT',
    baseDutyUnits: 0.0,
    baseRatePerUnit: 38000000,
    evaluatedScore: 4.65,
    gradesFinalized: true,
    contractSigned: true,
    appointmentSigned: true,
    computedAt: '۱۴۰۵/۱۰/۲۸ - ۱۰:۳۰',
    status: 'DEAN_APPROVED',
    approvedByDeptHeadAt: '۱۴۰۵/۱۰/۲۸ - ۱۴:۰۰',
    approvedByDeanAt: '۱۴۰۵/۱۰/۲۹ - ۰۸:۳۰',
    iban: 'IR990150000000123456789005',
    bankName: 'بانک پاسارگاد',
    courses: [
      { id: 1, courseCode: '1212101', courseTitle: 'تحقیق در عملیات ۱', degreeLevel: 'کارشناسی', courseType: 'نظری', units: 3, studentsCount: 38, multiplier: 1.0, teachingSharePercent: 100, equivalentUnits: 3.0 },
      { id: 2, courseCode: '1212202', courseTitle: 'کنترل کیفیت آماری', degreeLevel: 'کارشناسی', courseType: 'نظری', units: 3, studentsCount: 32, multiplier: 1.0, teachingSharePercent: 100, equivalentUnits: 3.0 },
      { id: 3, courseCode: '1212305', courseTitle: 'سیستم‌های صف و شبیه‌سازی', degreeLevel: 'کارشناسی ارشد', courseType: 'نظری', units: 3, studentsCount: 16, multiplier: 1.2, teachingSharePercent: 100, equivalentUnits: 3.6 },
    ],
    totalEquivalentUnits: 9.6,
    overloadUnits: 9.6,
    grossAmount: 364800000,
    classAbsencePenaltyUnits: 0,
    classAbsencePenaltyAmount: 0,
    examAbsencePenaltyAmount: 0,
    lateGradePenaltyAmount: 0,
    taxRate: 0.10,
    taxAmount: 36480000,
    totalDeductions: 36480000,
    netAmount: 328320000,
  },
];

export const INITIAL_BIOMETRIC_LOGS: BiometricAttendanceLogItem[] = [
  {
    id: 1,
    staffCode: '۱۱۰۲',
    profName: 'دکتر جمیل احمدی',
    sessionDate: '۱۴۰۵/۰۸/۱۲',
    courseTitle: 'ریاضی عمومی ۱',
    groupNumber: 1,
    classTime: '۰۸:۰۰ - ۱۰:۰۰',
    isBackToBack: false,
    gatePunchTime: '۰۷:۴۸:۱۲',
    verificationMethod: 'GATE_FINGERPRINT',
    verificationDetail: 'تطبیق موفق اثر انگشت در گیت ورودی اصلی (ساختمان آموزش)',
    ipAddress: '192.168.10.45 (شبکه داخلی دانشگاه)',
    isFlaggedSuspicious: false,
    payrollPenaltyAmount: 0,
  },
  {
    id: 2,
    staffCode: '۱۱۰۲',
    profName: 'دکتر جمیل احمدی',
    sessionDate: '۱۴۰۵/۰۸/۱۲',
    courseTitle: 'ساختمان داده‌ها',
    groupNumber: 1,
    classTime: '۱۰:۰۰ - ۱۲:۰۰',
    isBackToBack: true,
    gatePunchTime: undefined,
    verificationMethod: 'CHAIN_MATCHING_CONTINUOUS',
    verificationDetail: 'منطق پیوستگی زنجیره‌ای (Chain Matching): کلاس متوالی دوم — تایید خودکار حضور بدون نیاز به اثر انگشت مجدد در گیت',
    ipAddress: '192.168.10.45 (شبکه داخلی دانشگاه)',
    isFlaggedSuspicious: false,
    payrollPenaltyAmount: 0,
  },
  {
    id: 3,
    staffCode: '۱۱۰۵',
    profName: 'دکتر سارا رضایی',
    sessionDate: '۱۴۰۵/۰۸/۱۴',
    courseTitle: 'مبانی برنامه‌نویسی',
    groupNumber: 1,
    classTime: '۱۳:۳۰ - ۱۵:۳۰',
    isBackToBack: false,
    gatePunchTime: '۱۳:۱۵:۴۰',
    verificationMethod: 'CLASS_PC_LOGIN',
    verificationDetail: 'لاگین مستقیم استاد در کامپیوتر تریبون کلاس ۳۰۴ (Single Sign-On)',
    ipAddress: '10.20.4.102 (Classroom PC)',
    isFlaggedSuspicious: false,
    payrollPenaltyAmount: 0,
  },
  {
    id: 4,
    staffCode: '۱۱۹۰',
    profName: 'استاد مهدی کاظمی (مدعو)',
    sessionDate: '۱۴۰۵/۰۸/۱۶',
    courseTitle: 'طراحی الگوریتم‌ها',
    groupNumber: 1,
    classTime: '۰۸:۰۰ - ۱۰:۰۰',
    isBackToBack: false,
    gatePunchTime: undefined,
    verificationMethod: 'UNJUSTIFIED_ABSENCE',
    verificationDetail: 'عدم ثبت اثر انگشت در گیت، عدم لاگین کلاسی و عدم تشکیل جلسه جبرانی',
    ipAddress: '—',
    isFlaggedSuspicious: true,
    payrollPenaltyAmount: 12500000,
  },
];

export const INITIAL_APPOINTMENT_DECREES: TeachingAppointmentDecree[] = [
  {
    id: 1,
    decreeNo: 'AF-DEC-1405-1102',
    staffCode: '۱۱۰۲',
    profName: 'دکتر جمیل احمدی',
    academicRank: 'استادیار',
    departmentName: 'مهندسی کامپیوتر',
    termTitle: 'نیمسال اول ۱۴۰۵-۱۴۰۴',
    issueDate: '۱۴۰۵/۰۶/۲۵',
    coursesList: [
      { code: '1112101', title: 'ریاضی عمومی ۱', group: 1, units: 3, weeklyHours: 3 },
      { code: '1112201', title: 'ساختمان داده‌ها', group: 1, units: 3, weeklyHours: 3 },
      { code: '1112302', title: 'سیستم‌های عامل پیشرفته', group: 1, units: 3, weeklyHours: 3 },
      { code: '1112401', title: 'آزمایشگاه شبکه‌های کامپیوتری', group: 1, units: 2, weeklyHours: 2 },
    ],
    totalWeeklyHours: 11,
    totalTermHours: 176,
    signatureStatus: 'SIGNED',
    signedAt: '۱۴۰۵/۰۶/۲۸ - ۱۰:۱۵',
    ipAddress: '192.168.10.45',
    otpUsed: '94182',
    documentHash: 'SHA256:7f9a8b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a',
  },
  {
    id: 2,
    decreeNo: 'AF-DEC-1405-1105',
    staffCode: '۱۱۰۵',
    profName: 'دکتر سارا رضایی',
    academicRank: 'استادیار',
    departmentName: 'مهندسی کامپیوتر',
    termTitle: 'نیمسال اول ۱۴۰۵-۱۴۰۴',
    issueDate: '۱۴۰۵/۰۶/۲۵',
    coursesList: [
      { code: '1112103', title: 'مبانی برنامه‌نویسی', group: 1, units: 4, weeklyHours: 4 },
      { code: '1112202', title: 'برنامه‌نویسی پیشرفته', group: 1, units: 3, weeklyHours: 3 },
      { code: '1112303', title: 'پایگاه داده‌ها', group: 1, units: 3, weeklyHours: 3 },
      { code: '1112402', title: 'هوش مصنوعی پیشرفته', group: 1, units: 3, weeklyHours: 3 },
    ],
    totalWeeklyHours: 13,
    totalTermHours: 208,
    signatureStatus: 'SIGNED',
    signedAt: '۱۴۰۵/۰۶/۲۹ - ۱۶:۳۰',
    ipAddress: '192.168.10.52',
    otpUsed: '58124',
    documentHash: 'SHA256:9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d',
  },
  {
    id: 3,
    decreeNo: 'AF-DEC-1405-1190',
    staffCode: '۱۱۹۰',
    profName: 'استاد مهدی کاظمی (مدعو)',
    academicRank: 'مربی',
    departmentName: 'مهندسی کامپیوتر',
    termTitle: 'نیمسال اول ۱۴۰۵-۱۴۰۴',
    issueDate: '۱۴۰۵/۰۶/۲۵',
    coursesList: [
      { code: '1112301', title: 'طراحی الگوریتم‌ها', group: 1, units: 3, weeklyHours: 3 },
      { code: '1112108', title: 'مبانی فناوری اطلاعات (گروه ۲)', group: 2, units: 3, weeklyHours: 3 },
    ],
    totalWeeklyHours: 6,
    totalTermHours: 96,
    signatureStatus: 'PENDING',
  },
];

export const INITIAL_COURSE_EXAM_AGGREGATIONS: CourseExamAggregationItem[] = [
    {
      id: 1,
      courseCode: '۱۱۱۲۱۰۱',
      courseTitle: 'ریاضی عمومی ۱',
      professorName: 'دکتر جمیل احمدی',
      totalHallsCount: 3, // آمفی‌تئاتر مرکزی، سالن شماره ۲، سالن ورزشی
      receivedHallsCount: 3,
      totalExpectedSheets: 65,
      totalDeliveredSheets: 65,
      isFullyCollected: true,
      notificationSent: true,
      pickupQrStatus: 'PICKED_UP_BY_PROF',
      pickupDate: '۱۴۰۵/۱۰/۱۹ - ۱۰:۰۰',
      gradeDeadline: '۱۴۰۵/۱۰/۲۹ (۱۰ روز کاری)',
      papersReturnedToArchive: true, // تایید بایگانی -> باز شدن تسویه مالی
      archiveReturnDate: '۱۴۰۵/۱۰/۲۶',
    },
    {
      id: 2,
      courseCode: '۱۱۱۲۱۰۳',
      courseTitle: 'مبانی برنامه‌نویسی',
      professorName: 'دکتر سارا رضایی',
      totalHallsCount: 2, // سایت ۱۰۲ و سایت ۱۰۳
      receivedHallsCount: 2,
      totalExpectedSheets: 40,
      totalDeliveredSheets: 40,
      isFullyCollected: true,
      notificationSent: true,
      pickupQrStatus: 'PICKED_UP_BY_PROF',
      pickupDate: '۱۴۰۵/۱۰/۲۲ - ۱۴:۳۰',
      gradeDeadline: '۱۴۰۵/۱۱/۰۲ (۱۰ روز کاری)',
      papersReturnedToArchive: false, // هنوز برنگشته -> قفل تسویه مالی ۶۰٪
      archiveReturnDate: undefined,
    },
    {
      id: 3,
      courseCode: '۱۱۱۲۱۰۵',
      courseTitle: 'فیزیک عمومی ۱',
      professorName: 'دکتر علی حسینی',
      totalHallsCount: 3, // سالن ۱، سالن ۳، آمفی‌تئاتر
      receivedHallsCount: 2, // ۲ سالن از ۳ سالن رسیده
      totalExpectedSheets: 70,
      totalDeliveredSheets: 45,
      isFullyCollected: false, // هنوز کامل نشده -> پیامک به استاد قفل است
      notificationSent: false,
      pickupQrStatus: 'WAITING_AGGREGATION',
      pickupDate: undefined,
      gradeDeadline: '—',
      papersReturnedToArchive: false,
      archiveReturnDate: undefined,
    },
];

export const INITIAL_PROF_FINANCIAL_SETTINGS = [
    {
      staffId: 101,
      staffCode: '۱۱۰۲',
      name: 'دکتر جمیل احمدی',
      contractType: 'FULL_TIME_FACULTY',
      canRequestAdvance: false, // پیش‌فرض پنهان
      isInsuranceEnabled: true, // بیمه روزانه تامین اجتماعی
      isTaxExempt: false,
      daysTaughtCount: 16,
      advanceAmountRequested: 0,
      advanceAmountApproved: 0,
      advanceStatus: 'NONE',
    },
    {
      staffId: 102,
      staffCode: '۱۱۰۵',
      name: 'دکتر سارا رضایی',
      contractType: 'FULL_TIME_FACULTY',
      canRequestAdvance: true, // فعال‌شده توسط مدیر مالی برای تقاضای موردی
      isInsuranceEnabled: true,
      isTaxExempt: false,
      daysTaughtCount: 14,
      advanceAmountRequested: 50000000,
      advanceAmountApproved: 50000000,
      advanceStatus: 'PAID',
    },
    {
      staffId: 103,
      staffCode: '۱۱۹۰',
      name: 'استاد مهدی کاظمی (مدعو)',
      contractType: 'ADJUNCT',
      canRequestAdvance: true, // فعال‌شده توسط مدیر مالی
      isInsuranceEnabled: true,
      isTaxExempt: false,
      daysTaughtCount: 12,
      advanceAmountRequested: 40000000,
      advanceAmountApproved: 35000000,
      advanceStatus: 'APPROVED',
    },
    {
      staffId: 104,
      staffCode: '۱۱۰۴',
      name: 'دکتر علی حسینی',
      contractType: 'FULL_TIME_FACULTY',
      canRequestAdvance: false,
      isInsuranceEnabled: true,
      isTaxExempt: false,
      daysTaughtCount: 15,
      advanceAmountRequested: 0,
      advanceAmountApproved: 0,
      advanceStatus: 'NONE',
    },
];
export type ProfFinancialSettingItem = (typeof INITIAL_PROF_FINANCIAL_SETTINGS)[number];
