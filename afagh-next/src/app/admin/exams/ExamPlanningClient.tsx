'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';

// ==========================================
// TYPES & INTERFACES
// ==========================================

export type ExamSchedulingMode = 'AUTO_MATRIX' | 'MANUAL';
export type SeatingStrategyType = 'ALTERNATING_ZIGZAG' | 'EVEN_ODD' | 'SEQUENTIAL' | 'CHECKERBOARD';

export type ExamTabType =
  | 'SCHEDULE_TABLE'
  | 'SMART_SEATING_ENGINE'
  | 'ABSENCE_MANAGEMENT'
  | 'GRADE_DEADLINES'
  | 'EXAM_MINUTES_PAYROLL'
  | 'CALENDAR_SLOTS'
  | 'EXAM_HALLS'
  | 'CONFLICT_CHECKER'
  | 'PROCTORS'
  | 'STUDENT_CARDS'
  | 'QUALITY_ANALYTICS';

export interface ExamSlot {
  id: number;
  label: string;
  startTime: string; // e.g. "08:30"
  endTime: string;   // e.g. "10:30"
}

export interface ExamHall {
  id: number;
  name: string;
  buildingName: string;
  totalSeats: number;
  examCapacity: number; // distanced seating
  startSeatNumber: number; // e.g. 1, 101, 201
  endSeatNumber: number;   // startSeatNumber + examCapacity - 1
  seatPrefix?: string;     // e.g. "A-", "B-"
  hasAirConditioning: boolean;
  isCCTVMonitored: boolean;
  notes?: string;
}

export interface GradeTrackingCourse {
  id: number;
  courseCode: string;
  courseTitle: string;
  departmentName: string;
  professorName: string;
  professorPhone: string;
  studentsCount: number;
  examDate: string;
  gradeDeadline: string;
  hoursRemaining: number;
  status: 'PENDING' | 'DRAFT' | 'FINALIZED';
  remindersCount: number;
  lastReminderSentAt?: string;
}

export interface ExamRemunerationRate {
  id: number;
  role: string;
  roleTitle: string;
  ratePerHour: number;
}

export interface ProfessorExamAttendanceItem {
  id: number;
  courseCode: string;
  courseTitle: string;
  professorName: string;
  staffCode: string;
  phone: string;
  attendanceStatus: 'PRESENT' | 'WITH_COORDINATION' | 'ABSENT';
  penaltyApplied: boolean;
  notes: string;
}

export interface SessionProctorItem {
  id: number;
  staffId: number;
  name: string;
  staffCode: string;
  role: 'HALL_SUPERVISOR' | 'STANDARD_PROCTOR' | 'EXAM_LIAISON' | 'PRINTING_OFFICER';
  roleTitle: string;
  attendanceStatus: 'PRESENT' | 'ABSENT' | 'LATE';
  hoursWorked: number;
  ratePerHour: number;
  calculatedPayment: number;
  paymentStatus: 'UNPAID' | 'PAID';
}

export interface ProctorTermPayrollItem {
  staffId: number;
  name: string;
  staffCode: string;
  roleTitle: string;
  shiftsCount: number;
  totalHours: number;
  grossAmount: number;
  paymentStatus: 'UNPAID' | 'PAID';
  iban: string;
}

export interface ExamCourseItem {
  id: number;
  courseCode: string;
  courseTitle: string;
  units: number;
  courseType: string;
  groupNumber: number;
  programTitle: string;
  cohortId: string;
  cohortTitle: string;
  enrolledStudentsCount: number;
  professorName: string;
  staffCode: string;
  schedulingMode: ExamSchedulingMode;
  examDate: string; // e.g. "1405/10/18"
  slotId: number;
  hallId: number;
  chiefProctor: string;
  invigilatorsCount: number;
  hasConflict: boolean;
  conflictDetails?: string[];
}

export interface ProctorStaff {
  id: number;
  name: string;
  staffCode: string;
  staffType: 'PROFESSOR' | 'STAFF';
  assignedSlotsCount: number;
  maxDutySlots: number;
  assignedHalls: string[];
}

export interface AllocatedSeatModel {
  seatNo: number;
  studentName: string;
  studentCode: string;
  courseCode: string;
  courseTitle: string;
  profName: string;
  hallName: string;
  blockColor: string;
}

// ==========================================
// INITIAL DATA
// ==========================================

const INITIAL_EXAM_SLOTS: ExamSlot[] = [
  { id: 1, label: 'سانس ۱ (صبح زود)', startTime: '۰۸:۳۰', endTime: '۱۰:۳۰' },
  { id: 2, label: 'سانس ۲ (پیش از ظهر)', startTime: '۱۱:۰۰', endTime: '۱۳:۰۰' },
  { id: 3, label: 'سانس ۳ (بعدازظهر)', startTime: '۱۴:۰۰', endTime: '۱۶:۰۰' },
  { id: 4, label: 'سانس ۴ (عصر)', startTime: '۱۶:۳۰', endTime: '۱۸:۳۰' },
];

const INITIAL_EXAM_HALLS: ExamHall[] = [
  { id: 1, name: 'آمفی‌تئاتر مرکزی', buildingName: 'ساختمان اداری مرکزی', totalSeats: 120, examCapacity: 60, startSeatNumber: 1, endSeatNumber: 60, hasAirConditioning: true, isCCTVMonitored: true },
  { id: 2, name: 'سالن امتحانات شماره ۱', buildingName: 'ساختمان آموزش', totalSeats: 80, examCapacity: 40, startSeatNumber: 101, endSeatNumber: 140, hasAirConditioning: true, isCCTVMonitored: true },
  { id: 3, name: 'سالن امتحانات شماره ۲', buildingName: 'ساختمان آموزش', totalSeats: 80, examCapacity: 40, startSeatNumber: 201, endSeatNumber: 240, hasAirConditioning: true, isCCTVMonitored: true },
  { id: 4, name: 'سایت تخصصی کامپیوتر ۱۰۲', buildingName: 'دانشکده مهندسی', totalSeats: 50, examCapacity: 25, startSeatNumber: 301, endSeatNumber: 325, hasAirConditioning: true, isCCTVMonitored: true },
  { id: 5, name: 'کلاس ۳۰۱ امتحانی', buildingName: 'ساختمان ابن‌سینا', totalSeats: 60, examCapacity: 30, startSeatNumber: 401, endSeatNumber: 430, hasAirConditioning: true, isCCTVMonitored: false },
];

const INITIAL_PROCTORS: ProctorStaff[] = [
  { id: 1, name: 'دکتر جمیل احمدی', staffCode: '۱۱۰۲', staffType: 'PROFESSOR', assignedSlotsCount: 2, maxDutySlots: 4, assignedHalls: ['آمفی‌تئاتر مرکزی'] },
  { id: 2, name: 'دکتر سارا رضایی', staffCode: '۱۱۰۵', staffType: 'PROFESSOR', assignedSlotsCount: 3, maxDutySlots: 4, assignedHalls: ['سالن امتحانات ۱'] },
  { id: 3, name: 'دکتر علی حسینی', staffCode: '۱۱۰۴', staffType: 'PROFESSOR', assignedSlotsCount: 2, maxDutySlots: 4, assignedHalls: ['سالن امتحانات ۲'] },
  { id: 4, name: 'مهندس مریم کاظمی', staffCode: '۲۰۱۱', staffType: 'STAFF', assignedSlotsCount: 4, maxDutySlots: 6, assignedHalls: ['آمفی‌تئاتر مرکزی', 'سایت ۱۰۲'] },
  { id: 5, name: 'مهندس بهنام کریمی', staffCode: '۲۰۱۵', staffType: 'STAFF', assignedSlotsCount: 3, maxDutySlots: 6, assignedHalls: ['سالن امتحانات ۱'] },
];

const INITIAL_EXAM_COURSES: ExamCourseItem[] = [
  {
    id: 1,
    courseCode: '۱۱۱۲۱۰۱',
    courseTitle: 'ریاضی عمومی ۱',
    units: 3,
    courseType: 'پایه',
    groupNumber: 1,
    programTitle: 'مهندسی کامپیوتر',
    cohortId: 'COHORT-1405-1',
    cohortTitle: 'ورودی ۱۴۰۵ (ترم ۱)',
    enrolledStudentsCount: 30,
    professorName: 'دکتر جمیل احمدی',
    staffCode: '۱۱۰۲',
    schedulingMode: 'AUTO_MATRIX',
    examDate: '۱۴۰۵/۱۰/۱۸',
    slotId: 1,
    hallId: 1,
    chiefProctor: 'دکتر جمیل احمدی',
    invigilatorsCount: 2,
    hasConflict: false,
  },
  {
    id: 10,
    courseCode: '۱۱۱۲۱۰۹',
    courseTitle: 'تاریخ تحلیلی اسلام',
    units: 2,
    courseType: 'عمومی',
    groupNumber: 2,
    programTitle: 'مهندسی کامپیوتر',
    cohortId: 'COHORT-1405-1',
    cohortTitle: 'ورودی ۱۴۰۵ (ترم ۱)',
    enrolledStudentsCount: 30,
    professorName: 'استاد مرادی',
    staffCode: '۱۱۸۰',
    schedulingMode: 'AUTO_MATRIX',
    examDate: '۱۴۰۵/۱۰/۱۸',
    slotId: 1,
    hallId: 1,
    chiefProctor: 'استاد مرادی',
    invigilatorsCount: 2,
    hasConflict: false,
  },
  {
    id: 2,
    courseCode: '۱۱۱۲۱۰۳',
    courseTitle: 'مبانی برنامه‌نویسی',
    units: 4,
    courseType: 'پایه',
    groupNumber: 1,
    programTitle: 'مهندسی کامپیوتر',
    cohortId: 'COHORT-1405-1',
    cohortTitle: 'ورودی ۱۴۰۵ (ترم ۱)',
    enrolledStudentsCount: 25,
    professorName: 'دکتر سارا رضایی',
    staffCode: '۱۱۰۵',
    schedulingMode: 'AUTO_MATRIX',
    examDate: '۱۴۰۵/۱۰/۲۲',
    slotId: 2,
    hallId: 4,
    chiefProctor: 'دکتر سارا رضایی',
    invigilatorsCount: 2,
    hasConflict: false,
  },
  {
    id: 3,
    courseCode: '۱۱۱۲۱۰۵',
    courseTitle: 'فیزیک عمومی ۱',
    units: 3,
    courseType: 'پایه',
    groupNumber: 1,
    programTitle: 'مهندسی کامپیوتر',
    cohortId: 'COHORT-1405-1',
    cohortTitle: 'ورودی ۱۴۰۵ (ترم ۱)',
    enrolledStudentsCount: 35,
    professorName: 'دکتر علی حسینی',
    staffCode: '۱۱۰۴',
    schedulingMode: 'MANUAL',
    examDate: '۱۴۰۵/۱۰/۲۵',
    slotId: 1,
    hallId: 2,
    chiefProctor: 'دکتر علی حسینی',
    invigilatorsCount: 2,
    hasConflict: false,
  },
  {
    id: 4,
    courseCode: '۱۱۱۲۱۰۷',
    courseTitle: 'زبان انگلیسی عمومی',
    units: 3,
    courseType: 'عمومی',
    groupNumber: 1,
    programTitle: 'مهندسی کامپیوتر',
    cohortId: 'COHORT-1405-1',
    cohortTitle: 'ورودی ۱۴۰۵ (ترم ۱)',
    enrolledStudentsCount: 42,
    professorName: 'استاد مرادی',
    staffCode: '۱۱۸۰',
    schedulingMode: 'AUTO_MATRIX',
    examDate: '۱۴۰۵/۱۰/۲۸',
    slotId: 3,
    hallId: 1,
    chiefProctor: 'استاد مرادی',
    invigilatorsCount: 2,
    hasConflict: false,
  },
  {
    id: 5,
    courseCode: '۱۱۱۲۲۰۱',
    courseTitle: 'ساختمان داده‌ها',
    units: 3,
    courseType: 'اصلی',
    groupNumber: 1,
    programTitle: 'مهندسی کامپیوتر',
    cohortId: 'COHORT-1404-3',
    cohortTitle: 'ورودی ۱۴۰۴ (ترم ۳)',
    enrolledStudentsCount: 36,
    professorName: 'دکتر جمیل احمدی',
    staffCode: '۱۱۰۲',
    schedulingMode: 'AUTO_MATRIX',
    examDate: '۱۴۰۵/۱۰/۱۹',
    slotId: 2,
    hallId: 2,
    chiefProctor: 'دکتر جمیل احمدی',
    invigilatorsCount: 2,
    hasConflict: false,
  },
];

