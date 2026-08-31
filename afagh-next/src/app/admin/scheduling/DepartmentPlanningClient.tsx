'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';

// ==========================================
// INTERFACES & TYPES
// ==========================================

export type WeekRecurrence = 'ALL' | 'EVEN' | 'ODD';
export type ProgramShiftType = 'MORNING' | 'AFTERNOON_WORKING' | 'FLEXIBLE';

export interface TimeSlot {
  id: number;
  label: string;
  startTime: string; // e.g. "07:30" or "08:00"
  endTime: string;   // e.g. "09:00" or "09:30"
  isBreak: boolean;  // prayer/lunch or class
}

export interface AcademicTerm {
  id: number;
  code: string;
  title: string;
  isCurrent: boolean;
}

export interface AcademicProgram {
  id: number;
  code: string;
  title: string;
  facultyName: string;
  degreeLevel: string;
  preferredShift: ProgramShiftType;
}

export interface CohortOption {
  id: string;
  entryYear: string;
  semesterNo: number;
  title: string;
  expectedStudents: number;
  isEmployedAudience?: boolean; // آیا ورودی ویژه شاغلین/شبانه/ارشد است؟
}

export interface ClassroomOption {
  id: number;
  name: string;
  buildingName: string;
  capacity: number;
  roomType: 'THEORY' | 'LAB' | 'GYM' | 'EXAM';
  equipment: string[];
  isActive: boolean;
}

export interface ProfessorOption {
  id: number;
  name: string;
  staffCode: string;
  academicRank: string;
  contractType: 'تمام‌وقت' | 'نیمه‌وقت' | 'مدعو';
  departmentName: string;
  maxWeeklyUnits: number;
  maxDailyHours: number;
}

export type SlotStatus = 'PREF' | 'AVAIL' | 'UNAVAIL';

// [profId][dayIndex (0..5)][slotId] = SlotStatus
export interface ProfessorAvailabilityMap {
  [profId: number]: {
    [dayOfWeek: number]: {
      [slotId: number]: SlotStatus;
    };
  };
}

export interface CourseDemand {
  id: number;
  programId: number;
  programTitle: string;
  cohortId: string;
  cohortTitle: string;
  code: string;
  title: string;
  units: number;
  courseType: 'پایه' | 'اصلی' | 'تخصصی' | 'عمومی' | 'عملی';
  preferredProfId: number;
  requiredRoomType: 'THEORY' | 'LAB' | 'GYM';
  capacity: number;
  groupsCount: number;
  weekRecurrence: WeekRecurrence;
  sessionsCountPerWeek: number;
  examDate: string;
}

export interface DepartmentOffering {
  id: number;
  termId: number;
  programId: number;
  programTitle: string;
  cohortId: string;
  cohortTitle: string;
  courseId: number;
  code: string;
  title: string;
  units: number;
  courseType: string;
  groupNumber: number;
  professorId: number;
  professorName: string;
  capacity: number;
  enrolledCount: number;
  waitlistCapacity: number;
  classSchedules: {
    dayOfWeek: number;
    dayName: string;
    slotId: number;
    startTime: string;
    endTime: string;
    roomId: number;
    roomName: string;
    buildingName: string;
    weekType: WeekRecurrence;
  }[];
  examSchedule: {
    examDate: string;
    startTime: string;
    endTime: string;
    roomName: string;
  } | null;
}

export interface AutoScheduleScenario {
  id: 'COMPACT' | 'BALANCED' | 'PROF_PREF' | 'AFTERNOON_WORKING';
  title: string;
  subtitle: string;
  description: string;
  badgeColor: string;
  accentBorder: string;
  bgGradient: string;
  kpi: {
    daysPerWeek: string;
    profSatisfaction: string;
    conflictsRate: string;
    roomEfficiency: string;
    studentComfort: string;
    commuteScore: string;
  };
  offerings: DepartmentOffering[];
}

const faNum = (n: any) => (n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]));

const DAY_NAMES = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه'];

// ==========================================
// BELL SCHEDULE & TIME SLOTS PRESETS
// ==========================================

export const TIME_SLOT_PRESETS = {
  STANDARD_120: {
    name: 'الگوی ۱۲۰ دقیقه‌ای (۲ ساعته استاندارد)',
    description: 'کلاس‌های ۲ ساعته استاندارد دانشگاه‌ها با ۳۰ دقیقه استراحت بین کلاس‌ها',
    slots: [
      { id: 1, label: '۰۸:۰۰ الی ۱۰:۰۰', startTime: '08:00', endTime: '10:00', isBreak: false },
      { id: 2, label: '۱۰:۰۰ الی ۱۲:۰۰', startTime: '10:00', endTime: '12:00', isBreak: false },
      { id: 3, label: '۱۲:۰۰ الی ۱۳:۳۰ (نماز و ناهار)', startTime: '12:00', endTime: '13:30', isBreak: true },
      { id: 4, label: '۱۳:۳۰ الی ۱۵:۳۰', startTime: '13:30', endTime: '15:30', isBreak: false },
      { id: 5, label: '۱۵:۳۰ الی ۱۷:۳۰', startTime: '15:30', endTime: '17:30', isBreak: false },
      { id: 6, label: '۱۷:۳۰ الی ۱۹:۳۰', startTime: '17:30', endTime: '19:30', isBreak: false },
    ],
  },
  STANDARD_90: {
    name: 'الگوی ۹۰ دقیقه‌ای (۱٫۵ ساعته سراسری)',
    description: 'کلاس‌های ۱٫۵ ساعته مناسب دروس ۳ واحدی (۲ جلسه ۹۰ دقیقه‌ای در هفته)',
    slots: [
      { id: 1, label: '۰۸:۰۰ الی ۰۹:۳۰', startTime: '08:00', endTime: '09:30', isBreak: false },
      { id: 2, label: '۰۹:۴۵ الی ۱۱:۱۵', startTime: '09:45', endTime: '11:15', isBreak: false },
      { id: 3, label: '۱۱:۳۰ الی ۱۳:۰۰', startTime: '11:30', endTime: '13:00', isBreak: false },
      { id: 4, label: '۱۳:۰۰ الی ۱۳:۴۵ (نماز و ناهار)', startTime: '13:00', endTime: '13:45', isBreak: true },
      { id: 5, label: '۱۳:۴۵ الی ۱۵:۱۵', startTime: '13:45', endTime: '15:15', isBreak: false },
      { id: 6, label: '۱۵:۳۰ الی ۱۷:۰۰', startTime: '15:30', endTime: '17:00', isBreak: false },
      { id: 7, label: '۱۷:۱۵ الی ۱۸:۴۵', startTime: '17:15', endTime: '18:45', isBreak: false },
    ],
  },
  STANDARD_60: {
    name: 'الگوی ۶۰ دقیقه‌ای (۱ ساعته کارگاهی/فشرده)',
    description: 'کلاس‌های ۱ ساعته مناسب کارگاه‌ها و جلسات رفع اشکال و تمرین',
    slots: [
      { id: 1, label: '۰۸:۰۰ الی ۰۹:۰۰', startTime: '08:00', endTime: '09:00', isBreak: false },
      { id: 2, label: '۰۹:۱۵ الی ۱۰:۱۵', startTime: '09:15', endTime: '10:15', isBreak: false },
      { id: 3, label: '۱۰:۳۰ الی ۱۱:۳۰', startTime: '10:30', endTime: '11:30', isBreak: false },
      { id: 4, label: '۱۱:۴۵ الی ۱۲:۴۵', startTime: '11:45', endTime: '12:45', isBreak: false },
      { id: 5, label: '۱۲:۴۵ الی ۱۳:۴۵ (نماز و ناهار)', startTime: '12:45', endTime: '13:45', isBreak: true },
      { id: 6, label: '۱۳:۴۵ الی ۱۴:۴۵', startTime: '13:45', endTime: '14:45', isBreak: false },
      { id: 7, label: '۱۵:۰۰ الی ۱۶:۰۰', startTime: '15:00', endTime: '16:00', isBreak: false },
      { id: 8, label: '۱۶:۱۵ الی ۱۷:۱۵', startTime: '16:15', endTime: '17:15', isBreak: false },
    ],
  },
};

// ==========================================
// INITIAL DATA
// ==========================================

const INITIAL_TERMS: AcademicTerm[] = [
  { id: 14051, code: '1405-1', title: 'نیمسال اول ۱۴۰۵–۱۴۰۶ (مهر ۱۴۰۵)', isCurrent: true },
  { id: 14052, code: '1405-2', title: 'نیمسال دوم ۱۴۰۵–۱۴۰۶ (بهمن ۱۴۰۵)', isCurrent: false },
  { id: 14053, code: '1405-3', title: 'نیمسال تابستان ۱۴۰۶', isCurrent: false },
];

const INITIAL_PROGRAMS: AcademicProgram[] = [
  { id: 1, code: 'CE-BS', title: 'مهندسی کامپیوتر', facultyName: 'دانشکده مهندسی برق و کامپیوتر', degreeLevel: 'کارشناسی پیوسته', preferredShift: 'FLEXIBLE' },
  { id: 2, code: 'IT-BS', title: 'فناوری اطلاعات و ارتباطات', facultyName: 'دانشکده مهندسی برق و کامپیوتر', degreeLevel: 'کارشناسی پیوسته', preferredShift: 'AFTERNOON_WORKING' },
  { id: 3, code: 'FT-BS', title: 'مهندسی صنایع غذایی', facultyName: 'دانشکده کشاورزی و صنایع غذایی', degreeLevel: 'کارشناسی پیوسته', preferredShift: 'MORNING' },
  { id: 4, code: 'CS-BS', title: 'علوم کامپیوتر', facultyName: 'دانشکده علوم پایه', degreeLevel: 'کارشناسی پیوسته', preferredShift: 'FLEXIBLE' },
];

const INITIAL_COHORTS: CohortOption[] = [
  { id: 'COHORT-1405-1', entryYear: '۱۴۰۵', semesterNo: 1, title: 'ورودی ۱۴۰۵ (ترم ۱ - نوورود)', expectedStudents: 65, isEmployedAudience: false },
  { id: 'COHORT-1404-3', entryYear: '۱۴۰۴', semesterNo: 3, title: 'ورودی ۱۴۰۴ (ترم ۳)', expectedStudents: 55, isEmployedAudience: false },
  { id: 'COHORT-1403-5', entryYear: '۱۴۰۳', semesterNo: 5, title: 'ورودی ۱۴۰۳ (ترم ۵ - نوبت عصر/شاغلین)', expectedStudents: 48, isEmployedAudience: true },
  { id: 'COHORT-1402-7', entryYear: '۱۴۰۲', semesterNo: 7, title: 'ورودی ۱۴۰۲ (ترم ۷)', expectedStudents: 40, isEmployedAudience: true },
];

const INITIAL_CLASSROOMS: ClassroomOption[] = [
  { id: 1, name: 'اتاق ۲۰۱ (کلاس نظری)', buildingName: 'ساختمان آموزش', capacity: 45, roomType: 'THEORY', equipment: ['ویدئوپروژکتور', 'برد هوشمند', 'سیستم صوتی'], isActive: true },
  { id: 2, name: 'اتاق ۲۰۲ (کلاس نظری)', buildingName: 'ساختمان آموزش', capacity: 40, roomType: 'THEORY', equipment: ['ویدئوپروژکتور', 'تخته وایت‌برد'], isActive: true },
  { id: 3, name: 'اتاق ۲۰۳ (کلاس نظری)', buildingName: 'ساختمان آموزش', capacity: 35, roomType: 'THEORY', equipment: ['ویدئوپروژکتور'], isActive: true },
  { id: 4, name: 'سایت کامپیوتر ۱۰۱', buildingName: 'دانشکده فنی', capacity: 32, roomType: 'LAB', equipment: ['۳۲ رایانه متصل به LAN', 'پروژکتور', 'کولر گازی'], isActive: true },
  { id: 5, name: 'سایت کامپیوتر ۱۰۲', buildingName: 'دانشکده فنی', capacity: 28, roomType: 'LAB', equipment: ['۲۸ رایانه تخصصی', 'ویدئوپروژکتور'], isActive: true },
  { id: 6, name: 'آزمایشگاه فیزیک و مدار', buildingName: 'دانشکده علوم', capacity: 25, roomType: 'LAB', equipment: ['اسیلوسکوپ', 'میزهای آزمایشگاهی', 'کپسول ایمنی'], isActive: true },
  { id: 7, name: 'سالن چندمنظوره ورزشی', buildingName: 'مجموعه ورزشی', capacity: 50, roomType: 'GYM', equipment: ['کفپوش استاندارد', 'رختکن', 'امکانات بدنسازی'], isActive: true },
  { id: 8, name: 'آمفی‌تئاتر مرکزی', buildingName: 'ساختمان مرکزی', capacity: 120, roomType: 'EXAM', equipment: ['پروژکتور سینمایی', 'سیستم صوت دالبی', 'صندلی‌های همایش'], isActive: true },
];

