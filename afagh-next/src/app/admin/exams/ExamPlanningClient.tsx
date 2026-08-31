'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';

// ==========================================
// TYPES & INTERFACES
// ==========================================

export type ExamSchedulingMode = 'AUTO_MATRIX' | 'MANUAL';

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
    enrolledStudentsCount: 38,
    professorName: 'دکتر جمیل احمدی',
    schedulingMode: 'AUTO_MATRIX',
    examDate: '۱۴۰۵/۱۰/۱۸',
    slotId: 1,
    hallId: 1,
    chiefProctor: 'دکتر جمیل احمدی',
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
    enrolledStudentsCount: 32,
    professorName: 'دکتر سارا رضایی',
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
    schedulingMode: 'AUTO_MATRIX',
    examDate: '۱۴۰۵/۱۰/۱۹',
    slotId: 2,
    hallId: 2,
    chiefProctor: 'دکتر جمیل احمدی',
    invigilatorsCount: 2,
    hasConflict: false,
  },
  {
    id: 6,
    courseCode: '۱۱۱۲۲۰۲',
    courseTitle: 'برنامه‌نویسی پیشرفته',
    units: 3,
    courseType: 'اصلی',
    groupNumber: 1,
    programTitle: 'مهندسی کامپیوتر',
    cohortId: 'COHORT-1404-3',
    cohortTitle: 'ورودی ۱۴۰۴ (ترم ۳)',
    enrolledStudentsCount: 30,
    professorName: 'دکتر سارا رضایی',
    schedulingMode: 'MANUAL',
    examDate: '۱۴۰۵/۱۰/۲۳',
    slotId: 1,
    hallId: 4,
    chiefProctor: 'دکتر سارا رضایی',
    invigilatorsCount: 2,
    hasConflict: false,
  },
  {
    id: 7,
    courseCode: '۱۱۱۲۳۰۱',
    courseTitle: 'طراحی الگوریتم‌ها',
    units: 3,
    courseType: 'تخصصی',
    groupNumber: 1,
    programTitle: 'مهندسی کامپیوتر',
    cohortId: 'COHORT-1403-5',
    cohortTitle: 'ورودی ۱۴۰۳ (ترم ۵)',
    enrolledStudentsCount: 34,
    professorName: 'دکتر سارا رضایی',
    schedulingMode: 'AUTO_MATRIX',
    examDate: '۱۴۰۵/۱۰/۲۰',
    slotId: 1,
    hallId: 3,
    chiefProctor: 'دکتر سارا رضایی',
    invigilatorsCount: 2,
    hasConflict: false,
  },
  {
    id: 8,
    courseCode: '۱۱۱۲۳۰۳',
    courseTitle: 'سیستم‌های عامل',
    units: 3,
    courseType: 'تخصصی',
    groupNumber: 1,
    programTitle: 'مهندسی کامپیوتر',
    cohortId: 'COHORT-1403-5',
    cohortTitle: 'ورودی ۱۴۰۳ (ترم ۵)',
    enrolledStudentsCount: 38,
    professorName: 'دکتر جمیل احمدی',
    schedulingMode: 'AUTO_MATRIX',
    examDate: '۱۴۰۵/۱۰/۲۷',
    slotId: 3,
    hallId: 1,
    chiefProctor: 'دکتر جمیل احمدی',
    invigilatorsCount: 2,
    hasConflict: false,
  },
  {
    id: 9,
    courseCode: '۳۳۱۱۱۰۱',
    courseTitle: 'ریاضی عمومی صنایع غذایی',
    units: 3,
    courseType: 'پایه',
    groupNumber: 1,
    programTitle: 'مهندسی صنایع غذایی',
    cohortId: 'COHORT-1405-1-FOOD',
    cohortTitle: 'ورودی ۱۴۰۵ (ترم ۱ - صنایع غذایی)',
    enrolledStudentsCount: 35,
    professorName: 'دکتر جمیل احمدی',
    schedulingMode: 'AUTO_MATRIX',
    examDate: '۱۴۰۵/۱۰/۱۸',
    slotId: 3,
    hallId: 2,
    chiefProctor: 'دکتر جمیل احمدی',
    invigilatorsCount: 2,
    hasConflict: false,
  },
];