// Mock Student Names for Randomizer
const SAMPLE_STUDENTS_COURSE_A = [
  'علی رضایی اصل', 'زهرا موسوی کیا', 'محمدحسین حسینی', 'فاطمه احمدی‌پور',
  'امیررضا کریمی', 'سارا کاظمی‌نیا', 'نیما صادقی راد', 'مهدی جعفری',
  'مریم نوری', 'حسین عباسی', 'پوریا مرادی', 'نازنین رستمی',
  'عرفان باقری', 'الهام محمدی', 'سینا شریفی', 'پگاه یوسفی',
  'کیان مهرابی', 'ریحانه ابراهیمی', 'دانیال قاسم‌زاده', 'مهسا توکلی',
  'آرین فلاح', 'عاطفه خسروی', 'بهزاد انصاری', 'غزل طاهری',
  'نوید اسدی', 'رویا حیدری', 'میلاد کاشانی', 'شیرین فراهانی',
  'سپهر دادخواه', 'نگار رحیمی'
];

const SAMPLE_STUDENTS_COURSE_B = [
  'محمدرضا سلطانی', 'یاسمن غفاری', 'سامان پناهی', 'فروغ جمشیدی',
  'بردیا صالحی', 'آناهیتا معتمدی', 'پرهام اکبری', 'سوگل فرجی',
  'اشکان کیانی', 'شیدا بهرامی', 'سهراب نامدار', 'طناز صادق‌پور',
  'کامران صبوری', 'پردیس مهدوی', 'فربد جلالی', 'ملیکا امینی',
  'بهرام کاوه', 'هانیه مختاری', 'شاهین روزبه', 'فرناز سعیدی',
  'مازیار علیزاده', 'کیانا رفیعی', 'کیارش یزدانی', 'مونا دهقان',
  'پژمان گودرزی', 'نسترن بیات', 'شایان متین', 'آیدا زاهدی',
  'ماهان درخشان', 'ترانه فیاض'
];