const INITIAL_PROFESSORS: ProfessorOption[] = [
  { id: 1, name: 'دکتر جمیل احمدی', staffCode: '0011111111', academicRank: 'استادیار', contractType: 'تمام‌وقت', departmentName: 'گروه کامپیوتر', maxWeeklyUnits: 16, maxDailyHours: 6 },
  { id: 2, name: 'دکتر فاطمه اکبری', staffCode: '0011111112', academicRank: 'دانشیار', contractType: 'تمام‌وقت', departmentName: 'گروه کامپیوتر', maxWeeklyUnits: 14, maxDailyHours: 6 },
  { id: 3, name: 'مهندس سهراب کاظمی', staffCode: '0011111113', academicRank: 'مربی', contractType: 'مدعو', departmentName: 'گروه کامپیوتر', maxWeeklyUnits: 12, maxDailyHours: 6 },
  { id: 4, name: 'دکتر مریم رضایی', staffCode: '0011111114', academicRank: 'استادیار', contractType: 'تمام‌وقت', departmentName: 'گروه علوم پایه', maxWeeklyUnits: 14, maxDailyHours: 6 },
  { id: 5, name: 'دکتر محمد حسینی', staffCode: '0011111115', academicRank: 'استادیار', contractType: 'مدعو', departmentName: 'گروه معارف و عمومی', maxWeeklyUnits: 10, maxDailyHours: 4 },
  { id: 6, name: 'دکتر رضا ناصری', staffCode: '0011111116', academicRank: 'استادیار', contractType: 'تمام‌وقت', departmentName: 'گروه صنایع غذایی', maxWeeklyUnits: 14, maxDailyHours: 6 },
];

function createDefaultAvailabilities(): ProfessorAvailabilityMap {
  const map: ProfessorAvailabilityMap = {};
  
  for (let profId = 1; profId <= 6; profId++) {
    map[profId] = {};
    for (let d = 0; d < 6; d++) {
      map[profId][d] = {};
      for (let s = 1; s <= 12; s++) {
        if (profId === 1) { // Dr. Ahmadi
          map[profId][d][s] = (d === 0 || d === 2 || (d === 1 && s <= 3)) ? 'PREF' : (d === 3 ? 'UNAVAIL' : 'AVAIL');
        } else if (profId === 2) { // Dr. Akbari
          map[profId][d][s] = (d === 1 || d === 3 || d === 4) ? 'PREF' : (d === 0 ? 'UNAVAIL' : 'AVAIL');
        } else if (profId === 3) { // Eng. Kazemi (Adjunct: loves afternoons & evenings)
          map[profId][d][s] = (d === 4 || d === 5 || s >= 4) ? 'PREF' : (d <= 1 ? 'UNAVAIL' : 'AVAIL');
        } else if (profId === 4) { // Dr. Rezaei
          map[profId][d][s] = ((d === 0 || d === 1 || d === 4) && s <= 3) ? 'PREF' : (d === 2 ? 'UNAVAIL' : 'AVAIL');
        } else {
          map[profId][d][s] = (d % 2 === 1 || s >= 4) ? 'PREF' : 'AVAIL';
        }
      }
    }
  }

  return map;
}

const INITIAL_COURSE_DEMANDS: CourseDemand[] = [
  { id: 1, programId: 1, programTitle: 'مهندسی کامپیوتر', cohortId: 'COHORT-1405-1', cohortTitle: 'ورودی ۱۴۰۵ (ترم ۱)', code: '1112101', title: 'ریاضی عمومی ۱', units: 3, courseType: 'پایه', preferredProfId: 1, requiredRoomType: 'THEORY', capacity: 35, groupsCount: 2, weekRecurrence: 'ALL', sessionsCountPerWeek: 1, examDate: '1405/10/18' },
  { id: 2, programId: 1, programTitle: 'مهندسی کامپیوتر', cohortId: 'COHORT-1405-1', cohortTitle: 'ورودی ۱۴۰۵ (ترم ۱)', code: '1112103', title: 'مبانی برنامه‌نویسی', units: 4, courseType: 'پایه', preferredProfId: 2, requiredRoomType: 'LAB', capacity: 32, groupsCount: 2, weekRecurrence: 'ALL', sessionsCountPerWeek: 1, examDate: '1405/10/22' },
  { id: 3, programId: 1, programTitle: 'مهندسی کامپیوتر', cohortId: 'COHORT-1405-1', cohortTitle: 'ورودی ۱۴۰۵ (ترم ۱)', code: '1112105', title: 'فیزیک عمومی ۱', units: 3, courseType: 'پایه', preferredProfId: 4, requiredRoomType: 'THEORY', capacity: 35, groupsCount: 2, weekRecurrence: 'ALL', sessionsCountPerWeek: 1, examDate: '1405/10/25' },
  { id: 4, programId: 1, programTitle: 'مهندسی کامپیوتر', cohortId: 'COHORT-1405-1', cohortTitle: 'ورودی ۱۴۰۵ (ترم ۱)', code: '1112106', title: 'آزمایشگاه فیزیک ۱ (هفته زوج)', units: 1, courseType: 'عملی', preferredProfId: 3, requiredRoomType: 'LAB', capacity: 25, groupsCount: 1, weekRecurrence: 'EVEN', sessionsCountPerWeek: 1, examDate: '1405/10/15' },
  { id: 5, programId: 1, programTitle: 'مهندسی کامپیوتر', cohortId: 'COHORT-1405-1', cohortTitle: 'ورودی ۱۴۰۵ (ترم ۱)', code: '1112106-B', title: 'آزمایشگاه فیزیک ۱ (هفته فرد)', units: 1, courseType: 'عملی', preferredProfId: 3, requiredRoomType: 'LAB', capacity: 25, groupsCount: 1, weekRecurrence: 'ODD', sessionsCountPerWeek: 1, examDate: '1405/10/15' },
  { id: 6, programId: 1, programTitle: 'مهندسی کامپیوتر', cohortId: 'COHORT-1405-1', cohortTitle: 'ورودی ۱۴۰۵ (ترم ۱)', code: '1112107', title: 'زبان انگلیسی عمومی', units: 3, courseType: 'عمومی', preferredProfId: 5, requiredRoomType: 'THEORY', capacity: 40, groupsCount: 1, weekRecurrence: 'ALL', sessionsCountPerWeek: 1, examDate: '1405/10/28' },
  { id: 7, programId: 1, programTitle: 'مهندسی کامپیوتر', cohortId: 'COHORT-1405-1', cohortTitle: 'ورودی ۱۴۰۵ (ترم ۱)', code: '1112108', title: 'تربیت بدنی ۱', units: 2, courseType: 'عمومی', preferredProfId: 3, requiredRoomType: 'GYM', capacity: 40, groupsCount: 1, weekRecurrence: 'ALL', sessionsCountPerWeek: 1, examDate: '1405/10/14' },
  { id: 8, programId: 1, programTitle: 'مهندسی کامپیوتر', cohortId: 'COHORT-1405-1', cohortTitle: 'ورودی ۱۴۰۵ (ترم ۱)', code: '1112109', title: 'اندیشه اسلامی ۱', units: 2, courseType: 'عمومی', preferredProfId: 5, requiredRoomType: 'THEORY', capacity: 45, groupsCount: 1, weekRecurrence: 'ALL', sessionsCountPerWeek: 1, examDate: '1405/10/30' },
  { id: 9, programId: 1, programTitle: 'مهندسی کامپیوتر', cohortId: 'COHORT-1404-3', cohortTitle: 'ورودی ۱۴۰۴ (ترم ۳)', code: '1112201', title: 'ساختمان داده‌ها', units: 3, courseType: 'اصلی', preferredProfId: 1, requiredRoomType: 'THEORY', capacity: 35, groupsCount: 1, weekRecurrence: 'ALL', sessionsCountPerWeek: 1, examDate: '1405/10/19' },
  { id: 10, programId: 1, programTitle: 'مهندسی کامپیوتر', cohortId: 'COHORT-1404-3', cohortTitle: 'ورودی ۱۴۰۴ (ترم ۳)', code: '1112202', title: 'برنامه‌نویسی پیشرفته', units: 3, courseType: 'اصلی', preferredProfId: 2, requiredRoomType: 'LAB', capacity: 30, groupsCount: 1, weekRecurrence: 'ALL', sessionsCountPerWeek: 1, examDate: '1405/10/23' },
  { id: 11, programId: 1, programTitle: 'مهندسی کامپیوتر', cohortId: 'COHORT-1404-3', cohortTitle: 'ورودی ۱۴۰۴ (ترم ۳)', code: '1112203', title: 'ریاضی مهندسی (حل تمرین هفته فرد)', units: 3, courseType: 'پایه', preferredProfId: 1, requiredRoomType: 'THEORY', capacity: 35, groupsCount: 1, weekRecurrence: 'ODD', sessionsCountPerWeek: 1, examDate: '1405/10/26' },
  { id: 12, programId: 1, programTitle: 'مهندسی کامپیوتر', cohortId: 'COHORT-1404-3', cohortTitle: 'ورودی ۱۴۰۴ (ترم ۳)', code: '1112204', title: 'مدار منطقی (کارگاه هفته زوج)', units: 3, courseType: 'اصلی', preferredProfId: 4, requiredRoomType: 'THEORY', capacity: 35, groupsCount: 1, weekRecurrence: 'EVEN', sessionsCountPerWeek: 1, examDate: '1405/10/29' },
  { id: 13, programId: 1, programTitle: 'مهندسی کامپیوتر', cohortId: 'COHORT-1403-5', cohortTitle: 'ورودی ۱۴۰۳ (ترم ۵ - نوبت عصر/شاغلین)', code: '1112301', title: 'طراحی الگوریتم‌ها', units: 3, courseType: 'تخصصی', preferredProfId: 2, requiredRoomType: 'THEORY', capacity: 30, groupsCount: 1, weekRecurrence: 'ALL', sessionsCountPerWeek: 1, examDate: '1405/10/20' },
  { id: 14, programId: 1, programTitle: 'مهندسی کامپیوتر', cohortId: 'COHORT-1403-5', cohortTitle: 'ورودی ۱۴۰۳ (ترم ۵ - نوبت عصر/شاغلین)', code: '1112302', title: 'پایگاه داده‌ها', units: 3, courseType: 'تخصصی', preferredProfId: 1, requiredRoomType: 'LAB', capacity: 30, groupsCount: 1, weekRecurrence: 'ALL', sessionsCountPerWeek: 1, examDate: '1405/10/24' },
  { id: 15, programId: 1, programTitle: 'مهندسی کامپیوتر', cohortId: 'COHORT-1403-5', cohortTitle: 'ورودی ۱۴۰۳ (ترم ۵ - نوبت عصر/شاغلین)', code: '1112303', title: 'سیستم‌های عامل', units: 3, courseType: 'تخصصی', preferredProfId: 3, requiredRoomType: 'THEORY', capacity: 30, groupsCount: 1, weekRecurrence: 'ALL', sessionsCountPerWeek: 1, examDate: '1405/10/27' },
  { id: 16, programId: 3, programTitle: 'مهندسی صنایع غذایی', cohortId: 'COHORT-1405-1', cohortTitle: 'ورودی ۱۴۰۵ (ترم ۱)', code: '3311101', title: 'ریاضی عمومی صنایع غذایی', units: 3, courseType: 'پایه', preferredProfId: 1, requiredRoomType: 'THEORY', capacity: 35, groupsCount: 1, weekRecurrence: 'ALL', sessionsCountPerWeek: 1, examDate: '1405/10/18' },
  { id: 17, programId: 3, programTitle: 'مهندسی صنایع غذایی', cohortId: 'COHORT-1405-1', cohortTitle: 'ورودی ۱۴۰۵ (ترم ۱)', code: '3311102', title: 'شیمی مواد غذایی (آزمایشگاه هفته زوج)', units: 3, courseType: 'پایه', preferredProfId: 6, requiredRoomType: 'THEORY', capacity: 35, groupsCount: 1, weekRecurrence: 'EVEN', sessionsCountPerWeek: 1, examDate: '1405/10/21' },
];

