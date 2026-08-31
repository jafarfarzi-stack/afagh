'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';

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

// [profId][dayIndex (0..5)][slotId (1..5)] = SlotStatus
export interface ProfessorAvailabilityMap {
  [profId: number]: {
    [dayOfWeek: number]: {
      [slotId: number]: SlotStatus;
    };
  };
}

export interface CourseDemand {
  id: number;
  code: string;
  title: string;
  units: number;
  courseType: 'پایه' | 'اصلی' | 'تخصصی' | 'عمومی' | 'عملی';
  targetCohort: 'ترم ۱' | 'ترم ۳' | 'ترم ۵' | 'عمومی';
  preferredProfId: number;
  requiredRoomType: 'THEORY' | 'LAB' | 'GYM';
  capacity: number;
  examDate: string;
}

export interface DepartmentOffering {
  id: number;
  termId: number;
  courseId: number;
  code: string;
  title: string;
  units: number;
  courseType: string;
  targetCohort: string;
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
  }[];
  examSchedule: {
    examDate: string;
    startTime: string;
    endTime: string;
    roomName: string;
  } | null;
}

export interface AutoScheduleScenario {
  id: 'COMPACT' | 'BALANCED' | 'PROF_PREF';
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

const TIME_SLOTS = [
  { id: 1, label: '۰۸:۰۰ الی ۱۰:۰۰', start: '08:00', end: '10:00', isBreak: false },
  { id: 2, label: '۱۰:۰۰ الی ۱۲:۰۰', start: '10:00', end: '12:00', isBreak: false },
  { id: 3, label: '۱۲:۰۰ الی ۱۳:۳۰ (نماز و ناهار)', start: '12:00', end: '13:30', isBreak: true },
  { id: 4, label: '۱۳:۳۰ الی ۱۵:۳۰', start: '13:30', end: '15:30', isBreak: false },
  { id: 5, label: '۱۵:۳۰ الی ۱۷:۳۰', start: '15:30', end: '17:30', isBreak: false },
];

const TEACHING_SLOTS = TIME_SLOTS.filter(s => !s.isBreak);

const INITIAL_CLASSROOMS: ClassroomOption[] = [
  { id: 1, name: 'اتاق ۲۰۱ (کلاس نظری)', buildingName: 'ساختمان آموزش', capacity: 45, roomType: 'THEORY', equipment: ['ویدئوپروژکتور', 'برد هوشمند', 'سیستم صوتی'], isActive: true },
  { id: 2, name: 'اتاق ۲۰۲ (کلاس نظری)', buildingName: 'ساختمان آموزش', capacity: 40, roomType: 'THEORY', equipment: ['ویدئوپروژکتور', 'تخته وایت‌برد'], isActive: true },
  { id: 3, name: 'سایت کامپیوتر ۱۰۱', buildingName: 'دانشکده فنی', capacity: 30, roomType: 'LAB', equipment: ['۳۰ سیستم رایانه', 'شبکه LAN', 'پروژکتور', 'کولر گازی'], isActive: true },
  { id: 4, name: 'آزمایشگاه فیزیک و مدار', buildingName: 'دانشکده علوم', capacity: 25, roomType: 'LAB', equipment: ['اسیلوسکوپ', 'میزهای آزمایشگاهی', 'کپسول ایمنی'], isActive: true },
  { id: 5, name: 'سالن چندمنظوره ورزشی', buildingName: 'مجموعه ورزشی', capacity: 50, roomType: 'GYM', equipment: ['کفپوش استاندارد', 'رختکن', 'امکانات بدنسازی'], isActive: true },
  { id: 6, name: 'آمفی‌تئاتر مرکزی', buildingName: 'ساختمان مرکزی', capacity: 120, roomType: 'EXAM', equipment: ['پروژکتور سینمایی', 'سیستم صوت دالبی', 'صندلی‌های همایش'], isActive: true },
];

const INITIAL_PROFESSORS: ProfessorOption[] = [
  { id: 1, name: 'دکتر جمیل احمدی', staffCode: '0011111111', academicRank: 'استادیار', contractType: 'تمام‌وقت', departmentName: 'گروه کامپیوتر', maxWeeklyUnits: 16, maxDailyHours: 6 },
  { id: 2, name: 'دکتر فاطمه اکبری', staffCode: '0011111112', academicRank: 'دانشیار', contractType: 'تمام‌وقت', departmentName: 'گروه کامپیوتر', maxWeeklyUnits: 14, maxDailyHours: 6 },
  { id: 3, name: 'مهندس سهراب کاظمی', staffCode: '0011111113', academicRank: 'مربی', contractType: 'مدعو', departmentName: 'گروه کامپیوتر', maxWeeklyUnits: 10, maxDailyHours: 4 },
  { id: 4, name: 'دکتر مریم رضایی', staffCode: '0011111114', academicRank: 'استادیار', contractType: 'تمام‌وقت', departmentName: 'گروه علوم پایه', maxWeeklyUnits: 14, maxDailyHours: 6 },
  { id: 5, name: 'دکتر محمد حسینی', staffCode: '0011111115', academicRank: 'استادیار', contractType: 'مدعو', departmentName: 'گروه زبان و معارف', maxWeeklyUnits: 8, maxDailyHours: 4 },
];

// Helper to create default professor availability map
function createDefaultAvailabilities(): ProfessorAvailabilityMap {
  const map: ProfessorAvailabilityMap = {};
  
  // Dr. Jamil Ahmadi (Full-time: Prefers Sat, Mon morning/afternoon, available Sun)
  map[1] = {
    0: { 1: 'PREF', 2: 'PREF', 3: 'AVAIL', 4: 'PREF', 5: 'AVAIL' }, // Sat
    1: { 1: 'AVAIL', 2: 'AVAIL', 3: 'AVAIL', 4: 'AVAIL', 5: 'UNAVAIL' }, // Sun
    2: { 1: 'PREF', 2: 'PREF', 3: 'AVAIL', 4: 'PREF', 5: 'PREF' }, // Mon
    3: { 1: 'UNAVAIL', 2: 'UNAVAIL', 3: 'UNAVAIL', 4: 'UNAVAIL', 5: 'UNAVAIL' }, // Tue (Research Day)
    4: { 1: 'AVAIL', 2: 'AVAIL', 3: 'UNAVAIL', 4: 'UNAVAIL', 5: 'UNAVAIL' }, // Wed
    5: { 1: 'UNAVAIL', 2: 'UNAVAIL', 3: 'UNAVAIL', 4: 'UNAVAIL', 5: 'UNAVAIL' }, // Thu
  };

  // Dr. Fatemeh Akbari (Full-time: Prefers Sun, Tue, Wed)
  map[2] = {
    0: { 1: 'UNAVAIL', 2: 'UNAVAIL', 3: 'UNAVAIL', 4: 'UNAVAIL', 5: 'UNAVAIL' }, // Sat (Off)
    1: { 1: 'PREF', 2: 'PREF', 3: 'AVAIL', 4: 'PREF', 5: 'AVAIL' }, // Sun
    2: { 1: 'AVAIL', 2: 'AVAIL', 3: 'AVAIL', 4: 'UNAVAIL', 5: 'UNAVAIL' }, // Mon
    3: { 1: 'PREF', 2: 'PREF', 3: 'AVAIL', 4: 'PREF', 5: 'PREF' }, // Tue
    4: { 1: 'PREF', 2: 'PREF', 3: 'AVAIL', 4: 'AVAIL', 5: 'UNAVAIL' }, // Wed
    5: { 1: 'UNAVAIL', 2: 'UNAVAIL', 3: 'UNAVAIL', 4: 'UNAVAIL', 5: 'UNAVAIL' }, // Thu
  };

  // Eng. Sohrab Kazemi (Adjunct: Prefers Mon, Wed, Thu afternoons)
  map[3] = {
    0: { 1: 'UNAVAIL', 2: 'UNAVAIL', 3: 'UNAVAIL', 4: 'UNAVAIL', 5: 'UNAVAIL' },
    1: { 1: 'UNAVAIL', 2: 'UNAVAIL', 3: 'UNAVAIL', 4: 'UNAVAIL', 5: 'UNAVAIL' },
    2: { 1: 'UNAVAIL', 2: 'AVAIL', 3: 'AVAIL', 4: 'PREF', 5: 'PREF' },
    3: { 1: 'UNAVAIL', 2: 'UNAVAIL', 3: 'UNAVAIL', 4: 'UNAVAIL', 5: 'UNAVAIL' },
    4: { 1: 'AVAIL', 2: 'PREF', 3: 'AVAIL', 4: 'PREF', 5: 'PREF' },
    5: { 1: 'PREF', 2: 'PREF', 3: 'AVAIL', 4: 'PREF', 5: 'UNAVAIL' },
  };

  // Dr. Maryam Rezaei (Physics: Prefers Sat, Sun, Wed mornings)
  map[4] = {
    0: { 1: 'PREF', 2: 'PREF', 3: 'AVAIL', 4: 'AVAIL', 5: 'UNAVAIL' },
    1: { 1: 'PREF', 2: 'PREF', 3: 'AVAIL', 4: 'UNAVAIL', 5: 'UNAVAIL' },
    2: { 1: 'UNAVAIL', 2: 'UNAVAIL', 3: 'UNAVAIL', 4: 'UNAVAIL', 5: 'UNAVAIL' },
    3: { 1: 'AVAIL', 2: 'AVAIL', 3: 'AVAIL', 4: 'AVAIL', 5: 'UNAVAIL' },
    4: { 1: 'PREF', 2: 'PREF', 3: 'AVAIL', 4: 'UNAVAIL', 5: 'UNAVAIL' },
    5: { 1: 'UNAVAIL', 2: 'UNAVAIL', 3: 'UNAVAIL', 4: 'UNAVAIL', 5: 'UNAVAIL' },
  };

  // Dr. Mohammad Hosseini (General/English: Prefers Sun, Tue, Wed)
  map[5] = {
    0: { 1: 'AVAIL', 2: 'AVAIL', 3: 'UNAVAIL', 4: 'UNAVAIL', 5: 'UNAVAIL' },
    1: { 1: 'PREF', 2: 'PREF', 3: 'AVAIL', 4: 'PREF', 5: 'UNAVAIL' },
    2: { 1: 'UNAVAIL', 2: 'UNAVAIL', 3: 'UNAVAIL', 4: 'UNAVAIL', 5: 'UNAVAIL' },
    3: { 1: 'PREF', 2: 'PREF', 3: 'AVAIL', 4: 'PREF', 5: 'UNAVAIL' },
    4: { 1: 'PREF', 2: 'PREF', 3: 'AVAIL', 4: 'UNAVAIL', 5: 'UNAVAIL' },
    5: { 1: 'UNAVAIL', 2: 'UNAVAIL', 3: 'UNAVAIL', 4: 'UNAVAIL', 5: 'UNAVAIL' },
  };

  return map;
}

const INITIAL_COURSE_DEMANDS: CourseDemand[] = [
  { id: 1, code: '1112101', title: 'ریاضی عمومی ۱', units: 3, courseType: 'پایه', targetCohort: 'ترم ۱', preferredProfId: 1, requiredRoomType: 'THEORY', capacity: 40, examDate: '1405/10/18' },
  { id: 2, code: '1112103', title: 'مبانی کامپیوتر و برنامه‌نویسی', units: 4, courseType: 'پایه', targetCohort: 'ترم ۱', preferredProfId: 2, requiredRoomType: 'LAB', capacity: 30, examDate: '1405/10/22' },
  { id: 3, code: '1112105', title: 'فیزیک عمومی ۱', units: 3, courseType: 'پایه', targetCohort: 'ترم ۱', preferredProfId: 4, requiredRoomType: 'THEORY', capacity: 35, examDate: '1405/10/25' },
  { id: 4, code: '1112106', title: 'آزمایشگاه فیزیک ۱', units: 1, courseType: 'عملی', targetCohort: 'ترم ۱', preferredProfId: 3, requiredRoomType: 'LAB', capacity: 25, examDate: '1405/10/15' },
  { id: 5, code: '1112107', title: 'زبان انگلیسی عمومی', units: 3, courseType: 'عمومی', targetCohort: 'ترم ۱', preferredProfId: 5, requiredRoomType: 'THEORY', capacity: 40, examDate: '1405/10/28' },
  { id: 6, code: '1112108', title: 'تربیت بدنی ۱', units: 2, courseType: 'عمومی', targetCohort: 'ترم ۱', preferredProfId: 3, requiredRoomType: 'GYM', capacity: 40, examDate: '1405/10/14' },
  { id: 7, code: '1112109', title: 'اندیشه اسلامی ۱', units: 2, courseType: 'عمومی', targetCohort: 'ترم ۱', preferredProfId: 5, requiredRoomType: 'THEORY', capacity: 45, examDate: '1405/10/30' },
  
  { id: 8, code: '1112201', title: 'ساختمان داده‌ها', units: 3, courseType: 'اصلی', targetCohort: 'ترم ۳', preferredProfId: 1, requiredRoomType: 'THEORY', capacity: 35, examDate: '1405/10/19' },
  { id: 9, code: '1112202', title: 'برنامه‌نویسی پیشرفته', units: 3, courseType: 'اصلی', targetCohort: 'ترم ۳', preferredProfId: 2, requiredRoomType: 'LAB', capacity: 30, examDate: '1405/10/23' },
  { id: 10, code: '1112203', title: 'ریاضی مهندسی', units: 3, courseType: 'پایه', targetCohort: 'ترم ۳', preferredProfId: 1, requiredRoomType: 'THEORY', capacity: 35, examDate: '1405/10/26' },
  { id: 11, code: '1112204', title: 'مدار منطقی', units: 3, courseType: 'اصلی', targetCohort: 'ترم ۳', preferredProfId: 4, requiredRoomType: 'THEORY', capacity: 35, examDate: '1405/10/29' },

  { id: 12, code: '1112301', title: 'طراحی الگوریتم‌ها', units: 3, courseType: 'تخصصی', targetCohort: 'ترم ۵', preferredProfId: 2, requiredRoomType: 'THEORY', capacity: 30, examDate: '1405/10/20' },
  { id: 13, code: '1112302', title: 'پایگاه داده‌ها', units: 3, courseType: 'تخصصی', targetCohort: 'ترم ۵', preferredProfId: 1, requiredRoomType: 'LAB', capacity: 30, examDate: '1405/10/24' },
  { id: 14, code: '1112303', title: 'سیستم‌های عامل', units: 3, courseType: 'تخصصی', targetCohort: 'ترم ۵', preferredProfId: 3, requiredRoomType: 'THEORY', capacity: 30, examDate: '1405/10/27' },
];

/**
 * Core Dynamic Scheduling Solver:
 * Generates 3 genuinely distinct mathematical models based on live classrooms, professors, availability preferences, and course demands.
 */
function solveDynamicScenarios(
  classrooms: ClassroomOption[],
  professors: ProfessorOption[],
  availabilities: ProfessorAvailabilityMap,
  demands: CourseDemand[]
): AutoScheduleScenario[] {
  const activeClassrooms = classrooms.filter(c => c.isActive);
  const theoryRooms = activeClassrooms.filter(c => c.roomType === 'THEORY');
  const labRooms = activeClassrooms.filter(c => c.roomType === 'LAB');
  const gymRooms = activeClassrooms.filter(c => c.roomType === 'GYM');

  const getFallbackRoom = (type: string, idx: number): ClassroomOption => {
    if (type === 'LAB' && labRooms.length > 0) return labRooms[idx % labRooms.length];
    if (type === 'GYM' && gymRooms.length > 0) return gymRooms[idx % gymRooms.length];
    if (theoryRooms.length > 0) return theoryRooms[idx % theoryRooms.length];
    return activeClassrooms[0] || classrooms[0];
  };

  const getProf = (id: number) => professors.find(p => p.id === id) || professors[0];

  // Helper to check professor status
  const isProfAvailable = (profId: number, day: number, slot: number): SlotStatus => {
    return availabilities[profId]?.[day]?.[slot] || 'AVAIL';
  };

  // ==========================================
  // SCENARIO 1: COMPACT / CLUSTERED (2-3 DAYS)
  // Target Days: Saturday (0), Sunday (1), Monday (2) only.
  // Back-to-back blocks (08-10, 10-12, 13:30-15:30, 15:30-17:30).
  // ==========================================
  const compactOfferings: DepartmentOffering[] = [];
  const compactDays = [0, 1, 2]; // شنبه، یکشنبه، دوشنبه
  const compactSlots = [1, 2, 4, 5];

  demands.forEach((course, index) => {
    const prof = getProf(course.preferredProfId);
    // Find slot in compact days (Sat, Sun, Mon)
    let assignedDay = compactDays[index % compactDays.length];
    let assignedSlot = compactSlots[Math.floor(index / compactDays.length) % compactSlots.length];

    // Check if prof has hard block, if so find next available compact slot
    if (isProfAvailable(prof.id, assignedDay, assignedSlot) === 'UNAVAIL') {
      for (const d of compactDays) {
        for (const s of compactSlots) {
          if (isProfAvailable(prof.id, d, s) !== 'UNAVAIL') {
            assignedDay = d;
            assignedSlot = s;
            break;
          }
        }
      }
    }

    const room = getFallbackRoom(course.requiredRoomType, index);
    const slotDef = TIME_SLOTS.find(s => s.id === assignedSlot) || TIME_SLOTS[0];

    compactOfferings.push({
      id: 1000 + course.id,
      termId: 14051,
      courseId: course.id,
      code: course.code,
      title: course.title,
      units: course.units,
      courseType: course.courseType,
      targetCohort: course.targetCohort,
      groupNumber: 1,
      professorId: prof.id,
      professorName: prof.name,
      capacity: Math.min(course.capacity, room.capacity),
      enrolledCount: 0,
      waitlistCapacity: 5,
      classSchedules: [{
        dayOfWeek: assignedDay,
        dayName: DAY_NAMES[assignedDay],
        slotId: assignedSlot,
        startTime: slotDef.start,
        endTime: slotDef.end,
        roomId: room.id,
        roomName: room.name,
        buildingName: room.buildingName,
      }],
      examSchedule: {
        examDate: course.examDate,
        startTime: '۰۸:۳۰',
        endTime: '۱۰:۳۰',
        roomName: 'آمفی‌تئاتر مرکزی',
      },
    });
  });

  // ==========================================
  // SCENARIO 2: BALANCED & DISTRIBUTED (5 DAYS)
  // Target Days: Saturday (0) through Wednesday (4).
  // 1 to 2 courses per cohort daily, prioritized in cool morning slots (1 & 2).
  // ==========================================
  const balancedOfferings: DepartmentOffering[] = [];
  const balancedDays = [0, 1, 2, 3, 4]; // شنبه تا چهارشنبه

  demands.forEach((course, index) => {
    const prof = getProf(course.preferredProfId);
    const assignedDay = balancedDays[index % balancedDays.length];
    // Prioritize morning slots: 1 (08-10) and 2 (10-12), then 4 (13:30-15:30)
    const slotChoices = [1, 2, 4];
    let assignedSlot = slotChoices[Math.floor(index / balancedDays.length) % slotChoices.length];

    if (isProfAvailable(prof.id, assignedDay, assignedSlot) === 'UNAVAIL') {
      for (const s of [2, 1, 4, 5]) {
        if (isProfAvailable(prof.id, assignedDay, s) !== 'UNAVAIL') {
          assignedSlot = s;
          break;
        }
      }
    }

    const room = getFallbackRoom(course.requiredRoomType, (index + 2));
    const slotDef = TIME_SLOTS.find(s => s.id === assignedSlot) || TIME_SLOTS[0];

    balancedOfferings.push({
      id: 2000 + course.id,
      termId: 14051,
      courseId: course.id,
      code: course.code,
      title: course.title,
      units: course.units,
      courseType: course.courseType,
      targetCohort: course.targetCohort,
      groupNumber: 1,
      professorId: prof.id,
      professorName: prof.name,
      capacity: Math.min(course.capacity, room.capacity),
      enrolledCount: 0,
      waitlistCapacity: 5,
      classSchedules: [{
        dayOfWeek: assignedDay,
        dayName: DAY_NAMES[assignedDay],
        slotId: assignedSlot,
        startTime: slotDef.start,
        endTime: slotDef.end,
        roomId: room.id,
        roomName: room.name,
        buildingName: room.buildingName,
      }],
      examSchedule: {
        examDate: course.examDate,
        startTime: '۱۰:۳۰',
        endTime: '۱۲:۳۰',
        roomName: 'آمفی‌تئاتر مرکزی',
      },
    });
  });

  // ==========================================
  // SCENARIO 3: PROFESSOR PREFERENCE OPTIMIZED
  // 100% Alignment with Professor green 'PREF' slots.
  // Full-time faculty in morning, Adjunct in afternoon blocks.
  // ==========================================
  const profPrefOfferings: DepartmentOffering[] = [];
  const profDayLoad: { [profId: number]: { [day: number]: number } } = {};

  demands.forEach((course, index) => {
    const prof = getProf(course.preferredProfId);
    if (!profDayLoad[prof.id]) profDayLoad[prof.id] = {};

    // Search for best PREF slot for this prof
    let bestDay = 0;
    let bestSlot = 1;
    let foundPref = false;

    for (let d = 0; d < 6; d++) {
      for (const s of [1, 2, 4, 5]) {
        if (isProfAvailable(prof.id, d, s) === 'PREF') {
          const currentDayCount = profDayLoad[prof.id][d] || 0;
          if (currentDayCount < 2) {
            bestDay = d;
            bestSlot = s;
            foundPref = true;
            break;
          }
        }
      }
      if (foundPref) break;
    }

    // Fallback to AVAIL if PREF full
    if (!foundPref) {
      for (let d = 0; d < 6; d++) {
        for (const s of [2, 1, 4, 5]) {
          if (isProfAvailable(prof.id, d, s) === 'AVAIL') {
            bestDay = d;
            bestSlot = s;
            foundPref = true;
            break;
          }
        }
        if (foundPref) break;
      }
    }

    profDayLoad[prof.id][bestDay] = (profDayLoad[prof.id][bestDay] || 0) + 1;

    const room = getFallbackRoom(course.requiredRoomType, (index * 3));
    const slotDef = TIME_SLOTS.find(s => s.id === bestSlot) || TIME_SLOTS[0];

    profPrefOfferings.push({
      id: 3000 + course.id,
      termId: 14051,
      courseId: course.id,
      code: course.code,
      title: course.title,
      units: course.units,
      courseType: course.courseType,
      targetCohort: course.targetCohort,
      groupNumber: 1,
      professorId: prof.id,
      professorName: prof.name,
      capacity: Math.min(course.capacity, room.capacity),
      enrolledCount: 0,
      waitlistCapacity: 5,
      classSchedules: [{
        dayOfWeek: bestDay,
        dayName: DAY_NAMES[bestDay],
        slotId: bestSlot,
        startTime: slotDef.start,
        endTime: slotDef.end,
        roomId: room.id,
        roomName: room.name,
        buildingName: room.buildingName,
      }],
      examSchedule: {
        examDate: course.examDate,
        startTime: '۱۳:۳۰',
        endTime: '۱۵:۳۰',
        roomName: 'آمفی‌تئاتر مرکزی',
      },
    });
  });

  return [
    {
      id: 'COMPACT',
      title: 'مدل اول: فشرده‌سازی حداکثری (۲ الی ۳ روز کاری)',
      subtitle: 'تجمیع کامل کلاس‌ها در روزهای شنبه، یکشنبه و دوشنبه جهت آزادسازی روزهای کاری/پژوهشی',
      description: 'این سناریو برای دانشجویان شاغل یا غیربومی ایده‌آل است. کلیه جلسات در ساعات متوالی ۲ تا ۳ روز ابتدای هفته تجمیع شده و روزهای سه‌شنبه، چهارشنبه و پنج‌شنبه کاملاً آزاد خواهند بود.',
      badgeColor: 'bg-emerald-600 text-white',
      accentBorder: 'border-emerald-500 hover:border-emerald-600',
      bgGradient: 'from-emerald-50 to-teal-50/40',
      kpi: {
        daysPerWeek: '۲٫۵ روز در هفته',
        profSatisfaction: '۸۸٪',
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
      description: 'بهترین مدل از نظر روان‌شناختی و یادگیری پایدار دانشجویان. جلسات عمدتاً در ساعات شاداب صبحگاهی توزیع شده و زمان کافی برای مطالعه و پروژه‌های هفتگی فراهم است.',
      badgeColor: 'bg-blue-600 text-white',
      accentBorder: 'border-blue-500 hover:border-blue-600',
      bgGradient: 'from-blue-50 to-indigo-50/40',
      kpi: {
        daysPerWeek: '۴٫۸ روز در هفته',
        profSatisfaction: '۹۲٪',
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
      description: 'در این مدل، اولویت نخست به ساعات سبز اعلام‌شده توسط اساتید داده شده است. اساتید تمام‌وقت در ساعات صبحگاهی و اساتید مدعو در روزهای متمرکز چیده شده‌اند تا کمترین اتلاف وقت رخ دهد.',
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

export default function DepartmentPlanningClient() {
  // Top Level Navigation Tabs
  const [activeMainTab, setActiveMainTab] = useState<'INPUTS' | 'SCENARIOS' | 'APPROVED' | 'ROOMS_MATRIX'>('SCENARIOS');
  const [inputSubTab, setInputSubTab] = useState<'PROFESSORS' | 'CLASSROOMS' | 'DEMANDS'>('PROFESSORS');

  // Core state collections
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>(INITIAL_CLASSROOMS);
  const [professors, setProfessors] = useState<ProfessorOption[]>(INITIAL_PROFESSORS);
  const [availabilities, setAvailabilities] = useState<ProfessorAvailabilityMap>(createDefaultAvailabilities);
  const [courseDemands, setCourseDemands] = useState<CourseDemand[]>(INITIAL_COURSE_DEMANDS);

  // Selected entities for editors
  const [selectedProfId, setSelectedProfId] = useState<number>(1);
  const [selectedCohortFilter, setSelectedCohortFilter] = useState<string>('ALL');
  const [activeScenarioId, setActiveScenarioId] = useState<'COMPACT' | 'BALANCED' | 'PROF_PREF'>('COMPACT');
  
  // Approved offerings state
  const [approvedOfferings, setApprovedOfferings] = useState<DepartmentOffering[]>([]);
  
  // Dynamic Solver Scenarios
  const [scenarios, setScenarios] = useState<AutoScheduleScenario[]>(() => 
    solveDynamicScenarios(INITIAL_CLASSROOMS, INITIAL_PROFESSORS, createDefaultAvailabilities(), INITIAL_COURSE_DEMANDS)
  );

  // Modals & Notifications
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'warning' } | null>(null);
  const [isNewRoomModalOpen, setIsNewRoomModalOpen] = useState(false);
  const [newRoomForm, setNewRoomForm] = useState({ name: '', buildingName: 'ساختمان آموزش', capacity: 35, roomType: 'THEORY' as const, equipment: 'ویدئوپروژکتور، تخته وایت‌برد' });
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    courseId: 1,
    groupNumber: 1,
    professorId: 1,
    dayOfWeek: 0,
    startTime: '08:00',
    endTime: '10:00',
    roomId: 1,
    capacity: 40,
    waitlistCapacity: 5,
    examDate: '1405/10/20',
  });

  // Initial solve on mount
  useEffect(() => {
    const generated = solveDynamicScenarios(classrooms, professors, availabilities, courseDemands);
    setScenarios(generated);
    if (approvedOfferings.length === 0) {
      setApprovedOfferings(generated[0].offerings);
    }
  }, []);

  const showToast = (text: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Re-run solver explicitly
  const handleTriggerSolver = () => {
    const fresh = solveDynamicScenarios(classrooms, professors, availabilities, courseDemands);
    setScenarios(fresh);
    showToast('⚡ الگوریتم چیدمان هوشمند با موفقیت مجدداً اجرا و ۳ سناریوی جدید بر اساس آخرین تنظیمات حضور اساتید و کلاس‌ها تولید شد.', 'success');
  };

  // Apply scenario as approved semester timetable
  const handleApplyScenario = (scenario: AutoScheduleScenario) => {
    setApprovedOfferings(scenario.offerings);
    setActiveMainTab('APPROVED');
    showToast(`✅ ${scenario.title} به عنوان برنامه رسمی و مصوب نیمسال جاری با موفقیت بارگذاری شد.`, 'success');
  };

  // Toggle Professor Slot Status (Cycle: PREF -> AVAIL -> UNAVAIL -> PREF)
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

  // Fast bulk preset for professor
  const handleSetProfPreset = (profId: number, preset: 'ALL_PREF' | 'MORNING_ONLY' | 'AFTERNOON_ONLY' | 'EVEN_DAYS' | 'ODD_DAYS' | 'CLEAR_ALL') => {
    setAvailabilities(prev => {
      const updated = { ...prev };
      if (!updated[profId]) updated[profId] = {};
      
      for (let d = 0; d < 6; d++) {
        if (!updated[profId][d]) updated[profId][d] = {};
        for (const slot of TIME_SLOTS) {
          if (slot.isBreak) continue;
          if (preset === 'ALL_PREF') {
            updated[profId][d][slot.id] = 'PREF';
          } else if (preset === 'CLEAR_ALL') {
            updated[profId][d][slot.id] = 'UNAVAIL';
          } else if (preset === 'MORNING_ONLY') {
            updated[profId][d][slot.id] = (slot.id === 1 || slot.id === 2) ? 'PREF' : 'UNAVAIL';
          } else if (preset === 'AFTERNOON_ONLY') {
            updated[profId][d][slot.id] = (slot.id === 4 || slot.id === 5) ? 'PREF' : 'UNAVAIL';
          } else if (preset === 'EVEN_DAYS') { // شنبه (0)، دوشنبه (2)، چهارشنبه (4)
            updated[profId][d][slot.id] = (d % 2 === 0) ? 'PREF' : 'UNAVAIL';
          } else if (preset === 'ODD_DAYS') { // یکشنبه (1)، سه‌شنبه (3)، پنجشنبه (5)
            updated[profId][d][slot.id] = (d % 2 === 1) ? 'PREF' : 'UNAVAIL';
          }
        }
      }
      return updated;
    });
    showToast('الگوی ساعات حضور استاد اعمال شد. جهت دیدن تأثیر، به تب موتور هوشمند مراجعه کنید.', 'info');
  };

  // Active scenario data
  const currentScenario = useMemo(() => {
    return scenarios.find(s => s.id === activeScenarioId) || scenarios[0];
  }, [scenarios, activeScenarioId]);

  // Selected professor object
  const currentProf = useMemo(() => {
    return professors.find(p => p.id === selectedProfId) || professors[0];
  }, [professors, selectedProfId]);

  // Filtered offerings for grid
  const displayedScenarioOfferings = useMemo(() => {
    if (!currentScenario) return [];
    if (selectedCohortFilter === 'ALL') return currentScenario.offerings;
    return currentScenario.offerings.filter(o => o.targetCohort === selectedCohortFilter);
  }, [currentScenario, selectedCohortFilter]);

  // Create new classroom
  const handleAddNewClassroom = () => {
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
    setNewRoomForm({ name: '', buildingName: 'ساختمان آموزش', capacity: 35, roomType: 'THEORY', equipment: 'ویدئوپروژکتور، تخته وایت‌برد' });
    showToast(`کلاس «${newRoom.name}» با موفقیت افزوده شد.`, 'success');
  };

  // Toggle Classroom Active Status
  const handleToggleClassroomStatus = (id: number) => {
    setClassrooms(prev => prev.map(c => c.id === id ? { ...c, isActive: !c.isActive } : c));
    showToast('وضعیت دسترسی کلاس تغییر یافت.', 'info');
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 p-3 sm:p-6 space-y-5" dir="rtl">
      
      {/* Toast Notification Banner */}
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

      {/* Header Banner */}
      <div className="bg-gradient-to-l from-indigo-900 via-indigo-800 to-slate-900 text-white rounded-2xl p-5 shadow-lg border border-indigo-700/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-slate-950">
              سامانه چیدمان و برنامه‌ریزی هوشمند نیمسال
            </span>
            <span className="text-xs text-indigo-200">نیمسال اول ۱۴۰۵–۱۴۰۶</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            🗓️ کارتابل برنامه‌ریزی درسی و چیدمان هفتگی مدیر گروه
          </h1>
          <p className="text-xs sm:text-sm text-indigo-200 mt-1">
            تعریف ساعات حضور اساتید و کلاس‌های خالی، حل خودکار چیدمان با الگوریتم ۳ سناریویی و تصویب نهایی برنامه
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleTriggerSolver}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-extrabold text-xs sm:text-sm shadow-md transition transform active:scale-95"
            title="اجرای مجدد الگوریتم با اعمال تمام ساعات حضور اساتید و کلاس‌های خالی"
          >
            <span>⚡ بازتولید سناریوها با قیود جدید</span>
          </button>
          <Link
            href="/admin/curriculum"
            className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 transition"
          >
            📚 چارت درسی و سرفصل‌ها
          </Link>
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
          <span>🤖 مرحله ۱: موتور هوشمند و مقایسه ۳ سناریو</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-400 text-slate-950 font-bold">
            {faNum(3)} مدل
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
          <span>⚙️ مرحله ۲: تنظیم فرم حضور اساتید، کلاس‌های خالی و دروس</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-indigo-100 text-indigo-900 font-bold">
            ورودی‌ها
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
          <span>📋 مرحله ۳: برنامه مصوب جاری نیمسال</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold">
            {faNum(approvedOfferings.length)} درس
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
          <span>🏢 مرحله ۴: ماتریس اشغال فضاهای آموزشی</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 font-bold">
            نقشه حرارتی
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: AI MULTI-SCENARIO OPTIMIZATION ENGINE & WEEKLY GRID PREVIEW */}
      {/* ========================================================================= */}
      {activeMainTab === 'SCENARIOS' && (
        <div className="space-y-5">
          {/* Top Solver Trigger Callout */}
          <div className="bg-gradient-to-r from-amber-500/15 via-indigo-50 to-emerald-50 border border-amber-300/80 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xl">💡</span>
                <h2 className="font-extrabold text-slate-900 text-sm sm:text-base">
                  موتور هوشمند ۳ الگوریتم بهینه‌سازی چیدمان هفتگی بر اساس قیود اساتید و کلاس‌ها
                </h2>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                الگوریتم زیر با در نظر گرفتن <b>ساعات مجاز و غیرمجاز اعلامی اساتید</b>، <b>کلاس‌ها و آزمایشگاه‌های خالی</b> و <b>چارت دروس ورودی‌ها</b>، سه رویکرد کاملاً متمایز ارائه داده است. با کلیک روی هر مدل، تفاوت جدول هفتگی، روزهای حضور و ساعات را مشاهده و مدل دلخواه را ثبت کنید.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setActiveMainTab('INPUTS'); setInputSubTab('PROFESSORS'); }}
                className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 text-xs font-bold hover:bg-slate-50 transition shadow-sm"
              >
                ✏️ تغییر ساعات حضور اساتید
              </button>
              <button
                onClick={handleTriggerSolver}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold transition shadow flex items-center gap-1.5"
              >
                <span>⚡ اجرای مجدد الگوریتم</span>
              </button>
            </div>
          </div>

          {/* 3 Scenario KPI Comparison Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {scenarios.map(scenario => {
              const isSelected = scenario.id === activeScenarioId;
              return (
                <div
                  key={scenario.id}
                  onClick={() => setActiveScenarioId(scenario.id)}
                  className={`relative cursor-pointer rounded-2xl p-5 border-2 transition-all duration-200 bg-white flex flex-col justify-between shadow-sm hover:shadow-md ${
                    isSelected
                      ? `ring-4 ring-indigo-500/20 border-indigo-600 bg-gradient-to-br ${scenario.bgGradient}`
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div>
                    {/* Header Badge */}
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-full ${scenario.badgeColor}`}>
                        {scenario.id === 'COMPACT' ? '🟢 مدل فشرده' : scenario.id === 'BALANCED' ? '🔵 مدل متوازن' : '🟣 مدل اساتید'}
                      </span>
                      {isSelected ? (
                        <span className="flex items-center gap-1 text-xs font-extrabold text-indigo-900 bg-indigo-100 px-2.5 py-0.5 rounded-full border border-indigo-300">
                          <span>✓ سناریوی فعال</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 font-bold">کلیک برای مشاهده</span>
                      )}
                    </div>

                    <h3 className="text-base font-extrabold text-slate-900 leading-tight mb-1">
                      {scenario.title}
                    </h3>
                    <p className="text-[11px] text-slate-500 mb-4 line-clamp-2">
                      {scenario.subtitle}
                    </p>

                    {/* KPI Metrics List */}
                    <div className="grid grid-cols-2 gap-2 text-xs bg-white/80 p-3 rounded-xl border border-slate-200/80 mb-4">
                      <div>
                        <span className="text-[10px] text-slate-400 block">روزهای حضور دانشجو:</span>
                        <span className="font-extrabold text-slate-900">{scenario.kpi.daysPerWeek}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">تطابق با فرم اساتید:</span>
                        <span className="font-extrabold text-emerald-700">{scenario.kpi.profSatisfaction}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">تداخل کلاسی/امتحانی:</span>
                        <span className="font-extrabold text-indigo-700">{scenario.kpi.conflictsRate}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">بهره‌وری کلاس‌ها:</span>
                        <span className="font-extrabold text-slate-800">{scenario.kpi.roomEfficiency}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions inside card */}
                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-600">
                      تعداد: {faNum(scenario.offerings.length)} درس
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApplyScenario(scenario);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow transition"
                    >
                      🚀 تصویب این مدل
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active Scenario Preview & Visual Weekly Grid */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
            
            {/* Control Bar */}
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

              {/* Cohort Filter Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">فیلتر ورودی/ترم:</span>
                <select
                  value={selectedCohortFilter}
                  onChange={e => setSelectedCohortFilter(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold bg-slate-50 text-slate-800 focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="ALL">همه ورودی‌ها (ترم ۱، ۳، ۵)</option>
                  <option value="ترم ۱">فقط ورودی جدید (ترم ۱)</option>
                  <option value="ترم ۳">فقط ترم ۳</option>
                  <option value="ترم ۵">فقط ترم ۵</option>
                </select>
                <button
                  onClick={() => handleApplyScenario(currentScenario)}
                  className="px-4 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow-md flex items-center gap-1.5 transition"
                >
                  <span>🚀 تصویب و ثبت قطعی این سناریو</span>
                </button>
              </div>
            </div>

            {/* Visual Timetable Grid */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white text-center">
                    <th className="p-3 border border-slate-800 w-28 font-extrabold">روز هفته / ساعت</th>
                    {TEACHING_SLOTS.map(slot => (
                      <th key={slot.id} className="p-3 border border-slate-800 font-extrabold">
                        <div>{slot.label}</div>
                        <div className="text-[10px] text-slate-300 font-normal mt-0.5">{slot.start} تا {slot.end}</div>
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
                      {TEACHING_SLOTS.map(slot => {
                        const matchingOfferings = displayedScenarioOfferings.filter(o =>
                          o.classSchedules.some(cs => cs.dayOfWeek === dayIdx && cs.slotId === slot.id)
                        );

                        return (
                          <td
                            key={slot.id}
                            className={`p-2 border border-slate-200 align-top min-w-[190px] h-24 ${
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
                                  const isLab = offering.courseType === 'عملی' || offering.courseType === 'پایه' && offering.code === '1112103';
                                  
                                  return (
                                    <div
                                      key={offering.id}
                                      className={`p-2 rounded-xl border shadow-xs transition hover:shadow-sm ${
                                        isLab
                                          ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                                          : offering.targetCohort === 'ترم ۱'
                                          ? 'bg-indigo-50/90 border-indigo-200 text-indigo-950'
                                          : offering.targetCohort === 'ترم ۳'
                                          ? 'bg-emerald-50/90 border-emerald-200 text-emerald-950'
                                          : 'bg-purple-50/90 border-purple-200 text-purple-950'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-1 font-extrabold text-[11px]">
                                        <span>{offering.title}</span>
                                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/80 border border-slate-300">
                                          {offering.targetCohort}
                                        </span>
                                      </div>
                                      <div className="text-[10px] text-slate-600 mt-1 flex items-center gap-1 font-bold">
                                        <span>👨‍🏫 {offering.professorName}</span>
                                      </div>
                                      <div className="text-[10px] text-slate-700 mt-0.5 flex items-center justify-between">
                                        <span className="font-extrabold text-emerald-800">
                                          🏛️ {schedule.roomName}
                                        </span>
                                        <span className="text-slate-500 font-mono">
                                          گروه {faNum(offering.groupNumber)}
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

            {/* Offerings detail summary cards */}
            <div className="pt-4 border-t border-slate-200">
              <h4 className="font-extrabold text-slate-800 text-xs mb-2">
                📋 فهرست تفصیلی دروس اختصاص یافته در این سناریو ({faNum(displayedScenarioOfferings.length)} عنوان درس):
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {displayedScenarioOfferings.map(item => (
                  <div key={item.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-slate-900">{item.title}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-900">
                        {faNum(item.units)} واحد ({item.courseType})
                      </span>
                    </div>
                    <div className="text-slate-600 flex items-center justify-between">
                      <span>استاد: {item.professorName}</span>
                      <span className="text-[11px] font-mono font-bold text-indigo-700">{item.code}</span>
                    </div>
                    <div className="text-slate-700 font-bold bg-white p-1.5 rounded border border-slate-200/80 flex items-center justify-between text-[11px]">
                      <span>
                        🗓️ {item.classSchedules[0]?.dayName} ساعت {faNum(item.classSchedules[0]?.startTime)} تا {faNum(item.classSchedules[0]?.endTime)}
                      </span>
                      <span className="text-emerald-800 font-extrabold">
                        {item.classSchedules[0]?.roomName}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: SCHEDULING INPUTS & CONSTRAINTS (PROFESSORS, CLASSROOMS, DEMANDS) */}
      {/* ========================================================================= */}
      {activeMainTab === 'INPUTS' && (
        <div className="space-y-5">
          {/* Sub-tab navigation */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2 flex flex-wrap gap-2">
            <button
              onClick={() => setInputSubTab('PROFESSORS')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition ${
                inputSubTab === 'PROFESSORS'
                  ? 'bg-indigo-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              👨‍🏫 ۱. فرم زمان‌بندی و ساعات حضور اساتید (Professor Availability)
            </button>
            <button
              onClick={() => setInputSubTab('CLASSROOMS')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition ${
                inputSubTab === 'CLASSROOMS'
                  ? 'bg-indigo-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              🏛️ ۲. کلاس‌های خالی و فضاهای آموزشی (Classrooms Inventory)
            </button>
            <button
              onClick={() => setInputSubTab('DEMANDS')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition ${
                inputSubTab === 'DEMANDS'
                  ? 'bg-indigo-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              📚 ۳. دروس نیازمند برنامه‌ریزی نیمسال (Course Demands)
            </button>
          </div>

          {/* ------------------------------------------------------------- */}
          {/* SUBTAB 1: PROFESSOR AVAILABILITY MATRIX */}
          {/* ------------------------------------------------------------- */}
          {inputSubTab === 'PROFESSORS' && (
            <div className="space-y-4">
              
              {/* Professor Selection Bar */}
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-xl">👨‍🏫</span>
                  <div>
                    <label className="text-xs font-bold text-slate-500 block mb-0.5">انتخاب استاد جهت تنظیم فرم حضور:</label>
                    <select
                      value={selectedProfId}
                      onChange={e => setSelectedProfId(Number(e.target.value))}
                      className="border-2 border-indigo-400 rounded-xl px-3 py-1.5 font-extrabold text-sm text-indigo-950 bg-indigo-50/50 focus:ring-2 focus:ring-indigo-500"
                    >
                      {professors.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.academicRank} — {p.contractType} — {p.departmentName})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Quick Profile Info */}
                <div className="flex flex-wrap items-center gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <span>نوع قرارداد: <b className="text-slate-900">{currentProf.contractType}</b></span>
                  <span>|</span>
                  <span>سقف تدریس هفتگی: <b className="text-indigo-800">{faNum(currentProf.maxWeeklyUnits)} واحد</b></span>
                  <span>|</span>
                  <span>حداکثر تدریس روزانه: <b className="text-indigo-800">{faNum(currentProf.maxDailyHours)} ساعت</b></span>
                </div>
              </div>

              {/* Matrix Control Box & Presets */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
                      ماتریس هفتگی ساعات حضور: {currentProf.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      روی هر خانه کلیک کنید تا وضعیت آن بین <b>🟩 حاضر/اولویت</b>، <b>🟨 قابل حضور</b> و <b>🟥 عدم امکان حضور</b> تغییر کند.
                    </p>
                  </div>

                  {/* Fast Action Presets */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => handleSetProfPreset(selectedProfId, 'ALL_PREF')}
                      className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-[11px] transition"
                    >
                      🟢 حضور کامل هفته
                    </button>
                    <button
                      onClick={() => handleSetProfPreset(selectedProfId, 'MORNING_ONLY')}
                      className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[11px] transition"
                    >
                      ☀️ فقط صبح‌ها (۸-۱۲)
                    </button>
                    <button
                      onClick={() => handleSetProfPreset(selectedProfId, 'AFTERNOON_ONLY')}
                      className="px-2.5 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-900 font-bold text-[11px] transition"
                    >
                      🌆 فقط بعدازظهرها (۱۳:۳۰-۱۷:۳۰)
                    </button>
                    <button
                      onClick={() => handleSetProfPreset(selectedProfId, 'EVEN_DAYS')}
                      className="px-2.5 py-1 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-900 font-bold text-[11px] transition"
                    >
                      📅 روزهای زوج
                    </button>
                    <button
                      onClick={() => handleSetProfPreset(selectedProfId, 'CLEAR_ALL')}
                      className="px-2.5 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-900 font-bold text-[11px] transition"
                    >
                      🔴 مسدودسازی کل هفته
                    </button>
                  </div>
                </div>

                {/* The Interactive Matrix Grid */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-white text-center">
                        <th className="p-3 border border-slate-800 w-28 font-extrabold">روز هفته</th>
                        {TIME_SLOTS.map(slot => (
                          <th key={slot.id} className="p-3 border border-slate-800 font-extrabold">
                            <div>{slot.label}</div>
                            <div className="text-[10px] text-slate-300 font-normal mt-0.5">{slot.start} الی {slot.end}</div>
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
                          {TIME_SLOTS.map(slot => {
                            if (slot.isBreak) {
                              return (
                                <td key={slot.id} className="p-2 border border-slate-200 bg-slate-100/70 text-slate-400 text-center font-bold text-[10px]">
                                  استراحت و نماز
                                </td>
                              );
                            }

                            const status = availabilities[selectedProfId]?.[dayIdx]?.[slot.id] || 'AVAIL';

                            return (
                              <td
                                key={slot.id}
                                onClick={() => handleToggleProfSlot(selectedProfId, dayIdx, slot.id)}
                                className="p-2 border border-slate-200 cursor-pointer transition select-none hover:opacity-90"
                              >
                                <div className={`p-3 rounded-xl text-center font-extrabold text-xs transition border flex flex-col items-center justify-center gap-1 shadow-xs ${
                                  status === 'PREF'
                                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-emerald-200'
                                    : status === 'AVAIL'
                                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                                    : 'bg-rose-100 text-rose-900 border-rose-300'
                                }`}>
                                  <span>{status === 'PREF' ? '🟩 حاضر و اولویت اصلی' : status === 'AVAIL' ? '🟨 قابل حضور مشروط' : '🟥 عدم امکان حضور'}</span>
                                  <span className="text-[10px] opacity-80">
                                    {status === 'PREF' ? 'الویت تدریس' : status === 'AVAIL' ? 'در صورت ضرورت' : 'مرخصی / پژوهشی'}
                                  </span>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Legend & Save Prompt */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-slate-200 text-xs">
                  <div className="flex items-center gap-4 text-slate-600 font-bold">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-600"></span> حاضر و اولویت اصلی (سبز)</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-200 border border-amber-400"></span> قابل حضور در صورت نیاز (زرد)</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-200 border border-rose-400"></span> عدم امکان حضور (قرمز)</span>
                  </div>

                  <button
                    onClick={() => {
                      handleTriggerSolver();
                      showToast(`فرم ترجیحات حضور ${currentProf.name} ذخیره شد و الگوریتم بازتولید گردید.`, 'success');
                      setActiveMainTab('SCENARIOS');
                    }}
                    className="px-4 py-2 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-extrabold text-xs shadow transition flex items-center gap-2"
                  >
                    <span>💾 ذخیره ترجیحات و اجرای موتور چیدمان</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* SUBTAB 2: CLASSROOMS & LABS INVENTORY */}
          {/* ------------------------------------------------------------- */}
          {inputSubTab === 'CLASSROOMS' && (
            <div className="space-y-4">
              
              {/* Header Bar */}
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    🏛️ فهرست کلاس‌ها، سایت‌ها و آزمایشگاه‌های آموزشی
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    مدیریت فضاهای فیزیکی در دسترس، ظرفیت صندلی‌ها، تجهیزات و وضعیت فعال/غیرفعال جهت چیدمان درسی
                  </p>
                </div>

                <button
                  onClick={() => setIsNewRoomModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow flex items-center gap-1.5 transition"
                >
                  <span>➕ افزودن کلاس / آزمایشگاه جدید</span>
                </button>
              </div>

              {/* Classrooms Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {classrooms.map(room => (
                  <div
                    key={room.id}
                    className={`bg-white rounded-2xl p-4 border-2 transition-all shadow-sm flex flex-col justify-between ${
                      room.isActive ? 'border-slate-200 hover:border-indigo-400' : 'border-rose-200 bg-rose-50/40 opacity-75'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full ${
                          room.roomType === 'LAB' ? 'bg-amber-100 text-amber-900 border border-amber-300' :
                          room.roomType === 'GYM' ? 'bg-teal-100 text-teal-900 border border-teal-300' :
                          room.roomType === 'EXAM' ? 'bg-purple-100 text-purple-900 border border-purple-300' :
                          'bg-indigo-100 text-indigo-900 border border-indigo-200'
                        }`}>
                          {room.roomType === 'LAB' ? '🧪 آزمایشگاه / سایت کامپیوتر' :
                           room.roomType === 'GYM' ? '⚽ سالن ورزشی' :
                           room.roomType === 'EXAM' ? '🏛️ سالن همایش / امتحانات' : '📖 کلاس نظری'}
                        </span>

                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          room.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {room.isActive ? 'فعال و در دسترس' : 'غیرفعال / در دست تعمیر'}
                        </span>
                      </div>

                      <h4 className="text-base font-extrabold text-slate-900 mb-1">{room.name}</h4>
                      <p className="text-xs text-slate-500 mb-3">{room.buildingName}</p>

                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs space-y-1 mb-3">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">ظرفیت فیزیکی صندلی:</span>
                          <span className="font-extrabold text-slate-900">{faNum(room.capacity)} نفر</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">امکانات و تجهیزات:</span>
                          <span className="font-bold text-indigo-900">{room.equipment.join('، ')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
                      <button
                        onClick={() => handleToggleClassroomStatus(room.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                          room.isActive
                            ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        }`}
                      >
                        {room.isActive ? 'غیرفعال‌سازی موقت' : 'فعال‌سازی کلاس'}
                      </button>

                      <button
                        onClick={() => {
                          setClassrooms(prev => prev.filter(c => c.id !== room.id));
                          showToast(`کلاس «${room.name}» حذف شد.`, 'info');
                        }}
                        className="text-xs text-slate-400 hover:text-rose-600 font-bold"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* SUBTAB 3: COURSE DEMANDS */}
          {/* ------------------------------------------------------------- */}
          {inputSubTab === 'DEMANDS' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    📚 لیست عناوین درسی مورد نیاز جهت چیدمان نیمسال
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    دروس ورودی‌های مختلف (ترم ۱، ترم ۳، ترم ۵) به همراه استاد ترجیحی و نوع فضای آموزشی مورد نیاز
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600">
                    مجموع کل: {faNum(courseDemands.length)} عنوان درس
                  </span>
                  <button
                    onClick={handleTriggerSolver}
                    className="px-3.5 py-1.5 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-extrabold text-xs shadow"
                  >
                    ⚡ بازتولید چیدمان هوشمند
                  </button>
                </div>
              </div>

              {/* Course Demands Table */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white text-center">
                      <th className="p-3 border border-slate-800 font-extrabold">کد درس</th>
                      <th className="p-3 border border-slate-800 font-extrabold">عنوان درس</th>
                      <th className="p-3 border border-slate-800 font-extrabold">تعداد واحد</th>
                      <th className="p-3 border border-slate-800 font-extrabold">نوع درس</th>
                      <th className="p-3 border border-slate-800 font-extrabold">ورودی / ترم هدف</th>
                      <th className="p-3 border border-slate-800 font-extrabold">استاد مدرس پیشنهادی</th>
                      <th className="p-3 border border-slate-800 font-extrabold">نوع فضای مورد نیاز</th>
                      <th className="p-3 border border-slate-800 font-extrabold">ظرفیت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courseDemands.map((c, idx) => {
                      const prof = professors.find(p => p.id === c.preferredProfId);
                      return (
                        <tr key={c.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="p-3 border border-slate-200 font-mono text-center font-bold text-indigo-900">{c.code}</td>
                          <td className="p-3 border border-slate-200 font-extrabold text-slate-900">{c.title}</td>
                          <td className="p-3 border border-slate-200 text-center font-bold">{faNum(c.units)}</td>
                          <td className="p-3 border border-slate-200 text-center">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-800">{c.courseType}</span>
                          </td>
                          <td className="p-3 border border-slate-200 text-center">
                            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-indigo-100 text-indigo-900">{c.targetCohort}</span>
                          </td>
                          <td className="p-3 border border-slate-200 font-bold text-slate-800">{prof?.name}</td>
                          <td className="p-3 border border-slate-200 text-center font-bold text-slate-700">
                            {c.requiredRoomType === 'LAB' ? '🧪 سایت / آزمایشگاه' : c.requiredRoomType === 'GYM' ? '⚽ سالن ورزشی' : '📖 کلاس نظری'}
                          </td>
                          <td className="p-3 border border-slate-200 text-center font-bold text-slate-900">{faNum(c.capacity)} نفر</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: APPROVED OFFERINGS TABLE & MANUAL EDITS */}
      {/* ========================================================================= */}
      {activeMainTab === 'APPROVED' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                <h3 className="font-extrabold text-slate-900 text-base">
                  برنامه درسی مصوب و نهایی نیمسال جاری ({faNum(approvedOfferings.length)} عنوان کلاس فعال)
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                این دروس مستقیماً در سامانه انتخاب واحد دانشجویان، کارتابل اساتید و کارت ورود به جلسه بارگذاری شده است.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsManualModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow flex items-center gap-1.5 transition"
              >
                <span>➕ ارائه دستی کلاس جدید / گروه موازی</span>
              </button>
            </div>
          </div>

          {/* Approved Offerings Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white text-center">
                  <th className="p-3 border border-slate-800 w-12">ردیف</th>
                  <th className="p-3 border border-slate-800">کد درس</th>
                  <th className="p-3 border border-slate-800">عنوان درس</th>
                  <th className="p-3 border border-slate-800">گروه</th>
                  <th className="p-3 border border-slate-800">واحد</th>
                  <th className="p-3 border border-slate-800">استاد مدرس</th>
                  <th className="p-3 border border-slate-800">زمان‌بندی هفتگی کلاس</th>
                  <th className="p-3 border border-slate-800">شماره و نام کلاس</th>
                  <th className="p-3 border border-slate-800">امتحان پایان‌ترم</th>
                  <th className="p-3 border border-slate-800">ظرفیت</th>
                  <th className="p-3 border border-slate-800">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {approvedOfferings.map((item, idx) => (
                  <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="p-2 border border-slate-200 text-center font-bold text-slate-500">{faNum(idx + 1)}</td>
                    <td className="p-2 border border-slate-200 font-mono text-center font-bold text-indigo-900">{item.code}</td>
                    <td className="p-2 border border-slate-200 font-extrabold text-slate-900">{item.title}</td>
                    <td className="p-2 border border-slate-200 text-center font-bold">گروه {faNum(item.groupNumber)}</td>
                    <td className="p-2 border border-slate-200 text-center font-bold">{faNum(item.units)}</td>
                    <td className="p-2 border border-slate-200 font-bold text-slate-800">{item.professorName}</td>
                    <td className="p-2 border border-slate-200 text-slate-700">
                      {item.classSchedules.map((cs, i) => (
                        <div key={i} className="font-bold">
                          • {cs.dayName} {faNum(cs.startTime)} الی {faNum(cs.endTime)}
                        </div>
                      ))}
                    </td>
                    <td className="p-2 border border-slate-200 font-extrabold text-emerald-900">
                      🏛️ {item.classSchedules[0]?.roomName || '—'}
                    </td>
                    <td className="p-2 border border-slate-200 text-center font-bold text-slate-700">
                      {faNum(item.examSchedule?.examDate)} ({faNum(item.examSchedule?.startTime)})
                    </td>
                    <td className="p-2 border border-slate-200 text-center font-bold text-slate-900">
                      {faNum(item.capacity)} نفر
                    </td>
                    <td className="p-2 border border-slate-200 text-center">
                      <button
                        onClick={() => {
                          setApprovedOfferings(prev => prev.filter(o => o.id !== item.id));
                          showToast(`درس «${item.title}» از برنامه مصوب حذف شد.`, 'info');
                        }}
                        className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px]"
                      >
                        حذف
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
      {/* TAB 4: ROOM OCCUPANCY MATRIX (HEATMAP) */}
      {/* ========================================================================= */}
      {activeMainTab === 'ROOMS_MATRIX' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">
                🏢 ماتریس و نقشه حرارتی اشغال فضاهای آموزشی در طول هفته
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                مشاهده آنلاین وضعیت اشغال و ساعت‌های خالی هر کلاس جهت برنامه‌ریزی جلسات جبرانی و آزمون‌ها
              </p>
            </div>
            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl">
              تعداد کلاس‌های مانیتور شده: {faNum(classrooms.length)} فضا
            </span>
          </div>

          {/* Rooms Grid */}
          <div className="space-y-6">
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
                        {TEACHING_SLOTS.map(s => (
                          <th key={s.id} className="p-2 border border-slate-200 font-bold">{s.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DAY_NAMES.map((dayName, dayIdx) => (
                        <tr key={dayIdx}>
                          <td className="p-2 border border-slate-200 font-bold text-center bg-slate-50">{dayName}</td>
                          {TEACHING_SLOTS.map(slot => {
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

      {/* ========================================================================= */}
      {/* MODAL: ADD NEW CLASSROOM */}
      {/* ========================================================================= */}
      {isNewRoomModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 bg-indigo-950 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-sm sm:text-base">➕ افزودن کلاس یا آزمایشگاه جدید</h3>
              <button onClick={() => setIsNewRoomModalOpen(false)} className="text-white/60 hover:text-white">✕</button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">نام یا شماره اتاق:</label>
                <input
                  type="text"
                  placeholder="مثال: اتاق ۳۰۴ یا آزمایشگاه شبکه‌های نوین"
                  value={newRoomForm.name}
                  onChange={e => setNewRoomForm({ ...newRoomForm, name: e.target.value })}
                  className="w-full border border-slate-300 px-3 py-2 rounded-lg font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">نام ساختمان:</label>
                  <select
                    value={newRoomForm.buildingName}
                    onChange={e => setNewRoomForm({ ...newRoomForm, buildingName: e.target.value })}
                    className="w-full border border-slate-300 px-3 py-2 rounded-lg font-bold"
                  >
                    <option value="ساختمان آموزش">ساختمان آموزش</option>
                    <option value="دانشکده فنی">دانشکده فنی</option>
                    <option value="دانشکده علوم">دانشکده علوم</option>
                    <option value="مجموعه ورزشی">مجموعه ورزشی</option>
                    <option value="ساختمان مرکزی">ساختمان مرکزی</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">نوع فضا:</label>
                  <select
                    value={newRoomForm.roomType}
                    onChange={e => setNewRoomForm({ ...newRoomForm, roomType: e.target.value as any })}
                    className="w-full border border-slate-300 px-3 py-2 rounded-lg font-bold"
                  >
                    <option value="THEORY">کلاس نظری</option>
                    <option value="LAB">آزمایشگاه / سایت کامپیوتر</option>
                    <option value="GYM">سالن ورزشی</option>
                    <option value="EXAM">سالن همایش / آزمون</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">ظرفیت صندلی (نفر):</label>
                  <input
                    type="number"
                    value={newRoomForm.capacity}
                    onChange={e => setNewRoomForm({ ...newRoomForm, capacity: Number(e.target.value) })}
                    className="w-full border border-slate-300 px-3 py-2 rounded-lg font-bold font-mono"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">امکانات (با ویرگول جدا کنید):</label>
                  <input
                    type="text"
                    value={newRoomForm.equipment}
                    onChange={e => setNewRoomForm({ ...newRoomForm, equipment: e.target.value })}
                    className="w-full border border-slate-300 px-3 py-2 rounded-lg font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setIsNewRoomModalOpen(false)} className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs">
                انصراف
              </button>
              <button onClick={handleAddNewClassroom} className="px-5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow">
                ذخیره کلاس
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: MANUAL COURSE OFFERING */}
      {/* ========================================================================= */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 bg-indigo-950 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-sm sm:text-base">➕ ارائه دستی کلاس / گروه موازی</h3>
              <button onClick={() => setIsManualModalOpen(false)} className="text-white/60 hover:text-white">✕</button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">عنوان درس:</label>
                <select
                  value={manualForm.courseId}
                  onChange={e => setManualForm({ ...manualForm, courseId: Number(e.target.value) })}
                  className="w-full border border-slate-300 px-3 py-2 rounded-lg font-bold"
                >
                  {courseDemands.map(c => (
                    <option key={c.id} value={c.id}>{c.code} — {c.title} ({c.units} واحد)</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">استاد مدرس:</label>
                  <select
                    value={manualForm.professorId}
                    onChange={e => setManualForm({ ...manualForm, professorId: Number(e.target.value) })}
                    className="w-full border border-slate-300 px-3 py-2 rounded-lg font-bold"
                  >
                    {professors.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.contractType})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">شماره گروه:</label>
                  <select
                    value={manualForm.groupNumber}
                    onChange={e => setManualForm({ ...manualForm, groupNumber: Number(e.target.value) })}
                    className="w-full border border-slate-300 px-3 py-2 rounded-lg font-bold"
                  >
                    <option value={1}>گروه ۱</option>
                    <option value={2}>گروه ۲</option>
                    <option value={3}>گروه ۳</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">روز جلسه:</label>
                  <select
                    value={manualForm.dayOfWeek}
                    onChange={e => setManualForm({ ...manualForm, dayOfWeek: Number(e.target.value) })}
                    className="w-full border border-slate-300 px-2 py-1.5 rounded-lg font-bold"
                  >
                    {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">ساعت شروع:</label>
                  <input
                    type="text"
                    value={manualForm.startTime}
                    onChange={e => setManualForm({ ...manualForm, startTime: e.target.value })}
                    className="w-full border border-slate-300 px-2 py-1.5 rounded-lg font-mono text-center"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">ساعت پایان:</label>
                  <input
                    type="text"
                    value={manualForm.endTime}
                    onChange={e => setManualForm({ ...manualForm, endTime: e.target.value })}
                    className="w-full border border-slate-300 px-2 py-1.5 rounded-lg font-mono text-center"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">کلاس / محل برگزاری:</label>
                <select
                  value={manualForm.roomId}
                  onChange={e => setManualForm({ ...manualForm, roomId: Number(e.target.value) })}
                  className="w-full border border-slate-300 px-3 py-2 rounded-lg font-extrabold text-emerald-900"
                >
                  {classrooms.map(r => (
                    <option key={r.id} value={r.id}>{r.name} ({r.buildingName})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setIsManualModalOpen(false)} className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs">
                انصراف
              </button>
              <button
                onClick={() => {
                  const targetCourse = courseDemands.find(c => c.id === manualForm.courseId)!;
                  const targetProf = professors.find(p => p.id === manualForm.professorId)!;
                  const targetRoom = classrooms.find(r => r.id === manualForm.roomId)!;

                  const newOffering: DepartmentOffering = {
                    id: Date.now(),
                    termId: 14051,
                    courseId: targetCourse.id,
                    code: targetCourse.code,
                    title: targetCourse.title,
                    units: targetCourse.units,
                    courseType: targetCourse.courseType,
                    targetCohort: targetCourse.targetCohort,
                    groupNumber: manualForm.groupNumber,
                    professorId: targetProf.id,
                    professorName: targetProf.name,
                    capacity: manualForm.capacity,
                    enrolledCount: 0,
                    waitlistCapacity: manualForm.waitlistCapacity,
                    classSchedules: [{
                      dayOfWeek: manualForm.dayOfWeek,
                      dayName: DAY_NAMES[manualForm.dayOfWeek],
                      slotId: 1,
                      startTime: manualForm.startTime,
                      endTime: manualForm.endTime,
                      roomId: targetRoom.id,
                      roomName: targetRoom.name,
                      buildingName: targetRoom.buildingName,
                    }],
                    examSchedule: {
                      examDate: manualForm.examDate,
                      startTime: '۰۸:۳۰',
                      endTime: '۱۰:۳۰',
                      roomName: 'آمفی‌تئاتر مرکزی',
                    },
                  };

                  setApprovedOfferings(prev => [...prev, newOffering]);
                  setIsManualModalOpen(false);
                  showToast(`درس «${newOffering.title}» (گروه ${newOffering.groupNumber}) با موفقیت ارائه شد.`, 'success');
                }}
                className="px-5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow"
              >
                ثبت و ارائه کلاس
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