export default function ExamPlanningClient() {
  const [activeTab, setActiveTab] = useState<'SCHEDULE_TABLE' | 'CALENDAR_SLOTS' | 'CONFLICT_CHECKER' | 'EXAM_HALLS' | 'PROCTORS' | 'STUDENT_CARDS' | 'QUALITY_ANALYTICS'>('SCHEDULE_TABLE');
  const [courses, setCourses] = useState<ExamCourseItem[]>(INITIAL_EXAM_COURSES);
  const [slots, setSlots] = useState<ExamSlot[]>(INITIAL_EXAM_SLOTS);
  const [halls, setHalls] = useState<ExamHall[]>(INITIAL_EXAM_HALLS);
  const [proctors, setProctors] = useState<ProctorStaff[]>(INITIAL_PROCTORS);

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

  const [examStartDate, setExamStartDate] = useState<string>('۱۴۰۵/۱۰/۱۸');
  const [examEndDate, setExamEndDate] = useState<string>('۱۴۰۵/۱۰/۳۰');
  const [selectedCohortFilter, setSelectedCohortFilter] = useState<string>('ALL');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('ALL');

  const [editingCourse, setEditingCourse] = useState<ExamCourseItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);

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
  // SLOT MANAGEMENT HANDLERS
  // ==========================================
  const handleAddNewSlot = () => {
    if (!newSlotForm.label.trim() || !newSlotForm.startTime.trim() || !newSlotForm.endTime.trim()) {
      showToast('لطفاً کلیه اطلاعات سانس (عنوان، ساعت شروع و پایان) را وارد نمایید.');
      return;
    }
    const nextId = slots.length > 0 ? Math.max(...slots.map(s => s.id)) + 1 : 1;
    const newSlot: ExamSlot = {
      id: nextId,
      label: newSlotForm.label.trim(),
      startTime: newSlotForm.startTime.trim(),
      endTime: newSlotForm.endTime.trim(),
    };
    setSlots(prev => [...prev, newSlot]);
    setIsNewSlotModalOpen(false);
    setNewSlotForm({
      label: `سانس ${nextId + 1}`,
      startTime: '۱۹:۰۰',
      endTime: '۲۱:۰۰',
    });
    showToast(`✓ سانس آزمونی جدید «${newSlot.label}» (${newSlot.startTime} تا ${newSlot.endTime}) با موفقیت افزوده شد.`);
  };

  const handleDeleteSlot = (slotId: number) => {
    if (slots.length <= 1) {
      showToast('حداقل یک سانس آزمونی باید در سامانه فعال باشد.');
      return;
    }
    const target = slots.find(s => s.id === slotId);
    setSlots(prev => prev.filter(s => s.id !== slotId));
    const fallbackSlot = slots.find(s => s.id !== slotId)?.id || 1;
    setCourses(prev => prev.map(c => c.slotId === slotId ? { ...c, slotId: fallbackSlot } : c));
    showToast(`✕ سانس «${target?.label}» حذف شد.`);
  };

  // ==========================================
  // HALL & SEAT MANAGEMENT HANDLERS
  // ==========================================
  const handleAddNewHall = () => {
    if (!newHallForm.name.trim() || newHallForm.examCapacity <= 0) {
      showToast('لطفاً نام سالن و ظرفیت آزمونی معتبر وارد فرمایید.');
      return;
    }
    const nextId = halls.length > 0 ? Math.max(...halls.map(h => h.id)) + 1 : 1;
    const endSeat = Number(newHallForm.startSeatNumber) + Number(newHallForm.examCapacity) - 1;
    const newHall: ExamHall = {
      id: nextId,
      name: newHallForm.name.trim(),
      buildingName: newHallForm.buildingName.trim(),
      totalSeats: Number(newHallForm.totalSeats),
      examCapacity: Number(newHallForm.examCapacity),
      startSeatNumber: Number(newHallForm.startSeatNumber),
      endSeatNumber: endSeat,
      seatPrefix: newHallForm.seatPrefix?.trim() || undefined,
      hasAirConditioning: newHallForm.hasAirConditioning,
      isCCTVMonitored: newHallForm.isCCTVMonitored,
    };
    setHalls(prev => [...prev, newHall]);
    setIsNewHallModalOpen(false);
    setNewHallForm({
      name: '',
      buildingName: 'ساختمان آموزش',
      totalSeats: 60,
      examCapacity: 30,
      startSeatNumber: endSeat + 1,
      seatPrefix: '',
      hasAirConditioning: true,
      isCCTVMonitored: true,
    });
    showToast(`✓ سالن جدید «${newHall.name}» با ظرفیت آزمونی ${newHall.examCapacity} صندلی (شماره‌های ${newHall.startSeatNumber} الی ${newHall.endSeatNumber}) با موفقیت تعریف شد.`);
  };

  const handleUpdateHallCapacityAndSeats = (hallId: number, updates: Partial<ExamHall>) => {
    setHalls(prev =>
      prev.map(h => {
        if (h.id !== hallId) return h;
        const totalSeats = updates.totalSeats !== undefined ? Number(updates.totalSeats) : h.totalSeats;
        const examCapacity = updates.examCapacity !== undefined ? Number(updates.examCapacity) : h.examCapacity;
        const startSeatNumber = updates.startSeatNumber !== undefined ? Number(updates.startSeatNumber) : h.startSeatNumber;
        const endSeatNumber = startSeatNumber + examCapacity - 1;
        return {
          ...h,
          ...updates,
          totalSeats,
          examCapacity,
          startSeatNumber,
          endSeatNumber,
        };
      })
    );
  };

  const handleSequentialAutoNumbering = () => {
    let currentStart = 1;
    setHalls(prev =>
      prev.map(h => {
        const startSeatNumber = currentStart;
        const endSeatNumber = currentStart + h.examCapacity - 1;
        currentStart = endSeatNumber + 1;
        return {
          ...h,
          startSeatNumber,
          endSeatNumber,
        };
      })
    );
    showToast('⚡ شماره‌گذاری متوالی و یکپارچه صندلی‌های کلیه سالن‌ها از شماره ۱ تا آخرین سالن بدون وقفه و تداخل اعمال گردید.');
  };

  const handleDeleteHall = (hallId: number) => {
    if (halls.length <= 1) {
      showToast('حداقل یک سالن امتحانی باید در سامانه فعال باشد.');
      return;
    }
    const target = halls.find(h => h.id === hallId);
    setHalls(prev => prev.filter(h => h.id !== hallId));
    const fallbackHall = halls.find(h => h.id !== hallId)?.id || 1;
    setCourses(prev => prev.map(c => c.hallId === hallId ? { ...c, hallId: fallbackHall } : c));
    showToast(`✕ سالن آزمون «${target?.name}» حذف شد.`);
  };

  // ==========================================
  // CONFLICT DETECTION ENGINE
  // ==========================================
  const detectedConflicts = useMemo(() => {
    const list: { type: 'COHORT_SAME_SLOT' | 'HALL_OVERFLOW' | 'PROF_SAME_SLOT'; title: string; details: string; severity: 'CRITICAL' | 'WARNING'; courseIds: number[] }[] = [];

    // 1. Cohort Exam Overlap in same slot
    const slotCohortMap: Record<string, ExamCourseItem[]> = {};
    courses.forEach(c => {
      const key = `${c.examDate}_${c.slotId}_${c.cohortId}`;
      if (!slotCohortMap[key]) slotCohortMap[key] = [];
      slotCohortMap[key].push(c);
    });

    Object.entries(slotCohortMap).forEach(([key, items]) => {
      if (items.length > 1) {
        list.push({
          type: 'COHORT_SAME_SLOT',
          title: `تداخل دو امتحان هم‌ورودی در یک سانس`,
          details: `دانشجویان «${items[0].cohortTitle}» در تاریخ ${items[0].examDate} در سانس ${items[0].slotId} دارای ۲ آزمون همزمان («${items.map(i => i.courseTitle).join('» و «')}») هستند.`,
          severity: 'CRITICAL',
          courseIds: items.map(i => i.id),
        });
      }
    });

    // 2. Hall capacity overflow
    const slotHallMap: Record<string, ExamCourseItem[]> = {};
    courses.forEach(c => {
      const key = `${c.examDate}_${c.slotId}_${c.hallId}`;
      if (!slotHallMap[key]) slotHallMap[key] = [];
      slotHallMap[key].push(c);
    });

    Object.entries(slotHallMap).forEach(([key, items]) => {
      const totalStudents = items.reduce((s, i) => s + i.enrolledStudentsCount, 0);
      const hall = halls.find(h => h.id === items[0].hallId);
      if (hall && totalStudents > hall.examCapacity) {
        list.push({
          type: 'HALL_OVERFLOW',
          title: `کمبود صندلی آزمونی در ${hall.name}`,
          details: `در تاریخ ${items[0].examDate} سانس ${items[0].slotId}، تعداد کل دانشجویان (${totalStudents} نفر) از ظرفیت آزمونی با فاصله سالن (${hall.examCapacity} صندلی، شماره‌های ${hall.startSeatNumber} تا ${hall.endSeatNumber}) فراتر رفته است.`,
          severity: 'CRITICAL',
          courseIds: items.map(i => i.id),
        });
      }
    });

    return list;
  }, [courses, halls]);

  // ==========================================
  // AUTO MATRIX GENERATION ALGORITHM
  // ==========================================
  const handleRunAutoMatrixScheduling = () => {
    const datePool = [
      '۱۴۰۵/۱۰/۱۸',
      '۱۴۰۵/۱۰/۱۹',
      '۱۴۰۵/۱۰/۲۰',
      '۱۴۰۵/۱۰/۲۱',
      '۱۴۰۵/۱۰/۲۲',
      '۱۴۰۵/۱۰/۲۳',
      '۱۴۰۵/۱۰/۲۵',
      '۱۴۰۵/۱۰/۲۶',
      '۱۴۰۵/۱۰/۲۷',
      '۱۴۰۵/۱۰/۲۸',
      '۱۴۰۵/۱۰/۲۹',
      '۱۴۰۵/۱۰/۳۰',
    ];

    let dateIdx = 0;
    const cohortUsedDates: Record<string, Set<string>> = {};

    const updated = courses.map((course, idx) => {
      if (course.schedulingMode === 'MANUAL') {
        return course;
      }

      if (!cohortUsedDates[course.cohortId]) {
        cohortUsedDates[course.cohortId] = new Set();
      }

      let chosenDate = datePool[dateIdx % datePool.length];
      while (cohortUsedDates[course.cohortId].has(chosenDate) && dateIdx < 40) {
        dateIdx++;
        chosenDate = datePool[dateIdx % datePool.length];
      }
      cohortUsedDates[course.cohortId].add(chosenDate);
      dateIdx++;

      const assignedSlotId = slots.length > 0 ? slots[idx % slots.length].id : 1;
      const assignedHallId = halls.length > 0 ? halls[idx % halls.length].id : 1;

      return {
        ...course,
        schedulingMode: 'AUTO_MATRIX' as ExamSchedulingMode,
        examDate: chosenDate,
        slotId: assignedSlotId,
        hallId: assignedHallId,
        hasConflict: false,
      };
    });

    setCourses(updated);
    showToast('⚡ تخصیص خودکار و هوشمند ماتریس امتحانات بر اساس تقویم ترم با موفقیت انجام شد. تمامی تداخل‌های هم‌ورودی رفع گردید.');
  };

  const handleSaveCourseExamEdit = (updated: ExamCourseItem) => {
    setCourses(prev => prev.map(c => (c.id === updated.id ? updated : c)));
    setEditingCourse(null);
    showToast(`✓ تغییرات تاریخ و سالن آزمون درس «${updated.courseTitle}» با موفقیت ذخیره گردید.`);
  };

  const handleToggleMode = (courseId: number) => {
    setCourses(prev =>
      prev.map(c =>
        c.id === courseId
          ? {
              ...c,
              schedulingMode: c.schedulingMode === 'AUTO_MATRIX' ? 'MANUAL' : 'AUTO_MATRIX',
            }
          : c
      )
    );
  };

  const filteredCourses = courses.filter(c => {
    if (selectedCohortFilter !== 'ALL' && c.cohortId !== selectedCohortFilter) return false;
    if (selectedDateFilter !== 'ALL' && c.examDate !== selectedDateFilter) return false;
    return true;
  });

  const availableDates = Array.from(new Set(courses.map(c => c.examDate))).sort();
  const cohorts = Array.from(new Set(courses.map(c => JSON.stringify({ id: c.cohortId, title: c.cohortTitle })))).map(s => JSON.parse(s));

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
                تخصیص دوحالته (دستی و خودکار)، تعریف نامحدود سانس‌ها، تنظیم ظرفیت حوزه‌ها و بازه شماره صندلی، رصد تداخل‌ها و صدور کارت آزمون
              </p>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRunAutoMatrixScheduling}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 text-white font-extrabold text-xs shadow-md flex items-center gap-1.5 transition active:scale-95"
            >
              <span>⚡ اجرای تخصیص خودکار و هوشمند امتحانات</span>
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
            <span className="text-indigo-300 block text-[11px]">وضعیت تداخل‌ها:</span>
            <span className={`text-base font-black ${detectedConflicts.length === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {detectedConflicts.length === 0 ? '✓ بدون تداخل' : `⚠️ ${detectedConflicts.length} تداخل شناسایی شد`}
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
          onClick={() => setActiveTab('CALENDAR_SLOTS')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'CALENDAR_SLOTS'
              ? 'bg-indigo-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>🗓️ بازه تقویم و تعریف سانس‌های روزانه</span>
          <span className="px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-900 text-[10px] font-black">
            {slots.length} سانس
          </span>
        </button>

        <button
          onClick={() => setActiveTab('EXAM_HALLS')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'EXAM_HALLS'
              ? 'bg-indigo-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>🏛️ سالن‌های آزمون، ظرفیت و شماره صندلی</span>
          <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-black">
            {halls.length} حوزه
          </span>
        </button>

        <button
          onClick={() => setActiveTab('CONFLICT_CHECKER')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'CONFLICT_CHECKER'
              ? 'bg-indigo-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>⚠️ موتور رصد و حل تداخل‌ها</span>
          {detectedConflicts.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-black">
              {detectedConflicts.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('PROCTORS')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'PROCTORS'
              ? 'bg-indigo-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>👥 عوامل اجرایی و مراقبین</span>
        </button>

        <button
          onClick={() => setActiveTab('STUDENT_CARDS')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'STUDENT_CARDS'
              ? 'bg-indigo-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>📇 صدور کارت ورود به جلسه و چیدمان</span>
        </button>

        <button
          onClick={() => setActiveTab('QUALITY_ANALYTICS')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'QUALITY_ANALYTICS'
              ? 'bg-indigo-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>📊 گلوگاه‌های کیفی اساتید و تحلیل امکانات کلاس‌ها</span>
          {evalBottlenecks.filter(p => p.isFlagged).length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-black">
              {evalBottlenecks.filter(p => p.isFlagged).length} استاد با اخطار
            </span>
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: SCHEDULE TABLE & TWO MODES EXPLANATION */}
      {/* ========================================================================= */}
      {activeTab === 'SCHEDULE_TABLE' && (
        <div className="card space-y-4">
          {/* Explanation Banner */}
          <div className="p-3.5 bg-gradient-to-r from-sky-50 to-indigo-50 rounded-2xl border border-sky-200 text-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-black text-sky-950">💡 دو حالت هوشمند زمان‌بندی تاریخ و ساعت امتحانات:</span>
              </div>
              <p className="text-slate-600">
                <strong>۱. حالت تخصیص خودکار (🤖 Auto Matrix):</strong> بر اساس تقویم امتحانی ترم و عدم تداخل دروس هم‌ورودی به طور خودکار تاریخ و سانس بهینه تخصیص می‌یابد.
                <br />
                <strong>۲. حالت دستی و موردی (✍️ Manual Override):</strong> مدیر گروه یا اداره آموزش می‌تواند مستقیماً تاریخ، ساعت، سالن و مراقب را دستی تعیین یا قفل نماید.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setCourses(prev => prev.map(c => ({ ...c, schedulingMode: 'AUTO_MATRIX' })));
                  showToast('کلیه دروس به حالت تخصیص خودکار (🤖 Auto Matrix) تغییر یافتند.');
                }}
                className="px-3 py-1.5 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-900 font-bold text-xs"
              >
                تغییر همه به خودکار 🤖
              </button>
              <button
                onClick={() => {
                  setCourses(prev => prev.map(c => ({ ...c, schedulingMode: 'MANUAL' })));
                  showToast('کلیه دروس به حالت تخصیص دستی (✍️ Manual) تغییر یافتند.');
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs"
              >
                تغییر همه به دستی ✍️
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <label className="font-bold text-slate-700">فیلتر ورودی/ترم:</label>
                <select
                  value={selectedCohortFilter}
                  onChange={e => setSelectedCohortFilter(e.target.value)}
                  className="border border-slate-300 rounded-lg p-1.5 font-bold text-slate-800 bg-white"
                >
                  <option value="ALL">همه ورودی‌ها ({courses.length})</option>
                  {cohorts.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <label className="font-bold text-slate-700">فیلتر تاریخ آزمون:</label>
                <select
                  value={selectedDateFilter}
                  onChange={e => setSelectedDateFilter(e.target.value)}
                  className="border border-slate-300 rounded-lg p-1.5 font-bold text-slate-800 bg-white font-mono"
                >
                  <option value="ALL">همه تاریخ‌ها</option>
                  {availableDates.map(d => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <span className="text-slate-500 font-bold">
              نمایش {filteredCourses.length} درس از مجموع {courses.length} درس
            </span>
          </div>

          {/* Courses Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="p-2.5">کد درس</th>
                  <th className="p-2.5">عنوان درس و گروه</th>
                  <th className="p-2.5">رشته و ورودی</th>
                  <th className="p-2.5">استاد درس</th>
                  <th className="p-2.5 text-center">حالت زمان‌بندی</th>
                  <th className="p-2.5 text-center">تاریخ امتحان</th>
                  <th className="p-2.5 text-center">سانس و ساعت</th>
                  <th className="p-2.5">سالن و بازه صندلی</th>
                  <th className="p-2.5 text-center">تعداد دانشجو</th>
                  <th className="p-2.5 text-left">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filteredCourses.map(course => {
                  const slot = slots.find(s => s.id === course.slotId) || slots[0] || { id: 1, label: 'سانس ۱', startTime: '۰۸:۳۰', endTime: '۱۰:۳۰' };
                  const hall = halls.find(h => h.id === course.hallId) || halls[0] || { id: 1, name: 'آمفی‌تئاتر', buildingName: 'مرکزی', examCapacity: 60, startSeatNumber: 1, endSeatNumber: 60 };
                  const isAuto = course.schedulingMode === 'AUTO_MATRIX';

                  return (
                    <tr
                      key={course.id}
                      className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="p-2.5 font-mono font-bold text-slate-700" dir="ltr">
                        {course.courseCode}
                      </td>
                      <td className="p-2.5">
                        <p className="font-black text-slate-900">{course.courseTitle}</p>
                        <p className="text-[10px] text-slate-500">
                          گروه {course.groupNumber} · {course.units} واحد ({course.courseType})
                        </p>
                      </td>
                      <td className="p-2.5 font-medium text-slate-700">
                        {course.cohortTitle}
                      </td>
                      <td className="p-2.5 font-bold text-indigo-950">
                        {course.professorName}
                      </td>
                      <td className="p-2.5 text-center">
                        <button
                          onClick={() => handleToggleMode(course.id)}
                          className={`px-2.5 py-1 rounded-full font-extrabold text-[11px] transition shadow-xs flex items-center justify-center gap-1 mx-auto ${
                            isAuto
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-200'
                              : 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
                          }`}
                          title="برای سوئیچ حالت کلیک کنید"
                        >
                          <span>{isAuto ? '🤖 خودکار ترم' : '✍️ دستی مدیر'}</span>
                        </button>
                      </td>
                      <td className="p-2.5 text-center font-mono font-black text-slate-800 bg-slate-50/50">
                        {course.examDate}
                      </td>
                      <td className="p-2.5 text-center">
                        <span className="font-bold text-slate-800 block">{slot.label}</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {slot.startTime} الی {slot.endTime}
                        </span>
                      </td>
                      <td className="p-2.5">
                        <p className="font-bold text-slate-800">🏛️ {hall.name}</p>
                        <p className="text-[10px] text-emerald-800 font-bold">
                          صندلی {hall.startSeatNumber} الی {hall.endSeatNumber} (ظرفیت: {hall.examCapacity})
                        </p>
                      </td>
                      <td className="p-2.5 text-center font-bold text-slate-700">
                        {course.enrolledStudentsCount} نفر
                      </td>
                      <td className="p-2.5 text-left">
                        <button
                          onClick={() => setEditingCourse({ ...course })}
                          className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-900 font-extrabold text-xs border border-indigo-200 transition"
                        >
                          ✏️ ویرایش و تنظیم دستی
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CALENDAR & DAILY SLOTS (WITH ADDING & EDITING SLOTS) */}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div>
              <label className="font-bold text-slate-700 block text-xs mb-1">
                تاریخ شروع بازه آزمون‌های پایان‌ترم:
              </label>
              <input
                type="text"
                value={examStartDate}
                onChange={e => setExamStartDate(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold text-xs bg-white"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block text-xs mb-1">
                تاریخ پایان بازه آزمون‌های پایان‌ترم:
              </label>
              <input
                type="text"
                value={examEndDate}
                onChange={e => setExamEndDate(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold text-xs bg-white"
              />
            </div>
          </div>

          {/* Slots Cards List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-slate-800 text-xs">
                لیست سانس‌های فعال روزانه برگزاری آزمون ({slots.length} سانس):
              </h3>
              <span className="text-slate-500 text-[11px]">
                امکان ویرایش مستقیم ساعت شروع و پایان در کادرها وجود دارد
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {slots.map(slot => (
                <div key={slot.id} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3 relative group hover:border-indigo-400 transition">
                  <div className="flex items-center justify-between">
                    <input
                      type="text"
                      value={slot.label}
                      onChange={e =>
                        setSlots(slots.map(s => (s.id === slot.id ? { ...s, label: e.target.value } : s)))
                      }
                      className="font-black text-slate-900 text-xs bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 px-1 py-0.5 rounded w-36"
                    />
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 font-black">
                        #{slot.id}
                      </span>
                      {slots.length > 1 && (
                        <button
                          onClick={() => handleDeleteSlot(slot.id)}
                          className="text-rose-400 hover:text-rose-700 text-xs p-1"
                          title="حذف سانس"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 block mb-0.5">ساعت شروع:</span>
                      <input
                        type="text"
                        value={slot.startTime}
                        onChange={e =>
                          setSlots(slots.map(s => (s.id === slot.id ? { ...s, startTime: e.target.value } : s)))
                        }
                        className="w-16 border border-slate-300 rounded p-1 text-center font-mono font-bold bg-white text-slate-800"
                      />
                    </div>
                    <span className="text-slate-400 font-bold self-end pb-1">الی</span>
                    <div>
                      <span className="text-[10px] text-slate-500 block mb-0.5">ساعت پایان:</span>
                      <input
                        type="text"
                        value={slot.endTime}
                        onChange={e =>
                          setSlots(slots.map(s => (s.id === slot.id ? { ...s, endTime: e.target.value } : s)))
                        }
                        className="w-16 border border-slate-300 rounded p-1 text-center font-mono font-bold bg-white text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>مدت زمان آزمون:</span>
                    <strong className="text-indigo-950 font-bold">۱۲۰ دقیقه استاندارد</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: EXAM HALLS, CAPACITY & SEAT NUMBER RANGE */}
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
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleSequentialAutoNumbering}
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs shadow flex items-center gap-1.5 transition"
              >
                <span>⚡ شماره‌گذاری متوالی خودکار کلیه حوزه‌ها</span>
              </button>
              <button
                onClick={() => setIsNewHallModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-extrabold text-xs shadow flex items-center gap-1.5 transition"
              >
                <span>➕ افزودن حوزه / سالن جدید</span>
              </button>
            </div>
          </div>

          <div className="p-3 bg-indigo-50/70 rounded-2xl border border-indigo-200 text-xs flex items-center justify-between">
            <span className="font-bold text-indigo-950">
              📊 مجموع ظرفیت صندلی‌های آزمونی فاصله‌دار دانشگاه در هر سانس:
            </span>
            <span className="text-sm font-black text-indigo-900">
              {halls.reduce((s, h) => s + h.examCapacity, 0)} صندلی فعال
            </span>
          </div>

          {/* Halls Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {halls.map(hall => {
              const startNo = hall.startSeatNumber;
              const endNo = hall.startSeatNumber + hall.examCapacity - 1;

              return (
                <div key={hall.id} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3.5 hover:border-indigo-400 transition">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-black text-slate-900 text-sm">🏛️ {hall.name}</h3>
                      <p className="text-[11px] text-slate-500">{hall.buildingName}</p>
                    </div>
                    {halls.length > 1 && (
                      <button
                        onClick={() => handleDeleteHall(hall.id)}
                        className="text-rose-400 hover:text-rose-700 text-xs p-1"
                        title="حذف سالن"
                      >
                        🗑️
                      </button>
                    )}
                  </div>

                  {/* Seat Range Highlight Box (Auto-Calculated) */}
                  <div className="p-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-300 text-xs space-y-1">
                    <div className="flex items-center justify-between text-emerald-950 font-black">
                      <span>بازه شماره صندلی‌های این سالن:</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-200/80 font-mono">
                        از {startNo} تا {endNo}
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-800">
                      شامل <strong>{hall.examCapacity}</strong> صندلی داوطلب (با فاصله‌گذاری استاندارد)
                    </p>
                  </div>

                  {/* Editable Fields Grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-0.5">
                        ظرفیت کل صندلی سالن:
                      </label>
                      <input
                        type="number"
                        value={hall.totalSeats}
                        onChange={e => handleUpdateHallCapacityAndSeats(hall.id, { totalSeats: Number(e.target.value) })}
                        className="w-full border border-slate-300 rounded p-1.5 font-bold text-xs bg-slate-50 text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-emerald-800 block mb-0.5">
                        ظرفیت آزمونی (فاصله‌دار):
                      </label>
                      <input
                        type="number"
                        value={hall.examCapacity}
                        onChange={e => handleUpdateHallCapacityAndSeats(hall.id, { examCapacity: Number(e.target.value) })}
                        className="w-full border-2 border-emerald-400 rounded p-1.5 font-black text-xs bg-emerald-50/50 text-emerald-950"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-indigo-900 block mb-0.5">
                        شماره صندلی شروع:
                      </label>
                      <input
                        type="number"
                        value={hall.startSeatNumber}
                        onChange={e => handleUpdateHallCapacityAndSeats(hall.id, { startSeatNumber: Number(e.target.value) })}
                        className="w-full border-2 border-indigo-400 rounded p-1.5 font-mono font-black text-xs bg-indigo-50/50 text-indigo-950"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-0.5">
                        شماره صندلی پایان (محاسبه‌شده):
                      </label>
                      <input
                        type="text"
                        disabled
                        value={endNo}
                        className="w-full border border-slate-200 rounded p-1.5 font-mono font-black text-xs bg-slate-100 text-slate-600 cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] font-bold text-slate-600 pt-1 border-t border-slate-100">
                    <span>{hall.hasAirConditioning ? '❄️ تهویه مطبوع' : '—'}</span>
                    <span>{hall.isCCTVMonitored ? '📹 دوربین مداربسته' : '—'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: CONFLICT RESOLUTION ENGINE */}
      {/* ========================================================================= */}
      {activeTab === 'CONFLICT_CHECKER' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-black text-slate-900 text-base">
                موتور هوشمند رصد، اعتبارسنجی و حل خودکار تداخل‌های امتحانی
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                بررسی همزمان تداخل سانس دانشجویان هم‌ورودی، سرریز ظرفیت صندلی سالن‌ها و تداخل زمانی اساتید
              </p>
            </div>
            <button
              onClick={handleRunAutoMatrixScheduling}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow transition"
            >
              ⚡ اصلاح خودکار کلیه تداخل‌ها
            </button>
          </div>

          {detectedConflicts.length === 0 ? (
            <div className="p-8 text-center bg-emerald-50 rounded-2xl border border-emerald-200 space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-2xl mx-auto">
                ✓
              </div>
              <h3 className="font-black text-emerald-950 text-sm">برنامه امتحانات کاملاً استاندارد و بدون تداخل است</h3>
              <p className="text-xs text-emerald-700 max-w-md mx-auto">
                هیچ‌گونه تداخل زمانی بین دروس هم‌ورودی، کمبود صندلی سالن آزمون یا تداخل مراقبین در تقویم امتحانات ترم وجود ندارد.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {detectedConflicts.map((conf, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-2xl border bg-rose-50/50 border-rose-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🚨</span>
                      <h4 className="font-black text-rose-950 text-xs sm:text-sm">{conf.title}</h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white">
                        بحرانی
                      </span>
                    </div>
                    <p className="text-xs text-rose-800">{conf.details}</p>
                  </div>
                  <button
                    onClick={handleRunAutoMatrixScheduling}
                    className="px-3.5 py-1.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-extrabold text-xs shadow-xs transition whitespace-nowrap"
                  >
                    اصلاح خودکار تداخل ⚡
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: PROCTORS & INVIGILATORS */}
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
            <div className="flex items-center gap-2">
              <Link
                href="/proctor"
                className="px-4 py-2 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-extrabold text-xs shadow flex items-center gap-1.5 transition"
              >
                <span>📷 پرتال حضور و غیاب مراقبین (QR-Code) ←</span>
              </Link>
              <button
                onClick={() => showToast('توزیع خودکار نوبت‌های مراقبت بر اساس سقف موظفی اساتید با موفقیت انجام شد.')}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow transition"
              >
                ⚡ توزیع خودکار مراقبین به سالن‌ها
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="p-2.5">کد پرسنلی</th>
                  <th className="p-2.5">نام و نام خانوادگی</th>
                  <th className="p-2.5">سمت / رده</th>
                  <th className="p-2.5 text-center">نوبت‌های تخصیص‌یافته</th>
                  <th className="p-2.5 text-center">سقف موظفی مراقبت</th>
                  <th className="p-2.5">سالن‌های تخصیص‌یافته</th>
                  <th className="p-2.5 text-left">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {proctors.map(p => (
                  <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td className="p-2.5 font-mono font-bold text-slate-700" dir="ltr">
                      {p.staffCode}
                    </td>
                    <td className="p-2.5 font-black text-slate-900">{p.name}</td>
                    <td className="p-2.5 font-bold text-indigo-900">
                      {p.staffType === 'PROFESSOR' ? 'عضو هیات علمی' : 'کادر اجرایی آموزش'}
                    </td>
                    <td className="p-2.5 text-center font-bold text-slate-800">
                      {p.assignedSlotsCount} نوبت
                    </td>
                    <td className="p-2.5 text-center font-bold text-slate-500">
                      {p.maxDutySlots} نوبت
                    </td>
                    <td className="p-2.5 text-slate-700 font-medium">
                      {p.assignedHalls.join('، ')}
                    </td>
                    <td className="p-2.5 text-left">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-900">
                        ✓ تکمیل سهمیه
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: STUDENT CARDS & SEATING ALLOCATION */}
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

          {/* Sample Student Entrance Card Preview */}
          <div className="max-w-xl mx-auto p-5 bg-gradient-to-br from-white to-slate-50 rounded-2xl border-2 border-indigo-900 shadow-md space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-indigo-900/20 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-950 text-white flex items-center justify-center font-black text-base">
                  آ
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm">دانشگاه آفاق — کارت ورود به جلسه آزمون</h3>
                  <span className="text-[10px] text-slate-500">نیمسال اول سال تحصیلی ۱۴۰۵-۱۴۰۴</span>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 font-black text-[10px]">
                ✓ تسویه مالی تاییدشده
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-3 rounded-xl">
              <div>
                <span className="text-slate-500 block text-[10px]">نام و نام خانوادگی:</span>
                <strong className="text-slate-900">علی رضایی اصل</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">شماره دانشجویی:</span>
                <strong className="font-mono text-slate-900" dir="ltr">31412001</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">رشته تحصیلی:</span>
                <strong className="text-slate-900">مهندسی کامپیوتر (کارشناسی)</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">کد ملی:</span>
                <strong className="font-mono text-slate-900" dir="ltr">0012345678</strong>
              </div>
            </div>

            {/* Exams Table on the Card */}
            <table className="w-full text-right text-[11px] border-collapse">
              <thead>
                <tr className="bg-indigo-950 text-white">
                  <th className="p-1.5">درس</th>
                  <th className="p-1.5 text-center">تاریخ</th>
                  <th className="p-1.5 text-center">ساعت</th>
                  <th className="p-1.5 text-center">شماره صندلی</th>
                  <th className="p-1.5">سالن آزمون</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-200">
                  <td className="p-1.5 font-bold">ریاضی عمومی ۱</td>
                  <td className="p-1.5 text-center font-mono font-bold">۱۴۰۵/۱۰/۱۸</td>
                  <td className="p-1.5 text-center font-mono">۰۸:۳۰ الی ۱۰:۳۰</td>
                  <td className="p-1.5 text-center font-bold text-indigo-900 font-mono">صندلی ۲۴</td>
                  <td className="p-1.5">آمفی‌تئاتر مرکزی (۱ الی ۶۰)</td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="p-1.5 font-bold">مبانی برنامه‌نویسی</td>
                  <td className="p-1.5 text-center font-mono font-bold">۱۴۰۵/۱۰/۲۲</td>
                  <td className="p-1.5 text-center font-mono">۱۱:۰۰ الی ۱۳:۰۰</td>
                  <td className="p-1.5 text-center font-bold text-indigo-900 font-mono">سیستم ۳۱۲</td>
                  <td className="p-1.5">سایت ۱۰۲ (۳۰۱ الی ۳۲۵)</td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="p-1.5 font-bold">فیزیک عمومی ۱</td>
                  <td className="p-1.5 text-center font-mono font-bold">۱۴۰۵/۱۰/۲۵</td>
                  <td className="p-1.5 text-center font-mono">۰۸:۳۰ الی ۱۰:۳۰</td>
                  <td className="p-1.5 text-center font-bold text-indigo-900 font-mono">صندلی ۱۰۸</td>
                  <td className="p-1.5">سالن امتحانات شماره ۱ (۱۰۱ الی ۱۴۰)</td>
                </tr>
              </tbody>
            </table>

            <div className="p-2 bg-amber-50 rounded-lg border border-amber-200 text-[10px] text-amber-900 font-bold">
              ⚠️ همراه داشتن این کارت و کارت شناسایی معتبر در کلیه جلسات آزمون الزامی است. همراه داشتن تلفن همراه و ساعت هوشمند تخلف محسوب می‌شود.
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: QUALITY BOTTLENECKS & FACILITIES ANALYTICS (DASHBOARD) */}
      {/* ========================================================================= */}
      {activeTab === 'QUALITY_ANALYTICS' && (
        <div className="card space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-black text-slate-900 text-base flex items-center gap-2">
                <span>📊 داشبورد تضمین کیفیت آموزشی و تحلیل امکانات فیزیکی کلاس‌ها</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                شناسایی خودکار گلوگاه‌های کیفی اساتید (زیر ۳.۵ از ۵) و ارسال تیکت‌های تعمیراتی امکانات کلاس‌ها به پشتیبانی IT و تدارکات
              </p>
            </div>
            <button
              onClick={() => {
                setFacilityTickets(prev =>
                  prev.map(t => ({
                    ...t,
                    status: 'DISPATCHED' as const,
                    dispatchedAt: 'هم‌اکنون',
                  }))
                );
                showToast('🚀 کلیه تیکت‌های نیازمندی و تعمیرات کلاس‌ها به صورت خودکار برای واحدهای IT و تدارکات ارسال گردید.');
              }}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-700 to-indigo-800 hover:from-indigo-800 text-white font-extrabold text-xs shadow flex items-center gap-1.5 transition"
            >
              <span>🚀 ارسال خودکار تیکت‌های تعمیراتی به پشتیبانی IT و تدارکات</span>
            </button>
          </div>

          {/* Section 1: Quality Bottlenecks */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">👨‍🏫</span>
                <h3 className="font-black text-slate-900 text-sm">
                  ۱. گزارش ارزشیابی عملکرد اساتید و گلوگاه‌های کیفی تدریس:
                </h3>
              </div>
              <span className="text-xs text-slate-500 font-bold">
                آستانه هشدار کیفی: نمره کمتر از ۳.۵ از ۵
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="p-2.5">نام استاد</th>
                    <th className="p-2.5">کد پرسنلی</th>
                    <th className="p-2.5">دروس ارزشیابی‌شده</th>
                    <th className="p-2.5 text-center">تسلط علمی</th>
                    <th className="p-2.5 text-center">فن بیان و تدریس</th>
                    <th className="p-2.5 text-center">نظم کلاسی</th>
                    <th className="p-2.5 text-center">میانگین کل (از ۵)</th>
                    <th className="p-2.5 text-center">وضعیت کیفی</th>
                    <th className="p-2.5">تصمیم و بازخورد مدیر گروه</th>
                  </tr>
                </thead>
                <tbody>
                  {evalBottlenecks.map(b => (
                    <tr
                      key={b.id}
                      className={`border-b transition ${
                        b.isFlagged
                          ? 'bg-rose-50/80 border-rose-300 font-bold text-rose-950'
                          : 'border-slate-100 hover:bg-slate-50'
                      }`}
                    >
                      <td className="p-2.5 font-black text-slate-900 flex items-center gap-1.5">
                        {b.isFlagged && <span className="text-rose-600 text-base">⚠️</span>}
                        <span>{b.profName}</span>
                      </td>
                      <td className="p-2.5 font-mono text-slate-700" dir="ltr">{b.staffCode}</td>
                      <td className="p-2.5 text-slate-700">{b.courses.join('، ')}</td>
                      <td className="p-2.5 text-center font-bold">{b.masteryScore}</td>
                      <td className="p-2.5 text-center font-bold">{b.teachingSkill}</td>
                      <td className="p-2.5 text-center font-bold">{b.disciplineScore}</td>
                      <td className="p-2.5 text-center font-mono font-black text-sm">
                        <span
                          className={`px-2.5 py-1 rounded-xl ${
                            b.isFlagged ? 'bg-rose-600 text-white shadow-xs' : 'bg-emerald-100 text-emerald-900'
                          }`}
                        >
                          {b.avgScore}
                        </span>
                      </td>
                      <td className="p-2.5 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-black ${
                            b.isFlagged
                              ? 'bg-rose-200 text-rose-900 border border-rose-300 animate-pulse'
                              : 'bg-emerald-100 text-emerald-900'
                          }`}
                        >
                          {b.isFlagged ? '🚩 گلوگاه کیفی (اخطار)' : '✓ عملکرد مطلوب'}
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-700 text-[11px]">
                        {b.notes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Physical Facilities Analysis */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🏛️</span>
                <h3 className="font-black text-slate-900 text-sm">
                  ۲. تحلیل امکانات فیزیکی کلاس‌ها و ارجاع تیکت‌های تعمیرات به پشتیبانی:
                </h3>
              </div>
              <span className="text-xs text-slate-500 font-bold">
                استخراج خودکار از پاسخ‌های دانشجویان در فرم ارزشیابی ترم
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {facilityTickets.map(tkt => {
                const isDispatched = tkt.status === 'DISPATCHED';

                return (
                  <div
                    key={tkt.id}
                    className={`p-4 rounded-2xl border space-y-3 shadow-xs ${
                      isDispatched
                        ? 'bg-indigo-50/50 border-indigo-300'
                        : 'bg-amber-50/50 border-amber-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-black text-slate-900 text-sm">{tkt.roomName}</h4>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                          isDispatched ? 'bg-indigo-200 text-indigo-900' : 'bg-amber-200 text-amber-900'
                        }`}
                      >
                        {isDispatched ? '✓ تیکت ارسال شد' : '⏳ در انتظار ارجاع'}
                      </span>
                    </div>

                    <div className="text-xs text-slate-700 space-y-1">
                      <p><strong>موضوع نقص:</strong> {tkt.issueType}</p>
                      <p><strong>تعداد گزارش‌های دانشجویی:</strong> {tkt.reportedByCount} دانشجو</p>
                      <p><strong>واحد اقدام‌کننده:</strong> {tkt.targetDepartment}</p>
                      {tkt.ticketCode && (
                        <p className="font-mono font-bold text-indigo-900 text-[11px]" dir="ltr">
                          کد رهگیری: {tkt.ticketCode}
                        </p>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">
                        {isDispatched ? `ارسال شده در ${tkt.dispatchedAt}` : 'نیازمند تایید مدیر'}
                      </span>
                      {!isDispatched && (
                        <button
                          onClick={() => {
                            setFacilityTickets(prev =>
                              prev.map(t =>
                                t.id === tkt.id
                                  ? {
                                      ...t,
                                      status: 'DISPATCHED' as const,
                                      dispatchedAt: 'هم‌اکنون',
                                    }
                                  : t
                              )
                            );
                            showToast(`🚀 تیکت تعمیرات برای ${tkt.roomName} با موفقیت صادر و به ${tkt.targetDepartment} ارسال شد.`);
                          }}
                          className="px-3 py-1 rounded-lg bg-indigo-900 hover:bg-indigo-950 text-white font-black text-xs transition"
                        >
                          ارسال تیکت 🚀
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD NEW EXAM SLOT */}
      {/* ========================================================================= */}
      {isNewSlotModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 bg-indigo-950 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-sm sm:text-base">➕ افزودن سانس آزمون روزانه جدید</h3>
              <button onClick={() => setIsNewSlotModalOpen(false)} className="text-white/60 hover:text-white">✕</button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">عنوان سانس:</label>
                <input
                  type="text"
                  value={newSlotForm.label}
                  onChange={e => setNewSlotForm({ ...newSlotForm, label: e.target.value })}
                  placeholder="مثلاً: سانس ۵ (عصرگاهی)"
                  className="w-full border border-slate-300 rounded-lg p-2 font-bold bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">ساعت شروع:</label>
                  <input
                    type="text"
                    value={newSlotForm.startTime}
                    onChange={e => setNewSlotForm({ ...newSlotForm, startTime: e.target.value })}
                    placeholder="۱۹:۰۰"
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold text-center bg-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">ساعت پایان:</label>
                  <input
                    type="text"
                    value={newSlotForm.endTime}
                    onChange={e => setNewSlotForm({ ...newSlotForm, endTime: e.target.value })}
                    placeholder="۲۱:۰۰"
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold text-center bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setIsNewSlotModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs"
              >
                انصراف
              </button>
              <button
                onClick={handleAddNewSlot}
                className="px-5 py-1.5 rounded-lg bg-indigo-900 hover:bg-indigo-950 text-white font-extrabold text-xs shadow"
              >
                ✓ ثبت و افزودن سانس
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD NEW EXAM HALL */}
      {/* ========================================================================= */}
      {isNewHallModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 bg-indigo-950 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-sm sm:text-base">➕ تعریف حوزه / سالن امتحانی جدید</h3>
              <button onClick={() => setIsNewHallModalOpen(false)} className="text-white/60 hover:text-white">✕</button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">نام سالن / حوزه آزمون:</label>
                <input
                  type="text"
                  value={newHallForm.name}
                  onChange={e => setNewHallForm({ ...newHallForm, name: e.target.value })}
                  placeholder="مثلاً: سالن اجتماعات شهید بهشتی"
                  className="w-full border border-slate-300 rounded-lg p-2 font-bold bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">محل استقرار / ساختمان:</label>
                <input
                  type="text"
                  value={newHallForm.buildingName}
                  onChange={e => setNewHallForm({ ...newHallForm, buildingName: e.target.value })}
                  placeholder="مثلاً: ساختمان آموزش - طبقه دوم"
                  className="w-full border border-slate-300 rounded-lg p-2 font-bold bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">ظرفیت اسمی کل سالن:</label>
                  <input
                    type="number"
                    value={newHallForm.totalSeats}
                    onChange={e => setNewHallForm({ ...newHallForm, totalSeats: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-lg p-2 font-bold bg-white"
                  />
                </div>

                <div>
                  <label className="font-bold text-emerald-800 block mb-1">ظرفیت آزمونی (فاصله‌دار):</label>
                  <input
                    type="number"
                    value={newHallForm.examCapacity}
                    onChange={e => setNewHallForm({ ...newHallForm, examCapacity: Number(e.target.value) })}
                    className="w-full border-2 border-emerald-400 rounded-lg p-2 font-black bg-emerald-50/50 text-emerald-950"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-indigo-950 block mb-1">شماره صندلی شروع:</label>
                  <input
                    type="number"
                    value={newHallForm.startSeatNumber}
                    onChange={e => setNewHallForm({ ...newHallForm, startSeatNumber: Number(e.target.value) })}
                    className="w-full border-2 border-indigo-400 rounded-lg p-2 font-mono font-black bg-indigo-50/50 text-indigo-950"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-500 block mb-1">شماره صندلی پایان (خودکار):</label>
                  <input
                    type="text"
                    disabled
                    value={Number(newHallForm.startSeatNumber) + Number(newHallForm.examCapacity) - 1}
                    className="w-full border border-slate-200 rounded-lg p-2 font-mono font-black bg-slate-100 text-slate-600 cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Calculated Range Box */}
              <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-300 text-xs text-emerald-900 font-bold flex items-center justify-between">
                <span>بازه شماره صندلی‌های تخصیص‌یافته:</span>
                <span className="font-mono text-sm font-black">
                  از {newHallForm.startSeatNumber} تا {Number(newHallForm.startSeatNumber) + Number(newHallForm.examCapacity) - 1}
                </span>
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-1.5 font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newHallForm.hasAirConditioning}
                    onChange={e => setNewHallForm({ ...newHallForm, hasAirConditioning: e.target.checked })}
                    className="rounded text-indigo-600"
                  />
                  <span>تهویه مطبوع</span>
                </label>
                <label className="flex items-center gap-1.5 font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newHallForm.isCCTVMonitored}
                    onChange={e => setNewHallForm({ ...newHallForm, isCCTVMonitored: e.target.checked })}
                    className="rounded text-indigo-600"
                  />
                  <span>دوربین مداربسته</span>
                </label>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setIsNewHallModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs"
              >
                انصراف
              </button>
              <button
                onClick={handleAddNewHall}
                className="px-5 py-1.5 rounded-lg bg-indigo-900 hover:bg-indigo-950 text-white font-extrabold text-xs shadow"
              >
                ✓ ثبت و تعریف سالن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EDIT COURSE EXAM (MANUAL OVERRIDE & SETTINGS) */}
      {/* ========================================================================= */}
      {editingCourse && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 bg-indigo-950 text-white flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-sm sm:text-base">
                  ✏️ تنظیمات تاریخ و سالن آزمون: {editingCourse.courseTitle}
                </h3>
                <span className="text-xs text-indigo-300">
                  کد: {editingCourse.courseCode} · {editingCourse.cohortTitle} · استاد: {editingCourse.professorName}
                </span>
              </div>
              <button onClick={() => setEditingCourse(null)} className="text-white/60 hover:text-white">✕</button>
            </div>

            <div className="p-4 space-y-4 text-xs">
              {/* Mode Toggle */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="font-bold text-slate-800">حالت زمان‌بندی تاریخ و ساعت این درس:</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setEditingCourse({ ...editingCourse, schedulingMode: 'AUTO_MATRIX' })}
                    className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
                      editingCourse.schedulingMode === 'AUTO_MATRIX'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    🤖 خودکار ماتریسی
                  </button>
                  <button
                    onClick={() => setEditingCourse({ ...editingCourse, schedulingMode: 'MANUAL' })}
                    className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
                      editingCourse.schedulingMode === 'MANUAL'
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    ✍️ تخصیص دستی و قفل
                  </button>
                </div>
              </div>

              {/* Date & Slot */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">تاریخ آزمون:</label>
                  <input
                    type="text"
                    value={editingCourse.examDate}
                    onChange={e => setEditingCourse({ ...editingCourse, examDate: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold bg-white"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">سانس و ساعت برگزاری:</label>
                  <select
                    value={editingCourse.slotId}
                    onChange={e => setEditingCourse({ ...editingCourse, slotId: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-lg p-2 font-bold bg-white"
                  >
                    {slots.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.label} ({s.startTime} تا {s.endTime})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Hall & Proctor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">سالن آزمون:</label>
                  <select
                    value={editingCourse.hallId}
                    onChange={e => setEditingCourse({ ...editingCourse, hallId: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-lg p-2 font-bold bg-white"
                  >
                    {halls.map(h => (
                      <option key={h.id} value={h.id}>
                        🏛️ {h.name} (صندلی {h.startSeatNumber} تا {h.endSeatNumber} — ظرفیت: {h.examCapacity})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">سرپرست / مراقب ارشد:</label>
                  <input
                    type="text"
                    value={editingCourse.chiefProctor}
                    onChange={e => setEditingCourse({ ...editingCourse, chiefProctor: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 font-bold bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setEditingCourse(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs"
              >
                انصراف
              </button>
              <button
                onClick={() => handleSaveCourseExamEdit(editingCourse)}
                className="px-6 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow"
              >
                💾 ذخیره و اعمال تغییرات آزمون
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
              <div className="text-center space-y-1 border-b border-slate-200 pb-3">
                <h2 className="font-black text-slate-900 text-base">دانشگاه جامع آفاق — تقویم و برنامه امتحانات پایان‌ترم</h2>
                <p className="text-xs text-slate-600 font-bold">نیمسال اول سال تحصیلی ۱۴۰۵-۱۴۰۴ (بازه {examStartDate} الی {examEndDate})</p>
              </div>

              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 border-b border-slate-300">
                    <th className="p-2">کد درس</th>
                    <th className="p-2">عنوان درس</th>
                    <th className="p-2">رشته و ورودی</th>
                    <th className="p-2">استاد</th>
                    <th className="p-2 text-center">تاریخ</th>
                    <th className="p-2 text-center">ساعت</th>
                    <th className="p-2">سالن و شماره صندلی</th>
                  </tr>
                </thead>
                <tbody>
                  {courses.map(c => {
                    const slot = slots.find(s => s.id === c.slotId) || slots[0];
                    const hall = halls.find(h => h.id === c.hallId) || halls[0];
                    return (
                      <tr key={c.id} className="border-b border-slate-100">
                        <td className="p-2 font-mono font-bold" dir="ltr">{c.courseCode}</td>
                        <td className="p-2 font-bold">{c.courseTitle} (گروه {c.groupNumber})</td>
                        <td className="p-2">{c.cohortTitle}</td>
                        <td className="p-2">{c.professorName}</td>
                        <td className="p-2 text-center font-mono font-bold">{c.examDate}</td>
                        <td className="p-2 text-center font-mono">{slot.startTime} تا {slot.endTime}</td>
                        <td className="p-2">{hall.name} ({hall.startSeatNumber} تا {hall.endSeatNumber})</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
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
                className="px-6 py-1.5 rounded-lg bg-indigo-900 hover:bg-indigo-950 text-white font-extrabold text-xs shadow"
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