export default function ExamPlanningClient() {
  const [activeTab, setActiveTab] = useState<ExamTabType>('SCHEDULE_TABLE');
  const [courses, setCourses] = useState<ExamCourseItem[]>(INITIAL_EXAM_COURSES);
  const [slots, setSlots] = useState<ExamSlot[]>(INITIAL_EXAM_SLOTS);
  const [halls, setHalls] = useState<ExamHall[]>(INITIAL_EXAM_HALLS);
  const [proctors, setProctors] = useState<ProctorStaff[]>(INITIAL_PROCTORS);

  const [examStartDate, setExamStartDate] = useState<string>('۱۴۰۵/۱۰/۱۸');
  const [examEndDate, setExamEndDate] = useState<string>('۱۴۰۵/۱۰/۳۰');
  const [selectedCohortFilter, setSelectedCohortFilter] = useState<string>('ALL');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('ALL');

  const [editingCourse, setEditingCourse] = useState<ExamCourseItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [showPhotoRosterPrint, setShowPhotoRosterPrint] = useState<boolean>(false);

  // ==========================================
  // ANTI-CHEATING SEATING ENGINE STATE
  // ==========================================
  const [seatingStrategy, setSeatingStrategy] = useState<SeatingStrategyType>('ALTERNATING_ZIGZAG');
  const [isGroupByProfCourse, setIsGroupByProfCourse] = useState<boolean>(true);
  const [isShuffleNames, setIsShuffleNames] = useState<boolean>(true);
  const [selectedSeatingSlot, setSelectedSeatingSlot] = useState<number>(1);
  const [allocatedSeatsList, setAllocatedSeatsList] = useState<AllocatedSeatModel[]>([]);

  // ==========================================
  // ABSENCE & DYNAMIC SMS CONFIG STATE
  // ==========================================
  const [selectedAbsenceCourseId, setSelectedAbsenceCourseId] = useState<number>(1);
  const [absenceSmsTemplate, setAbsenceSmsTemplate] = useState<string>(
    'دانشجوی گرامی {نام_دانشجو}، غیبت شما در آزمون درس {عنوان_درس} ثبت گردید. شما حداکثر ۴۸ ساعت فرصت دارید گواهی پزشکی یا مدارک موجه بودن غیبت را در سامانه کمیسیون موارد خاص آفاق بارگذاری فرمایید؛ در غیر اینصورت طبق آیین‌نامه اقدام خواهد شد.'
  );
  const [smsDeliveryLogs, setSmsDeliveryLogs] = useState<Array<{
    id: number;
    studentName: string;
    studentCode: string;
    mobile: string;
    sentAt: string;
    status: string;
  }>>([
    {
      id: 1,
      studentName: 'امیررضا کریمی',
      studentCode: '31412005',
      mobile: '09123456789',
      sentAt: '۱۴۰۵/۱۰/۱۸ - ۰۹:۱۵',
      status: 'تحویل داده شده (مخابرات)',
    },
    {
      id: 2,
      studentName: 'نیما صادقی راد',
      studentCode: '31412007',
      mobile: '09198765432',
      sentAt: '۱۴۰۵/۱۰/۱۸ - ۰۹:۱۵',
      status: 'تحویل داده شده (مخابرات)',
    },
  ]);

  // Quality Bottlenecks State
  const [evalBottlenecks, setEvalBottlenecks] = useState([
    {
      id: 1,
      profName: 'دکتر جمیل احمدی',
      staffCode: '۱۱۰۲',
      courses: ['ریاضی عمومی ۱', 'ساختمان داده‌ها', 'سیستم‌های عامل'],
      avgScore: 4.85,
      masteryScore: 4.95,
      teachingSkill: 4.80,
      disciplineScore: 4.90,
      totalResponses: 112,
      isFlagged: false,
      notes: 'کیفیت تدریس عالی و رضایت حداکثری دانشجویان',
    },
    {
      id: 2,
      profName: 'دکتر سارا رضایی',
      staffCode: '۱۱۰۵',
      courses: ['مبانی برنامه‌نویسی', 'برنامه‌نویسی پیشرفته', 'پایگاه داده‌ها'],
      avgScore: 4.70,
      masteryScore: 4.85,
      teachingSkill: 4.65,
      disciplineScore: 4.70,
      totalResponses: 98,
      isFlagged: false,
      notes: 'عملکرد بسیار خوب و پروژه‌محور در دروس تخصصی',
    },
    {
      id: 3,
      profName: 'دکتر علی حسینی',
      staffCode: '۱۱۰۴',
      courses: ['فیزیک عمومی ۱'],
      avgScore: 4.40,
      masteryScore: 4.60,
      teachingSkill: 4.20,
      disciplineScore: 4.50,
      totalResponses: 35,
      isFlagged: false,
      notes: 'عملکرد مطلوب در دروس پایه',
    },
    {
      id: 4,
      profName: 'استاد مهدی کاظمی (مدعو)',
      staffCode: '۱۱۹۰',
      courses: ['مبانی فناوری اطلاعات (گروه ۲)'],
      avgScore: 3.10,
      masteryScore: 3.20,
      teachingSkill: 2.90,
      disciplineScore: 3.30,
      totalResponses: 42,
      isFlagged: true,
      notes: '⚠️ گلوگاه کیفی: نمره میانگین زیر ۳.۵ — ضعف در انتقال مفاهیم و عدم پاسخگویی به ابهامات دانشجویان',
    },
  ]);

  // ==========================================
  // GRADE SUBMISSION & DEADLINE REMINDER STATE
  // ==========================================
  const [gradeCourses, setGradeCourses] = useState<GradeTrackingCourse[]>([
    {
      id: 1,
      courseCode: '1112101',
      courseTitle: 'ریاضی عمومی ۱',
      departmentName: 'مهندسی کامپیوتر',
      professorName: 'دکتر جمیل احمدی',
      professorPhone: '09121111111',
      studentsCount: 30,
      examDate: '۱۴۰۵/۱۰/۱۸',
      gradeDeadline: '۱۴۰۵/۱۰/۲۸ - ۲۳:۵۹',
      hoursRemaining: 18,
      status: 'PENDING',
      remindersCount: 1,
      lastReminderSentAt: '۱۴۰۵/۱۰/۲۵ - ۱۰:۱۵',
    },
    {
      id: 2,
      courseCode: '1112103',
      courseTitle: 'مبانی برنامه‌نویسی',
      departmentName: 'مهندسی کامپیوتر',
      professorName: 'دکتر سارا رضایی',
      professorPhone: '09122222222',
      studentsCount: 30,
      examDate: '۱۴۰۵/۱۰/۱۸',
      gradeDeadline: '۱۴۰۵/۱۰/۲۸ - ۲۳:۵۹',
      hoursRemaining: 18,
      status: 'DRAFT',
      remindersCount: 0,
    },
    {
      id: 3,
      courseCode: '1112105',
      courseTitle: 'فیزیک عمومی ۱',
      departmentName: 'مهندسی کامپیوتر',
      professorName: 'دکتر علی حسینی',
      professorPhone: '09123333333',
      studentsCount: 25,
      examDate: '۱۴۰۵/۱۰/۲۲',
      gradeDeadline: '۱۴۰۵/۱۱/۰۲ - ۲۳:۵۹',
      hoursRemaining: 65,
      status: 'PENDING',
      remindersCount: 0,
    },
    {
      id: 4,
      courseCode: '1112201',
      courseTitle: 'ساختمان داده‌ها',
      departmentName: 'مهندسی کامپیوتر',
      professorName: 'دکتر جمیل احمدی',
      professorPhone: '09121111111',
      studentsCount: 35,
      examDate: '۱۴۰۵/۱۰/۲۵',
      gradeDeadline: '۱۴۰۵/۱۱/۰۵ - ۲۳:۵۹',
      hoursRemaining: 96,
      status: 'FINALIZED',
      remindersCount: 0,
    },
    {
      id: 5,
      courseCode: '1112301',
      courseTitle: 'طراحی الگوریتم‌ها',
      departmentName: 'مهندسی کامپیوتر',
      professorName: 'استاد مهدی کاظمی (مدعو)',
      professorPhone: '09124444444',
      studentsCount: 28,
      examDate: '۱۴۰۵/۱۰/۱۵',
      gradeDeadline: '۱۴۰۵/۱۰/۲۵ - ۲۳:۵۹',
      hoursRemaining: -12,
      status: 'PENDING',
      remindersCount: 3,
      lastReminderSentAt: '۱۴۰۵/۱۰/۲۶ - ۰۸:۰۰',
    },
    {
      id: 6,
      courseCode: '1112302',
      courseTitle: 'پایگاه داده‌ها',
      departmentName: 'مهندسی کامپیوتر',
      professorName: 'دکتر سارا رضایی',
      professorPhone: '09122222222',
      studentsCount: 32,
      examDate: '۱۴۰۵/۱۰/۱۹',
      gradeDeadline: '۱۴۰۵/۱۰/۲۹ - ۲۳:۵۹',
      hoursRemaining: 42,
      status: 'DRAFT',
      remindersCount: 1,
      lastReminderSentAt: '۱۴۰۵/۱۰/۲۷ - ۱۴:۰۰',
    },
  ]);

  const [gradeSearchQuery, setGradeSearchQuery] = useState<string>('');
  const [gradeFilterStatus, setGradeFilterStatus] = useState<string>('ALL');
  const [gradeFilterUrgency, setGradeFilterUrgency] = useState<string>('ALL');
  const [nudgeModalCourse, setNudgeModalCourse] = useState<GradeTrackingCourse | null>(null);
  const [nudgeMessageText, setNudgeMessageText] = useState<string>('');
  const [sentNudgeLogs, setSentNudgeLogs] = useState<Array<{
    id: number;
    profName: string;
    courseTitle: string;
    phone: string;
    sentAt: string;
    text: string;
  }>>([
    {
      id: 1,
      profName: 'دکتر جمیل احمدی',
      courseTitle: 'ریاضی عمومی ۱',
      phone: '09121111111',
      sentAt: '۱۴۰۵/۱۰/۲۵ - ۱۰:۱۵',
      text: 'استاد محترم دکتر جمیل احمدی، مهلت ثبت نمرات درس ریاضی عمومی ۱ تا ۱۴۰۵/۱۰/۲۸ می‌باشد. لطفاً نهایی فرمایید.',
    },
    {
      id: 2,
      profName: 'استاد مهدی کاظمی',
      courseTitle: 'طراحی الگوریتم‌ها',
      phone: '09124444444',
      sentAt: '۱۴۰۵/۱۰/۲۶ - ۰۸:۰۰',
      text: 'اخطار ددلاین: استاد محترم مهلت ثبت نمرات درس طراحی الگوریتم‌ها منقضی شده است. پرونده به مدیر گروه ارجاع شد.',
    },
  ]);

  // ==========================================
  // EXAM MINUTES, PROFESSOR ATTENDANCE & PROCTOR REMUNERATION STATE
  // ==========================================
  const [minutesSelectedSlotId, setMinutesSelectedSlotId] = useState<number>(1);
  const [minutesSelectedHallId, setMinutesSelectedHallId] = useState<number>(1);
  const [minutesExamDate, setMinutesExamDate] = useState<string>('۱۴۰۵/۱۰/۱۸');
  const [minutesIsSigned, setMinutesIsSigned] = useState<boolean>(false);
  const [minutesSignatureHash, setMinutesSignatureHash] = useState<string | null>(null);

  const [remunerationRates, setRemunerationRates] = useState<ExamRemunerationRate[]>([
    { id: 1, role: 'HALL_SUPERVISOR', roleTitle: 'سرپرست سالن / رئیس حوزه', ratePerHour: 180000 },
    { id: 2, role: 'STANDARD_PROCTOR', roleTitle: 'مراقب عادی آزمون', ratePerHour: 120000 },
    { id: 3, role: 'EXAM_LIAISON', roleTitle: 'رابط و پیک سالن امتحانات', ratePerHour: 100000 },
    { id: 4, role: 'PRINTING_OFFICER', roleTitle: 'مسئول مخزن و تکثیر سوالات', ratePerHour: 150000 },
  ]);

  const [minutesProfessors, setMinutesProfessors] = useState<ProfessorExamAttendanceItem[]>([
    {
      id: 1,
      courseCode: '1112101',
      courseTitle: 'ریاضی عمومی ۱',
      professorName: 'دکتر جمیل احمدی',
      staffCode: '۱۱۰۲',
      phone: '09121111111',
      attendanceStatus: 'PRESENT',
      penaltyApplied: false,
      notes: 'حضور به موقع در سالن و پاسخگویی به سوالات داوطلبان',
    },
    {
      id: 2,
      courseCode: '1112103',
      courseTitle: 'مبانی برنامه‌نویسی',
      professorName: 'دکتر سارا رضایی',
      staffCode: '۱۱۰۵',
      phone: '09122222222',
      attendanceStatus: 'WITH_COORDINATION',
      penaltyApplied: false,
      notes: 'هماهنگی قبلی جهت اعزام دستیار آموزشی به سالن آزمون',
    },
    {
      id: 3,
      courseCode: '1112301',
      courseTitle: 'طراحی الگوریتم‌ها',
      professorName: 'استاد مهدی کاظمی (مدعو)',
      staffCode: '۱۱۹۰',
      phone: '09124444444',
      attendanceStatus: 'ABSENT',
      penaltyApplied: true,
      notes: 'عدم حضور غیرموجه در جلسه آزمون - اعمال کسر حق‌التدریس و اخطار سیستمی',
    },
  ]);

  const [minutesSessionProctors, setMinutesSessionProctors] = useState<SessionProctorItem[]>([
    {
      id: 1,
      staffId: 101,
      name: 'دکتر جمیل احمدی',
      staffCode: '۱۱۰۲',
      role: 'HALL_SUPERVISOR',
      roleTitle: 'سرپرست سالن / رئیس حوزه',
      attendanceStatus: 'PRESENT',
      hoursWorked: 2.0,
      ratePerHour: 180000,
      calculatedPayment: 360000,
      paymentStatus: 'UNPAID',
    },
    {
      id: 2,
      staffId: 102,
      name: 'مهندس مهرداد نوری',
      staffCode: '۲۰۱۵',
      role: 'STANDARD_PROCTOR',
      roleTitle: 'مراقب عادی آزمون',
      attendanceStatus: 'PRESENT',
      hoursWorked: 2.0,
      ratePerHour: 120000,
      calculatedPayment: 240000,
      paymentStatus: 'UNPAID',
    },
    {
      id: 3,
      staffId: 103,
      name: 'خانم الهام کاظمی',
      staffCode: '۲۰۲۲',
      role: 'STANDARD_PROCTOR',
      roleTitle: 'مراقب عادی آزمون',
      attendanceStatus: 'PRESENT',
      hoursWorked: 2.0,
      ratePerHour: 120000,
      calculatedPayment: 240000,
      paymentStatus: 'UNPAID',
    },
    {
      id: 4,
      staffId: 104,
      name: 'آقای سعید رضازاده',
      staffCode: '۲۰۳۰',
      role: 'EXAM_LIAISON',
      roleTitle: 'رابط و پیک سالن امتحانات',
      attendanceStatus: 'PRESENT',
      hoursWorked: 2.0,
      ratePerHour: 100000,
      calculatedPayment: 200000,
      paymentStatus: 'UNPAID',
    },
  ]);

  const [proctorTermPayrollList, setProctorTermPayrollList] = useState<ProctorTermPayrollItem[]>([
    {
      staffId: 101,
      name: 'دکتر جمیل احمدی',
      staffCode: '۱۱۰۲',
      roleTitle: 'سرپرست سالن',
      shiftsCount: 8,
      totalHours: 16.0,
      grossAmount: 2880000,
      paymentStatus: 'UNPAID',
      iban: 'IR120170000000123456789001',
    },
    {
      staffId: 102,
      name: 'مهندس مهرداد نوری',
      staffCode: '۲۰۱۵',
      roleTitle: 'مراقب عادی',
      shiftsCount: 10,
      totalHours: 20.0,
      grossAmount: 2400000,
      paymentStatus: 'UNPAID',
      iban: 'IR550180000000123456789002',
    },
    {
      staffId: 103,
      name: 'خانم الهام کاظمی',
      staffCode: '۲۰۲۲',
      roleTitle: 'مراقب عادی',
      shiftsCount: 9,
      totalHours: 18.0,
      grossAmount: 2160000,
      paymentStatus: 'UNPAID',
      iban: 'IR770190000000123456789003',
    },
    {
      staffId: 104,
      name: 'آقای سعید رضازاده',
      staffCode: '۲۰۳۰',
      roleTitle: 'رابط و پیک آزمون',
      shiftsCount: 12,
      totalHours: 24.0,
      grossAmount: 2400000,
      paymentStatus: 'UNPAID',
      iban: 'IR330120000000123456789004',
    },
    {
      staffId: 105,
      name: 'مهندس فرشید بهرامی',
      staffCode: '۲۰۴۵',
      roleTitle: 'مسئول مخزن و تکثیر',
      shiftsCount: 6,
      totalHours: 18.0,
      grossAmount: 2700000,
      paymentStatus: 'UNPAID',
      iban: 'IR990150000000123456789005',
    },
  ]);

  // Facilities Maintenance Tickets State
  const [facilityTickets, setFacilityTickets] = useState([
    {
      id: 101,
      roomName: 'کلاس ۳۰۴ (ساختمان آموزش)',
      issueType: 'خرابی و افت کیفیت تصویر ویدئوپروژکتور',
      reportedByCount: 32,
      targetDepartment: 'واحد فناوری اطلاعات (IT)',
      status: 'DISPATCHED' as 'PENDING' | 'DISPATCHED' | 'FIXED',
      ticketCode: 'IT-TKT-1405-304',
      dispatchedAt: '۱۴۰۵/۰۹/۲۱',
    },
    {
      id: 102,
      roomName: 'کلاس ۲۰۲ (ساختمان آموزش)',
      issueType: 'نقص سیستم سرمایش/گرمایش و عدم تهویه مناسب',
      reportedByCount: 28,
      targetDepartment: 'امور پشتیبانی و تاسیسات',
      status: 'PENDING' as 'PENDING' | 'DISPATCHED' | 'FIXED',
      ticketCode: 'LOG-TKT-1405-202',
    },
    {
      id: 103,
      roomName: 'سایت تخصصی کامپیوتر ۱۰۲',
      issueType: 'نیاز به ارتقای رم و نصب نرم‌افزارهای تخصصی روی ۵ سیستم',
      reportedByCount: 19,
      targetDepartment: 'واحد فناوری اطلاعات (IT)',
      status: 'DISPATCHED' as 'PENDING' | 'DISPATCHED' | 'FIXED',
      ticketCode: 'IT-TKT-1405-102',
      dispatchedAt: '۱۴۰۵/۰۹/۲۲',
    },
  ]);

  // New Slot Modal State
  const [isNewSlotModalOpen, setIsNewSlotModalOpen] = useState<boolean>(false);
  const [newSlotForm, setNewSlotForm] = useState({
    label: 'سانس ۵ (عصرگاهی)',
    startTime: '۱۹:۰۰',
    endTime: '۲۱:۰۰',
  });

  // New Hall Modal State
  const [isNewHallModalOpen, setIsNewHallModalOpen] = useState<boolean>(false);
  const [newHallForm, setNewHallForm] = useState({
    name: '',
    buildingName: 'ساختمان آموزش',
    totalSeats: 60,
    examCapacity: 30,
    startSeatNumber: 501,
    seatPrefix: '',
    hasAirConditioning: true,
    isCCTVMonitored: true,
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 6000);
  };

  // ==========================================
  // GRADE SUBMISSION DEADLINE HANDLERS
  // ==========================================
  const handleOpenNudgeModal = (course: GradeTrackingCourse) => {
    setNudgeModalCourse(course);
    const text = `استاد محترم ${course.professorName}، مهلت ثبت و نهایی کردن نمرات درس «${course.courseTitle}» تا تاریخ ${course.gradeDeadline} (${course.hoursRemaining > 0 ? `${course.hoursRemaining} ساعت مانده` : 'منقضی شده'}) می‌باشد. لطفاً پیش از پایان مهلت قانونی نسبت به نهایی‌سازی لیست‌ها در سامانه اقدام فرمایید: afagh.ac.ir/professor/grades`;
    setNudgeMessageText(text);
  };

  const handleSendSingleNudge = () => {
    if (!nudgeModalCourse) return;
    const newLog = {
      id: Date.now(),
      profName: nudgeModalCourse.professorName,
      courseTitle: nudgeModalCourse.courseTitle,
      phone: nudgeModalCourse.professorPhone,
      sentAt: 'هم‌اکنون',
      text: nudgeMessageText,
    };
    setSentNudgeLogs(prev => [newLog, ...prev]);
    setGradeCourses(prev =>
      prev.map(c =>
        c.id === nudgeModalCourse.id
          ? { ...c, remindersCount: c.remindersCount + 1, lastReminderSentAt: 'هم‌اکنون' }
          : c
      )
    );
    showToast(`📲 پیامک و هشدار سیستمی یادآوری ددلاین با موفقیت برای «${nudgeModalCourse.professorName}» ارسال گردید.`);
    setNudgeModalCourse(null);
  };

  const handleBulkNudge = () => {
    const pendingCourses = gradeCourses.filter(c => c.status !== 'FINALIZED');
    if (pendingCourses.length === 0) {
      showToast('کلیه اساتید نمرات خود را نهایی کرده‌اند و نیازی به ارسال یادآوری نیست.');
      return;
    }
    const newLogs = pendingCourses.map((c, idx) => ({
      id: Date.now() + idx,
      profName: c.professorName,
      courseTitle: c.courseTitle,
      phone: c.professorPhone,
      sentAt: 'هم‌اکنون (ارسال دسته‌جمعی)',
      text: `استاد محترم ${c.professorName}، یادآوری مهلت ثبت نمرات درس «${c.courseTitle}» تا ${c.gradeDeadline}. لطفاً پیش از پایان مهلت نهایی فرمایید.`,
    }));
    setSentNudgeLogs(prev => [...newLogs, ...prev]);
    setGradeCourses(prev =>
      prev.map(c =>
        c.status !== 'FINALIZED'
          ? { ...c, remindersCount: c.remindersCount + 1, lastReminderSentAt: 'هم‌اکنون (دسته‌جمعی)' }
          : c
      )
    );
    showToast(`📢 یادآوری دسته‌جمعی ددلاین برای ${pendingCourses.length} درس به اساتید مربوطه پیامک شد.`);
  };

  const handleEscalateToDeptHead = (courseId: number) => {
    const crs = gradeCourses.find(c => c.id === courseId);
    if (!crs) return;
    showToast(`⛔ پرونده تاخیر در ثبت نمره درس «${crs.courseTitle}» به کارتابل مدیر گروه ارجاع داده شد.`);
  };

  // ==========================================
  // EXAM MINUTES & POST-EXAM SETTLEMENT HANDLERS
  // ==========================================
  const handleUpdateProfExamAttendance = (
    id: number,
    status: 'PRESENT' | 'WITH_COORDINATION' | 'ABSENT',
    notes?: string
  ) => {
    setMinutesProfessors(prev =>
      prev.map(p => {
        if (p.id === id) {
          const penalty = status === 'ABSENT';
          return {
            ...p,
            attendanceStatus: status,
            penaltyApplied: penalty,
            notes: notes !== undefined ? notes : (penalty ? 'غیبت غیرموجه در آزمون - ثبت کسر حق‌التدریس' : p.notes),
          };
        }
        return p;
      })
    );
    const prof = minutesProfessors.find(p => p.id === id);
    if (status === 'ABSENT') {
      showToast(`⚠️ غیبت غیرموجه «${prof?.professorName}» در صورتجلسه ثبت و جریمه کسر از فیش حق‌التدریس فعال گردید.`);
    } else if (status === 'PRESENT') {
      showToast(`✓ حضور «${prof?.professorName}» در جلسه آزمون تایید شد.`);
    } else {
      showToast(`✓ عدم حضور با هماهنگی قبلی «${prof?.professorName}» ثبت شد.`);
    }
  };

  const handleUpdateProctorAttendance = (
    id: number,
    status: 'PRESENT' | 'ABSENT' | 'LATE',
    hoursWorked: number = 2.0
  ) => {
    setMinutesSessionProctors(prev =>
      prev.map(pr => {
        if (pr.id === id) {
          const calc = status === 'ABSENT' ? 0 : hoursWorked * pr.ratePerHour;
          return {
            ...pr,
            attendanceStatus: status,
            hoursWorked: status === 'ABSENT' ? 0 : hoursWorked,
            calculatedPayment: calc,
          };
        }
        return pr;
      })
    );
  };

  const handleSignExamMinutes = () => {
    const hash = 'SHA256:8f4c2e71d9a04b56839210c4f828a1be998e35a7b6209';
    setMinutesIsSigned(true);
    setMinutesSignatureHash(hash);
    showToast(`📝 صورتجلسه رسمی آزمون با امضای الکترونیکی نهایی و پلمب گردید.`);
  };

  const handleBatchPayProctors = () => {
    setProctorTermPayrollList(prev => prev.map(p => ({ ...p, paymentStatus: 'PAID' })));
    showToast(`✅ تسویه مالی کلیه مراقبین امتحانات انجام و سند حسابداری مربوطه صادر شد.`);
  };

  const handleExportProctorBankDiskette = () => {
    const csvContent = 'data:text/csv;charset=utf-8,' +
      'کد پرسنلی,نام و نام خانوادگی,تعداد شیفت,مجموع ساعات,مبلغ ناخالص (تومان),شماره شبا,وضعیت پرداخت\n' +
      proctorTermPayrollList
        .map(p => `${p.staffCode},${p.name},${p.shiftsCount},${p.totalHours},${p.grossAmount},${p.iban},${p.paymentStatus === 'PAID' ? 'پرداخت شده' : 'آماده پرداخت'}`)
        .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Proctor_Payroll_Bank_Diskette_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('💾 فایل دیسکت بانکی (پایا/شبا) مراقبین آزمون با موفقیت بارگیری شد.');
  };

  // ==========================================
  // SMART 3-PHASE SEATING ALLOCATION ENGINE
  // ==========================================
  const handleRunSmartSeatingAlgorithm = () => {
    // Phase 1: Grouping by Prof -> Course -> Group
    let listA = [...SAMPLE_STUDENTS_COURSE_A];
    let listB = [...SAMPLE_STUDENTS_COURSE_B];

    // Phase 2: Randomization (Fisher-Yates Shuffle)
    if (isShuffleNames) {
      for (let i = listA.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [listA[i], listA[j]] = [listA[j], listA[i]];
      }
      for (let i = listB.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [listB[i], listB[j]] = [listB[j], listB[i]];
      }
    }

    // Phase 3: Placement Strategy in Hall (Seats 1 to 60)
    const result: AllocatedSeatModel[] = [];

    if (seatingStrategy === 'ALTERNATING_ZIGZAG') {
      // Alternating 1 from A, 1 from B
      let idxA = 0;
      let idxB = 0;
      for (let seat = 1; seat <= 60; seat++) {
        if (seat % 2 !== 0 && idxA < listA.length) {
          result.push({
            seatNo: seat,
            studentName: listA[idxA],
            studentCode: `314120${(idxA + 1).toString().padStart(2, '0')}`,
            courseCode: '۱۱۱۲۱۰۱',
            courseTitle: 'ریاضی عمومی ۱',
            profName: 'دکتر جمیل احمدی',
            hallName: 'آمفی‌تئاتر مرکزی',
            blockColor: 'bg-indigo-600 text-white',
          });
          idxA++;
        } else if (idxB < listB.length) {
          result.push({
            seatNo: seat,
            studentName: listB[idxB],
            studentCode: `314130${(idxB + 1).toString().padStart(2, '0')}`,
            courseCode: '۱۱۱۲۱۰۹',
            courseTitle: 'تاریخ تحلیلی اسلام',
            profName: 'استاد مرادی',
            hallName: 'آمفی‌تئاتر مرکزی',
            blockColor: 'bg-emerald-600 text-white',
          });
          idxB++;
        }
      }
    } else if (seatingStrategy === 'EVEN_ODD') {
      // Course A on odd seats (1, 3, 5...), Course B on even seats (2, 4, 6...)
      for (let i = 0; i < listA.length; i++) {
        const seat = i * 2 + 1;
        if (seat <= 60) {
          result.push({
            seatNo: seat,
            studentName: listA[i],
            studentCode: `314120${(i + 1).toString().padStart(2, '0')}`,
            courseCode: '۱۱۱۲۱۰۱',
            courseTitle: 'ریاضی عمومی ۱',
            profName: 'دکتر جمیل احمدی',
            hallName: 'آمفی‌تئاتر مرکزی',
            blockColor: 'bg-indigo-600 text-white',
          });
        }
      }
      for (let i = 0; i < listB.length; i++) {
        const seat = (i + 1) * 2;
        if (seat <= 60) {
          result.push({
            seatNo: seat,
            studentName: listB[i],
            studentCode: `314130${(i + 1).toString().padStart(2, '0')}`,
            courseCode: '۱۱۱۲۱۰۹',
            courseTitle: 'تاریخ تحلیلی اسلام',
            profName: 'استاد مرادی',
            hallName: 'آمفی‌تئاتر مرکزی',
            blockColor: 'bg-emerald-600 text-white',
          });
        }
      }
    } else {
      // Sequential: Course A 1..30, Course B 31..60
      let seat = 1;
      for (const name of listA) {
        result.push({
          seatNo: seat,
          studentName: name,
          studentCode: `314120${seat.toString().padStart(2, '0')}`,
          courseCode: '۱۱۱۲۱۰۱',
          courseTitle: 'ریاضی عمومی ۱',
          profName: 'دکتر جمیل احمدی',
          hallName: 'آمفی‌تئاتر مرکزی',
          blockColor: 'bg-indigo-600 text-white',
        });
        seat++;
      }
      for (const name of listB) {
        result.push({
          seatNo: seat,
          studentName: name,
          studentCode: `314130${(seat - 30).toString().padStart(2, '0')}`,
          courseCode: '۱۱۱۲۱۰۹',
          courseTitle: 'تاریخ تحلیلی اسلام',
          profName: 'استاد مرادی',
          hallName: 'آمفی‌تئاتر مرکزی',
          blockColor: 'bg-emerald-600 text-white',
        });
        seat++;
      }
    }

    result.sort((a, b) => a.seatNo - b.seatNo);
    setAllocatedSeatsList(result);
    showToast(`⚡ الگوریتم چیدمان ضدتقلب با استراتژی «${seatingStrategy === 'ALTERNATING_ZIGZAG' ? 'زیگزاگی / یکی‌درمیان' : seatingStrategy === 'EVEN_ODD' ? 'زوج و فرد' : 'بلوک‌های متوالی'}» اجرا و در جدول seat_allocations ثبت گردید.`);
  };

  // Initial Run Seating
  React.useEffect(() => {
    handleRunSmartSeatingAlgorithm();
  }, []);

  // Send Absence SMS
  const handleSendAbsenceSmsToAll = () => {
    const newLog = {
      id: smsDeliveryLogs.length + 1,
      studentName: 'محمدرضا سلطانی',
      studentCode: '31413001',
      mobile: '09351234567',
      sentAt: `${new Date().toLocaleDateString('fa-IR')} - ${new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}`,
      status: 'تحویل داده شده (مخابرات)',
    };
    setSmsDeliveryLogs(prev => [newLog, ...prev]);
    showToast('📲 پیامک اخطار ۴۸ ساعته بارگذاری گواهی پزشکی برای کلیه غایبین آزمون با موفقیت ارسال گردید.');
  };

  return (
    <div className="space-y-4">
      {/* Top Banner & Header */}
      <div className="card bg-gradient-to-l from-indigo-950 via-slate-900 to-indigo-900 text-white p-5 rounded-2xl shadow-lg border border-indigo-800/40">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-700/80 border border-indigo-400/30 flex items-center justify-center text-3xl shadow-inner">
              📝
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-black text-lg sm:text-xl tracking-tight">ماژول مدیریت و برنامه‌ریزی جامع امتحانات دانشگاه</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/90 text-white shadow-xs">
                  نیمسال اول ۱۴۰۵-۱۴۰۴
                </span>
              </div>
              <p className="text-xs text-indigo-200 mt-1">
                موتور چیدمان ضدتقلب (زیگزاگی / زوج‌وفرد)، مدیریت غیبت‌ها با پیامک ۴۸ ساعته، رصد تداخل‌ها و صدور کارت آزمون
              </p>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab('SMART_SEATING_ENGINE')}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 text-slate-950 font-black text-xs shadow-md flex items-center gap-1.5 transition active:scale-95"
            >
              <span>⚡ موتور چیدمان ضدتقلب صندلی‌ها</span>
            </button>
            <button
              onClick={() => setShowPrintModal(true)}
              className="px-3.5 py-2 rounded-xl bg-indigo-800/80 hover:bg-indigo-700 text-indigo-100 font-bold text-xs border border-indigo-600/50 flex items-center gap-1.5 transition"
            >
              <span>🖨️ چاپ برنامه امتحانات</span>
            </button>
            <Link
              href="/admin/scheduling"
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-600/50 flex items-center gap-1.5 transition"
            >
              <span>🗓️ بازگشت به برنامه‌ریزی هفتگی</span>
            </Link>
          </div>
        </div>

        {/* Quick KPI Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-4 mt-4 border-t border-indigo-800/60 text-xs">
          <div className="p-2.5 bg-indigo-900/60 rounded-xl border border-indigo-700/40">
            <span className="text-indigo-300 block text-[11px]">کل عناوین امتحانی:</span>
            <span className="text-base font-black text-white">{courses.length} عنوان درس</span>
          </div>
          <div className="p-2.5 bg-indigo-900/60 rounded-xl border border-indigo-700/40">
            <span className="text-indigo-300 block text-[11px]">بازه امتحانات ترم:</span>
            <span className="text-xs font-bold text-white font-mono">{examStartDate} الی {examEndDate}</span>
          </div>
          <div className="p-2.5 bg-indigo-900/60 rounded-xl border border-indigo-700/40">
            <span className="text-indigo-300 block text-[11px]">سانس‌های فعال روزانه:</span>
            <span className="text-base font-black text-white">{slots.length} سانس آزمونی</span>
          </div>
          <div className="p-2.5 bg-indigo-900/60 rounded-xl border border-indigo-700/40">
            <span className="text-indigo-300 block text-[11px]">ظرفیت صندلی‌های فاصله‌دار:</span>
            <span className="text-base font-black text-emerald-400">
              {halls.reduce((s, h) => s + h.examCapacity, 0)} صندلی در هر سانس
            </span>
          </div>
          <div className="p-2.5 bg-indigo-900/60 rounded-xl border border-indigo-700/40">
            <span className="text-indigo-300 block text-[11px]">الگوریتم ضدتقلب:</span>
            <span className="text-base font-black text-amber-400">
              {seatingStrategy === 'ALTERNATING_ZIGZAG' ? 'زیگزاگی ۲ درس' : 'زوج و فرد'}
            </span>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toastMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="text-lg">📢</span>
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-emerald-700 font-black">✕</button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 bg-white p-2 rounded-2xl shadow-xs border border-slate-200">
        <button
          onClick={() => setActiveTab('SCHEDULE_TABLE')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'SCHEDULE_TABLE'
              ? 'bg-indigo-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>📋 جدول زمان‌بندی امتحانات و تخصیص دوحالته</span>
        </button>

        <button
          onClick={() => setActiveTab('SMART_SEATING_ENGINE')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'SMART_SEATING_ENGINE'
              ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
              : 'text-amber-900 hover:bg-amber-50'
          }`}
        >
          <span>🪑 موتور چیدمان صندلی ضدتقلب (۳ فاز)</span>
        </button>

        <button
          onClick={() => setActiveTab('ABSENCE_MANAGEMENT')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'ABSENCE_MANAGEMENT'
              ? 'bg-indigo-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>📱 غیبت‌ها و پیامک ۴۸ ساعته</span>
        </button>

        <button
          onClick={() => setActiveTab('GRADE_DEADLINES')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'GRADE_DEADLINES'
              ? 'bg-rose-700 text-white shadow-xs'
              : 'text-rose-900 hover:bg-rose-50'
          }`}
        >
          <span>⏱️ پایش ددلاین ثبت نمرات و اخطار اساتید</span>
        </button>

        <button
          onClick={() => setActiveTab('EXAM_MINUTES_PAYROLL')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'EXAM_MINUTES_PAYROLL'
              ? 'bg-indigo-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>📝 صورتجلسه آزمون، حضور استاد و تسویه مراقبین</span>
        </button>

        <button
          onClick={() => setActiveTab('CALENDAR_SLOTS')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'CALENDAR_SLOTS'
              ? 'bg-indigo-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>🗓️ بازه تقویم و سانس‌ها</span>
        </button>

        <button
          onClick={() => setActiveTab('EXAM_HALLS')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'EXAM_HALLS'
              ? 'bg-indigo-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>🏛️ حوزه‌ها، ظرفیت و بازه صندلی</span>
        </button>

        <button
          onClick={() => setActiveTab('PROCTORS')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'PROCTORS'
              ? 'bg-indigo-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>👥 مراقبین (QR-Code)</span>
        </button>

        <button
          onClick={() => setActiveTab('STUDENT_CARDS')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'STUDENT_CARDS'
              ? 'bg-indigo-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>📇 کارت ورود به جلسه</span>
        </button>

        <button
          onClick={() => setActiveTab('QUALITY_ANALYTICS')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'QUALITY_ANALYTICS'
              ? 'bg-indigo-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>📊 گلوگاه‌های کیفی اساتید و تیکت‌ها</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: SCHEDULE TABLE */}
      {/* ========================================================================= */}
      {activeTab === 'SCHEDULE_TABLE' && (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs">
            <span className="font-bold text-slate-800">
              لیست دروس امتحانی ترم با قابلیت سوئیچ بین حالت خودکار و دستی:
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('SMART_SEATING_ENGINE')}
                className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-black text-xs"
              >
                رفتن به موتور تخصیص صندلی ضدتقلب ←
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="p-2.5">کد درس</th>
                  <th className="p-2.5">عنوان درس و گروه</th>
                  <th className="p-2.5">استاد</th>
                  <th className="p-2.5 text-center">حالت زمان‌بندی</th>
                  <th className="p-2.5 text-center">تاریخ امتحان</th>
                  <th className="p-2.5 text-center">سانس</th>
                  <th className="p-2.5">سالن و صندلی</th>
                  <th className="p-2.5 text-center">تعداد دانشجو</th>
                  <th className="p-2.5 text-left">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {courses.map(course => (
                  <tr key={course.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-2.5 font-mono font-bold text-slate-700" dir="ltr">{course.courseCode}</td>
                    <td className="p-2.5 font-black text-slate-900">{course.courseTitle} (گروه {course.groupNumber})</td>
                    <td className="p-2.5 font-bold text-indigo-900">{course.professorName}</td>
                    <td className="p-2.5 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-900">
                        {course.schedulingMode === 'AUTO_MATRIX' ? '🤖 خودکار ترم' : '✍️ دستی'}
                      </span>
                    </td>
                    <td className="p-2.5 text-center font-mono font-bold text-slate-900">{course.examDate}</td>
                    <td className="p-2.5 text-center font-bold text-slate-700">سانس {course.slotId}</td>
                    <td className="p-2.5 font-medium text-slate-800">آمفی‌تئاتر مرکزی (۱ الی ۶۰)</td>
                    <td className="p-2.5 text-center font-bold text-slate-700">{course.enrolledStudentsCount} نفر</td>
                    <td className="p-2.5 text-left">
                      <button
                        onClick={() => setActiveTab('SMART_SEATING_ENGINE')}
                        className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-900 font-bold text-[11px] border border-indigo-200"
                      >
                        چیدمان صندلی 🪑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: SMART ANTI-CHEATING SEATING ENGINE (3-PHASE PROCESSOR) */}
      {/* ========================================================================= */}
      {activeTab === 'SMART_SEATING_ENGINE' && (
        <div className="card space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-black text-slate-900 text-base flex items-center gap-2">
                <span>🪑 موتور هوشمند پردازش و چیدمان صندلی ضدتقلب (Anti-Cheating Engine)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                گروه‌بندی ساختاریافته بر اساس کد استاد و درس، درهم‌سازی تصادفی اسامی و اعمال استراتژی‌های چیدمان فیزیکی (زیگزاگی، زوج‌وفرد)
              </p>
            </div>
            <button
              onClick={handleRunSmartSeatingAlgorithm}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 text-slate-950 font-black text-xs shadow-md flex items-center gap-1.5 transition active:scale-95"
            >
              <span>⚡ اجرای مجدد الگوریتم چیدمان و درهم‌سازی</span>
            </button>
          </div>

          {/* 3-Phase Control Panel */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
            {/* Phase 1: Grouping */}
            <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2">
              <span className="font-black text-indigo-950 block border-b border-slate-100 pb-1">
                فاز ۱: گروه‌بندی ساختاریافته (Grouping)
              </span>
              <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={isGroupByProfCourse}
                  onChange={e => setIsGroupByProfCourse(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                <span>مرتب‌سازی: کد استاد ← کد درس ← گروه</span>
              </label>
              <p className="text-[11px] text-slate-500">
                جهت توزیع و جمع‌آوری متمرکز و منظم برگه‌های امتحانی توسط مراقبین هر سالن
              </p>
            </div>

            {/* Phase 2: Randomization */}
            <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2">
              <span className="font-black text-indigo-950 block border-b border-slate-100 pb-1">
                فاز ۲: درهم‌سازی تصادفی (Randomization)
              </span>
              <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={isShuffleNames}
                  onChange={e => setIsShuffleNames(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                <span>درهم‌سازی اسامی (Fisher-Yates Shuffle)</span>
              </label>
              <p className="text-[11px] text-slate-500">
                جلوگیری از نشستن دانشجویان با نام‌های مشابه یا دوستان در کنار هم
              </p>
            </div>

            {/* Phase 3: Placement Strategy */}
            <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2">
              <span className="font-black text-indigo-950 block border-b border-slate-100 pb-1">
                فاز ۳: استراتژی چیدمان فیزیکی (Placement)
              </span>
              <select
                value={seatingStrategy}
                onChange={e => {
                  setSeatingStrategy(e.target.value as SeatingStrategyType);
                }}
                className="w-full border-2 border-amber-400 rounded-lg p-1.5 font-black text-xs bg-amber-50/50 text-slate-950"
              >
                <option value="ALTERNATING_ZIGZAG">۱. زیگزاگی / یکی‌درمیان دو درس (Anti-Cheating)</option>
                <option value="EVEN_ODD">۲. زوج و فرد (Even/Odd Split)</option>
                <option value="SEQUENTIAL">۳. عادی متوالی کلاسی (Sequential)</option>
                <option value="CHECKERBOARD">۴. شطرنجی ماتریسی فاصله‌دار</option>
              </select>
              <p className="text-[11px] text-amber-900 font-bold">
                ترکیب هوشمند دو درس هم‌سانس (ریاضی ۱ و تاریخ اسلام) در آمفی‌تئاتر
              </p>
            </div>
          </div>

          {/* Visual Seating Map */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="font-black text-slate-900 text-sm">
                  🗺️ نقشه چیدمان زنده صندلی‌های آمفی‌تئاتر مرکزی (۶۰ صندلی):
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-900">
                  نرخ ایمنی ضدتقلب: ۹۹.۴٪
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs font-bold">
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-md bg-indigo-600"></span> ریاضی عمومی ۱ (دکتر احمدی - ۳۰ نفر)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-md bg-emerald-600"></span> تاریخ تحلیلی اسلام (استاد مرادی - ۳۰ نفر)
                </span>
              </div>
            </div>

            {/* Grid Map */}
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2 p-4 bg-slate-950 rounded-3xl border-2 border-indigo-900">
              {allocatedSeatsList.map(st => (
                <div
                  key={st.seatNo}
                  className={`p-2.5 rounded-xl border text-center transition transform hover:scale-105 shadow-sm ${st.blockColor}`}
                  title={`${st.studentName} (${st.studentCode}) — ${st.courseTitle} (${st.profName})`}
                >
                  <span className="text-[9px] opacity-80 block font-mono">صندلی</span>
                  <span className="text-base font-black block font-mono">{st.seatNo}</span>
                  <span className="text-[10px] truncate block max-w-[70px] mx-auto font-bold mt-0.5">
                    {st.studentName.split(' ')[0]}
                  </span>
                  <span className="text-[8px] opacity-75 block truncate">
                    {st.courseTitle.split(' ')[0]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: ABSENCE MANAGEMENT & DYNAMIC SMS DISPATCH */}
      {/* ========================================================================= */}
      {activeTab === 'ABSENCE_MANAGEMENT' && (
        <div className="card space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-black text-slate-900 text-base flex items-center gap-2">
                <span>📱 مدیریت غیبت‌های امتحانی و سامانه پیامک هوشمند ۴۸ ساعته</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                ثبت غیبت سیستمی (وضعیت ABSENT)، ارسال خودکار پیامک مهلت ۴۸ ساعته بارگذاری گواهی پزشکی در کمیسیون
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/admin/templates"
                className="px-3.5 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-black text-xs shadow flex items-center gap-1.5 transition"
              >
                <span>📨 موتور قالب‌های پیامک ←</span>
              </Link>
              <button
                onClick={() => setShowPhotoRosterPrint(true)}
                className="px-3.5 py-2 rounded-xl bg-indigo-800 hover:bg-indigo-900 text-white font-black text-xs shadow flex items-center gap-1.5 transition"
              >
                <span>🖨️ چاپ صورت‌جلسه عکس‌دار</span>
              </button>
              <button
                onClick={handleSendAbsenceSmsToAll}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 text-white font-black text-xs shadow flex items-center gap-1.5 transition"
              >
                <span>📲 ارسال پیامک گروهی به غایبین</span>
              </button>
            </div>
          </div>

          {/* SMS Template Customizer */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-black text-slate-900 text-xs">
                ✍️ تنظیم و شخصی‌سازی الگوی پیامک اخطار غیبت به دانشجو:
              </span>
              <span className="text-slate-500 text-[11px]">
                متغیرهای در دسترس: {'{نام_دانشجو}'}، {'{عنوان_درس}'}، {'{مهلت_ساعت}'}
              </span>
            </div>

            <textarea
              rows={3}
              value={absenceSmsTemplate}
              onChange={e => setAbsenceSmsTemplate(e.target.value)}
              className="w-full border border-slate-300 rounded-xl p-3 font-bold text-xs bg-white text-slate-800"
            />

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-700">الگوهای پیش‌فرض:</span>
                <button
                  onClick={() =>
                    setAbsenceSmsTemplate(
                      'دانشجوی گرامی {نام_دانشجو}، غیبت شما در آزمون درس {عنوان_درس} ثبت گردید. شما حداکثر ۴۸ ساعت فرصت دارید گواهی پزشکی یا مدارک موجه بودن غیبت را در سامانه کمیسیون موارد خاص آفاق بارگذاری فرمایید؛ در غیر اینصورت طبق آیین‌نامه اقدام خواهد شد.'
                    )
                  }
                  className="px-2.5 py-1 rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-900 font-bold text-[11px]"
                >
                  مهلت ۴۸ ساعته گواهی پزشکی 🏥
                </button>
                <button
                  onClick={() =>
                    setAbsenceSmsTemplate(
                      'دانشجوی گرامی {نام_دانشجو}، غیبت در جلسه آزمون درس {عنوان_درس} غیرموجه ثبت شد و نمره صفر در کارنامه نیمسال شما درج می‌گردد.'
                    )
                  }
                  className="px-2.5 py-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-900 font-bold text-[11px]"
                >
                  اخطار نمره صفر غیبت 🔴
                </button>
              </div>

              <span className="text-emerald-700 font-bold">✓ متصل به وب‌سرویس پیامک دانشگاه</span>
            </div>
          </div>

          {/* SMS Dispatch Log Table */}
          <div className="space-y-3">
            <h3 className="font-black text-slate-900 text-xs sm:text-sm">
              لاگ ارسال پیامک‌های اخطار غیبت به دانشجویان:
            </h3>

            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="p-2.5">نام دانشجو</th>
                    <th className="p-2.5">شماره دانشجویی</th>
                    <th className="p-2.5">شماره همراه</th>
                    <th className="p-2.5 text-center">زمان ارسال پیامک</th>
                    <th className="p-2.5 text-center">وضعیت تحویل</th>
                    <th className="p-2.5 text-left">اقدام کمیسیون</th>
                  </tr>
                </thead>
                <tbody>
                  {smsDeliveryLogs.map(log => (
                    <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-2.5 font-bold text-slate-900">{log.studentName}</td>
                      <td className="p-2.5 font-mono text-slate-700" dir="ltr">{log.studentCode}</td>
                      <td className="p-2.5 font-mono text-slate-700" dir="ltr">{log.mobile}</td>
                      <td className="p-2.5 text-center font-mono text-slate-500">{log.sentAt}</td>
                      <td className="p-2.5 text-center">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-900">
                          ✓ {log.status}
                        </span>
                      </td>
                      <td className="p-2.5 text-left">
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                          در انتظار بارگذاری مدارک (۴۸ ساعت)
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: GRADE SUBMISSION & SLA DEADLINE TRACKER */}
      {/* ========================================================================= */}
      {activeTab === 'GRADE_DEADLINES' && (
        <div className="card space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-slate-900 text-base sm:text-lg">
                  ⏱️ پایش ددلاین ثبت نمرات اساتید و ارسال اخطارهای هوشمند (SLA)
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-900 border border-rose-200">
                  مهلت قانونی: ۱۰ روز پس از آزمون
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                رصد برخط وضعیت نمرات (قطعی 🟢، پیش‌نویس 🟡، ثبت‌نشده 🔴)، شمارش معکوس ددلاین و ارسال پیامک اخطار سریع به اساتید
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleBulkNudge}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-700 to-rose-800 hover:from-rose-800 text-white font-extrabold text-xs shadow flex items-center gap-1.5 transition active:scale-95"
              >
                <span>📢 ارسال یادآوری دسته‌جمعی به کلیه اساتید معوق</span>
              </button>
              <Link
                href="/admin/templates"
                className="px-3.5 py-2 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-bold text-xs shadow flex items-center gap-1.5 transition"
              >
                <span>📨 مدیریت قالب‌های پیامک ددلاین ←</span>
              </Link>
            </div>
          </div>

          {/* Quick Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <span className="text-slate-500 text-[11px] block font-medium">کل دروس ترم:</span>
              <span className="text-lg font-black text-slate-900">{gradeCourses.length} درس</span>
            </div>
            <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200">
              <span className="text-emerald-700 text-[11px] block font-medium">نهایی و قطعی (قفل شده):</span>
              <span className="text-lg font-black text-emerald-800">
                {gradeCourses.filter(c => c.status === 'FINALIZED').length} درس 🟢
              </span>
            </div>
            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200">
              <span className="text-amber-700 text-[11px] block font-medium">پیش‌نویس موقت استاد:</span>
              <span className="text-lg font-black text-amber-800">
                {gradeCourses.filter(c => c.status === 'DRAFT').length} درس 🟡
              </span>
            </div>
            <div className="p-3 bg-rose-50 rounded-2xl border border-rose-200">
              <span className="text-rose-700 text-[11px] block font-medium">ثبت‌نشده / معلق:</span>
              <span className="text-lg font-black text-rose-800">
                {gradeCourses.filter(c => c.status === 'PENDING').length} درس 🔴
              </span>
            </div>
            <div className="p-3 bg-red-100 rounded-2xl border border-red-300">
              <span className="text-red-800 text-[11px] block font-medium">اخطار بحرانی (&lt;۲۴ ساعت/انقضا):</span>
              <span className="text-lg font-black text-red-950">
                {gradeCourses.filter(c => c.status !== 'FINALIZED' && c.hoursRemaining < 24).length} درس 🚨
              </span>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-700">فیلتر وضعیت:</span>
                <select
                  value={gradeFilterStatus}
                  onChange={e => setGradeFilterStatus(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800"
                >
                  <option value="ALL">همه وضعیت‌ها</option>
                  <option value="PENDING">ثبت‌نشده (قرمز)</option>
                  <option value="DRAFT">پیش‌نویس موقت (زرد)</option>
                  <option value="FINALIZED">نهایی و قطعی (سبز)</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-700">فوریت ددلاین:</span>
                <select
                  value={gradeFilterUrgency}
                  onChange={e => setGradeFilterUrgency(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800"
                >
                  <option value="ALL">همه فوریت‌ها</option>
                  <option value="CRITICAL">🚨 اضطراری (&lt;۲۴ ساعت)</option>
                  <option value="WARNING">⚠️ هشدار (&lt;۷۲ ساعت)</option>
                  <option value="EXPIRED">⛔ منقضی شده</option>
                </select>
              </div>
            </div>

            <div className="w-full sm:w-64">
              <input
                type="text"
                placeholder="جستجو با نام استاد یا عنوان درس..."
                value={gradeSearchQuery}
                onChange={e => setGradeSearchQuery(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-1.5 text-xs bg-white text-slate-800"
              />
            </div>
          </div>

          {/* Courses Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="p-2.5">کد درس</th>
                  <th className="p-2.5">عنوان درس</th>
                  <th className="p-2.5">استاد درس</th>
                  <th className="p-2.5 text-center">دانشجویان</th>
                  <th className="p-2.5 text-center">تاریخ امتحان</th>
                  <th className="p-2.5 text-center">مهلت ددلاین</th>
                  <th className="p-2.5 text-center">زمان باقیمانده (SLA)</th>
                  <th className="p-2.5 text-center">وضعیت نمرات</th>
                  <th className="p-2.5 text-center">اخطارهای ارسالی</th>
                  <th className="p-2.5 text-left">عملیات پیگیری</th>
                </tr>
              </thead>
              <tbody>
                {gradeCourses
                  .filter(c => {
                    if (gradeFilterStatus !== 'ALL' && c.status !== gradeFilterStatus) return false;
                    if (gradeFilterUrgency === 'CRITICAL' && (c.hoursRemaining >= 24 || c.hoursRemaining < 0)) return false;
                    if (gradeFilterUrgency === 'WARNING' && (c.hoursRemaining >= 72 || c.hoursRemaining < 24)) return false;
                    if (gradeFilterUrgency === 'EXPIRED' && c.hoursRemaining >= 0) return false;
                    if (gradeSearchQuery.trim()) {
                      const q = gradeSearchQuery.trim().toLowerCase();
                      return (
                        c.courseTitle.toLowerCase().includes(q) ||
                        c.courseCode.includes(q) ||
                        c.professorName.toLowerCase().includes(q)
                      );
                    }
                    return true;
                  })
                  .map(course => {
                    const isExpired = course.hoursRemaining < 0;
                    const isCritical = course.hoursRemaining >= 0 && course.hoursRemaining <= 24;
                    const isWarning = course.hoursRemaining > 24 && course.hoursRemaining <= 72;

                    return (
                      <tr
                        key={course.id}
                        className={`border-b border-slate-100 transition ${
                          course.status === 'FINALIZED'
                            ? 'bg-emerald-50/40 hover:bg-emerald-50/80'
                            : isExpired
                            ? 'bg-rose-50/70 hover:bg-rose-50'
                            : isCritical
                            ? 'bg-amber-50/70 hover:bg-amber-50'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="p-2.5 font-mono font-bold text-slate-700" dir="ltr">
                          {course.courseCode}
                        </td>
                        <td className="p-2.5 font-black text-slate-900">{course.courseTitle}</td>
                        <td className="p-2.5 font-bold text-indigo-900">
                          <div>{course.professorName}</div>
                          <div className="font-mono text-[10px] text-slate-500" dir="ltr">
                            {course.professorPhone}
                          </div>
                        </td>
                        <td className="p-2.5 text-center font-bold text-slate-700">
                          {course.studentsCount} نفر
                        </td>
                        <td className="p-2.5 text-center font-mono font-bold text-slate-800">
                          {course.examDate}
                        </td>
                        <td className="p-2.5 text-center font-mono text-[11px] text-slate-700 font-bold">
                          {course.gradeDeadline}
                        </td>
                        <td className="p-2.5 text-center">
                          {course.status === 'FINALIZED' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-900">
                              ✓ بسته شده
                            </span>
                          ) : isExpired ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white animate-pulse">
                              ⛔ منقضی ({Math.abs(course.hoursRemaining)} ساعت تاخیر)
                            </span>
                          ) : isCritical ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-900 border border-rose-300 font-mono">
                              🚨 {course.hoursRemaining} ساعت مانده (فوری)
                            </span>
                          ) : isWarning ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 font-mono">
                              ⚠️ {course.hoursRemaining} ساعت مانده
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 font-mono">
                              {course.hoursRemaining} ساعت مانده
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-center">
                          {course.status === 'FINALIZED' ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-600 text-white shadow-xs">
                              🟢 نهایی و قطعی
                            </span>
                          ) : course.status === 'DRAFT' ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-500 text-slate-950 shadow-xs">
                              🟡 پیش‌نویس موقت
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-600 text-white shadow-xs">
                              🔴 ثبت‌نشده
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-center">
                          <div className="font-bold text-slate-800">
                            {course.remindersCount > 0 ? (
                              <span className="text-indigo-900 font-black">
                                {course.remindersCount} نوبت پیامک
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </div>
                          {course.lastReminderSentAt && (
                            <div className="text-[9px] text-slate-500 font-mono">
                              {course.lastReminderSentAt}
                            </div>
                          )}
                        </td>
                        <td className="p-2.5 text-left">
                          <div className="flex items-center justify-end gap-1.5">
                            {course.status !== 'FINALIZED' && (
                              <button
                                onClick={() => handleOpenNudgeModal(course)}
                                className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 font-black text-[11px] transition"
                              >
                                📲 اخطار سریع
                              </button>
                            )}
                            {isExpired && (
                              <button
                                onClick={() => handleEscalateToDeptHead(course.id)}
                                className="px-2.5 py-1 rounded-lg bg-red-800 hover:bg-red-900 text-white font-bold text-[10px] shadow-xs"
                              >
                                🚨 ارجاع مدیر گروه
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Dispatch Log Box */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <h3 className="font-black text-slate-900 text-xs">
              📋 تاریخچه هشدارهای ارسالی به اساتید (Log Dispatch Engine):
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {sentNudgeLogs.map(log => (
                <div
                  key={log.id}
                  className="p-2.5 bg-white rounded-xl border border-slate-200 flex items-start justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-indigo-950">{log.profName}</span>
                      <span className="text-slate-400">·</span>
                      <span className="font-bold text-slate-700">درس: {log.courseTitle}</span>
                      <span className="font-mono text-[10px] text-slate-500" dir="ltr">
                        ({log.phone})
                      </span>
                    </div>
                    <p className="text-slate-600 text-[11px]">{log.text}</p>
                  </div>
                  <div className="text-left shrink-0">
                    <span className="font-mono text-[10px] text-slate-500 block">{log.sentAt}</span>
                    <span className="text-[10px] font-bold text-emerald-700">✓ تحویل مخابرات</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: EXAM MINUTES, PROFESSOR ATTENDANCE & PROCTOR REMUNERATION */}
      {/* ========================================================================= */}
      {activeTab === 'EXAM_MINUTES_PAYROLL' && (
        <div className="card space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-slate-900 text-base sm:text-lg">
                  📝 صورتجلسه الکترونیکی آزمون، ثبت حضور استاد و تسویه مراقبین
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-900 border border-indigo-200">
                  اتصال مستقیم به ماژول حقوق و دستمزد
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                ثبت برخط حضور و پاسخگویی استاد، محاسبه خودکار حق‌الزحمه مراقبت، امضای دیجیتال و صدور دیسکت بانکی
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!minutesIsSigned ? (
                <button
                  onClick={handleSignExamMinutes}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 text-white font-extrabold text-xs shadow flex items-center gap-1.5 transition active:scale-95"
                >
                  <span>✍️ امضای الکترونیکی و پلمب صورتجلسه</span>
                </button>
              ) : (
                <div className="px-3 py-1.5 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-950 font-black text-xs flex items-center gap-1.5">
                  <span>🔒 پلمب با امضای دیجیتال</span>
                  <span className="font-mono text-[10px]" dir="ltr">({minutesSignatureHash?.slice(0, 16)}...)</span>
                </div>
              )}
            </div>
          </div>

          {/* Session Selector */}
          <div className="p-4 bg-indigo-950 text-white rounded-2xl shadow-md flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-indigo-300 font-bold">📅 تاریخ آزمون:</span>
                <span className="font-mono font-black text-white">{minutesExamDate}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-indigo-300 font-bold">⏰ سانس:</span>
                <span className="font-bold text-amber-300">سانس ۱ (۰۸:۳۰ الی ۱۰:۳۰)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-indigo-300 font-bold">🏛️ حوزه آزمون:</span>
                <span className="font-bold text-emerald-300">آمفی‌تئاتر مرکزی (ظرفیت: ۶۰ نفر)</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded bg-indigo-800 text-indigo-100 font-bold text-[11px]">
                سرپرست حوزه: دکتر جمیل احمدی
              </span>
            </div>
          </div>

          {/* SECTION 1: PROFESSOR EXAM ATTENDANCE */}
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                  <span>👨‍🏫 ۱. وضعیت حضور اساتید دروس در سالن آزمون (جهت رفع اشکال)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  طبق آیین‌نامه، عدم حضور استاد بدون هماهنگی قبلی موجب درج غیبت در کارگزینی و کسر از فیش حق‌التدریس می‌شود.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="p-2.5">کد درس</th>
                    <th className="p-2.5">عنوان درس</th>
                    <th className="p-2.5">استاد درس</th>
                    <th className="p-2.5">شماره تماس</th>
                    <th className="p-2.5 text-center">وضعیت حضور در سالن</th>
                    <th className="p-2.5 text-center">اثر انضباطی و مالی</th>
                    <th className="p-2.5">توضیحات و علت</th>
                  </tr>
                </thead>
                <tbody>
                  {minutesProfessors.map(prof => (
                    <tr
                      key={prof.id}
                      className={`border-b border-slate-100 transition ${
                        prof.attendanceStatus === 'ABSENT'
                          ? 'bg-rose-50/70 font-bold'
                          : prof.attendanceStatus === 'PRESENT'
                          ? 'bg-emerald-50/40'
                          : 'bg-amber-50/40'
                      }`}
                    >
                      <td className="p-2.5 font-mono font-bold text-slate-700" dir="ltr">
                        {prof.courseCode}
                      </td>
                      <td className="p-2.5 font-black text-slate-900">{prof.courseTitle}</td>
                      <td className="p-2.5 font-bold text-indigo-950">{prof.professorName}</td>
                      <td className="p-2.5 font-mono text-slate-600" dir="ltr">{prof.phone}</td>
                      <td className="p-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleUpdateProfExamAttendance(prof.id, 'PRESENT')}
                            className={`px-2 py-1 rounded text-[11px] font-black transition ${
                              prof.attendanceStatus === 'PRESENT'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            ✓ حاضر در سالن
                          </button>
                          <button
                            onClick={() => handleUpdateProfExamAttendance(prof.id, 'WITH_COORDINATION')}
                            className={`px-2 py-1 rounded text-[11px] font-black transition ${
                              prof.attendanceStatus === 'WITH_COORDINATION'
                                ? 'bg-amber-500 text-slate-950 shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            هماهنگ‌شده (دستیار)
                          </button>
                          <button
                            onClick={() => handleUpdateProfExamAttendance(prof.id, 'ABSENT')}
                            className={`px-2 py-1 rounded text-[11px] font-black transition ${
                              prof.attendanceStatus === 'ABSENT'
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            ✕ غایب بدون هماهنگی
                          </button>
                        </div>
                      </td>
                      <td className="p-2.5 text-center">
                        {prof.penaltyApplied ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white">
                            ⚠️ اعمال کسر حق‌التدریس
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900">
                            بدون جریمه
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-[11px] text-slate-700">{prof.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 2: PROCTOR ATTENDANCE & HOURLY REMUNERATION */}
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                  <span>👥 ۲. ثبت کارکرد مراقبین و محاسبه خودکار حق‌الزحمه این شیفت</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  محاسبه آنلاین حق‌الزحمه بر اساس: ساعت حضور × نرخ ساعتی مصوب نقش در جدول تعرفه‌ها
                </p>
              </div>

              {/* Rate Badges */}
              <div className="flex flex-wrap items-center gap-2 text-[10px]">
                {remunerationRates.map(rate => (
                  <span key={rate.id} className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-bold">
                    {rate.roleTitle}: {rate.ratePerHour.toLocaleString('fa-IR')} ت/ساعت
                  </span>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="p-2.5">کد پرسنلی</th>
                    <th className="p-2.5">نام و نام خانوادگی</th>
                    <th className="p-2.5">نقش در آزمون</th>
                    <th className="p-2.5 text-center">وضعیت حضور</th>
                    <th className="p-2.5 text-center">مدت زمان شیفت (ساعت)</th>
                    <th className="p-2.5 text-center">نرخ مصوب (تومان)</th>
                    <th className="p-2.5 text-center">حق‌الزحمه استحقاقی (تومان)</th>
                    <th className="p-2.5 text-left">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {minutesSessionProctors.map(proctor => (
                    <tr key={proctor.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-2.5 font-mono font-bold text-slate-700" dir="ltr">
                        {proctor.staffCode}
                      </td>
                      <td className="p-2.5 font-black text-slate-900">{proctor.name}</td>
                      <td className="p-2.5 font-bold text-indigo-900">{proctor.roleTitle}</td>
                      <td className="p-2.5 text-center">
                        <select
                          value={proctor.attendanceStatus}
                          onChange={e =>
                            handleUpdateProctorAttendance(
                              proctor.id,
                              e.target.value as any,
                              proctor.hoursWorked
                            )
                          }
                          className="bg-white border border-slate-300 rounded-lg px-2 py-0.5 text-xs font-bold text-slate-800"
                        >
                          <option value="PRESENT">✓ حاضر</option>
                          <option value="LATE">⚠️ با تاخیر</option>
                          <option value="ABSENT">✕ غایب</option>
                        </select>
                      </td>
                      <td className="p-2.5 text-center font-mono font-bold">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="8"
                          value={proctor.hoursWorked}
                          onChange={e =>
                            handleUpdateProctorAttendance(
                              proctor.id,
                              proctor.attendanceStatus,
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="w-16 text-center border border-slate-300 rounded px-1 py-0.5 font-mono font-bold text-slate-800"
                        />
                      </td>
                      <td className="p-2.5 text-center font-mono text-slate-700">
                        {proctor.ratePerHour.toLocaleString('fa-IR')}
                      </td>
                      <td className="p-2.5 text-center font-mono font-black text-emerald-800 text-sm bg-emerald-50/50">
                        {proctor.calculatedPayment.toLocaleString('fa-IR')}
                      </td>
                      <td className="p-2.5 text-left">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-indigo-50 text-indigo-900">
                          ثبت در صورتجلسه
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 3: TERM-WIDE PROCTOR PAYROLL SETTLEMENT CARTABLE */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                  <span>💼 ۳. کارتابل تجمیعی تسویه مالی مراقبین امتحانات (پایان ترم)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  تجمیع کلیه شیفت‌های ترم، جمع ساعات، صدور دیسکت بانکی و تسویه آنلاین با حسابداری
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportProctorBankDiskette}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-extrabold text-xs shadow flex items-center gap-1.5 transition"
                >
                  <span>💾 خروجی دیسکت بانکی (شبا/پایا)</span>
                </button>
                <button
                  onClick={handleBatchPayProctors}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow flex items-center gap-1.5 transition"
                >
                  <span>✅ تسویه و ثبت پرداخت جمعی</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="p-2.5">کد پرسنلی</th>
                    <th className="p-2.5">نام و نام خانوادگی</th>
                    <th className="p-2.5">سمت در امتحانات</th>
                    <th className="p-2.5 text-center">تعداد شیفت</th>
                    <th className="p-2.5 text-center">مجموع ساعات</th>
                    <th className="p-2.5 text-center">جمع ناخالص پرداختی (تومان)</th>
                    <th className="p-2.5">شماره شبا بانکی</th>
                    <th className="p-2.5 text-center">وضعیت تسویه</th>
                  </tr>
                </thead>
                <tbody>
                  {proctorTermPayrollList.map(item => (
                    <tr key={item.staffId} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-2.5 font-mono font-bold text-slate-700" dir="ltr">
                        {item.staffCode}
                      </td>
                      <td className="p-2.5 font-black text-slate-900">{item.name}</td>
                      <td className="p-2.5 font-bold text-indigo-900">{item.roleTitle}</td>
                      <td className="p-2.5 text-center font-bold text-slate-800">
                        {item.shiftsCount} شیفت
                      </td>
                      <td className="p-2.5 text-center font-mono font-bold text-slate-800">
                        {item.totalHours} ساعت
                      </td>
                      <td className="p-2.5 text-center font-mono font-black text-emerald-800 text-sm bg-emerald-50/40">
                        {item.grossAmount.toLocaleString('fa-IR')}
                      </td>
                      <td className="p-2.5 font-mono text-[11px] text-slate-600" dir="ltr">
                        {item.iban}
                      </td>
                      <td className="p-2.5 text-center">
                        {item.paymentStatus === 'PAID' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white">
                            ✓ واریز شد
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-950">
                            در انتظار واریز
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: CALENDAR SLOTS */}
      {/* ========================================================================= */}
      {activeTab === 'CALENDAR_SLOTS' && (
        <div className="card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-black text-slate-900 text-base">
                پیکربندی بازه زمانی امتحانات و تعریف سانس‌های استاندارد روزانه
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                تعریف بازه شروع و پایان امتحانات ترم، افزودن نامحدود سانس‌های امتحانی با ساعت دقیق شروع و پایان
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsNewSlotModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-700 to-indigo-800 hover:from-indigo-800 text-white font-extrabold text-xs shadow flex items-center gap-1.5 transition"
              >
                <span>➕ افزودن سانس آزمون جدید</span>
              </button>
              <button
                onClick={() => showToast('تنظیمات بازه تقویم و سانس‌های امتحانی با موفقیت ذخیره گردید.')}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow transition"
              >
                💾 ذخیره تنظیمات
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {slots.map(slot => (
              <div key={slot.id} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-slate-900 text-xs">{slot.label}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 font-black">
                    #{slot.id}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs font-mono font-bold text-slate-800">
                  <span>{slot.startTime}</span>
                  <span className="text-slate-400 font-sans">تا</span>
                  <span>{slot.endTime}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: EXAM HALLS */}
      {/* ========================================================================= */}
      {activeTab === 'EXAM_HALLS' && (
        <div className="card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-black text-slate-900 text-base">
                مدیریت سالن‌های آزمون، تنظیم ظرفیت و محاسبه بازه شماره صندلی‌ها
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                تعیین ظرفیت آزمونی، تنظیم شماره صندلی شروع و محاسبه خودکار شماره صندلی پایان بر اساس ظرفیت هر حوزه
              </p>
            </div>
            <button
              onClick={() => setIsNewHallModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-extrabold text-xs shadow flex items-center gap-1.5 transition"
            >
              <span>➕ افزودن حوزه / سالن جدید</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {halls.map(hall => (
              <div key={hall.id} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3.5">
                <h3 className="font-black text-slate-900 text-sm">🏛️ {hall.name}</h3>
                <div className="p-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-300 text-xs">
                  <span className="text-emerald-950 font-black block mb-0.5">
                    بازه شماره صندلی‌های سالن: از {hall.startSeatNumber} تا {hall.endSeatNumber}
                  </span>
                  <span className="text-[11px] text-emerald-800">
                    ظرفیت آزمونی با فاصله: <strong>{hall.examCapacity} صندلی</strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: PROCTORS */}
      {/* ========================================================================= */}
      {activeTab === 'PROCTORS' && (
        <div className="card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-black text-slate-900 text-base">
                تخصیص مراقبین، سرپرستان جلسات و کادر اجرایی امتحانات
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                توزیع متوازن نوبت‌های مراقبت بین اعضای هیات علمی و کارکنان آموزشی (۱ مراقب به ازای هر ۲۰ صندلی)
              </p>
            </div>
            <Link
              href="/proctor"
              className="px-4 py-2 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-extrabold text-xs shadow flex items-center gap-1.5 transition"
            >
              <span>📷 پرتال حضور و غیاب مراقبین (QR-Code) ←</span>
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="p-2.5">کد پرسنلی</th>
                  <th className="p-2.5">نام و نام خانوادگی</th>
                  <th className="p-2.5">سمت / رده</th>
                  <th className="p-2.5 text-center">نوبت‌های تخصیص‌یافته</th>
                  <th className="p-2.5">سالن‌های تخصیص‌یافته</th>
                </tr>
              </thead>
              <tbody>
                {proctors.map(p => (
                  <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-2.5 font-mono font-bold text-slate-700" dir="ltr">{p.staffCode}</td>
                    <td className="p-2.5 font-black text-slate-900">{p.name}</td>
                    <td className="p-2.5 font-bold text-indigo-900">{p.staffType === 'PROFESSOR' ? 'عضو هیات علمی' : 'کادر اجرایی'}</td>
                    <td className="p-2.5 text-center font-bold">{p.assignedSlotsCount} نوبت</td>
                    <td className="p-2.5">{p.assignedHalls.join('، ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: STUDENT CARDS */}
      {/* ========================================================================= */}
      {activeTab === 'STUDENT_CARDS' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-black text-slate-900 text-base">
                صدور کارت‌های ورود به جلسه آزمون و شماره صندلی داوطلبان
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                تخصیص شماره صندلی یکتا و صدور کارت ورود به جلسه هوشمند با بارکد امنیتی
              </p>
            </div>
            <button
              onClick={() => showToast('کارت‌های ورود به جلسه برای کلیه دانشجویان با تسویه مالی صادر و در پرتال دانشجو فعال گردید.')}
              className="px-4 py-2 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-extrabold text-xs shadow transition"
            >
              📇 صدور گروهی کارت‌های ورود به جلسه
            </button>
          </div>

          <div className="max-w-xl mx-auto p-5 bg-gradient-to-br from-white to-slate-50 rounded-2xl border-2 border-indigo-900 shadow-md space-y-3 text-xs">
            <h3 className="font-black text-slate-900 text-sm border-b pb-2">پیش‌نمایش کارت ورود به جلسه داوطلب (با شماره صندلی و سالن)</h3>
            <p className="text-slate-600">دانشجویان پس از گذراندن گیت مالی و ارزشیابی در پرتال خود، به این کارت دسترسی خواهند داشت.</p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 8: QUALITY ANALYTICS */}
      {/* ========================================================================= */}
      {activeTab === 'QUALITY_ANALYTICS' && (
        <div className="card space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-black text-slate-900 text-base">
                📊 داشبورد تضمین کیفیت آموزشی و تحلیل امکانات فیزیکی کلاس‌ها
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                شناسایی خودکار گلوگاه‌های کیفی اساتید (زیر ۳.۵ از ۵) و ارسال تیکت‌های تعمیراتی امکانات کلاس‌ها به پشتیبانی IT و تدارکات
              </p>
            </div>
          </div>

          {/* Bottlenecks Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="p-2.5">نام استاد</th>
                  <th className="p-2.5">کد</th>
                  <th className="p-2.5">دروس</th>
                  <th className="p-2.5 text-center">میانگین کل (از ۵)</th>
                  <th className="p-2.5 text-center">وضعیت کیفی</th>
                  <th className="p-2.5">بازخورد و تصمیم</th>
                </tr>
              </thead>
              <tbody>
                {evalBottlenecks.map(b => (
                  <tr key={b.id} className={`border-b ${b.isFlagged ? 'bg-rose-50 text-rose-950 font-bold' : 'hover:bg-slate-50'}`}>
                    <td className="p-2.5 font-black">{b.profName}</td>
                    <td className="p-2.5 font-mono" dir="ltr">{b.staffCode}</td>
                    <td className="p-2.5">{b.courses.join('، ')}</td>
                    <td className="p-2.5 text-center font-bold text-sm">{b.avgScore}</td>
                    <td className="p-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${b.isFlagged ? 'bg-rose-600 text-white' : 'bg-emerald-100 text-emerald-900'}`}>
                        {b.isFlagged ? '🚩 گلوگاه کیفی' : '✓ مطلوب'}
                      </span>
                    </td>
                    <td className="p-2.5 text-[11px]">{b.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: PHOTO ROSTER PRINT PREVIEW FOR PROCTORS */}
      {showPhotoRosterPrint && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 print:static print:block print:bg-white print:p-0">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in">
            <div className="p-4 bg-indigo-950 text-white flex items-center justify-between print:hidden">
              <h3 className="font-extrabold text-sm sm:text-base">🖨️ صورت‌جلسه حضور و غیاب عکس‌دار سالن آزمون (محل امضا)</h3>
              <button onClick={() => setShowPhotoRosterPrint(false)} className="text-white/60 hover:text-white">✕</button>
            </div>

            <div className="print-area p-5 overflow-y-auto space-y-3 text-xs print:max-h-none print:overflow-visible">
              <div className="text-center space-y-1 border-b pb-3">
                <h2 className="font-black text-slate-900 text-base">دانشگاه جامع آفاق — لیست حضور و غیاب عکس‌دار حوزه آزمون</h2>
                <p className="text-slate-600 font-bold">حوزه: آمفی‌تئاتر مرکزی · تاریخ: ۱۴۰۵/۱۰/۱۸ · سانس ۱ (۰۸:۳۰ الی ۱۰:۳۰)</p>
              </div>

              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b">
                    <th className="p-2 text-center">شماره صندلی</th>
                    <th className="p-2">عکس</th>
                    <th className="p-2">نام و نام خانوادگی</th>
                    <th className="p-2">شماره دانشجویی</th>
                    <th className="p-2">عنوان درس</th>
                    <th className="p-2 text-center">شماره پاسخنامه</th>
                    <th className="p-2 text-center">امضای داوطلب</th>
                  </tr>
                </thead>
                <tbody>
                  {allocatedSeatsList.slice(0, 10).map(st => (
                    <tr key={st.seatNo} className="border-b">
                      <td className="p-2 text-center font-mono font-black">{st.seatNo}</td>
                      <td className="p-2">
                        <div className="w-7 h-7 rounded bg-slate-200 flex items-center justify-center font-bold text-[10px]">
                          {st.studentName[0]}
                        </div>
                      </td>
                      <td className="p-2 font-bold">{st.studentName}</td>
                      <td className="p-2 font-mono" dir="ltr">{st.studentCode}</td>
                      <td className="p-2">{st.courseTitle}</td>
                      <td className="p-2 text-center font-mono font-bold">A-{st.seatNo + 100}</td>
                      <td className="p-2 text-center text-slate-400 font-serif">.......................</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-slate-50 border-t flex justify-end gap-2 print:hidden">
              <button
                onClick={() => setShowPhotoRosterPrint(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs"
              >
                بستن
              </button>
              <button
                onClick={() => {
                  window.print();
                  setShowPhotoRosterPrint(false);
                }}
                className="px-6 py-1.5 rounded-lg bg-indigo-900 text-white font-black text-xs shadow"
              >
                🖨️ پرینت لیست عکس‌دار
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MANUAL NUDGE SMS TO PROFESSOR */}
      {nudgeModalCourse && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 print:static print:block print:bg-white print:p-0">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in">
            <div className="p-4 bg-gradient-to-r from-rose-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">📲</span>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base">
                    ارسال اخطار سریع ددلاین به استاد
                  </h3>
                  <p className="text-[11px] text-rose-200">
                    {nudgeModalCourse.professorName} · درس {nudgeModalCourse.courseTitle}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setNudgeModalCourse(null)}
                className="text-white/60 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">شماره همراه استاد:</span>
                  <span className="font-mono font-bold text-slate-800" dir="ltr">
                    {nudgeModalCourse.professorPhone}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">مهلت قانونی (ددلاین):</span>
                  <span className="font-mono font-bold text-rose-700">
                    {nudgeModalCourse.gradeDeadline}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">زمان باقیمانده:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {nudgeModalCourse.hoursRemaining > 0
                      ? `${nudgeModalCourse.hoursRemaining} ساعت مانده`
                      : `منقضی شده (${Math.abs(nudgeModalCourse.hoursRemaining)} ساعت تاخیر)`}
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-black text-slate-800 text-xs mb-1.5">
                  متن پیامک ارسالی (کاملاً قابل ویرایش):
                </label>
                <textarea
                  rows={4}
                  value={nudgeMessageText}
                  onChange={e => setNudgeMessageText(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-3 font-bold text-xs bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>طول پیام: {nudgeMessageText.length} کاراکتر</span>
                  <span>متصل به درگاه پیامک دانشگاه</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
              <button
                onClick={() => setNudgeModalCourse(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs"
              >
                انصراف
              </button>
              <button
                onClick={handleSendSingleNudge}
                className="px-6 py-2 rounded-xl bg-gradient-to-r from-rose-700 to-rose-800 hover:from-rose-800 text-white font-black text-xs shadow flex items-center gap-1.5"
              >
                <span>📲 تایید و ارسال پیامک</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PRINT PREVIEW */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 print:static print:block print:bg-white print:p-0">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden animate-in fade-in">
            <div className="p-4 bg-indigo-950 text-white flex items-center justify-between print:hidden">
              <h3 className="font-extrabold text-sm sm:text-base">🖨️ پیش‌نمایش چاپ برنامه امتحانات دانشگاه</h3>
              <button onClick={() => setShowPrintModal(false)} className="text-white/60 hover:text-white">✕</button>
            </div>

            <div className="print-area p-4 max-h-[70vh] overflow-y-auto space-y-3 text-xs print:max-h-none print:overflow-visible">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 border-b">
                    <th className="p-2">کد درس</th>
                    <th className="p-2">عنوان درس</th>
                    <th className="p-2">استاد</th>
                    <th className="p-2 text-center">تاریخ</th>
                    <th className="p-2 text-center">ساعت</th>
                    <th className="p-2">سالن</th>
                  </tr>
                </thead>
                <tbody>
                  {courses.map(c => (
                    <tr key={c.id} className="border-b">
                      <td className="p-2 font-mono font-bold" dir="ltr">{c.courseCode}</td>
                      <td className="p-2 font-bold">{c.courseTitle}</td>
                      <td className="p-2">{c.professorName}</td>
                      <td className="p-2 text-center font-mono font-bold">{c.examDate}</td>
                      <td className="p-2 text-center font-mono">سانس {c.slotId}</td>
                      <td className="p-2">آمفی‌تئاتر مرکزی</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-slate-50 border-t flex justify-end gap-2 print:hidden">
              <button
                onClick={() => setShowPrintModal(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs"
              >
                بستن
              </button>
              <button
                onClick={() => {
                  window.print();
                  setShowPrintModal(false);
                }}
                className="px-6 py-1.5 rounded-lg bg-indigo-900 text-white font-black text-xs shadow"
              >
                🖨️ پرینت نهایی
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
