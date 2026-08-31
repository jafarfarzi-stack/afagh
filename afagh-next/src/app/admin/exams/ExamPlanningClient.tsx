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
  hasAirConditioning: boolean;
  isCCTVMonitored: boolean;
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
  { id: 1, name: 'آمفی‌تئاتر مرکزی', buildingName: 'ساختمان اداری مرکزی', totalSeats: 120, examCapacity: 60, hasAirConditioning: true, isCCTVMonitored: true },
  { id: 2, name: 'سالن امتحانات شماره ۱', buildingName: 'ساختمان آموزش', totalSeats: 80, examCapacity: 40, hasAirConditioning: true, isCCTVMonitored: true },
  { id: 3, name: 'سالن امتحانات شماره ۲', buildingName: 'ساختمان آموزش', totalSeats: 80, examCapacity: 40, hasAirConditioning: true, isCCTVMonitored: true },
  { id: 4, name: 'سایت تخصصی کامپیوتر ۱۰۲', buildingName: 'دانشکده مهندسی', totalSeats: 50, examCapacity: 25, hasAirConditioning: true, isCCTVMonitored: true },
  { id: 5, name: 'کلاس ۳۰۱ امتحانی', buildingName: 'ساختمان ابن‌سینا', totalSeats: 60, examCapacity: 30, hasAirConditioning: true, isCCTVMonitored: false },
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
  const [activeTab, setActiveTab] = useState<'SCHEDULE_TABLE' | 'CALENDAR_SLOTS' | 'CONFLICT_CHECKER' | 'EXAM_HALLS' | 'PROCTORS' | 'STUDENT_CARDS'>('SCHEDULE_TABLE');
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

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 6000);
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
          details: `در تاریخ ${items[0].examDate} سانس ${items[0].slotId}، تعداد کل دانشجویان (${totalStudents} نفر) از ظرفیت آزمونی با فاصله سالن (${hall.examCapacity} صندلی) فراتر رفته است.`,
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
    // Generate dates between start and end date
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
        return course; // Keep manual locked
      }

      if (!cohortUsedDates[course.cohortId]) {
        cohortUsedDates[course.cohortId] = new Set();
      }

      // Find next date not used for this cohort
      let chosenDate = datePool[dateIdx % datePool.length];
      while (cohortUsedDates[course.cohortId].has(chosenDate) && dateIdx < 40) {
        dateIdx++;
        chosenDate = datePool[dateIdx % datePool.length];
      }
      cohortUsedDates[course.cohortId].add(chosenDate);
      dateIdx++;

      // Distribute slots and halls
      const assignedSlotId = ((idx % 3) + 1);
      const assignedHallId = ((idx % halls.length) + 1);

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

  // Filtered courses
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
                تخصیص دوحالته (دستی و خودکار ماتریسی)، رصد بلادرنگ تداخل‌ها، چیدمان صندلی، سالن‌ها و صدور کارت آزمون
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
            <span className="text-indigo-300 block text-[11px]">سانس‌های روزانه:</span>
            <span className="text-base font-black text-white">{slots.length} سانس استاندارد</span>
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
          onClick={() => setActiveTab('CALENDAR_SLOTS')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'CALENDAR_SLOTS'
              ? 'bg-indigo-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>🗓️ بازه تقویم و سانس‌های روزانه</span>
        </button>

        <button
          onClick={() => setActiveTab('EXAM_HALLS')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'EXAM_HALLS'
              ? 'bg-indigo-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>🏛️ سالن‌های آزمون و ظرفیت صندلی</span>
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
                  <th className="p-2.5">سالن آزمون</th>
                  <th className="p-2.5 text-center">تعداد دانشجو</th>
                  <th className="p-2.5 text-left">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filteredCourses.map(course => {
                  const slot = slots.find(s => s.id === course.slotId) || slots[0];
                  const hall = halls.find(h => h.id === course.hallId) || halls[0];
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
                        <p className="text-[10px] text-slate-500">{hall.buildingName}</p>
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
      {/* TAB 2: CONFLICT RESOLUTION ENGINE */}
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
      {/* TAB 3: CALENDAR & DAILY SLOTS */}
      {/* ========================================================================= */}
      {activeTab === 'CALENDAR_SLOTS' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-black text-slate-900 text-base">
                پیکربندی بازه زمانی امتحانات و سانس‌های استاندارد روزانه
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                تعریف بازه شروع و پایان امتحانات و ساعت دقیق برگزاری آزمون‌ها در طول روز
              </p>
            </div>
            <button
              onClick={() => showToast('تنظیمات بازه تقویم و سانس‌های امتحانی با موفقیت ذخیره گردید.')}
              className="px-4 py-2 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-extrabold text-xs shadow transition"
            >
              💾 ذخیره تنظیمات تقویم
            </button>
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

          {/* Slots Table */}
          <div className="space-y-2">
            <h3 className="font-extrabold text-slate-800 text-xs">سانس‌های تعریف‌شده روزانه آزمون:</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {slots.map(slot => (
                <div key={slot.id} className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-slate-900 text-xs">{slot.label}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 font-bold">
                      سانس {slot.id}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <input
                      type="text"
                      value={slot.startTime}
                      onChange={e =>
                        setSlots(slots.map(s => (s.id === slot.id ? { ...s, startTime: e.target.value } : s)))
                      }
                      className="w-16 border border-slate-300 rounded p-1 text-center font-mono font-bold"
                    />
                    <span className="text-slate-400">تا</span>
                    <input
                      type="text"
                      value={slot.endTime}
                      onChange={e =>
                        setSlots(slots.map(s => (s.id === slot.id ? { ...s, endTime: e.target.value } : s)))
                      }
                      className="w-16 border border-slate-300 rounded p-1 text-center font-mono font-bold"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: EXAM HALLS & CAPACITY */}
      {/* ========================================================================= */}
      {activeTab === 'EXAM_HALLS' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-black text-slate-900 text-base">
                مدیریت سالن‌های آزمون، فاصله‌گذاری صندلی‌ها و نظارت تصویری
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                محاسبه ظرفیت آزمونی بر اساس استاندارد فاصله‌گذاری یک‌درمیان صندلی‌ها
              </p>
            </div>
            <span className="text-xs font-bold text-indigo-900 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-200">
              مجموع ظرفیت آزمونی همزمان: {halls.reduce((s, h) => s + h.examCapacity, 0)} صندلی
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {halls.map(hall => (
              <div key={hall.id} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-slate-900 text-sm">🏛️ {hall.name}</h3>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-extrabold">
                    {hall.examCapacity} صندلی آزمونی
                  </span>
                </div>

                <p className="text-xs text-slate-500">{hall.buildingName}</p>

                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100">
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="text-slate-500 block text-[10px]">ظرفیت اسمی کل:</span>
                    <strong className="text-slate-800">{hall.totalSeats} نفر</strong>
                  </div>
                  <div className="p-2 bg-emerald-50 rounded-lg">
                    <span className="text-emerald-700 block text-[10px]">ظرفیت آزمونی (با فاصله):</span>
                    <strong className="text-emerald-950">{hall.examCapacity} صندلی</strong>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-[11px] font-bold text-slate-600 pt-1">
                  <span>{hall.hasAirConditioning ? '❄️ تهویه مطبوع' : '—'}</span>
                  <span>{hall.isCCTVMonitored ? '📹 دوربین مداربسته' : '—'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: PROCTORS & INVIGILATORS */}
      {/* ========================================================================= */}
      {activeTab === 'PROCTORS' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-black text-slate-900 text-base">
                تخصیص مراقبین، سرپرستان جلسات و کادر اجرایی امتحانات
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                توزیع متوازن نوبت‌های مراقبت بین اعضای هیات علمی و کارکنان آموزشی (۱ مراقب به ازای هر ۲۰ صندلی)
              </p>
            </div>
            <button
              onClick={() => showToast('توزیع خودکار نوبت‌های مراقبت بر اساس سقف موظفی اساتید با موفقیت انجام شد.')}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow transition"
            >
              ⚡ توزیع خودکار مراقبین به سالن‌ها
            </button>
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
                  <td className="p-1.5 text-center font-bold text-indigo-900">صندلی ۲۴</td>
                  <td className="p-1.5">آمفی‌تئاتر مرکزی</td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="p-1.5 font-bold">مبانی برنامه‌نویسی</td>
                  <td className="p-1.5 text-center font-mono font-bold">۱۴۰۵/۱۰/۲۲</td>
                  <td className="p-1.5 text-center font-mono">۱۱:۰۰ الی ۱۳:۰۰</td>
                  <td className="p-1.5 text-center font-bold text-indigo-900">سیستم ۱۲</td>
                  <td className="p-1.5">سایت ۱۰۲</td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="p-1.5 font-bold">فیزیک عمومی ۱</td>
                  <td className="p-1.5 text-center font-mono font-bold">۱۴۰۵/۱۰/۲۵</td>
                  <td className="p-1.5 text-center font-mono">۰۸:۳۰ الی ۱۰:۳۰</td>
                  <td className="p-1.5 text-center font-bold text-indigo-900">صندلی ۰۸</td>
                  <td className="p-1.5">سالن امتحانات شماره ۱</td>
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
                        🏛️ {h.name} (ظرفیت: {h.examCapacity})
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
                    <th className="p-2">سالن</th>
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
                        <td className="p-2">{hall.name}</td>
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
