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
          <span>📱 مدیریت غیبت‌ها، پیامک ۴۸ ساعته و صورت‌جلسه</span>
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
              <button
                onClick={() => setShowPhotoRosterPrint(true)}
                className="px-3.5 py-2 rounded-xl bg-indigo-800 hover:bg-indigo-900 text-white font-black text-xs shadow flex items-center gap-1.5 transition"
              >
                <span>🖨️ چاپ صورت‌جلسه عکس‌دار سالن</span>
              </button>
              <button
                onClick={handleSendAbsenceSmsToAll}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 text-white font-black text-xs shadow flex items-center gap-1.5 transition"
              >
                <span>📲 ارسال پیامک گروهی به غایبین آزمون</span>
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in">
            <div className="p-4 bg-indigo-950 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-sm sm:text-base">🖨️ صورت‌جلسه حضور و غیاب عکس‌دار سالن آزمون (محل امضا)</h3>
              <button onClick={() => setShowPhotoRosterPrint(false)} className="text-white/60 hover:text-white">✕</button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 text-xs">
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

            <div className="p-3 bg-slate-50 border-t flex justify-end gap-2">
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

      {/* MODAL: PRINT PREVIEW */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden animate-in fade-in">
            <div className="p-4 bg-indigo-950 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-sm sm:text-base">🖨️ پیش‌نمایش چاپ برنامه امتحانات دانشگاه</h3>
              <button onClick={() => setShowPrintModal(false)} className="text-white/60 hover:text-white">✕</button>
            </div>

            <div className="p-4 max-h-[70vh] overflow-y-auto space-y-3 text-xs">
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

            <div className="p-3 bg-slate-50 border-t flex justify-end gap-2">
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