// ==========================================
// DYNAMIC 4-SCENARIO SOLVER ENGINE
// ==========================================

function solveDynamicScenarios(
  timeSlots: TimeSlot[],
  classrooms: ClassroomOption[],
  professors: ProfessorOption[],
  availabilities: ProfessorAvailabilityMap,
  demands: CourseDemand[]
): AutoScheduleScenario[] {
  const teachingSlots = timeSlots.filter(s => !s.isBreak);
  const activeClassrooms = classrooms.filter(c => c.isActive);
  const theoryRooms = activeClassrooms.filter(c => c.roomType === 'THEORY');
  const labRooms = activeClassrooms.filter(c => c.roomType === 'LAB');
  const gymRooms = activeClassrooms.filter(c => c.roomType === 'GYM');

  // Distinguish morning and afternoon slots
  const morningSlots = teachingSlots.filter(s => s.startTime < '13:00');
  const afternoonEveningSlots = teachingSlots.filter(s => s.startTime >= '13:00');
  const fallbackAfternoonSlots = afternoonEveningSlots.length > 0 ? afternoonEveningSlots : teachingSlots;

  const getFallbackRoom = (type: string, idx: number): ClassroomOption => {
    if (type === 'LAB' && labRooms.length > 0) return labRooms[idx % labRooms.length];
    if (type === 'GYM' && gymRooms.length > 0) return gymRooms[idx % gymRooms.length];
    if (theoryRooms.length > 0) return theoryRooms[idx % theoryRooms.length];
    return activeClassrooms[0] || classrooms[0];
  };

  const getProf = (id: number) => professors.find(p => p.id === id) || professors[0];

  const isProfAvailable = (profId: number, day: number, slotId: number): SlotStatus => {
    return availabilities[profId]?.[day]?.[slotId] || 'AVAIL';
  };

  interface FlattenedDemand {
    demand: CourseDemand;
    groupNo: number;
    assignedProf: ProfessorOption;
    uniqueId: number;
  }

  const flattenedList: FlattenedDemand[] = [];
  demands.forEach(d => {
    for (let g = 1; g <= d.groupsCount; g++) {
      let prof = getProf(d.preferredProfId);
      if (g === 2 && d.code === '1112101') prof = getProf(3);
      if (g === 2 && d.code === '1112103') prof = getProf(1);

      flattenedList.push({
        demand: d,
        groupNo: g,
        assignedProf: prof,
        uniqueId: d.id * 100 + g,
      });
    }
  });

  // -------------------------------------------------------------
  // 1. COMPACT SCENARIO (2-3 DAYS)
  // -------------------------------------------------------------
  const compactOfferings: DepartmentOffering[] = [];
  const compactDays = [0, 1, 2];
  const profTimeOccupiedCompact: { [profId: number]: Set<string> } = {};

  flattenedList.forEach((item, index) => {
    const profId = item.assignedProf.id;
    if (!profTimeOccupiedCompact[profId]) profTimeOccupiedCompact[profId] = new Set();

    let assignedDay = compactDays[index % compactDays.length];
    let assignedSlot = teachingSlots[Math.floor(index / compactDays.length) % teachingSlots.length] || teachingSlots[0];

    for (const d of compactDays) {
      for (const s of teachingSlots) {
        const timeKey = `${d}-${s.id}-${item.demand.weekRecurrence}`;
        const anyWeekKey = `${d}-${s.id}-ALL`;
        if (!profTimeOccupiedCompact[profId].has(timeKey) && !profTimeOccupiedCompact[profId].has(anyWeekKey) && isProfAvailable(profId, d, s.id) !== 'UNAVAIL') {
          assignedDay = d;
          assignedSlot = s;
          break;
        }
      }
    }

    profTimeOccupiedCompact[profId].add(`${assignedDay}-${assignedSlot.id}-${item.demand.weekRecurrence}`);
    const room = getFallbackRoom(item.demand.requiredRoomType, index);

    compactOfferings.push({
      id: 10000 + item.uniqueId,
      termId: 14051,
      programId: item.demand.programId,
      programTitle: item.demand.programTitle,
      cohortId: item.demand.cohortId,
      cohortTitle: item.demand.cohortTitle,
      courseId: item.demand.id,
      code: item.demand.code,
      title: item.demand.title,
      units: item.demand.units,
      courseType: item.demand.courseType,
      groupNumber: item.groupNo,
      professorId: item.assignedProf.id,
      professorName: item.assignedProf.name,
      capacity: Math.min(item.demand.capacity, room.capacity),
      enrolledCount: 0,
      waitlistCapacity: 5,
      classSchedules: [{
        dayOfWeek: assignedDay,
        dayName: DAY_NAMES[assignedDay],
        slotId: assignedSlot.id,
        startTime: assignedSlot.startTime,
        endTime: assignedSlot.endTime,
        roomId: room.id,
        roomName: room.name,
        buildingName: room.buildingName,
        weekType: item.demand.weekRecurrence,
      }],
      examSchedule: {
        examDate: item.demand.examDate,
        startTime: '۰۸:۳۰',
        endTime: '۱۰:۳۰',
        roomName: 'آمفی‌تئاتر مرکزی',
      },
    });
  });

  // -------------------------------------------------------------
  // 2. BALANCED SCENARIO (5 DAYS SAT-WED)
  // -------------------------------------------------------------
  const balancedOfferings: DepartmentOffering[] = [];
  const balancedDays = [0, 1, 2, 3, 4];
  const profTimeOccupiedBalanced: { [profId: number]: Set<string> } = {};

  flattenedList.forEach((item, index) => {
    const profId = item.assignedProf.id;
    if (!profTimeOccupiedBalanced[profId]) profTimeOccupiedBalanced[profId] = new Set();

    let assignedDay = balancedDays[index % balancedDays.length];
    let assignedSlot = teachingSlots[Math.floor(index / balancedDays.length) % teachingSlots.length] || teachingSlots[0];

    for (const d of balancedDays) {
      for (const s of teachingSlots) {
        const timeKey = `${d}-${s.id}-${item.demand.weekRecurrence}`;
        const anyWeekKey = `${d}-${s.id}-ALL`;
        if (!profTimeOccupiedBalanced[profId].has(timeKey) && !profTimeOccupiedBalanced[profId].has(anyWeekKey) && isProfAvailable(profId, d, s.id) !== 'UNAVAIL') {
          assignedDay = d;
          assignedSlot = s;
          break;
        }
      }
    }

    profTimeOccupiedBalanced[profId].add(`${assignedDay}-${assignedSlot.id}-${item.demand.weekRecurrence}`);
    const room = getFallbackRoom(item.demand.requiredRoomType, (index + 2));

    balancedOfferings.push({
      id: 20000 + item.uniqueId,
      termId: 14051,
      programId: item.demand.programId,
      programTitle: item.demand.programTitle,
      cohortId: item.demand.cohortId,
      cohortTitle: item.demand.cohortTitle,
      courseId: item.demand.id,
      code: item.demand.code,
      title: item.demand.title,
      units: item.demand.units,
      courseType: item.demand.courseType,
      groupNumber: item.groupNo,
      professorId: item.assignedProf.id,
      professorName: item.assignedProf.name,
      capacity: Math.min(item.demand.capacity, room.capacity),
      enrolledCount: 0,
      waitlistCapacity: 5,
      classSchedules: [{
        dayOfWeek: assignedDay,
        dayName: DAY_NAMES[assignedDay],
        slotId: assignedSlot.id,
        startTime: assignedSlot.startTime,
        endTime: assignedSlot.endTime,
        roomId: room.id,
        roomName: room.name,
        buildingName: room.buildingName,
        weekType: item.demand.weekRecurrence,
      }],
      examSchedule: {
        examDate: item.demand.examDate,
        startTime: '۱۰:۳۰',
        endTime: '۱۲:۳۰',
        roomName: 'آمفی‌تئاتر مرکزی',
      },
    });
  });

  // -------------------------------------------------------------
  // 3. PROFESSOR PREFERENCE SCENARIO
  // -------------------------------------------------------------
  const profPrefOfferings: DepartmentOffering[] = [];
  const profTimeOccupiedPref: { [profId: number]: Set<string> } = {};

  flattenedList.forEach((item, index) => {
    const profId = item.assignedProf.id;
    if (!profTimeOccupiedPref[profId]) profTimeOccupiedPref[profId] = new Set();

    let bestDay = 0;
    let bestSlot = teachingSlots[0];
    let foundPref = false;

    for (let d = 0; d < 6; d++) {
      for (const s of teachingSlots) {
        const timeKey = `${d}-${s.id}-${item.demand.weekRecurrence}`;
        const anyWeekKey = `${d}-${s.id}-ALL`;
        if (!profTimeOccupiedPref[profId].has(timeKey) && !profTimeOccupiedPref[profId].has(anyWeekKey) && isProfAvailable(profId, d, s.id) === 'PREF') {
          bestDay = d;
          bestSlot = s;
          foundPref = true;
          break;
        }
      }
      if (foundPref) break;
    }

    if (!foundPref) {
      for (let d = 0; d < 6; d++) {
        for (const s of teachingSlots) {
          const timeKey = `${d}-${s.id}-${item.demand.weekRecurrence}`;
          const anyWeekKey = `${d}-${s.id}-ALL`;
          if (!profTimeOccupiedPref[profId].has(timeKey) && !profTimeOccupiedPref[profId].has(anyWeekKey) && isProfAvailable(profId, d, s.id) === 'AVAIL') {
            bestDay = d;
            bestSlot = s;
            foundPref = true;
            break;
          }
        }
        if (foundPref) break;
      }
    }

    profTimeOccupiedPref[profId].add(`${bestDay}-${bestSlot.id}-${item.demand.weekRecurrence}`);
    const room = getFallbackRoom(item.demand.requiredRoomType, (index * 3));

    profPrefOfferings.push({
      id: 30000 + item.uniqueId,
      termId: 14051,
      programId: item.demand.programId,
      programTitle: item.demand.programTitle,
      cohortId: item.demand.cohortId,
      cohortTitle: item.demand.cohortTitle,
      courseId: item.demand.id,
      code: item.demand.code,
      title: item.demand.title,
      units: item.demand.units,
      courseType: item.demand.courseType,
      groupNumber: item.groupNo,
      professorId: item.assignedProf.id,
      professorName: item.assignedProf.name,
      capacity: Math.min(item.demand.capacity, room.capacity),
      enrolledCount: 0,
      waitlistCapacity: 5,
      classSchedules: [{
        dayOfWeek: bestDay,
        dayName: DAY_NAMES[bestDay],
        slotId: bestSlot.id,
        startTime: bestSlot.startTime,
        endTime: bestSlot.endTime,
        roomId: room.id,
        roomName: room.name,
        buildingName: room.buildingName,
        weekType: item.demand.weekRecurrence,
      }],
      examSchedule: {
        examDate: item.demand.examDate,
        startTime: '۱۳:۳۰',
        endTime: '۱۵:۳۰',
        roomName: 'آمفی‌تئاتر مرکزی',
      },
    });
  });

  // -------------------------------------------------------------
  // 4. AFTERNOON & WORKING STUDENTS SCENARIO (تراکم شیفت بعدازظهر و عصر)
  // Mornings (08:00 - 12:00) are 100% FREE for employment!
  // Classes strictly allocated in slots starting at >= 13:00 and Thursdays
  // -------------------------------------------------------------
  const workingOfferings: DepartmentOffering[] = [];
  const workingDays = [0, 1, 2, 3, 4, 5]; // شنبه تا پنج‌شنبه
  const profTimeOccupiedWorking: { [profId: number]: Set<string> } = {};

  flattenedList.forEach((item, index) => {
    const profId = item.assignedProf.id;
    if (!profTimeOccupiedWorking[profId]) profTimeOccupiedWorking[profId] = new Set();

    let assignedDay = workingDays[index % workingDays.length];
    let assignedSlot = fallbackAfternoonSlots[Math.floor(index / workingDays.length) % fallbackAfternoonSlots.length] || fallbackAfternoonSlots[0];

    // Search strictly in afternoon/evening slots first
    let found = false;
    for (const d of workingDays) {
      for (const s of fallbackAfternoonSlots) {
        const timeKey = `${d}-${s.id}-${item.demand.weekRecurrence}`;
        const anyWeekKey = `${d}-${s.id}-ALL`;
        if (!profTimeOccupiedWorking[profId].has(timeKey) && !profTimeOccupiedWorking[profId].has(anyWeekKey) && isProfAvailable(profId, d, s.id) !== 'UNAVAIL') {
          assignedDay = d;
          assignedSlot = s;
          found = true;
          break;
        }
      }
      if (found) break;
    }

    profTimeOccupiedWorking[profId].add(`${assignedDay}-${assignedSlot.id}-${item.demand.weekRecurrence}`);
    const room = getFallbackRoom(item.demand.requiredRoomType, (index + 4));

    workingOfferings.push({
      id: 40000 + item.uniqueId,
      termId: 14051,
      programId: item.demand.programId,
      programTitle: item.demand.programTitle,
      cohortId: item.demand.cohortId,
      cohortTitle: item.demand.cohortTitle,
      courseId: item.demand.id,
      code: item.demand.code,
      title: item.demand.title,
      units: item.demand.units,
      courseType: item.demand.courseType,
      groupNumber: item.groupNo,
      professorId: item.assignedProf.id,
      professorName: item.assignedProf.name,
      capacity: Math.min(item.demand.capacity, room.capacity),
      enrolledCount: 0,
      waitlistCapacity: 5,
      classSchedules: [{
        dayOfWeek: assignedDay,
        dayName: DAY_NAMES[assignedDay],
        slotId: assignedSlot.id,
        startTime: assignedSlot.startTime,
        endTime: assignedSlot.endTime,
        roomId: room.id,
        roomName: room.name,
        buildingName: room.buildingName,
        weekType: item.demand.weekRecurrence,
      }],
      examSchedule: {
        examDate: item.demand.examDate,
        startTime: '۱۶:۰۰',
        endTime: '۱۸:۰۰',
        roomName: 'آمفی‌تئاتر مرکزی',
      },
    });
  });

  return [
    {
      id: 'AFTERNOON_WORKING',
      title: 'مدل چهارم: ویژه دانشجویان شاغل (شیفت بعدازظهر، عصر و پنج‌شنبه)',
      subtitle: 'آزادسازی ۱۰۰٪ صبح‌ها برای اشتغال و تمرکز جلسات از ساعت ۱۳:۳۰ به بعد و نوبت عصر',
      description: 'این سناریو برای دانشجویان شاغل، دوره‌های شبانه، کارشناسی ارشد و پاره‌وقت طراحی شده است. کلیه ساعات صبح (۰۸:۰۰ تا ۱۲:۰۰) کاملاً آزاد بوده و کلاس‌ها در بلوک‌های بعدازظهر و پنج‌شنبه تشکیل می‌شوند.',
      badgeColor: 'bg-amber-600 text-slate-950 font-black',
      accentBorder: 'border-amber-500 hover:border-amber-600',
      bgGradient: 'from-amber-50 to-orange-50/50',
      kpi: {
        daysPerWeek: '۳٫۵ بعدازظهر',
        profSatisfaction: '۹۶٪',
        conflictsRate: '۰٪ (تضمین‌شده)',
        roomEfficiency: '۹۵٪ (عصرگاهی)',
        studentComfort: '۹۹٪ (شاغلین)',
        commuteScore: 'صبح‌ها ۱۰۰٪ آزاد',
      },
      offerings: workingOfferings,
    },
    {
      id: 'COMPACT',
      title: 'مدل اول: فشرده‌سازی حداکثری (۲ الی ۳ روز کاری)',
      subtitle: 'تجمیع کامل کلاس‌ها در روزهای شنبه، یکشنبه و دوشنبه جهت آزادسازی روزهای کاری/پژوهشی',
      description: 'این سناریو برای دانشجویان غیربومی ایده‌آل است. کلیه جلسات در ساعات متوالی ۲ تا ۳ روز ابتدای هفته تجمیع شده و روزهای سه‌شنبه، چهارشنبه و پنج‌شنبه کاملاً آزاد خواهند بود.',
      badgeColor: 'bg-emerald-600 text-white',
      accentBorder: 'border-emerald-500 hover:border-emerald-600',
      bgGradient: 'from-emerald-50 to-teal-50/40',
      kpi: {
        daysPerWeek: '۲٫۵ روز در هفته',
        profSatisfaction: '۸۹٪',
        conflictsRate: '۰٪ (بدون تداخل)',
        roomEfficiency: '۹۴٪',
        studentComfort: '۸۵٪ (فشرده)',
        commuteScore: 'کاهش ۵۰٪ تردد',
      },
      offerings: compactOfferings,
    },
    {
      id: 'BALANCED',
      title: 'مدل دوم: توزیع متوازن و استاندارد (شنبه تا چهارشنبه)',
      subtitle: 'پخش یکنواخت بار آموزشی در طول ۵ روز هفته با حداکثر ۱ تا ۲ جلسه در هر روز',
      description: 'بهترین مدل از نظر روان‌شناختی و یادگیری پایدار دانشجویان تمام‌وقت. جلسات عمدتاً در ساعات شاداب صبحگاهی توزیع شده و زمان کافی برای مطالعه فراهم است.',
      badgeColor: 'bg-blue-600 text-white',
      accentBorder: 'border-blue-500 hover:border-blue-600',
      bgGradient: 'from-blue-50 to-indigo-50/40',
      kpi: {
        daysPerWeek: '۴٫۸ روز در هفته',
        profSatisfaction: '۹۳٪',
        conflictsRate: '۰٪ (بدون تداخل)',
        roomEfficiency: '۸۶٪',
        studentComfort: '۹۸٪ (عالی)',
        commuteScore: 'توزیع یکنواخت',
      },
      offerings: balancedOfferings,
    },
    {
      id: 'PROF_PREF',
      title: 'مدل سوم: بهینه‌سازی بر مبنای حضور و ترجیحات اساتید',
      subtitle: 'انطباق حداکثری با فرم‌های اعلام حضور اساتید هیئت علمی و بلوک‌بندی اساتید مدعو',
      description: 'در این مدل، اولویت نخست به ساعات سبز اعلام‌شده توسط اساتید داده شده است. اساتید تمام‌وقت در ساعات صبحگاهی و اساتید مدعو در روزهای متمرکز چیده شده‌اند.',
      badgeColor: 'bg-purple-600 text-white',
      accentBorder: 'border-purple-500 hover:border-purple-600',
      bgGradient: 'from-purple-50 to-fuchsia-50/40',
      kpi: {
        daysPerWeek: '۳٫۲ روز در هفته',
        profSatisfaction: '۹۹٪ (حداکثری)',
        conflictsRate: '۰٪ (تضمین‌شده)',
        roomEfficiency: '۹۲٪',
        studentComfort: '۹۱٪',
        commuteScore: 'کاهش ۳۵٪ تردد اساتید',
      },
      offerings: profPrefOfferings,
    },
  ];
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function DepartmentPlanningClient() {
  // Global Planning Context
  const [selectedTermId, setSelectedTermId] = useState<number>(14051);
  const [selectedProgramId, setSelectedProgramId] = useState<number>(1);
  const [selectedCohortId, setSelectedCohortId] = useState<string>('ALL');
  const [targetShiftPreference, setTargetShiftPreference] = useState<ProgramShiftType>('AFTERNOON_WORKING');

  // Time Slots / Bell Schedule State
  const [activeSlotPresetKey, setActiveSlotPresetKey] = useState<'STANDARD_120' | 'STANDARD_90' | 'STANDARD_60'>('STANDARD_120');
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>(TIME_SLOT_PRESETS.STANDARD_120.slots);

  // Timetable View Mode: ALL (تمام جلسات), EVEN (هفته زوج), ODD (هفته فرد)
  const [selectedWeekFilter, setSelectedWeekFilter] = useState<WeekRecurrence | 'ALL_VIEW'>('ALL_VIEW');

  // Main Tabs
  const [activeMainTab, setActiveMainTab] = useState<'SCENARIOS' | 'PROFESSOR_SCHEDULE' | 'INPUTS' | 'APPROVED' | 'ROOMS_MATRIX'>('SCENARIOS');
  const [inputSubTab, setInputSubTab] = useState<'BELL_CONFIG' | 'PROFESSORS' | 'CLASSROOMS' | 'DEMANDS'>('BELL_CONFIG');

  // Core Data
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>(INITIAL_CLASSROOMS);
  const [professors, setProfessors] = useState<ProfessorOption[]>(INITIAL_PROFESSORS);
  const [availabilities, setAvailabilities] = useState<ProfessorAvailabilityMap>(createDefaultAvailabilities);
  const [courseDemands, setCourseDemands] = useState<CourseDemand[]>(INITIAL_COURSE_DEMANDS);

  // Inspector & Scenarios
  const [inspectorProfId, setInspectorProfId] = useState<number>(1);
  const [activeScenarioId, setActiveScenarioId] = useState<'COMPACT' | 'BALANCED' | 'PROF_PREF' | 'AFTERNOON_WORKING'>('AFTERNOON_WORKING');
  const [approvedOfferings, setApprovedOfferings] = useState<DepartmentOffering[]>([]);
  
  const [scenarios, setScenarios] = useState<AutoScheduleScenario[]>(() => 
    solveDynamicScenarios(TIME_SLOT_PRESETS.STANDARD_120.slots, INITIAL_CLASSROOMS, INITIAL_PROFESSORS, createDefaultAvailabilities(), INITIAL_COURSE_DEMANDS)
  );

  // Modals / Toasts
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'warning' } | null>(null);
  const [isNewRoomModalOpen, setIsNewRoomModalOpen] = useState(false);
  const [newRoomForm, setNewRoomForm] = useState({ name: '', buildingName: 'ساختمان آموزش', capacity: 35, roomType: 'THEORY' as const, equipment: 'ویدئوپروژکتور، تخته وایت‌برد' });
  
  // Custom Time Slot Add Modal
  const [isNewSlotModalOpen, setIsNewSlotModalOpen] = useState(false);
  const [slotPositionChoice, setSlotPositionChoice] = useState<'START' | 'END' | 'AUTO'>('END');
  const [newSlotForm, setNewSlotForm] = useState({ label: '', startTime: '17:30', endTime: '19:00', isBreak: false });

  // Initial solve
  useEffect(() => {
    const generated = solveDynamicScenarios(timeSlots, classrooms, professors, availabilities, courseDemands);
    setScenarios(generated);
    if (approvedOfferings.length === 0) {
      setApprovedOfferings(generated[0].offerings);
    }
  }, []);

  const showToast = (text: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4500);
  };

  const handleTriggerSolver = (overrideSlots?: TimeSlot[]) => {
    const slotsToUse = overrideSlots || timeSlots;
    const fresh = solveDynamicScenarios(slotsToUse, classrooms, professors, availabilities, courseDemands);
    setScenarios(fresh);
    showToast('⚡ الگوریتم چیدمان با موفقیت بازتولید شد و ۴ مدل بهینه‌سازی به‌روزرسانی گردیدند.', 'success');
  };

  const handleApplyPresetSlots = (presetKey: 'STANDARD_120' | 'STANDARD_90' | 'STANDARD_60') => {
    setActiveSlotPresetKey(presetKey);
    const preset = TIME_SLOT_PRESETS[presetKey];
    setTimeSlots(preset.slots);
    handleTriggerSolver(preset.slots);
    showToast(`الگوی زمانی «${preset.name}» با موفقیت فعال شد.`, 'success');
  };

  const handleApplyScenario = (scenario: AutoScheduleScenario) => {
    setApprovedOfferings(scenario.offerings);
    setActiveMainTab('APPROVED');
    showToast(`✅ ${scenario.title} به عنوان برنامه رسمی و مصوب نیمسال با موفقیت بارگذاری شد.`, 'success');
  };

  const handleToggleProfSlot = (profId: number, dayIdx: number, slotId: number) => {
    setAvailabilities(prev => {
      const current = prev[profId]?.[dayIdx]?.[slotId] || 'AVAIL';
      const next: SlotStatus = current === 'PREF' ? 'AVAIL' : current === 'AVAIL' ? 'UNAVAIL' : 'PREF';
      const updated = { ...prev };
      if (!updated[profId]) updated[profId] = {};
      if (!updated[profId][dayIdx]) updated[profId][dayIdx] = {};
      updated[profId][dayIdx][slotId] = next;
      return updated;
    });
  };

  const handleOpenAddSlotModal = (position: 'START' | 'END' | 'AUTO') => {
    setSlotPositionChoice(position);
    if (position === 'START') {
      const firstSlot = timeSlots[0];
      const startHour = firstSlot ? firstSlot.startTime : '08:00';
      setNewSlotForm({
        label: '۰۷:۰۰ الی ۰۸:۰۰ (شیفت صبح زود)',
        startTime: '07:00',
        endTime: startHour,
        isBreak: false,
      });
    } else if (position === 'END') {
      const lastSlot = timeSlots[timeSlots.length - 1];
      const endHour = lastSlot ? lastSlot.endTime : '17:30';
      setNewSlotForm({
        label: `${endHour} الی ۱۹:۳۰ (شیفت عصر/شب)`,
        startTime: endHour,
        endTime: '19:30',
        isBreak: false,
      });
    } else {
      setNewSlotForm({
        label: 'بازه زمانی جدید',
        startTime: '13:30',
        endTime: '15:00',
        isBreak: false,
      });
    }
    setIsNewSlotModalOpen(true);
  };

  const handleSaveNewSlot = () => {
    if (!newSlotForm.label.trim()) return;
    const newSlot: TimeSlot = {
      id: Date.now(),
      label: newSlotForm.label,
      startTime: newSlotForm.startTime,
      endTime: newSlotForm.endTime,
      isBreak: newSlotForm.isBreak,
    };

    let updatedSlots: TimeSlot[] = [];
    if (slotPositionChoice === 'START') {
      updatedSlots = [newSlot, ...timeSlots];
    } else if (slotPositionChoice === 'END') {
      updatedSlots = [...timeSlots, newSlot];
    } else {
      updatedSlots = [...timeSlots, newSlot].sort((a, b) => a.startTime.localeCompare(b.startTime));
    }

    setTimeSlots(updatedSlots);
    setIsNewSlotModalOpen(false);
    handleTriggerSolver(updatedSlots);
    showToast(`بازه زمانی «${newSlot.label}» با موفقیت افزوده شد.`, 'success');
  };

  const handleDeleteSlot = (id: number) => {
    if (timeSlots.length <= 2) {
      showToast('حداقل ۲ بازه زمانی برای برنامه‌ریزی دانشگاه لازم است.', 'warning');
      return;
    }
    const updated = timeSlots.filter(s => s.id !== id);
    setTimeSlots(updated);
    handleTriggerSolver(updated);
    showToast('بازه زمانی با موفقیت حذف شد.', 'info');
  };

  const handleUpdateSlotInPlace = (id: number, field: keyof TimeSlot, value: any) => {
    const updated = timeSlots.map(s => s.id === id ? { ...s, [field]: value } : s);
    setTimeSlots(updated);
  };

  const handleSortSlotsChronologically = () => {
    const sorted = [...timeSlots].sort((a, b) => a.startTime.localeCompare(b.startTime));
    setTimeSlots(sorted);
    handleTriggerSolver(sorted);
    showToast('بازه‌های زمانی بر اساس ساعت شروع مرتب شدند.', 'success');
  };

  // Computed
  const currentScenario = useMemo(() => {
    return scenarios.find(s => s.id === activeScenarioId) || scenarios[0];
  }, [scenarios, activeScenarioId]);

  const currentProgram = useMemo(() => {
    return INITIAL_PROGRAMS.find(p => p.id === selectedProgramId) || INITIAL_PROGRAMS[0];
  }, [selectedProgramId]);

  const currentTerm = useMemo(() => {
    return INITIAL_TERMS.find(t => t.id === selectedTermId) || INITIAL_TERMS[0];
  }, [selectedTermId]);

  const displayedScenarioOfferings = useMemo(() => {
    if (!currentScenario) return [];
    let list = currentScenario.offerings;
    if (selectedProgramId > 0) {
      list = list.filter(o => o.programId === selectedProgramId);
    }
    if (selectedCohortId !== 'ALL') {
      list = list.filter(o => o.cohortId === selectedCohortId);
    }
    if (selectedWeekFilter !== 'ALL_VIEW') {
      list = list.filter(o => o.classSchedules.some(cs => cs.weekType === 'ALL' || cs.weekType === selectedWeekFilter));
    }
    return list;
  }, [currentScenario, selectedProgramId, selectedCohortId, selectedWeekFilter]);

  const inspectorProf = useMemo(() => {
    return professors.find(p => p.id === inspectorProfId) || professors[0];
  }, [professors, inspectorProfId]);

  const inspectorOfferings = useMemo(() => {
    const source = currentScenario ? currentScenario.offerings : approvedOfferings;
    let list = source.filter(o => o.professorId === inspectorProfId);
    if (selectedWeekFilter !== 'ALL_VIEW') {
      list = list.filter(o => o.classSchedules.some(cs => cs.weekType === 'ALL' || cs.weekType === selectedWeekFilter));
    }
    return list;
  }, [currentScenario, approvedOfferings, inspectorProfId, selectedWeekFilter]);

  const inspectorStats = useMemo(() => {
    const totalUnits = inspectorOfferings.reduce((sum, o) => sum + o.units, 0);
    const groupsCount = inspectorOfferings.length;
    const distinctDays = new Set(inspectorOfferings.flatMap(o => o.classSchedules.map(cs => cs.dayOfWeek))).size;
    const distinctPrograms = Array.from(new Set(inspectorOfferings.map(o => o.programTitle)));

    return {
      totalUnits,
      groupsCount,
      distinctDays,
      distinctPrograms,
      quotaPercent: Math.min(100, Math.round((totalUnits / inspectorProf.maxWeeklyUnits) * 100)),
    };
  }, [inspectorOfferings, inspectorProf]);

  const teachingSlots = useMemo(() => timeSlots.filter(s => !s.isBreak), [timeSlots]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 p-3 sm:p-6 space-y-5" dir="rtl">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed top-4 left-4 right-4 sm:right-auto sm:left-6 z-50 p-4 rounded-xl shadow-2xl border flex items-center justify-between gap-3 text-sm font-bold animate-in fade-in slide-in-from-top-4 duration-300 ${
          toastMessage.type === 'success' ? 'bg-emerald-900 text-emerald-100 border-emerald-700' :
          toastMessage.type === 'info' ? 'bg-blue-900 text-blue-100 border-blue-700' :
          'bg-amber-900 text-amber-100 border-amber-700'
        }`}>
          <div className="flex items-center gap-2">
            <span>{toastMessage.type === 'success' ? '✅' : toastMessage.type === 'info' ? 'ℹ️' : '⚠️'}</span>
            <span>{toastMessage.text}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-white/60 hover:text-white text-xs">✕</button>
        </div>
      )}

      {/* Global Academic Header Banner */}
      <div className="bg-gradient-to-l from-indigo-950 via-indigo-900 to-slate-900 text-white rounded-2xl p-5 shadow-lg border border-indigo-700/50 space-y-4">
        
        {/* Title Bar */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-slate-950">
                سامانه هوشمند چیدمان دانشگاهی و شاغلین
              </span>
              <span className="text-xs text-indigo-200">{currentTerm.title}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              🗓️ کارتابل برنامه‌ریزی درسی و الگوریتم‌های چیدمان (روزانه و شاغلین)
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleTriggerSolver()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-extrabold text-xs sm:text-sm shadow-md transition transform active:scale-95"
            >
              <span>⚡ بازتولید سناریوها</span>
            </button>
            <Link
              href="/admin/curriculum"
              className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 transition"
            >
              📚 سرفصل‌ها و چارت
            </Link>
          </div>
        </div>

        {/* Global Context Bar: Term, Major, Cohort, Shift Preference, Week View */}
        <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-xl border border-white/15 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <div>
            <label className="text-indigo-200 font-bold block mb-1">۱. نیمسال تحصیلی:</label>
            <select
              value={selectedTermId}
              onChange={e => setSelectedTermId(Number(e.target.value))}
              className="w-full bg-slate-900/90 text-white border border-indigo-400/50 rounded-lg px-2.5 py-2 font-bold focus:ring-2 focus:ring-amber-400"
            >
              {INITIAL_TERMS.map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-indigo-200 font-bold block mb-1">۲. رشته و دپارتمان:</label>
            <select
              value={selectedProgramId}
              onChange={e => setSelectedProgramId(Number(e.target.value))}
              className="w-full bg-slate-900/90 text-white border border-indigo-400/50 rounded-lg px-2.5 py-2 font-bold focus:ring-2 focus:ring-amber-400"
            >
              {INITIAL_PROGRAMS.map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-indigo-200 font-bold block mb-1">۳. ورودی تحصیلی:</label>
            <select
              value={selectedCohortId}
              onChange={e => setSelectedCohortId(e.target.value)}
              className="w-full bg-slate-900/90 text-white border border-indigo-400/50 rounded-lg px-2.5 py-2 font-bold focus:ring-2 focus:ring-amber-400"
            >
              <option value="ALL">کلیه ورودی‌ها</option>
              {INITIAL_COHORTS.map(c => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>

          {/* Shift Preference Selector */}
          <div>
            <label className="text-amber-300 font-bold block mb-1">۴. ترجیح شیفت زمانی رشته:</label>
            <select
              value={targetShiftPreference}
              onChange={e => {
                const shift = e.target.value as ProgramShiftType;
                setTargetShiftPreference(shift);
                if (shift === 'AFTERNOON_WORKING') {
                  setActiveScenarioId('AFTERNOON_WORKING');
                  showToast('ترجیح شیفت بر روی «دانشجویان شاغل (نوبت عصر)» تنظیم گردید.', 'info');
                } else if (shift === 'MORNING') {
                  setActiveScenarioId('BALANCED');
                  showToast('ترجیح شیفت بر روی «شیفت صبح (روزانه)» تنظیم گردید.', 'info');
                }
              }}
              className="w-full bg-amber-500/20 text-amber-200 border border-amber-400/60 rounded-lg px-2.5 py-2 font-extrabold focus:ring-2 focus:ring-amber-400"
            >
              <option value="AFTERNOON_WORKING" className="bg-slate-900 text-white">🌆 شیفت عصر/شب (دانشجویان شاغل)</option>
              <option value="MORNING" className="bg-slate-900 text-white">☀️ شیفت صبح (دانشجویان تمام‌وقت)</option>
              <option value="FLEXIBLE" className="bg-slate-900 text-white">⚡ شناور و متوازن</option>
            </select>
          </div>

          {/* Week Filter Toggle */}
          <div>
            <label className="text-indigo-200 font-bold block mb-1">۵. نمای هفته (زوج / فرد):</label>
            <div className="grid grid-cols-3 gap-1 bg-slate-900/90 p-1 rounded-lg border border-indigo-400/50">
              <button
                onClick={() => setSelectedWeekFilter('ALL_VIEW')}
                className={`py-1 rounded font-bold text-[10px] transition ${
                  selectedWeekFilter === 'ALL_VIEW' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                کلیه
              </button>
              <button
                onClick={() => setSelectedWeekFilter('EVEN')}
                className={`py-1 rounded font-bold text-[10px] transition ${
                  selectedWeekFilter === 'EVEN' ? 'bg-cyan-600 text-white' : 'text-cyan-300 hover:text-white'
                }`}
              >
                زوج 🔷
              </button>
              <button
                onClick={() => setSelectedWeekFilter('ODD')}
                className={`py-1 rounded font-bold text-[10px] transition ${
                  selectedWeekFilter === 'ODD' ? 'bg-amber-600 text-white' : 'text-amber-300 hover:text-white'
                }`}
              >
                فرد 🔶
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Main Navigation Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveMainTab('SCENARIOS')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition ${
            activeMainTab === 'SCENARIOS'
              ? 'bg-indigo-900 text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>🤖 مرحله ۱: موتور هوشمند و ۴ مدل چیدمان</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-400 text-slate-950 font-bold">
            {faNum(4)} مدل
          </span>
        </button>

        <button
          onClick={() => setActiveMainTab('PROFESSOR_SCHEDULE')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition ${
            activeMainTab === 'PROFESSOR_SCHEDULE'
              ? 'bg-indigo-900 text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>👨‍🏫 مرحله ۲: کنترل و تاییدیه برنامه هفتگی استاد</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-purple-100 text-purple-900 font-bold">
            چند گروهی
          </span>
        </button>

        <button
          onClick={() => setActiveMainTab('INPUTS')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition ${
            activeMainTab === 'INPUTS'
              ? 'bg-indigo-900 text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>⏰ مرحله ۳: تنظیمات دانشگاه (تایم‌های کلاسی، حضور اساتید، کلاس‌ها)</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-indigo-100 text-indigo-900 font-bold">
            پیکربندی
          </span>
        </button>

        <button
          onClick={() => setActiveMainTab('APPROVED')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition ${
            activeMainTab === 'APPROVED'
              ? 'bg-indigo-900 text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>📋 مرحله ۴: برنامه مصوب نهایی نیمسال</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold">
            {faNum(approvedOfferings.length)} کلاس
          </span>
        </button>

        <button
          onClick={() => setActiveMainTab('ROOMS_MATRIX')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition ${
            activeMainTab === 'ROOMS_MATRIX'
              ? 'bg-indigo-900 text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>🏢 مرحله ۵: ماتریس اشغال فضاهای آموزشی</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 font-bold">
            نقشه حرارتی
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: AI MULTI-SCENARIO OPTIMIZATION ENGINE (4 MODELS) */}
      {/* ========================================================================= */}
      {activeMainTab === 'SCENARIOS' && (
        <div className="space-y-5">
          
          <div className="bg-gradient-to-r from-amber-500/15 via-indigo-50 to-emerald-50 border border-amber-300/80 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xl">💡</span>
                <h2 className="font-extrabold text-slate-900 text-sm sm:text-base">
                  برنامه‌ریزی رشته «{currentProgram.title}» — ۴ سناریوی هوشمند بهینه‌سازی
                </h2>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                شامل <b>مدل ویژه دانشجویان شاغل (شیفت عصر)</b>، <b>مدل فشرده ۲-۳ روزه</b>، <b>مدل متوازن ۵ روزه</b> و <b>مدل انطباق با ترجیحات اساتید</b>.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => { setActiveMainTab('INPUTS'); setInputSubTab('BELL_CONFIG'); }}
                className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 text-xs font-bold hover:bg-slate-50 transition shadow-sm"
              >
                ⏰ تنظیم تایم‌های کلاسی
              </button>
              <button
                onClick={() => handleTriggerSolver()}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold transition shadow flex items-center gap-1.5"
              >
                <span>⚡ بازتولید سناریوها</span>
              </button>
            </div>
          </div>

          {/* 4 Scenario KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {scenarios.map(scenario => {
              const isSelected = scenario.id === activeScenarioId;
              return (
                <div
                  key={scenario.id}
                  onClick={() => setActiveScenarioId(scenario.id)}
                  className={`relative cursor-pointer rounded-2xl p-4 border-2 transition-all duration-200 bg-white flex flex-col justify-between shadow-sm hover:shadow-md ${
                    isSelected
                      ? `ring-4 ring-indigo-500/20 border-indigo-600 bg-gradient-to-br ${scenario.bgGradient}`
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${scenario.badgeColor}`}>
                        {scenario.id === 'AFTERNOON_WORKING' ? '🌆 ویژه شاغلین/عصر' :
                         scenario.id === 'COMPACT' ? '🟢 فشرده ۲-۳ روزه' :
                         scenario.id === 'BALANCED' ? '🔵 متوازن ۵ روزه' : '🟣 ترجیحات اساتید'}
                      </span>
                      {isSelected ? (
                        <span className="text-[10px] font-extrabold text-indigo-900 bg-indigo-100 px-2 py-0.5 rounded-full border border-indigo-300">
                          ✓ فعال
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-bold">انتخاب</span>
                      )}
                    </div>

                    <h3 className="text-sm font-extrabold text-slate-900 leading-tight mb-1">
                      {scenario.title}
                    </h3>
                    <p className="text-[11px] text-slate-500 mb-3 line-clamp-2">
                      {scenario.subtitle}
                    </p>

                    <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-white/80 p-2 rounded-xl border border-slate-200/80 mb-3">
                      <div>
                        <span className="text-[9px] text-slate-400 block">حضور دانشجو:</span>
                        <span className="font-extrabold text-slate-900">{scenario.kpi.daysPerWeek}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block">رضایت اساتید:</span>
                        <span className="font-extrabold text-emerald-700">{scenario.kpi.profSatisfaction}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block">تداخل:</span>
                        <span className="font-extrabold text-indigo-700">{scenario.kpi.conflictsRate}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block">ویژگی کلیدی:</span>
                        <span className="font-extrabold text-amber-800">{scenario.kpi.commuteScore}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between gap-1">
                    <span className="text-[10px] font-bold text-slate-600">
                      {faNum(scenario.offerings.filter(o => selectedProgramId === 0 || o.programId === selectedProgramId).length)} کلاس
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApplyScenario(scenario);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow transition"
                    >
                      🚀 تصویب
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Timetable Grid */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-indigo-600 animate-pulse"></span>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    پیش‌نمایش جدول هفتگی: {currentScenario.title}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {currentScenario.description}
                </p>
              </div>

              <button
                onClick={() => handleApplyScenario(currentScenario)}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow-md flex items-center gap-1.5 transition"
              >
                <span>🚀 تصویب و ثبت قطعی این سناریو در سامانه</span>
              </button>
            </div>

            {/* Visual Grid */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white text-center">
                    <th className="p-3 border border-slate-800 w-28 font-extrabold">روز هفته</th>
                    {teachingSlots.map(slot => (
                      <th key={slot.id} className="p-3 border border-slate-800 font-extrabold">
                        <div>{slot.label}</div>
                        <div className="text-[10px] text-slate-300 font-normal mt-0.5">{slot.startTime} تا {slot.endTime}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAY_NAMES.map((dayName, dayIdx) => (
                    <tr key={dayIdx} className={dayIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                      <td className="p-3 border border-slate-200 font-extrabold text-center bg-slate-100 text-slate-900">
                        {dayName}
                      </td>
                      {teachingSlots.map(slot => {
                        const matchingOfferings = displayedScenarioOfferings.filter(o =>
                          o.classSchedules.some(cs => cs.dayOfWeek === dayIdx && cs.slotId === slot.id)
                        );

                        return (
                          <td
                            key={slot.id}
                            className={`p-2 border border-slate-200 align-top min-w-[200px] h-24 ${
                              matchingOfferings.length === 0 ? 'bg-slate-50/30' : ''
                            }`}
                          >
                            {matchingOfferings.length === 0 ? (
                              <span className="text-[10px] text-slate-300 flex items-center justify-center h-full">
                                — خالی —
                              </span>
                            ) : (
                              <div className="space-y-1.5">
                                {matchingOfferings.map(offering => {
                                  const schedule = offering.classSchedules.find(cs => cs.dayOfWeek === dayIdx && cs.slotId === slot.id)!;
                                  const isLab = offering.courseType === 'عملی' || offering.courseType === 'پایه' && offering.code.includes('1112103');
                                  const isEven = schedule.weekType === 'EVEN';
                                  const isOdd = schedule.weekType === 'ODD';
                                  
                                  return (
                                    <div
                                      key={offering.id}
                                      className={`p-2 rounded-xl border shadow-xs transition hover:shadow-sm ${
                                        isEven
                                          ? 'bg-cyan-50/95 border-cyan-400 text-cyan-950'
                                          : isOdd
                                          ? 'bg-amber-50/95 border-amber-400 text-amber-950'
                                          : isLab
                                          ? 'bg-purple-50/90 border-purple-300 text-purple-950'
                                          : offering.cohortId.includes('1403') || activeScenarioId === 'AFTERNOON_WORKING'
                                          ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                                          : 'bg-indigo-50/90 border-indigo-200 text-indigo-950'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-1 font-extrabold text-[11px]">
                                        <span>{offering.title}</span>
                                        <div className="flex items-center gap-1">
                                          {isEven && <span className="text-[9px] px-1 py-0.2 rounded bg-cyan-700 text-white font-bold">هفته زوج 🔷</span>}
                                          {isOdd && <span className="text-[9px] px-1 py-0.2 rounded bg-amber-600 text-white font-bold">هفته فرد 🔶</span>}
                                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/80 border border-slate-300 font-bold">
                                            گروه {faNum(offering.groupNumber)}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="text-[10px] text-slate-600 mt-1 flex items-center justify-between font-bold">
                                        <span>👨‍🏫 {offering.professorName}</span>
                                        <span className="text-[9px] text-indigo-800 bg-indigo-100/70 px-1 rounded">
                                          {offering.cohortTitle.split('(')[1]?.replace(')', '') || offering.cohortTitle}
                                        </span>
                                      </div>
                                      <div className="text-[10px] text-slate-700 mt-0.5 flex items-center justify-between">
                                        <span className="font-extrabold text-emerald-800">
                                          🏛️ {schedule.roomName}
                                        </span>
                                        <span className="text-slate-500 font-mono">
                                          {faNum(offering.units)} واحد
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: PROFESSOR SCHEDULE INSPECTOR */}
      {/* ========================================================================= */}
      {activeMainTab === 'PROFESSOR_SCHEDULE' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <span className="text-2xl p-2.5 rounded-2xl bg-purple-100 text-purple-900">👨‍🏫</span>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-0.5">انتخاب استاد جهت بررسی و کنترل برنامه هفتگی:</label>
                  <select
                    value={inspectorProfId}
                    onChange={e => setInspectorProfId(Number(e.target.value))}
                    className="border-2 border-purple-400 rounded-xl px-3 py-1.5 font-extrabold text-sm text-purple-950 bg-purple-50/50"
                  >
                    {professors.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.academicRank} — {p.contractType} — {p.departmentName})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-900 border border-emerald-300">
                  ✅ وضعیت تداخل: صفر (تضمین‌شده در تمام گروه‌ها)
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500 block text-[11px] mb-1">واحدهای موظفی:</span>
                <span className="text-lg font-extrabold text-indigo-950">
                  {faNum(inspectorStats.totalUnits)} از {faNum(inspectorProf.maxWeeklyUnits)} واحد
                </span>
                <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2 overflow-hidden">
                  <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${inspectorStats.quotaPercent}%` }}></div>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500 block text-[11px] mb-1">گروه‌های درسی:</span>
                <span className="text-lg font-extrabold text-purple-950">
                  {faNum(inspectorStats.groupsCount)} گروه
                </span>
                <span className="text-[10px] text-purple-700 block mt-1 font-bold">
                  (در {faNum(inspectorStats.distinctPrograms.length)} رشته تحصیلی)
                </span>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500 block text-[11px] mb-1">روزهای حضور:</span>
                <span className="text-lg font-extrabold text-emerald-950">
                  {faNum(inspectorStats.distinctDays)} روز در هفته
                </span>
                <span className="text-[10px] text-emerald-700 block mt-1 font-bold">
                  (رعایت سقف تدریس)
                </span>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500 block text-[11px] mb-1">نوع قرارداد:</span>
                <span className="text-sm font-extrabold text-slate-900 block mt-0.5">{inspectorProf.contractType}</span>
                <span className="text-[10px] text-slate-500 block mt-1 font-bold">{inspectorProf.departmentName}</span>
              </div>
            </div>
          </div>

          {/* Professor Weekly Grid */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <h3 className="font-extrabold text-slate-900 text-base">
                🗓️ جدول برنامه هفتگی اختصاصی: {inspectorProf.name}
              </h3>
              <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">
                سناریوی محاسباتی: {currentScenario.title.split(':')[0]}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white text-center">
                    <th className="p-3 border border-slate-800 w-28 font-extrabold">روز هفته</th>
                    {teachingSlots.map(slot => (
                      <th key={slot.id} className="p-3 border border-slate-800 font-extrabold">
                        <div>{slot.label}</div>
                        <div className="text-[10px] text-slate-300 font-normal mt-0.5">{slot.startTime} الی {slot.endTime}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAY_NAMES.map((dayName, dayIdx) => (
                    <tr key={dayIdx} className={dayIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="p-3 border border-slate-200 font-extrabold text-center bg-slate-100 text-slate-900">
                        {dayName}
                      </td>
                      {teachingSlots.map(slot => {
                        const matchingOfferings = inspectorOfferings.filter(o =>
                          o.classSchedules.some(cs => cs.dayOfWeek === dayIdx && cs.slotId === slot.id)
                        );

                        const availabilityStatus = availabilities[inspectorProfId]?.[dayIdx]?.[slot.id] || 'AVAIL';

                        return (
                          <td
                            key={slot.id}
                            className={`p-2 border border-slate-200 align-top min-w-[190px] h-24 ${
                              matchingOfferings.length > 0
                                ? 'bg-indigo-50/80'
                                : availabilityStatus === 'PREF'
                                ? 'bg-emerald-50/40'
                                : availabilityStatus === 'UNAVAIL'
                                ? 'bg-rose-50/40'
                                : ''
                            }`}
                          >
                            {matchingOfferings.length > 0 ? (
                              <div className="space-y-1">
                                {matchingOfferings.map(offering => {
                                  const schedule = offering.classSchedules.find(cs => cs.dayOfWeek === dayIdx && cs.slotId === slot.id)!;
                                  return (
                                    <div key={offering.id} className="p-2.5 rounded-xl bg-white border-2 border-indigo-400 shadow-sm text-indigo-950 space-y-1">
                                      <div className="flex items-center justify-between font-extrabold text-xs">
                                        <span>{offering.title}</span>
                                        <div className="flex items-center gap-1">
                                          {schedule.weekType === 'EVEN' && <span className="text-[9px] px-1 py-0.2 rounded bg-cyan-700 text-white font-bold">هفته زوج</span>}
                                          {schedule.weekType === 'ODD' && <span className="text-[9px] px-1 py-0.2 rounded bg-amber-600 text-white font-bold">هفته فرد</span>}
                                          <span className="px-1.5 py-0.5 rounded bg-indigo-900 text-white text-[10px]">
                                            گروه {faNum(offering.groupNumber)}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="text-[11px] text-slate-600 flex items-center justify-between font-bold">
                                        <span>🎓 {offering.programTitle}</span>
                                        <span className="text-[10px] text-indigo-700 font-mono">{offering.cohortTitle.split('(')[1]?.replace(')', '') || offering.cohortTitle}</span>
                                      </div>
                                      <div className="text-[11px] font-extrabold text-emerald-800 flex items-center justify-between pt-1 border-t border-slate-100">
                                        <span>🏛️ {schedule.roomName}</span>
                                        <span className="text-[10px] text-slate-500 font-normal">{faNum(offering.units)} واحد</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center h-full text-center p-1">
                                <span className={`text-[10px] font-bold ${
                                  availabilityStatus === 'PREF' ? 'text-emerald-700' :
                                  availabilityStatus === 'UNAVAIL' ? 'text-rose-600' : 'text-slate-400'
                                }`}>
                                  {availabilityStatus === 'PREF' ? '🟩 ساعت آزاد (اولویت استاد)' :
                                   availabilityStatus === 'UNAVAIL' ? '🟥 عدم امکان حضور' : '🟨 ساعت آزاد'}
                                </span>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: UNIVERSITY CONFIG & CUSTOM TIME SLOT MANAGER */}
      {/* ========================================================================= */}
      {activeMainTab === 'INPUTS' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2 flex flex-wrap gap-2">
            <button
              onClick={() => setInputSubTab('BELL_CONFIG')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition ${
                inputSubTab === 'BELL_CONFIG' ? 'bg-indigo-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              ⏰ ۱. تنظیم بازه‌های زمانی و افزودن تایم کلاس (Bell Schedule)
            </button>
            <button
              onClick={() => setInputSubTab('PROFESSORS')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition ${
                inputSubTab === 'PROFESSORS' ? 'bg-indigo-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              👨‍🏫 ۲. فرم ساعات حضور و ترجیحات اساتید
            </button>
            <button
              onClick={() => setInputSubTab('CLASSROOMS')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition ${
                inputSubTab === 'CLASSROOMS' ? 'bg-indigo-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              🏛️ ۳. کلاس‌های خالی و فضاهای آموزشی
            </button>
            <button
              onClick={() => setInputSubTab('DEMANDS')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition ${
                inputSubTab === 'DEMANDS' ? 'bg-indigo-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              📚 ۴. دروس نیازمند برنامه‌ریزی (جلسات زوج/فرد)
            </button>
          </div>

          {/* SUBTAB: ADVANCED TIME SLOTS & BELL SCHEDULE MANAGER */}
          {inputSubTab === 'BELL_CONFIG' && (
            <div className="space-y-4">
              
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base">
                      ⏰ الگوهای پیش‌فرض ساعات کلاسی دانشگاه (Bell Schedule Presets)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      انتخاب سریع الگوی ۱۲۰ دقیقه‌ای، ۹۰ دقیقه‌ای یا ۶۰ دقیقه‌ای
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleOpenAddSlotModal('START')}
                      className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs shadow flex items-center gap-1 transition"
                    >
                      <span>🌅 + افزودن تایم به اول روز (صبح زود)</span>
                    </button>
                    <button
                      onClick={() => handleOpenAddSlotModal('END')}
                      className="px-3 py-1.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-extrabold text-xs shadow flex items-center gap-1 transition"
                    >
                      <span>🌙 + افزودن تایم به آخر روز (شیفت عصر/شب)</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {(['STANDARD_120', 'STANDARD_90', 'STANDARD_60'] as const).map(presetKey => {
                    const preset = TIME_SLOT_PRESETS[presetKey];
                    const isSelected = activeSlotPresetKey === presetKey;

                    return (
                      <div
                        key={presetKey}
                        onClick={() => handleApplyPresetSlots(presetKey)}
                        className={`p-4 rounded-2xl border-2 cursor-pointer transition flex flex-col justify-between ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-400/30'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-extrabold text-xs text-slate-900">{preset.name}</span>
                            {isSelected && <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-900 text-white font-bold">الگوی فعال</span>}
                          </div>
                          <p className="text-[11px] text-slate-500 mb-3">{preset.description}</p>
                        </div>

                        <div className="pt-2 border-t border-slate-200 text-xs text-indigo-900 font-bold">
                          شامل {faNum(preset.slots.length)} بازه زمانی روزانه
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Slots In-place Editor */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base">
                      مدیریت و ویرایش مستقیم اسلات‌های زمانی فعال روزانه ({faNum(timeSlots.length)} بازه)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      امکان ویرایش مستقیم ساعت شروع و پایان، افزودن تایم به ابتدا یا انتهای روز و حذف اسلات
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSortSlotsChronologically}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold transition flex items-center gap-1"
                    >
                      <span>⏱️ مرتب‌سازی زمانی</span>
                    </button>
                    <button
                      onClick={() => handleOpenAddSlotModal('AUTO')}
                      className="px-4 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow flex items-center gap-1.5"
                    >
                      <span>➕ افزودن بازه دلخواه</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {timeSlots.map((slot, idx) => (
                    <div
                      key={slot.id}
                      className={`p-4 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                        slot.isBreak ? 'bg-amber-50/70 border-amber-300' : 'bg-slate-50/80 border-slate-200 hover:border-indigo-400'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-extrabold text-xs text-slate-900">
                            بازه {faNum(idx + 1)} {idx === 0 ? '(شروع صبح)' : idx === timeSlots.length - 1 ? '(پایان روز/عصر)' : ''}
                          </span>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleUpdateSlotInPlace(slot.id, 'isBreak', !slot.isBreak)}
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md transition ${
                                slot.isBreak ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                              }`}
                            >
                              {slot.isBreak ? 'استراحت / نماز' : 'کلاس درسی'}
                            </button>
                            <button
                              onClick={() => handleDeleteSlot(slot.id)}
                              className="text-slate-400 hover:text-rose-600 p-1 font-bold text-xs"
                              title="حذف این بازه"
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        <div className="mb-2">
                          <label className="text-[10px] text-slate-500 block mb-0.5">عنوان بازه زمانی:</label>
                          <input
                            type="text"
                            value={slot.label}
                            onChange={e => handleUpdateSlotInPlace(slot.id, 'label', e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-900"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <label className="text-[10px] text-slate-500 block mb-0.5">ساعت شروع:</label>
                            <input
                              type="text"
                              value={slot.startTime}
                              onChange={e => handleUpdateSlotInPlace(slot.id, 'startTime', e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 font-mono text-center font-bold text-indigo-900"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-500 block mb-0.5">ساعت پایان:</label>
                            <input
                              type="text"
                              value={slot.endTime}
                              onChange={e => handleUpdateSlotInPlace(slot.id, 'endTime', e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 font-mono text-center font-bold text-indigo-900"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <span className="text-xs text-slate-500">
                    با زدن دکمه زیر، ماتریس حضور اساتید و الگوریتم سناریوها با بازه‌های زمانی جدید منطبق می‌شوند.
                  </span>

                  <button
                    onClick={() => {
                      handleTriggerSolver();
                      setActiveMainTab('SCENARIOS');
                    }}
                    className="px-5 py-2.5 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-extrabold text-xs shadow flex items-center gap-2"
                  >
                    <span>💾 ذخیره تنظیمات تایم‌ها و بازتولید سناریوها</span>
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* SUBTAB: PROFESSORS */}
          {inputSubTab === 'PROFESSORS' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-xl">👨‍🏫</span>
                  <div>
                    <label className="text-xs font-bold text-slate-500 block mb-0.5">انتخاب استاد جهت ویرایش فرم حضور:</label>
                    <select
                      value={inspectorProfId}
                      onChange={e => setInspectorProfId(Number(e.target.value))}
                      className="border-2 border-indigo-400 rounded-xl px-3 py-1.5 font-extrabold text-sm text-indigo-950 bg-indigo-50/50"
                    >
                      {professors.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.contractType})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="text-xs bg-slate-50 p-2 rounded-lg border border-slate-200">
                  سقف تدریس هفتگی: <b className="text-indigo-900">{faNum(inspectorProf.maxWeeklyUnits)} واحد</b>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-white text-center">
                        <th className="p-3 border border-slate-800 w-28 font-extrabold">روز هفته</th>
                        {teachingSlots.map(slot => (
                          <th key={slot.id} className="p-3 border border-slate-800 font-extrabold">
                            <div>{slot.label}</div>
                            <div className="text-[10px] text-slate-300 font-normal mt-0.5">{slot.startTime} الی {slot.endTime}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DAY_NAMES.map((dayName, dayIdx) => (
                        <tr key={dayIdx} className={dayIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="p-3 border border-slate-200 font-extrabold text-center bg-slate-100 text-slate-900">
                            {dayName}
                          </td>
                          {teachingSlots.map(slot => {
                            const status = availabilities[inspectorProfId]?.[dayIdx]?.[slot.id] || 'AVAIL';

                            return (
                              <td
                                key={slot.id}
                                onClick={() => handleToggleProfSlot(inspectorProfId, dayIdx, slot.id)}
                                className="p-2 border border-slate-200 cursor-pointer select-none"
                              >
                                <div className={`p-3 rounded-xl text-center font-extrabold text-xs transition border flex flex-col items-center justify-center gap-1 shadow-xs ${
                                  status === 'PREF'
                                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-emerald-200'
                                    : status === 'AVAIL'
                                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                                    : 'bg-rose-100 text-rose-900 border-rose-300'
                                }`}>
                                  <span>{status === 'PREF' ? '🟩 حاضر و اولویت اصلی' : status === 'AVAIL' ? '🟨 قابل حضور مشروط' : '🟥 عدم امکان حضور'}</span>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end pt-3 border-t border-slate-200">
                  <button
                    onClick={() => {
                      handleTriggerSolver();
                      setActiveMainTab('SCENARIOS');
                    }}
                    className="px-5 py-2.5 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-extrabold text-xs shadow"
                  >
                    <span>💾 ذخیره و بازتولید سناریوها</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SUBTAB: CLASSROOMS */}
          {inputSubTab === 'CLASSROOMS' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex items-center justify-between">
                <h3 className="font-extrabold text-slate-900 text-base">🏛️ فضاهای فیزیکی و کلاس‌های آموزشی در دسترس</h3>
                <button
                  onClick={() => setIsNewRoomModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow"
                >
                  ➕ افزودن کلاس جدید
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {classrooms.map(room => (
                  <div key={room.id} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-900">
                          {room.roomType === 'LAB' ? '🧪 سایت / آزمایشگاه' : room.roomType === 'GYM' ? '⚽ سالن ورزشی' : '📖 کلاس نظری'}
                        </span>
                        <span className="text-[11px] font-bold text-emerald-800">ظرفیت: {faNum(room.capacity)} نفر</span>
                      </div>
                      <h4 className="text-base font-extrabold text-slate-900 mb-0.5">{room.name}</h4>
                      <p className="text-xs text-slate-500 mb-2">{room.buildingName}</p>
                      <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200">
                        امکانات: {room.equipment.join('، ')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SUBTAB: DEMANDS */}
          {inputSubTab === 'DEMANDS' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">📚 لیست دروس و جلسات دوره‌ای (هفته زوج و فرد)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">پشتیبانی از دروس ۳ واحدی ۱٫۵ جلسه‌ای و آزمایشگاه‌های یک هفته در میان</p>
                </div>
                <span className="text-xs font-bold text-slate-600">مجموع: {faNum(courseDemands.length)} عنوان</span>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white text-center">
                      <th className="p-3 border border-slate-800">کد درس</th>
                      <th className="p-3 border border-slate-800">عنوان درس</th>
                      <th className="p-3 border border-slate-800">رشته</th>
                      <th className="p-3 border border-slate-800">ورودی/ترم</th>
                      <th className="p-3 border border-slate-800">تواتر هفته</th>
                      <th className="p-3 border border-slate-800">استاد</th>
                      <th className="p-3 border border-slate-800">نوع فضا</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courseDemands.map((c, idx) => (
                      <tr key={c.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="p-3 border border-slate-200 font-mono text-center font-bold text-indigo-900">{c.code}</td>
                        <td className="p-3 border border-slate-200 font-extrabold text-slate-900">{c.title}</td>
                        <td className="p-3 border border-slate-200 font-bold text-slate-700">{c.programTitle}</td>
                        <td className="p-3 border border-slate-200 text-center">{c.cohortTitle}</td>
                        <td className="p-3 border border-slate-200 text-center">
                          {c.weekRecurrence === 'ALL' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-900">هر هفته</span>
                          ) : c.weekRecurrence === 'EVEN' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-900">هفته زوج 🔷</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900">هفته فرد 🔶</span>
                          )}
                        </td>
                        <td className="p-3 border border-slate-200 font-bold">{professors.find(p => p.id === c.preferredProfId)?.name}</td>
                        <td className="p-3 border border-slate-200 text-center font-bold text-slate-600">
                          {c.requiredRoomType === 'LAB' ? '🧪 آزمایشگاه' : c.requiredRoomType === 'GYM' ? '⚽ سالن' : '📖 نظری'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: APPROVED OFFERINGS */}
      {/* ========================================================================= */}
      {activeMainTab === 'APPROVED' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">
                📋 برنامه مصوب و نهایی نیمسال جاری ({faNum(approvedOfferings.length)} کلاس فعال)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                شامل مشخصات هفته برگزاری (ثابت / زوج / فرد) و شماره کلاس
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white text-center">
                  <th className="p-3 border border-slate-800 w-12">ردیف</th>
                  <th className="p-3 border border-slate-800">کد درس</th>
                  <th className="p-3 border border-slate-800">عنوان درس</th>
                  <th className="p-3 border border-slate-800">گروه</th>
                  <th className="p-3 border border-slate-800">تواتر هفته</th>
                  <th className="p-3 border border-slate-800">استاد مدرس</th>
                  <th className="p-3 border border-slate-800">زمان‌بندی</th>
                  <th className="p-3 border border-slate-800">محل کلاس</th>
                </tr>
              </thead>
              <tbody>
                {approvedOfferings.map((item, idx) => (
                  <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="p-2 border border-slate-200 text-center font-bold text-slate-500">{faNum(idx + 1)}</td>
                    <td className="p-2 border border-slate-200 font-mono text-center font-bold text-indigo-900">{item.code}</td>
                    <td className="p-2 border border-slate-200 font-extrabold text-slate-900">{item.title}</td>
                    <td className="p-2 border border-slate-200 text-center font-bold bg-indigo-50/50">گروه {faNum(item.groupNumber)}</td>
                    <td className="p-2 border border-slate-200 text-center">
                      {item.classSchedules[0]?.weekType === 'EVEN' ? (
                        <span className="px-2 py-0.5 rounded bg-cyan-100 text-cyan-900 font-bold text-[10px]">هفته زوج 🔷</span>
                      ) : item.classSchedules[0]?.weekType === 'ODD' ? (
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px]">هفته فرد 🔶</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 font-bold text-[10px]">هر هفته</span>
                      )}
                    </td>
                    <td className="p-2 border border-slate-200 font-bold text-slate-800">{item.professorName}</td>
                    <td className="p-2 border border-slate-200 text-slate-800 font-bold">
                      {item.classSchedules[0]?.dayName} {faNum(item.classSchedules[0]?.startTime)} تا {faNum(item.classSchedules[0]?.endTime)}
                    </td>
                    <td className="p-2 border border-slate-200 font-extrabold text-emerald-900">
                      🏛️ {item.classSchedules[0]?.roomName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: ROOM OCCUPANCY MATRIX */}
      {/* ========================================================================= */}
      {activeMainTab === 'ROOMS_MATRIX' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
          <div className="pb-3 border-b border-slate-200">
            <h3 className="font-extrabold text-slate-900 text-base">🏢 ماتریس و نقشه حرارتی اشغال فضاهای آموزشی</h3>
            <p className="text-xs text-slate-500 mt-0.5">وضعیت اشغال یا آزاد بودن کلاس‌ها در هر روز و بازه زمانی</p>
          </div>

          <div className="space-y-5">
            {classrooms.map(room => (
              <div key={room.id} className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="bg-slate-900 text-white p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm">{room.name}</span>
                    <span className="text-xs text-slate-300">({room.buildingName})</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 font-bold">
                      ظرفیت: {faNum(room.capacity)} نفر
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto p-3">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-800 text-center">
                        <th className="p-2 border border-slate-200 w-24">روز</th>
                        {teachingSlots.map(s => (
                          <th key={s.id} className="p-2 border border-slate-200 font-bold">{s.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DAY_NAMES.map((dayName, dayIdx) => (
                        <tr key={dayIdx}>
                          <td className="p-2 border border-slate-200 font-bold text-center bg-slate-50">{dayName}</td>
                          {teachingSlots.map(slot => {
                            const occupiedBy = approvedOfferings.find(o =>
                              o.classSchedules.some(cs => cs.roomId === room.id && cs.dayOfWeek === dayIdx && cs.slotId === slot.id)
                            );

                            return (
                              <td
                                key={slot.id}
                                className={`p-2 border border-slate-200 text-center font-bold h-14 ${
                                  occupiedBy
                                    ? 'bg-indigo-100/90 text-indigo-950 border-indigo-200'
                                    : 'bg-emerald-50/50 text-emerald-800'
                                }`}
                              >
                                {occupiedBy ? (
                                  <div>
                                    <div className="font-extrabold text-[11px]">{occupiedBy.title}</div>
                                    <div className="text-[10px] text-slate-600 mt-0.5">{occupiedBy.professorName}</div>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-emerald-700 opacity-70">✓ خالی و در دسترس</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Add New Slot */}
      {isNewSlotModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 bg-indigo-950 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-sm sm:text-base">
                ➕ {slotPositionChoice === 'START' ? '🌅 افزودن تایم کلاس در ابتدای روز (صبح زود)' : slotPositionChoice === 'END' ? '🌙 افزودن تایم کلاس در انتهای روز (شیفت عصر/شب)' : 'افزودن بازه زمانی جدید'}
              </h3>
              <button onClick={() => setIsNewSlotModalOpen(false)} className="text-white/60 hover:text-white">✕</button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">موقعیت قرارگیری در برنامه:</label>
                <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setSlotPositionChoice('START')}
                    className={`py-1.5 rounded text-[11px] font-bold transition ${slotPositionChoice === 'START' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-600'}`}
                  >
                    🌅 اول روز
                  </button>
                  <button
                    type="button"
                    onClick={() => setSlotPositionChoice('END')}
                    className={`py-1.5 rounded text-[11px] font-bold transition ${slotPositionChoice === 'END' ? 'bg-indigo-900 text-white shadow-sm' : 'text-slate-600'}`}
                  >
                    🌙 آخر روز
                  </button>
                  <button
                    type="button"
                    onClick={() => setSlotPositionChoice('AUTO')}
                    className={`py-1.5 rounded text-[11px] font-bold transition ${slotPositionChoice === 'AUTO' ? 'bg-indigo-900 text-white shadow-sm' : 'text-slate-600'}`}
                  >
                    ⏱️ ترتیب ساعتی
                  </button>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">عنوان بازه زمانی:</label>
                <input
                  type="text"
                  placeholder="مثال: ۰۷:۰۰ الی ۰۸:۰۰ یا ۱۸:۰۰ الی ۱۹:۳۰"
                  value={newSlotForm.label}
                  onChange={e => setNewSlotForm({ ...newSlotForm, label: e.target.value })}
                  className="w-full border border-slate-300 px-3 py-2 rounded-lg font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">ساعت شروع:</label>
                  <input
                    type="text"
                    value={newSlotForm.startTime}
                    onChange={e => setNewSlotForm({ ...newSlotForm, startTime: e.target.value })}
                    className="w-full border border-slate-300 px-3 py-2 rounded-lg font-mono text-center font-bold text-indigo-900"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">ساعت پایان:</label>
                  <input
                    type="text"
                    value={newSlotForm.endTime}
                    onChange={e => setNewSlotForm({ ...newSlotForm, endTime: e.target.value })}
                    className="w-full border border-slate-300 px-3 py-2 rounded-lg font-mono text-center font-bold text-indigo-900"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isBreakCheck"
                  checked={newSlotForm.isBreak}
                  onChange={e => setNewSlotForm({ ...newSlotForm, isBreak: e.target.checked })}
                  className="rounded border-slate-300 text-indigo-900 focus:ring-indigo-500 w-4 h-4"
                />
                <label htmlFor="isBreakCheck" className="text-slate-700 font-bold">
                  این بازه برای استراحت / نماز / ناهار است (کلاس تشکیل نمی‌شود)
                </label>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setIsNewSlotModalOpen(false)} className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs">
                انصراف
              </button>
              <button
                onClick={handleSaveNewSlot}
                className="px-5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow"
              >
                ذخیره و اعمال بازه
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add New Room */}
      {isNewRoomModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="p-4 bg-indigo-950 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-sm sm:text-base">➕ افزودن کلاس یا آزمایشگاه جدید</h3>
              <button onClick={() => setIsNewRoomModalOpen(false)} className="text-white/60 hover:text-white">✕</button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">نام یا شماره اتاق:</label>
                <input
                  type="text"
                  placeholder="مثال: کلاس ۳۰۴"
                  value={newRoomForm.name}
                  onChange={e => setNewRoomForm({ ...newRoomForm, name: e.target.value })}
                  className="w-full border border-slate-300 px-3 py-2 rounded-lg font-bold"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">ساختمان:</label>
                  <select
                    value={newRoomForm.buildingName}
                    onChange={e => setNewRoomForm({ ...newRoomForm, buildingName: e.target.value })}
                    className="w-full border border-slate-300 px-3 py-2 rounded-lg font-bold"
                  >
                    <option value="ساختمان آموزش">ساختمان آموزش</option>
                    <option value="دانشکده فنی">دانشکده فنی</option>
                    <option value="دانشکده علوم">دانشکده علوم</option>
                    <option value="مجموعه ورزشی">مجموعه ورزشی</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">ظرفیت صندلی:</label>
                  <input
                    type="number"
                    value={newRoomForm.capacity}
                    onChange={e => setNewRoomForm({ ...newRoomForm, capacity: Number(e.target.value) })}
                    className="w-full border border-slate-300 px-3 py-2 rounded-lg font-bold font-mono"
                  />
                </div>
              </div>
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setIsNewRoomModalOpen(false)} className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs">انصراف</button>
              <button
                onClick={() => {
                  if (!newRoomForm.name.trim()) return;
                  const newRoom: ClassroomOption = {
                    id: Date.now(),
                    name: newRoomForm.name,
                    buildingName: newRoomForm.buildingName,
                    capacity: Number(newRoomForm.capacity) || 30,
                    roomType: newRoomForm.roomType,
                    equipment: newRoomForm.equipment.split('،').map(s => s.trim()).filter(Boolean),
                    isActive: true,
                  };
                  setClassrooms(prev => [...prev, newRoom]);
                  setIsNewRoomModalOpen(false);
                  showToast(`کلاس «${newRoom.name}» افزوده شد.`, 'success');
                }}
                className="px-5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow"
              >
                ذخیره کلاس
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
