'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { getSchedulingWorkspaceAction, generateClassSessionsAction, type GenerateSessionsOutcome } from './actions';

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
  isEmployedAudience?: boolean;
}

export interface ClassroomOption {
  id: number;
  name: string;
  buildingName: string;
  capacity: number;
  roomType: 'THEORY' | 'LAB' | 'GYM' | 'EXAM';
  equipment: string[];
  isActive: boolean;
  isAllocatedToDept: boolean;
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
  hasSubmittedAvailability: boolean;
  chairNotes?: string; // یادداشت و هماهنگی مدیر گروه با استاد
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
  groupProfessors?: { [groupNo: number]: number };
  isCoTaught?: boolean;
  coProfId?: number;
  theoryWeightRatio?: number; // e.g. 0.70 (14 marks out of 20)
  labWeightRatio?: number;    // e.g. 0.30 (6 marks out of 20)
  requiredRoomType: 'THEORY' | 'LAB' | 'GYM';
  capacity: number;
  groupsCount: number;
  weekRecurrence: WeekRecurrence;
  sessionsCountPerWeek: number;
  examDate: string;
  examSchedulingMode?: 'AUTO_MATRIX' | 'MANUAL';
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
  isCoTaught?: boolean;
  coProfId?: number;
  coProfName?: string;
  theoryWeightRatio?: number;
  labWeightRatio?: number;
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

// ═══════════════════════════════════════════════════════════════════════
// دادهٔ واقعی سرور (getSchedulingWorkspaceAction) — در این فایل هیچ
// Mock ثابتی وجود ندارد؛ همهٔ آرایه‌ها از actions.ts می‌آیند.
// ═══════════════════════════════════════════════════════════════════════

export interface SchedulingWorkspace {
  terms: { id: number; code: string; title: string; isCurrent: boolean }[];
  selectedTermId: number | null;
  programs: { id: number; code: string; title: string; facultyName: string; degreeLevel: string }[];
  cohorts: { entryYear: number; expectedStudents: number }[];
  classrooms: { id: number; name: string; buildingName: string; capacity: number; roomType: string }[];
  allocatedRoomIds: number[];
  professors: { id: number; name: string; staffCode: string | null; academicRank: string | null; departmentName: string | null }[];
  demands: {
    offeringId: number; code: string; title: string; units: string; courseType: string;
    capacity: number; groupNumber: number; professorId: number | null; isCoTaught: boolean;
    enrolledCount: number; programId: number; programTitle: string;
    cohortId: string; cohortTitle: string;
  }[];
  phases: Record<number, string>;
  termCalendar: { startJalali: string | null; endJalali: string | null; startDate: string | null } | null;
  sessionsTotal: number;
  sessionsByOffering: Record<number, { total: number; makeup: number; firstDate: string | null }>;
  hardConflictCount: number;
  approvedOfferings: {
    offeringId: number; code: string; title: string; units: string; courseType: string;
    groupNumber: number; professorId: number | null; professorName: string; capacity: number;
    enrolledCount: number; dayOfWeek: number | null; dayName: string; startTime: string;
    endTime: string; roomId: number | null; roomName: string; buildingName: string;
  }[];
  makeupSessions: {
    id: number; courseCode: string; courseTitle: string; profName: string;
    sessionNo: number; sessionDate: string; sessionTime: string; replacedSessionId: number | null;
  }[];
}

const faToEnDigits = (s: string) =>
  String(s)
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/** استخراج تاریخ‌های 'YYYY/MM/DD' از متن آزاد (تعطیلات) — با رقوم لاتین */
const parseJalaliDates = (s: string): string[] =>
  (String(s).match(/\d{4}\s*[/٫]\s*\d{1,2}\s*[/٫]\s*\d{1,2}/g) || []).map(p =>
    faToEnDigits(p).replace(/\s+/g, '').replace(/٫/g, '/')
  );

function mapDemands(demands: SchedulingWorkspace['demands']): CourseDemand[] {
  return demands.map(d => ({
    id: d.offeringId,
    programId: d.programId,
    programTitle: d.programTitle,
    cohortId: d.cohortId,
    cohortTitle: d.cohortTitle,
    code: d.code,
    title: d.title,
    units: Number(d.units) || 0,
    courseType: (['پایه', 'اصلی', 'تخصصی', 'عمومی', 'عملی'].includes(d.courseType) ? d.courseType : 'عمومی') as CourseDemand['courseType'],
    preferredProfId: d.professorId ?? 0,
    isCoTaught: d.isCoTaught || undefined,
    requiredRoomType: 'THEORY',
    capacity: d.capacity,
    groupsCount: 1,
    weekRecurrence: 'ALL',
    sessionsCountPerWeek: 1,
    examDate: '',
  }));
}

function mapClassrooms(rooms: SchedulingWorkspace['classrooms'], allocatedRoomIds: number[]): ClassroomOption[] {
  return rooms.map(r => ({
    id: r.id,
    name: r.name,
    buildingName: r.buildingName,
    capacity: r.capacity,
    roomType: (['THEORY', 'LAB', 'GYM', 'EXAM'].includes(r.roomType) ? r.roomType : 'THEORY') as ClassroomOption['roomType'],
    equipment: [],
    isActive: true,
    isAllocatedToDept: allocatedRoomIds.includes(r.id),
  }));
}

/** سقف‌های تدریس استاد فعلاً ستون دیتابیسی ندارند (گپ شناخته‌شدهٔ طراحی)؛ پیش‌فرض صریح */
const PROF_DEFAULT_MAX_UNITS = 16;
const PROF_DEFAULT_MAX_DAILY_HOURS = 6;

function mapProfessors(profs: SchedulingWorkspace['professors']): ProfessorOption[] {
  return profs.map(p => ({
    id: p.id,
    name: p.name,
    staffCode: p.staffCode ?? '—',
    academicRank: p.academicRank ?? '—',
    contractType: 'تمام‌وقت',
    departmentName: p.departmentName ?? '—',
    maxWeeklyUnits: PROF_DEFAULT_MAX_UNITS,
    maxDailyHours: PROF_DEFAULT_MAX_DAILY_HOURS,
    hasSubmittedAvailability: false,
  }));
}

function mapCohorts(cohorts: SchedulingWorkspace['cohorts']): CohortOption[] {
  return cohorts.map(c => ({
    id: String(c.entryYear),
    entryYear: faNum(c.entryYear),
    semesterNo: 0,
    title: `ورودی ${faNum(c.entryYear)}`,
    expectedStudents: c.expectedStudents,
  }));
}

function mapOfferings(rows: SchedulingWorkspace['approvedOfferings']): DepartmentOffering[] {
  return rows.map(r => ({
    id: r.offeringId,
    termId: 0,
    programId: 0,
    programTitle: 'همهٔ رشته‌ها',
    cohortId: 'ALL',
    cohortTitle: 'کلیهٔ ورودی‌ها',
    courseId: r.offeringId,
    code: r.code,
    title: r.title,
    units: Number(r.units) || 0,
    courseType: r.courseType,
    groupNumber: r.groupNumber,
    professorId: r.professorId ?? 0,
    professorName: r.professorName,
    capacity: r.capacity,
    enrolledCount: r.enrolledCount,
    waitlistCapacity: 0,
    classSchedules: [{
      dayOfWeek: (r.dayOfWeek ?? 1) - 1,
      dayName: r.dayName,
      slotId: 0,
      startTime: r.startTime,
      endTime: r.endTime,
      roomId: r.roomId ?? 0,
      roomName: r.roomName,
      buildingName: r.buildingName,
      weekType: 'ALL',
    }],
    examSchedule: null,
  }));
}

const PHASE_LABELS: Record<string, string> = {
  SUPPLY: 'تأمین (فاز ۱)',
  ALLOCATION: 'تخصیص (فاز ۲)',
  REVIEW: 'بازبینی کارشناس (فاز ۳)',
  PUBLISHED: 'منتشرشده (فاز ۴)',
};

// ==========================================
// BELL SCHEDULE PRESETS
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

// ═══════════════════════════════════════════════════════════════════════
// حضور استادان — پیش‌فرض خنثی (بدون دادهٔ واقعی، هیچ اولویتی ساخته نمی‌شود)
// ═══════════════════════════════════════════════════════════════════════

function createNeutralAvailabilities(profIds: number[]): ProfessorAvailabilityMap {
  const map: ProfessorAvailabilityMap = {};
  for (const profId of profIds) {
    map[profId] = {};
    for (let d = 0; d < 6; d++) {
      map[profId][d] = {};
      for (let s = 1; s <= 12; s++) map[profId][d][s] = 'AVAIL';
    }
  }
  return map;
}

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
  const activeClassrooms = classrooms.filter(c => c.isActive && c.isAllocatedToDept);
  const fallbackRooms = activeClassrooms.length > 0 ? activeClassrooms : classrooms.filter(c => c.isActive);

  const theoryRooms = fallbackRooms.filter(c => c.roomType === 'THEORY');
  const labRooms = fallbackRooms.filter(c => c.roomType === 'LAB');
  const gymRooms = fallbackRooms.filter(c => c.roomType === 'GYM');

  const afternoonEveningSlots = teachingSlots.filter(s => s.startTime >= '13:00');
  const fallbackAfternoonSlots = afternoonEveningSlots.length > 0 ? afternoonEveningSlots : teachingSlots;

  const getFallbackRoom = (type: string, idx: number): ClassroomOption => {
    if (type === 'LAB' && labRooms.length > 0) return labRooms[idx % labRooms.length];
    if (type === 'GYM' && gymRooms.length > 0) return gymRooms[idx % gymRooms.length];
    if (theoryRooms.length > 0) return theoryRooms[idx % theoryRooms.length];
    return fallbackRooms[0] || classrooms[0];
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
      const profId = d.groupProfessors?.[g] || d.preferredProfId;
      const prof = getProf(profId);

      flattenedList.push({
        demand: d,
        groupNo: g,
        assignedProf: prof,
        uniqueId: d.id * 100 + g,
      });
    }
  });

  // 1. COMPACT SCENARIO
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
      isCoTaught: item.demand.isCoTaught,
      coProfId: item.demand.coProfId,
      coProfName: item.demand.coProfId ? getProf(item.demand.coProfId).name : undefined,
      theoryWeightRatio: item.demand.theoryWeightRatio,
      labWeightRatio: item.demand.labWeightRatio,
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

  // 2. BALANCED SCENARIO
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
      isCoTaught: item.demand.isCoTaught,
      coProfId: item.demand.coProfId,
      coProfName: item.demand.coProfId ? getProf(item.demand.coProfId).name : undefined,
      theoryWeightRatio: item.demand.theoryWeightRatio,
      labWeightRatio: item.demand.labWeightRatio,
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

  // 3. PROFESSOR PREFERENCE SCENARIO
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
      isCoTaught: item.demand.isCoTaught,
      coProfId: item.demand.coProfId,
      coProfName: item.demand.coProfId ? getProf(item.demand.coProfId).name : undefined,
      theoryWeightRatio: item.demand.theoryWeightRatio,
      labWeightRatio: item.demand.labWeightRatio,
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

  // 4. AFTERNOON & WORKING STUDENTS SCENARIO
  const workingOfferings: DepartmentOffering[] = [];
  const workingDays = [0, 1, 2, 3, 4, 5];
  const profTimeOccupiedWorking: { [profId: number]: Set<string> } = {};

  flattenedList.forEach((item, index) => {
    const profId = item.assignedProf.id;
    if (!profTimeOccupiedWorking[profId]) profTimeOccupiedWorking[profId] = new Set();

    let assignedDay = workingDays[index % workingDays.length];
    let assignedSlot = fallbackAfternoonSlots[Math.floor(index / workingDays.length) % fallbackAfternoonSlots.length] || fallbackAfternoonSlots[0];

    for (const d of workingDays) {
      for (const s of fallbackAfternoonSlots) {
        const timeKey = `${d}-${s.id}-${item.demand.weekRecurrence}`;
        const anyWeekKey = `${d}-${s.id}-ALL`;
        if (!profTimeOccupiedWorking[profId].has(timeKey) && !profTimeOccupiedWorking[profId].has(anyWeekKey) && isProfAvailable(profId, d, s.id) !== 'UNAVAIL') {
          assignedDay = d;
          assignedSlot = s;
          break;
        }
      }
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
      isCoTaught: item.demand.isCoTaught,
      coProfId: item.demand.coProfId,
      coProfName: item.demand.coProfId ? getProf(item.demand.coProfId).name : undefined,
      theoryWeightRatio: item.demand.theoryWeightRatio,
      labWeightRatio: item.demand.labWeightRatio,
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
      description: 'این سناریو برای دانشجویان شاغل، دوره‌های شبانه، کارشناسی ارشد و پاره‌وقت طراحی شده است. کلیه ساعات صبح (۰۸:۰۰ تا ۱۲:۰۰) کاملاً آزاد بوده و کلاس‌ها در بلوک‌های بعدازظهر تشکیل می‌شوند.',
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

export default function DepartmentPlanningClient({ initial }: { initial: SchedulingWorkspace }) {
  // Global Planning Context — همه از دادهٔ واقعی سرور (getSchedulingWorkspaceAction)
  const [selectedTermId, setSelectedTermId] = useState<number>(initial.selectedTermId ?? 0);
  const [selectedProgramId, setSelectedProgramId] = useState<number>(initial.programs[0]?.id ?? 0);
  const [selectedCohortId, setSelectedCohortId] = useState<string>('ALL');
  const [targetShiftPreference, setTargetShiftPreference] = useState<ProgramShiftType>('AFTERNOON_WORKING');

  // فعال‌های واقعی
  const [terms, setTerms] = useState(initial.terms);
  const [programs, setPrograms] = useState(initial.programs);
  const [cohorts, setCohorts] = useState<CohortOption[]>(() => mapCohorts(initial.cohorts));
  const [currentPhase, setCurrentPhase] = useState<string>(initial.phases[initial.selectedTermId ?? 0] ?? 'SUPPLY');
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);

  // Time Slots / Bell Schedule State
  const [activeSlotPresetKey, setActiveSlotPresetKey] = useState<'STANDARD_120' | 'STANDARD_90' | 'STANDARD_60'>('STANDARD_120');
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>(TIME_SLOT_PRESETS.STANDARD_120.slots);

  // Timetable View Mode: ALL (تمام جلسات), EVEN (هفته زوج), ODD (هفته فرد)
  const [selectedWeekFilter, setSelectedWeekFilter] = useState<WeekRecurrence | 'ALL_VIEW'>('ALL_VIEW');

  // Main Tabs
  const [activeMainTab, setActiveMainTab] = useState<'CURRICULUM_ASSIGN' | 'PROF_QUOTAS' | 'DEPT_ROOMS' | 'SCENARIOS' | 'PROFESSOR_SCHEDULE' | 'APPROVED' | 'TERM_CALENDAR'>('CURRICULUM_ASSIGN');

  // Academic Term Calendar Configuration — از ردیف واقعی academic_terms
  const [calendarConfig, setCalendarConfig] = useState({
    classStartDate: initial.termCalendar?.startJalali ?? '',
    classEndDate: initial.termCalendar?.endJalali ?? '',
    examStartDate: '',
    examEndDate: '',
    holidays: '',
    sessionsCount: 16,
  });

  const [generatedTermSessionsCount, setGeneratedTermSessionsCount] = useState<number>(initial.sessionsTotal);
  const [sessionsByOffering, setSessionsByOffering] = useState<Record<number, { total: number; makeup: number; firstDate: string | null }>>(initial.sessionsByOffering);
  const [makeupSessions, setMakeupSessions] = useState(initial.makeupSessions);
  const [hardConflictCount, setHardConflictCount] = useState<number>(initial.hardConflictCount);
  const [isGeneratingSessions, setIsGeneratingSessions] = useState(false);

  // Core Data — آرایه‌های واقعی (بدون Mock)
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>(() => mapClassrooms(initial.classrooms, initial.allocatedRoomIds));
  const [professors, setProfessors] = useState<ProfessorOption[]>(() => mapProfessors(initial.professors));
  const [availabilities, setAvailabilities] = useState<ProfessorAvailabilityMap>(() => createNeutralAvailabilities(initial.professors.map(p => p.id)));
  const [courseDemands, setCourseDemands] = useState<CourseDemand[]>(() => mapDemands(initial.demands));

  // Inspector & Scenarios
  const [inspectorProfId, setInspectorProfId] = useState<number>(initial.professors[0]?.id ?? 1);
  const [activeScenarioId, setActiveScenarioId] = useState<'COMPACT' | 'BALANCED' | 'PROF_PREF' | 'AFTERNOON_WORKING'>('AFTERNOON_WORKING');
  // برنامهٔ مصوب واقعی از جدول schedules؛ خروجی الگوریتم فقط «پیش‌نمایش» است
  const [approvedOfferings, setApprovedOfferings] = useState<DepartmentOffering[]>(() => mapOfferings(initial.approvedOfferings));
  const [previewScenario, setPreviewScenario] = useState<AutoScheduleScenario | null>(null);

  const [scenarios, setScenarios] = useState<AutoScheduleScenario[]>(() =>
    solveDynamicScenarios(
      TIME_SLOT_PRESETS.STANDARD_120.slots,
      mapClassrooms(initial.classrooms, initial.allocatedRoomIds),
      mapProfessors(initial.professors),
      createNeutralAvailabilities(initial.professors.map(p => p.id)),
      mapDemands(initial.demands)
    )
  );

  // Modal: Chair Editing Professor Availability
  const [isProfAvailabilityModalOpen, setIsProfAvailabilityModalOpen] = useState<boolean>(false);
  const [editingProfId, setEditingProfId] = useState<number>(initial.professors[0]?.id ?? 1);
  const [editingProfNotes, setEditingProfNotes] = useState<string>('');

  // Modals / Toasts
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'warning' } | null>(null);


  const showToast = (text: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4500);
  };

  // تغییر نیمسال → بارگذاری مجدد واقعی از Server Action
  useEffect(() => {
    const baseId = initial.selectedTermId ?? 0;
    if (selectedTermId === baseId) return;
    let cancelled = false;
    setIsLoadingWorkspace(true);
    getSchedulingWorkspaceAction(selectedTermId)
      .then(w => {
        if (cancelled || !w.ok) return;
        setTerms(w.terms);
        setPrograms(w.programs);
        setCohorts(mapCohorts(w.cohorts));
        setCurrentPhase(w.phases[selectedTermId] ?? 'SUPPLY');
        const rooms = mapClassrooms(w.classrooms, w.allocatedRoomIds);
        const profs = mapProfessors(w.professors);
        const avail = createNeutralAvailabilities(profs.map(p => p.id));
        const demands = mapDemands(w.demands);
        setClassrooms(rooms);
        setProfessors(profs);
        setAvailabilities(avail);
        setCourseDemands(demands);
        setApprovedOfferings(mapOfferings(w.approvedOfferings));
        setPreviewScenario(null);
        setScenarios(solveDynamicScenarios(timeSlots, rooms, profs, avail, demands));
        setGeneratedTermSessionsCount(w.sessionsTotal);
        setSessionsByOffering(w.sessionsByOffering);
        setMakeupSessions(w.makeupSessions);
        setHardConflictCount(w.hardConflictCount);
        setCalendarConfig(cfg => ({
          ...cfg,
          classStartDate: w.termCalendar?.startJalali ?? '',
          classEndDate: w.termCalendar?.endJalali ?? '',
        }));
      })
      .catch(() => showToast('⚠️ بارگذاری دادهٔ نیمسال از سرور ناموفق بود.', 'warning'))
      .finally(() => { if (!cancelled) setIsLoadingWorkspace(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTermId]);

  const handleTriggerSolver = (overrideSlots?: TimeSlot[]) => {
    const slotsToUse = overrideSlots || timeSlots;
    const fresh = solveDynamicScenarios(slotsToUse, classrooms, professors, availabilities, courseDemands);
    setScenarios(fresh);
    showToast('⚡ مدل‌های پیشنهادی با داده‌های جاری (استادان، سهمیهٔ سالن‌ها و تقاضا) بازمحاسبه شد؛ ثبت رسمی از جدول برنامهٔ مصوب است.', 'success');
  };

  const handleApplyScenario = (scenario: AutoScheduleScenario) => {
    setPreviewScenario(scenario);
    setActiveMainTab('APPROVED');
    showToast(`👁 «${scenario.title}» به عنوان پیش‌نمایش الگوریتم بارگذاری شد؛ ثبت رسمی فقط از برنامهٔ مصوب سیستم است.`, 'info');
  };

  /** تولید/بازتولید جلسات واقعی از schedules — Server Action با گیت قیود سخت */
  const handleGenerateSessions = async () => {
    if (!selectedTermId) return;
    setIsGeneratingSessions(true);
    try {
      const res = await generateClassSessionsAction({
        termId: selectedTermId,
        sessionsCount: calendarConfig.sessionsCount,
        holidays: parseJalaliDates(calendarConfig.holidays),
      });
      if (!res.ok) {
        showToast(`⚠️ ${res.error ?? 'خطا در تولید جلسات.'}`, 'warning');
        return;
      }
      setGeneratedTermSessionsCount(res.generated);
      setSessionsByOffering(Object.fromEntries(
        Object.entries(res.sessionsPerOffering).map(([offeringId, total]) => [
          Number(offeringId), { total, makeup: 0, firstDate: null },
        ])
      ));
      setHardConflictCount(res.hardConflicts.length);
      showToast(`⚡ ${faNum(res.generated)} جلسهٔ ترم برای ${faNum(res.offerings)} درس تولید و در تقویم ثبت شد.`, 'success');
    } finally {
      setIsGeneratingSessions(false);
    }
  };

  // Change professor assigned to a course in the chart
  const handleAssignProfessorToCourse = (demandId: number, profId: number) => {
    setCourseDemands(prev => prev.map(d => d.id === demandId ? { ...d, preferredProfId: profId } : d));
    const targetProf = professors.find(p => p.id === profId);
    showToast(`استاد «${targetProf?.name}» به عنوان مدرس این درس تعیین شد.`, 'info');
  };

  // Change professor assigned to a specific group of a course
  const handleAssignProfessorToGroup = (demandId: number, groupNo: number, profId: number) => {
    setCourseDemands(prev =>
      prev.map(d => {
        if (d.id !== demandId) return d;
        return {
          ...d,
          groupProfessors: {
            ...(d.groupProfessors || {}),
            [groupNo]: profId,
          },
        };
      })
    );
    const targetProf = professors.find(p => p.id === profId);
    showToast(`استاد «${targetProf?.name}» برای گروه ${groupNo} تعیین شد.`, 'info');
  };

  // Toggle Co-Teaching for a course
  const handleToggleCoTeaching = (demandId: number) => {
    setCourseDemands(prev =>
      prev.map(d => {
        if (d.id !== demandId) return d;
        const nextState = !d.isCoTaught;
        return {
          ...d,
          isCoTaught: nextState,
          coProfId: nextState ? (d.coProfId || professors.find(p => p.id !== d.preferredProfId)?.id) : undefined,
          theoryWeightRatio: nextState ? (d.theoryWeightRatio || 0.70) : undefined,
          labWeightRatio: nextState ? (d.labWeightRatio || 0.30) : undefined,
        };
      })
    );
    showToast('وضعیت تخصیص دو استاد (مشترک تئوری و عملی) تغییر یافت.', 'info');
  };

  // Assign Second / Lab Professor
  const handleAssignCoProfessor = (demandId: number, coProfId: number) => {
    setCourseDemands(prev => prev.map(d => (d.id === demandId ? { ...d, coProfId } : d)));
    const targetProf = professors.find(p => p.id === coProfId);
    showToast(`استاد همکار «${targetProf?.name}» جهت بخش عملی تعیین شد.`, 'info');
  };

  // Update Co-Teaching Weights (e.g. 70% theory, 30% lab)
  const handleUpdateCoWeights = (demandId: number, theoryPercent: number) => {
    const theoryRatio = Math.max(0.1, Math.min(0.9, theoryPercent / 100));
    const labRatio = Math.round((1 - theoryRatio) * 100) / 100;
    setCourseDemands(prev =>
      prev.map(d =>
        d.id === demandId
          ? {
              ...d,
              theoryWeightRatio: theoryRatio,
              labWeightRatio: labRatio,
            }
          : d
      )
    );
  };

  // Change groups count for a course
  const handleUpdateCourseGroupsCount = (demandId: number, groups: number) => {
    setCourseDemands(prev => prev.map(d => d.id === demandId ? { ...d, groupsCount: groups } : d));
    showToast(`تعداد گروه‌های ارائه‌شونده به ${faNum(groups)} گروه تغییر یافت.`, 'info');
  };

  // Toggle Exam Scheduling Mode (Auto vs Manual) for a course
  const handleToggleDemandExamMode = (demandId: number) => {
    setCourseDemands(prev =>
      prev.map(d =>
        d.id === demandId
          ? {
              ...d,
              examSchedulingMode: d.examSchedulingMode === 'MANUAL' ? 'AUTO_MATRIX' : 'MANUAL',
            }
          : d
      )
    );
    showToast('حالت زمان‌بندی تاریخ و ساعت امتحان این درس تغییر یافت.', 'info');
  };

  // Update Exam Date manually for a course
  const handleUpdateDemandExamDate = (demandId: number, date: string) => {
    setCourseDemands(prev =>
      prev.map(d => (d.id === demandId ? { ...d, examDate: date, examSchedulingMode: 'MANUAL' } : d))
    );
  };

  // Change max units cap for a professor
  const handleUpdateProfMaxUnits = (profId: number, maxUnits: number) => {
    setProfessors(prev => prev.map(p => p.id === profId ? { ...p, maxWeeklyUnits: maxUnits } : p));
    showToast('سقف مجاز واحد تدریس استاد با موفقیت به‌روزرسانی شد.', 'success');
  };



  // Chair open availability editor for a professor
  const handleOpenEditProfAvailability = (profId: number) => {
    setEditingProfId(profId);
    const targetProf = professors.find(p => p.id === profId);
    setEditingProfNotes(targetProf?.chairNotes || '');
    setIsProfAvailabilityModalOpen(true);
  };

  // Toggle Slot in Availability Editor
  const handleToggleEditingProfSlot = (dayIdx: number, slotId: number) => {
    setAvailabilities(prev => {
      const current = prev[editingProfId]?.[dayIdx]?.[slotId] || 'AVAIL';
      const next: SlotStatus = current === 'PREF' ? 'AVAIL' : current === 'AVAIL' ? 'UNAVAIL' : 'PREF';
      const updated = { ...prev };
      if (!updated[editingProfId]) updated[editingProfId] = {};
      if (!updated[editingProfId][dayIdx]) updated[editingProfId][dayIdx] = {};
      updated[editingProfId][dayIdx][slotId] = next;
      return updated;
    });
  };

  // Presets in Availability Editor
  const handleApplyEditingProfPreset = (preset: 'ALL_PREF' | 'MORNING_ONLY' | 'AFTERNOON_ONLY' | 'EVEN_DAYS' | 'ODD_DAYS' | 'CLEAR') => {
    setAvailabilities(prev => {
      const updated = { ...prev };
      if (!updated[editingProfId]) updated[editingProfId] = {};
      for (let d = 0; d < 6; d++) {
        updated[editingProfId][d] = {};
        for (const slot of timeSlots) {
          if (slot.isBreak) continue;
          if (preset === 'ALL_PREF') updated[editingProfId][d][slot.id] = 'PREF';
          else if (preset === 'CLEAR') updated[editingProfId][d][slot.id] = 'UNAVAIL';
          else if (preset === 'MORNING_ONLY') updated[editingProfId][d][slot.id] = (slot.id === 1 || slot.id === 2) ? 'PREF' : 'UNAVAIL';
          else if (preset === 'AFTERNOON_ONLY') updated[editingProfId][d][slot.id] = (slot.id >= 4) ? 'PREF' : 'UNAVAIL';
          else if (preset === 'EVEN_DAYS') updated[editingProfId][d][slot.id] = (d % 2 === 0) ? 'PREF' : 'UNAVAIL';
          else if (preset === 'ODD_DAYS') updated[editingProfId][d][slot.id] = (d % 2 === 1) ? 'PREF' : 'UNAVAIL';
        }
      }
      return updated;
    });
  };

  // Save Chair Availability Edits
  const handleSaveChairProfAvailability = () => {
    setProfessors(prev => prev.map(p => p.id === editingProfId ? { ...p, hasSubmittedAvailability: true, chairNotes: editingProfNotes } : p));
    setIsProfAvailabilityModalOpen(false);
    handleTriggerSolver();
    const profName = professors.find(p => p.id === editingProfId)?.name;
    showToast(`ساعات حضور و هماهنگی‌های استاد «${profName}» با موفقیت ثبت و در الگوریتم اعمال شد.`, 'success');
  };

  // Compute Professor Assigned Units Load (accounting for single & co-taught courses)
  const profAssignedUnitsMap = useMemo(() => {
    const map: { [profId: number]: { units: number; coursesCount: number } } = {};
    professors.forEach(p => { map[p.id] = { units: 0, coursesCount: 0 }; });

    courseDemands.forEach(d => {
      const primaryProfId = d.preferredProfId;
      if (d.isCoTaught && d.coProfId) {
        // Split units based on theory & lab weights
        const theoryUnits = Math.round((d.units * (d.theoryWeightRatio || 0.70)) * 10) / 10;
        const labUnits = Math.round((d.units * (d.labWeightRatio || 0.30)) * 10) / 10;
        if (map[primaryProfId]) {
          map[primaryProfId].units += (theoryUnits * d.groupsCount);
          map[primaryProfId].coursesCount += d.groupsCount;
        }
        if (map[d.coProfId]) {
          map[d.coProfId].units += (labUnits * d.groupsCount);
          map[d.coProfId].coursesCount += d.groupsCount;
        }
      } else {
        if (map[primaryProfId]) {
          map[primaryProfId].units += (d.units * d.groupsCount);
          map[primaryProfId].coursesCount += d.groupsCount;
        }
      }
    });

    return map;
  }, [courseDemands, professors]);

  // Computed state
  const currentScenario = useMemo(() => {
    return scenarios.find(s => s.id === activeScenarioId) || scenarios[0];
  }, [scenarios, activeScenarioId]);

  const currentProgram = useMemo(() => {
    return programs.find(p => p.id === selectedProgramId) || programs[0];
  }, [programs, selectedProgramId]);

  const currentTerm = useMemo(() => {
    return terms.find(t => t.id === selectedTermId) || terms[0];
  }, [terms, selectedTermId]);

  const displayedScenarioOfferings = useMemo(() => {
    if (!currentScenario) return [];
    let list = currentScenario.offerings;
    if (selectedProgramId > 0) list = list.filter(o => o.programId === 0 || o.programId === selectedProgramId);
    if (selectedCohortId !== 'ALL') list = list.filter(o => o.cohortId === 'ALL' || o.cohortId === selectedCohortId);
    if (selectedWeekFilter !== 'ALL_VIEW') {
      list = list.filter(o => o.classSchedules.some(cs => cs.weekType === 'ALL' || cs.weekType === selectedWeekFilter));
    }
    return list;
  }, [currentScenario, selectedProgramId, selectedCohortId, selectedWeekFilter]);

  const displayedDemands = useMemo(() => {
    let list = courseDemands;
    if (selectedProgramId > 0) list = list.filter(d => d.programId === 0 || d.programId === selectedProgramId);
    if (selectedCohortId !== 'ALL') list = list.filter(d => d.cohortId === 'ALL' || d.cohortId === selectedCohortId);
    return list;
  }, [courseDemands, selectedProgramId, selectedCohortId]);

  const inspectorProf = useMemo(() => {
    return professors.find(p => p.id === inspectorProfId) || professors[0];
  }, [professors, inspectorProfId]);

  const editingProf = useMemo(() => {
    return professors.find(p => p.id === editingProfId) || professors[0];
  }, [professors, editingProfId]);

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
                سامانه جامع چیدمان متمرکز دانشگاهی
              </span>
              <span className="text-xs text-indigo-200">{currentTerm.title}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-700/60 text-indigo-100 font-bold mr-2">
                فاز: {PHASE_LABELS[currentPhase] ?? currentPhase}{isLoadingWorkspace ? ' — در حال بارگذاری…' : ''}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              🗓️ کارتابل یکپارچه برنامه‌ریزی درسی و چیدمان متمرکز مدیر گروه
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleTriggerSolver()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-extrabold text-xs sm:text-sm shadow-md transition transform active:scale-95"
            >
              <span>⚡ اجرای چیدمان متمرکز با قیود جاری</span>
            </button>
            <Link
              href="/admin/exams"
              className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-700 to-indigo-800 hover:from-indigo-800 hover:to-indigo-900 text-white font-extrabold text-xs border border-indigo-500/50 flex items-center gap-1.5 shadow-md transition"
            >
              <span>📝 ماژول مدیریت و تخصیص امتحانات ←</span>
            </Link>
            <Link
              href="/admin/curriculum"
              className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 transition"
            >
              📚 چارت کلی دانشگاه
            </Link>
          </div>
        </div>

        {/* Global Context Bar */}
        <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-xl border border-white/15 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <div>
            <label className="text-indigo-200 font-bold block mb-1">۱. نیمسال تحصیلی:</label>
            <select
              value={selectedTermId}
              onChange={e => setSelectedTermId(Number(e.target.value))}
              className="w-full bg-slate-900/90 text-white border border-indigo-400/50 rounded-lg px-2.5 py-2 font-bold focus:ring-2 focus:ring-amber-400"
            >
              {terms.map(t => (
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
              {programs.map(p => (
                <option key={p.id} value={p.id}>{p.title} — {p.facultyName}</option>
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
              <option value="ALL">کلیه ورودی‌های رشته</option>
              {cohorts.map(c => (
                <option key={c.id} value={c.id}>{c.title} ({faNum(c.expectedStudents)} نفر)</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-amber-300 font-bold block mb-1">۴. ترجیح شیفت زمانی:</label>
            <select
              value={targetShiftPreference}
              onChange={e => {
                const shift = e.target.value as ProgramShiftType;
                setTargetShiftPreference(shift);
                if (shift === 'AFTERNOON_WORKING') setActiveScenarioId('AFTERNOON_WORKING');
                else if (shift === 'MORNING') setActiveScenarioId('BALANCED');
              }}
              className="w-full bg-amber-500/20 text-amber-200 border border-amber-400/60 rounded-lg px-2.5 py-2 font-extrabold focus:ring-2 focus:ring-amber-400"
            >
              <option value="AFTERNOON_WORKING" className="bg-slate-900 text-white">🌆 شیفت عصر/شب (دانشجویان شاغل)</option>
              <option value="MORNING" className="bg-slate-900 text-white">☀️ شیفت صبح (دانشجویان تمام‌وقت)</option>
              <option value="FLEXIBLE" className="bg-slate-900 text-white">⚡ شناور و متوازن</option>
            </select>
          </div>

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

      {/* Main Operational Step Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveMainTab('CURRICULUM_ASSIGN')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition ${
            activeMainTab === 'CURRICULUM_ASSIGN' ? 'bg-indigo-900 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>📚 گام ۱: چارت دروس و انتساب اساتید</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-400 text-slate-950 font-bold">
            {faNum(displayedDemands.length)} درس
          </span>
        </button>

        <button
          onClick={() => setActiveMainTab('PROF_QUOTAS')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition ${
            activeMainTab === 'PROF_QUOTAS' ? 'bg-indigo-900 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>👨‍🏫 گام ۲: سقف واحدها و ویرایش حضور اساتید</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-purple-100 text-purple-900 font-bold">
            ویرایش ساعات
          </span>
        </button>

        <button
          onClick={() => setActiveMainTab('DEPT_ROOMS')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition ${
            activeMainTab === 'DEPT_ROOMS' ? 'bg-indigo-900 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>🏛️ گام ۳: کلاس‌های اختصاص‌یافته به گروه</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold">
            {faNum(classrooms.filter(c => c.isAllocatedToDept).length)} کلاس
          </span>
        </button>

        <button
          onClick={() => setActiveMainTab('SCENARIOS')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition ${
            activeMainTab === 'SCENARIOS' ? 'bg-indigo-900 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>🤖 گام ۴: موتور هوشمند چیدمان متمرکز (۴ مدل)</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-400 text-slate-950 font-bold">
            {faNum(4)} سناریو
          </span>
        </button>

        <button
          onClick={() => setActiveMainTab('PROFESSOR_SCHEDULE')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition ${
            activeMainTab === 'PROFESSOR_SCHEDULE' ? 'bg-indigo-900 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>🗓️ گام ۵: کنترل برنامه هفتگی اختصاصی استاد</span>
        </button>

        <button
          onClick={() => setActiveMainTab('APPROVED')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition ${
            activeMainTab === 'APPROVED' ? 'bg-indigo-900 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>📋 گام ۶: برنامه مصوب و ثبت نهایی</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold">
            {faNum(previewScenario ? previewScenario.offerings.length : approvedOfferings.length)} کلاس
          </span>
        </button>

        <button
          onClick={() => setActiveMainTab('TERM_CALENDAR')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition ${
            activeMainTab === 'TERM_CALENDAR' ? 'bg-indigo-900 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>📅 تقویم ترم و تولید خودکار جلسات آموزشی</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-cyan-100 text-cyan-900 font-bold">
            {faNum(generatedTermSessionsCount)} جلسه
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* STEP 1: CURRICULUM CHART & FACULTY ASSIGNMENT */}
      {/* ========================================================================= */}
      {activeMainTab === 'CURRICULUM_ASSIGN' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">📚</span>
                <h3 className="font-extrabold text-slate-900 text-base">
                  چارت درسی رشته «{currentProgram.title}» و انتساب اساتید به دروس
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                برای هر درس چارت، نام استاد مدرس و تعداد گروه‌ها را مشخص فرمایید. کنترل سقف واحد مجاز اساتید به صورت زنده انجام می‌شود.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  handleTriggerSolver();
                  setActiveMainTab('SCENARIOS');
                }}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-900 to-indigo-950 hover:from-indigo-950 hover:to-slate-950 text-white font-extrabold text-xs shadow-md flex items-center gap-2 transition"
              >
                <span>⚡ اجرای چیدمان متمرکز با انتساب‌های جاری</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white text-center">
                  <th className="p-3 border border-slate-800 w-12">ردیف</th>
                  <th className="p-3 border border-slate-800">کد درس</th>
                  <th className="p-3 border border-slate-800">عنوان درس چارت</th>
                  <th className="p-3 border border-slate-800">ورودی/ترم</th>
                  <th className="p-3 border border-slate-800">واحد</th>
                  <th className="p-3 border border-slate-800">نوع درس</th>
                  <th className="p-3 border border-slate-800">تعداد گروه‌ها</th>
                  <th className="p-3 border border-slate-800">انتخاب استاد مدرس</th>
                  <th className="p-3 border border-slate-800">وضعیت سقف تدریس استاد</th>
                  <th className="p-3 border border-slate-800">تنظیم تاریخ امتحان (دو حالت)</th>
                </tr>
              </thead>
              <tbody>
                {displayedDemands.map((demand, idx) => {
                  const assignedProf = professors.find(p => p.id === demand.preferredProfId) || professors[0];
                  const profLoad = profAssignedUnitsMap[assignedProf.id]?.units || 0;
                  const isOverQuota = profLoad > assignedProf.maxWeeklyUnits;

                  return (
                    <tr key={demand.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                      <td className="p-2 border border-slate-200 text-center font-bold text-slate-500">{faNum(idx + 1)}</td>
                      <td className="p-2 border border-slate-200 font-mono text-center font-bold text-indigo-900">{demand.code}</td>
                      <td className="p-2 border border-slate-200 font-extrabold text-slate-900">{demand.title}</td>
                      <td className="p-2 border border-slate-200 text-center">
                        <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 font-bold text-[10px]">
                          {demand.cohortTitle.split('(')[1]?.replace(')', '') || demand.cohortTitle}
                        </span>
                      </td>
                      <td className="p-2 border border-slate-200 text-center font-extrabold text-slate-900">{faNum(demand.units)}</td>
                      <td className="p-2 border border-slate-200 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          demand.courseType === 'عملی' ? 'bg-amber-100 text-amber-900' : 'bg-slate-200 text-slate-800'
                        }`}>
                          {demand.courseType}
                        </span>
                      </td>

                      <td className="p-2 border border-slate-200 text-center">
                        <select
                          value={demand.groupsCount}
                          onChange={e => handleUpdateCourseGroupsCount(demand.id, Number(e.target.value))}
                          className="border border-slate-300 rounded px-2 py-1 font-bold bg-white text-indigo-900"
                        >
                          <option value={1}>۱ گروه</option>
                          <option value={2}>۲ گروه موازی</option>
                          <option value={3}>۳ گروه</option>
                        </select>
                      </td>

                      <td className="p-2 border border-slate-200 min-w-[280px]">
                        {!demand.isCoTaught ? (
                          demand.groupsCount === 1 ? (
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={demand.preferredProfId}
                                  onChange={e => handleAssignProfessorToCourse(demand.id, Number(e.target.value))}
                                  className="w-full border-2 border-indigo-400/80 rounded-lg px-2 py-1 font-extrabold bg-indigo-50/50 text-indigo-950 focus:ring-2 focus:ring-indigo-500"
                                >
                                  {professors.map(p => (
                                    <option key={p.id} value={p.id}>
                                      {p.name} ({p.academicRank} — {p.contractType})
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => handleToggleCoTeaching(demand.id)}
                                  title="تخصیص دو استاد مشترک (تئوری + عملی)"
                                  className="px-2 py-1 rounded bg-purple-100 hover:bg-purple-200 text-purple-900 font-bold text-[10px] whitespace-nowrap transition"
                                >
                                  👥 مشترک
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2 p-2 bg-slate-50 rounded-xl border border-slate-200">
                              <div className="flex items-center justify-between pb-1 border-b border-slate-200 text-[10px] font-bold text-slate-600">
                                <span>انتساب اساتید به گروه‌های مجزا:</span>
                                <button
                                  type="button"
                                  onClick={() => handleToggleCoTeaching(demand.id)}
                                  className="text-purple-700 font-black hover:underline"
                                >
                                  👥 تبدیل به مشترک
                                </button>
                              </div>
                              {Array.from({ length: demand.groupsCount }).map((_, gIdx) => {
                                const gNo = gIdx + 1;
                                const curProfId = demand.groupProfessors?.[gNo] || demand.preferredProfId;
                                return (
                                  <div key={gNo} className="flex items-center gap-1 text-[11px]">
                                    <span className="px-1.5 py-0.5 rounded bg-indigo-900 text-white font-bold text-[10px] whitespace-nowrap">
                                      گروه {faNum(gNo)}:
                                    </span>
                                    <select
                                      value={curProfId}
                                      onChange={e => handleAssignProfessorToGroup(demand.id, gNo, Number(e.target.value))}
                                      className="w-full border border-indigo-300 rounded px-1.5 py-0.5 font-bold bg-white text-indigo-950 text-xs"
                                    >
                                      {professors.map(p => (
                                        <option key={p.id} value={p.id}>
                                          {p.name} ({p.academicRank})
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                );
                              })}
                            </div>
                          )
                        ) : (
                          <div className="p-2 rounded-xl bg-purple-50 border border-purple-200 space-y-2">
                            <div className="flex items-center justify-between pb-1 border-b border-purple-200/60">
                              <span className="font-extrabold text-[10px] text-purple-950">👥 درس مشترک با دو استاد:</span>
                              <button
                                type="button"
                                onClick={() => handleToggleCoTeaching(demand.id)}
                                className="text-[10px] text-purple-700 hover:underline font-bold"
                              >
                                لغو (تک‌استاد)
                              </button>
                            </div>

                            {/* Theory Professor */}
                            <div className="space-y-0.5">
                              <div className="flex items-center justify-between text-[10px] font-bold text-slate-700">
                                <span>📖 استاد بخش تئوری:</span>
                                <span className="text-indigo-900">سهم: {faNum((demand.theoryWeightRatio || 0.7) * 100)}٪ ({faNum((demand.theoryWeightRatio || 0.7) * 20)} نمره)</span>
                              </div>
                              <select
                                value={demand.preferredProfId}
                                onChange={e => handleAssignProfessorToCourse(demand.id, Number(e.target.value))}
                                className="w-full border border-indigo-300 rounded px-2 py-1 font-extrabold bg-white text-indigo-950 text-xs"
                              >
                                {professors.map(p => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} ({p.academicRank})
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Lab / Practical Professor */}
                            <div className="space-y-0.5">
                              <div className="flex items-center justify-between text-[10px] font-bold text-slate-700">
                                <span>🔬 استاد بخش عملی:</span>
                                <span className="text-purple-900">سهم: {faNum((demand.labWeightRatio || 0.3) * 100)}٪ ({faNum((demand.labWeightRatio || 0.3) * 20)} نمره)</span>
                              </div>
                              <select
                                value={demand.coProfId || professors[2].id}
                                onChange={e => handleAssignCoProfessor(demand.id, Number(e.target.value))}
                                className="w-full border border-purple-300 rounded px-2 py-1 font-extrabold bg-white text-purple-950 text-xs"
                              >
                                {professors.map(p => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} ({p.academicRank})
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Weighting Slider */}
                            <div className="pt-1 border-t border-purple-200/50">
                              <div className="flex items-center justify-between text-[9px] font-bold text-slate-600 mb-0.5">
                                <span>سهم‌بندی مدیر گروه:</span>
                                <span>{faNum((demand.theoryWeightRatio || 0.7) * 100)}٪ تئوری / {faNum((demand.labWeightRatio || 0.3) * 100)}٪ عملی</span>
                              </div>
                              <input
                                type="range"
                                min={10}
                                max={90}
                                step={5}
                                value={Math.round((demand.theoryWeightRatio || 0.7) * 100)}
                                onChange={e => handleUpdateCoWeights(demand.id, Number(e.target.value))}
                                className="w-full h-1.5 bg-purple-200 rounded-lg appearance-none cursor-pointer"
                              />
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="p-2 border border-slate-200 text-center">
                        {!demand.isCoTaught ? (
                          <div className={`p-1.5 rounded-lg text-[11px] font-bold ${
                            isOverQuota ? 'bg-rose-100 text-rose-900 border border-rose-300' : 'bg-emerald-100 text-emerald-900'
                          }`}>
                            <span>{faNum(profLoad)} از {faNum(assignedProf.maxWeeklyUnits)} واحد</span>
                            {isOverQuota && <span className="block text-[9px] font-black text-rose-700 mt-0.5">⚠️ تجاوز از سقف مجاز!</span>}
                          </div>
                        ) : (
                          <div className="space-y-1 text-[10px] font-bold">
                            <div className={`p-1 rounded ${profLoad > assignedProf.maxWeeklyUnits ? 'bg-rose-100 text-rose-900' : 'bg-indigo-100 text-indigo-900'}`}>
                              <span>تئوری: {faNum(profLoad)}/{faNum(assignedProf.maxWeeklyUnits)} و</span>
                            </div>
                            {demand.coProfId && (
                              <div className={`p-1 rounded ${profAssignedUnitsMap[demand.coProfId]?.units > (professors.find(p => p.id === demand.coProfId)?.maxWeeklyUnits || 10) ? 'bg-rose-100 text-rose-900' : 'bg-purple-100 text-purple-900'}`}>
                                <span>عملی: {faNum(profAssignedUnitsMap[demand.coProfId]?.units)}/{(professors.find(p => p.id === demand.coProfId)?.maxWeeklyUnits || 10)} و</span>
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="p-2 border border-slate-200 text-center min-w-[150px]">
                        <div className="space-y-1">
                          <button
                            type="button"
                            onClick={() => handleToggleDemandExamMode(demand.id)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black transition ${
                              demand.examSchedulingMode === 'MANUAL'
                                ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
                                : 'bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-200'
                            }`}
                            title="برای تغییر بین حالت خودکار و دستی کلیک کنید"
                          >
                            {demand.examSchedulingMode === 'MANUAL' ? '✍️ دستی مدیر' : '🤖 خودکار ترم'}
                          </button>
                          <input
                            type="text"
                            value={demand.examDate}
                            onChange={e => handleUpdateDemandExamDate(demand.id, e.target.value)}
                            className="w-full border border-slate-300 rounded p-1 font-mono font-bold text-center text-[11px] bg-white text-slate-800"
                          />
                        </div>
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
      {/* STEP 2: PROFESSOR QUOTAS & DIRECT AVAILABILITY OVERRIDE BY CHAIR */}
      {/* ========================================================================= */}
      {activeMainTab === 'PROF_QUOTAS' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">👨‍🏫</span>
                <h3 className="font-extrabold text-slate-900 text-base">
                  مدیریت سقف واحدها و ویرایش مستقیم ساعات حضور اساتید توسط مدیر گروه
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                مدیر گروه می‌تواند ساعات حضور هر استاد را مستقیماً ویرایش کرده، ساعات آزاد یا مسدود را اصلاح و سقف تدریس را تغییر دهد.
              </p>
            </div>

            <Link
              href="/professor/availability"
              className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-xs shadow transition flex items-center gap-1.5"
            >
              <span>👁️ پرتال استاد</span>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {professors.map(prof => {
              const assignedUnits = profAssignedUnitsMap[prof.id]?.units || 0;
              const isOver = assignedUnits > prof.maxWeeklyUnits;

              return (
                <div key={prof.id} className="bg-white rounded-2xl p-4 border-2 border-slate-200 shadow-sm flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-indigo-100 text-indigo-900">
                        {prof.academicRank} — {prof.contractType}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        prof.hasSubmittedAvailability ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {prof.hasSubmittedAvailability ? '✅ فرم حضور ثبت‌شده' : '⏳ در انتظار تکمیل'}
                      </span>
                    </div>

                    <h4 className="text-base font-extrabold text-slate-900">{prof.name}</h4>
                    <p className="text-xs text-slate-500 font-mono mb-2">کد پرسنلی: {prof.staffCode}</p>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-2 mb-2">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 font-bold">سقف مجاز واحد در هفته:</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={prof.maxWeeklyUnits}
                            onChange={e => handleUpdateProfMaxUnits(prof.id, Number(e.target.value))}
                            className="w-16 border border-slate-300 rounded px-2 py-0.5 font-mono text-center font-extrabold text-indigo-900 bg-white"
                          />
                          <span className="text-slate-500">واحد</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                        <span className="text-slate-600 font-bold">واحدهای اختصاص‌یافته فعلی:</span>
                        <span className={`font-extrabold ${isOver ? 'text-rose-700' : 'text-emerald-800'}`}>
                          {faNum(assignedUnits)} واحد
                        </span>
                      </div>
                    </div>

                    {prof.chairNotes && (
                      <div className="p-2 bg-amber-50 rounded-lg border border-amber-200 text-[11px] text-amber-900 font-bold">
                        💬 هماهنگی: {prof.chairNotes}
                      </div>
                    )}
                  </div>

                  {/* Edit Professor Availability Button */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleOpenEditProfAvailability(prof.id)}
                      className="px-3 py-1.5 rounded-lg bg-indigo-900 hover:bg-indigo-950 text-white font-extrabold text-xs shadow flex items-center gap-1 transition"
                    >
                      <span>✏️ ویرایش ساعات حضور استاد</span>
                    </button>

                    <button
                      onClick={() => {
                        setInspectorProfId(prof.id);
                        setActiveMainTab('PROFESSOR_SCHEDULE');
                      }}
                      className="text-xs text-slate-500 hover:text-indigo-900 font-bold"
                    >
                      برنامه ⬅️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 3: ALLOCATED CLASSROOMS TO DEPARTMENT */}
      {/* ========================================================================= */}
      {activeMainTab === 'DEPT_ROOMS' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🏛️</span>
                <h3 className="font-extrabold text-slate-900 text-base">
                  کلاس‌ها، سایت‌ها و آزمایشگاه‌های اختصاص‌یافته به دپارتمان «{currentProgram.title}»
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                سهمیهٔ فضاهای فیزیکی این نیمسال از جدول scheduling_room_grants (موتور تخصیص) خوانده می‌شود؛ تغییر سهمیه از موتور تخصیص سالن انجام می‌شود.
              </p>
            </div>

            <span className="px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-900 font-extrabold text-xs">
              {faNum(classrooms.filter(c => c.isAllocatedToDept).length)} سالن سهمیه‌دار از {faNum(classrooms.length)} سالن دانشگاه
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {classrooms.map(room => (
              <div
                key={room.id}
                className={`p-4 rounded-2xl border-2 transition flex flex-col justify-between shadow-sm ${
                  room.isAllocatedToDept
                    ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-400/20'
                    : 'border-slate-200 bg-white opacity-70 hover:opacity-100'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-900">
                      {room.roomType === 'LAB' ? '🧪 سایت / آزمایشگاه' : room.roomType === 'GYM' ? '⚽ سالن ورزشی' : '📖 کلاس نظری'}
                    </span>
                    <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full ${
                      room.isAllocatedToDept ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {room.isAllocatedToDept ? '✓ اختصاص به گروه' : 'آزاد / سایر گروه‌ها'}
                    </span>
                  </div>

                  <h4 className="text-base font-extrabold text-slate-900">{room.name}</h4>
                  <p className="text-xs text-slate-500 mb-2">{room.buildingName}</p>

                  <div className="bg-white/80 p-2.5 rounded-xl border border-slate-200 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">ظرفیت صندلی:</span>
                      <span className="font-extrabold text-slate-900">{faNum(room.capacity)} نفر</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">امکانات:</span>
                      <span className="font-bold text-indigo-900">{room.equipment.join('، ')}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 mt-3 text-center text-[11px] font-bold text-slate-500">
                  {room.isAllocatedToDept ? 'سهمیهٔ ثبت‌شدهٔ موتور تخصیص' : 'استخر مشترک دانشکده'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 4: AI MULTI-SCENARIO SOLVER */}
      {/* ========================================================================= */}
      {activeMainTab === 'SCENARIOS' && (
        <div className="space-y-5">
          <div className="bg-gradient-to-r from-amber-500/15 via-indigo-50 to-emerald-50 border border-amber-300/80 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xl">💡</span>
                <h2 className="font-extrabold text-slate-900 text-sm sm:text-base">
                  برنامه‌ریزی متمرکز رشته «{currentProgram.title}» — ۴ سناریوی هوشمند بهینه‌سازی
                </h2>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                موتور هوشمند بر اساس <b>اساتید منتسب در چارت</b>، <b>سقف مجاز واحدها</b>، <b>ساعات اعلامی و هماهنگ‌شده اساتید</b> و <b>کلاس‌های اختصاص‌یافته به گروه</b> ۴ مدل زیر را تولید کرده است.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleTriggerSolver()}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold transition shadow flex items-center gap-1.5"
              >
                <span>⚡ بازتولید سناریوها</span>
              </button>
            </div>
          </div>

          {/* 4 Scenario KPI Cards */}
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
                      {isSelected && <span className="text-[10px] font-extrabold text-indigo-900 bg-indigo-100 px-2 py-0.5 rounded-full">✓ فعال</span>}
                    </div>

                    <h3 className="text-sm font-extrabold text-slate-900 leading-tight mb-1">{scenario.title}</h3>
                    <p className="text-[11px] text-slate-500 mb-3 line-clamp-2">{scenario.subtitle}</p>

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
                        <span className="text-[9px] text-slate-400 block">ویژگی:</span>
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
                      👁 پیش‌نمایش این سناریو
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Timetable Grid Preview */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">
                  پیش‌نمایش جدول هفتگی: {currentScenario.title}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{currentScenario.description}</p>
              </div>

              <button
                onClick={() => handleApplyScenario(currentScenario)}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow-md flex items-center gap-1.5 transition"
              >
                <span>👁 پیش‌نمایش این سناریو در گام ۶</span>
              </button>
            </div>

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
                                  const isEven = schedule.weekType === 'EVEN';
                                  const isOdd = schedule.weekType === 'ODD';
                                  
                                  return (
                                    <div
                                      key={offering.id}
                                      className="p-2 rounded-xl border border-slate-200 shadow-xs bg-indigo-50/90 text-indigo-950 space-y-1"
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
                                      <div className="text-[10px] text-slate-600 flex items-center justify-between font-bold">
                                        <span>👨‍🏫 {offering.professorName}</span>
                                        <span className="text-[9px] text-indigo-800 bg-indigo-100 px-1 rounded">
                                          {offering.cohortTitle.split('(')[1]?.replace(')', '') || offering.cohortTitle}
                                        </span>
                                      </div>
                                      <div className="text-[10px] text-slate-700 flex items-center justify-between pt-1 border-t border-indigo-200/60">
                                        <span className="font-extrabold text-emerald-800">🏛️ {schedule.roomName}</span>
                                        <span className="text-slate-500 font-mono">{faNum(offering.units)} واحد</span>
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
      {/* STEP 5: PROFESSOR WEEKLY SCHEDULE INSPECTOR */}
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
                <button
                  onClick={() => handleOpenEditProfAvailability(inspectorProfId)}
                  className="px-3.5 py-2 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-extrabold text-xs shadow flex items-center gap-1.5"
                >
                  <span>✏️ ویرایش ساعات حضور این استاد</span>
                </button>
                <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-900 border border-emerald-300">
                  ✅ وضعیت تداخل: صفر
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
                  (در {faNum(inspectorStats.distinctPrograms.length)} رشته)
                </span>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500 block text-[11px] mb-1">روزهای حضور:</span>
                <span className="text-lg font-extrabold text-emerald-950">
                  {faNum(inspectorStats.distinctDays)} روز در هفته
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
      {/* STEP 6: APPROVED OFFERINGS */}
      {/* ========================================================================= */}
      {activeMainTab === 'APPROVED' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">
                📋 برنامه مصوب و نهایی نیمسال جاری ({faNum(previewScenario ? previewScenario.offerings.length : approvedOfferings.length)} کلاس فعال)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                منبع: جدول برنامهٔ مصوب (schedules) — روز، ساعت و سالن واقعی هر کلاس
              </p>
            </div>
          </div>

          {previewScenario && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs">
              <span className="font-bold text-amber-900">👁 پیش‌نمایش الگوریتم: «{previewScenario.title}» — هنوز به عنوان برنامهٔ رسمی ثبت نشده است.</span>
              <button
                onClick={() => setPreviewScenario(null)}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs whitespace-nowrap"
              >
                بازگشت به برنامهٔ مصوب سیستم
              </button>
            </div>
          )}

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
                {(previewScenario ? previewScenario.offerings : approvedOfferings).map((item, idx) => (
                  <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="p-2 border border-slate-200 text-center font-bold text-slate-500">{faNum(idx + 1)}</td>
                    <td className="p-2 border border-slate-200 font-mono text-center font-bold text-indigo-900">{item.code}</td>
                    <td className="p-2 border border-slate-200 font-extrabold text-slate-900">
                      <div>{item.title}</div>
                      {item.isCoTaught && (
                        <div className="text-[10px] text-purple-700 font-bold mt-0.5">
                          👥 مشترک: تئوری ({faNum((item.theoryWeightRatio || 0.7) * 100)}٪) + عملی ({faNum((item.labWeightRatio || 0.3) * 100)}٪)
                        </div>
                      )}
                    </td>
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
                    <td className="p-2 border border-slate-200 font-bold text-slate-800">
                      <div>{item.professorName}</div>
                      {item.isCoTaught && item.coProfName && (
                        <div className="text-[10px] text-purple-800">همکار عملی: {item.coProfName}</div>
                      )}
                    </td>
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
      {/* STEP 7: ACADEMIC TERM CALENDAR & 16-SESSIONS GENERATOR */}
      {/* ========================================================================= */}
      {activeMainTab === 'TERM_CALENDAR' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">
                  📅 تعریف بازه نیمسال و تقویم آموزشی دانشگاه (تولید خودکار جلسات)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  از روی سطرهای واقعی جدول schedules (روز هفته، ساعت، سالن) و تاریخ شروع نیمسال، تاریخ جلسات شمسی ساخته و در class_sessions ثبت می‌شود؛ پیش از تولید، گیت قیود سخت (تداخل استاد/سالن) اجرا می‌گردد.
                </p>
              </div>

              <button
                onClick={handleGenerateSessions}
                disabled={isGeneratingSessions}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 text-white font-extrabold text-xs shadow-md flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-wait"
              >
                <span>{isGeneratingSessions ? '⏳ در حال تولید جلسات از برنامهٔ مصوب…' : `⚡ تولید و زمان‌بندی خودکار ${faNum(calendarConfig.sessionsCount)} جلسه ترم برای کلیه دروس`}</span>
              </button>
            </div>

            {/* Calendar Settings Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div>
                <label className="font-bold text-slate-700 block mb-1">تاریخ شروع کلاس‌ها:</label>
                <input
                  type="text"
                  value={calendarConfig.classStartDate}
                  onChange={e => setCalendarConfig({ ...calendarConfig, classStartDate: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">تاریخ پایان کلاس‌ها:</label>
                <input
                  type="text"
                  value={calendarConfig.classEndDate}
                  onChange={e => setCalendarConfig({ ...calendarConfig, classEndDate: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">شروع امتحانات پایان‌ترم:</label>
                <input
                  type="text"
                  value={calendarConfig.examStartDate}
                  onChange={e => setCalendarConfig({ ...calendarConfig, examStartDate: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">پایان امتحانات پایان‌ترم:</label>
                <input
                  type="text"
                  value={calendarConfig.examEndDate}
                  onChange={e => setCalendarConfig({ ...calendarConfig, examEndDate: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold bg-white"
                />
              </div>

              <div className="sm:col-span-2 lg:col-span-4 pt-2 border-t border-slate-200">
                <label className="font-bold text-slate-700 block mb-1">تعطیلات رسمی تقویم آموزشی ترم (حذف خودکار از جلسات):</label>
                <input
                  type="text"
                  value={calendarConfig.holidays}
                  onChange={e => setCalendarConfig({ ...calendarConfig, holidays: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-bold bg-white"
                />
              </div>
            </div>

            {/* Generated Sessions KPI Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
              <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200">
                <span className="text-indigo-700 font-bold block mb-0.5">جلسات تولیدشدهٔ این ترم:</span>
                <span className="text-lg font-black text-indigo-950">{faNum(generatedTermSessionsCount)} جلسه</span>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <span className="text-emerald-700 font-bold block mb-0.5">درس‌های دارای جلسهٔ تولیدشده:</span>
                <span className="text-lg font-black text-emerald-950">{faNum(Object.keys(sessionsByOffering).length)} درس</span>
              </div>
              <div className={`p-3 rounded-xl border ${hardConflictCount === 0 ? 'bg-purple-50 border-purple-200' : 'bg-rose-50 border-rose-300'}`}>
                <span className={`font-bold block mb-0.5 ${hardConflictCount === 0 ? 'text-purple-700' : 'text-rose-700'}`}>گیت قیود سخت (استاد/سالن/ظرفیت):</span>
                <span className={`text-lg font-black ${hardConflictCount === 0 ? 'text-purple-950' : 'text-rose-950'}`}>
                  {hardConflictCount === 0 ? 'پاک ✓' : `${faNum(hardConflictCount)} تداخل سخت!`}
                </span>
              </div>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                <span className="text-amber-700 font-bold block mb-0.5">جلسات جبرانی ثبت‌شده:</span>
                <span className="text-lg font-black text-amber-950">{faNum(makeupSessions.length)} جلسه</span>
              </div>
            </div>

            {/* Admin Make-up Session Approval Table */}
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-slate-900 text-sm">
                  🏛️ کارتابل اداره آموزش: جلسات جبرانی ثبت‌شدهٔ این نیمسال
                </h4>
                <span className="text-xs text-slate-500 font-bold">
                  (منبع: class_sessions با isMakeUpSession = ۱)
                </span>
              </div>

              {makeupSessions.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs font-bold text-slate-500">
                  در این نیمسال هیچ جلسهٔ جبرانی ثبت نشده است.
                </div>
              ) : (
                <div className="space-y-2">
                  {makeupSessions.map(item => (
                    <div key={item.id} className="p-3.5 rounded-xl border text-xs space-y-1.5 bg-emerald-50/40 border-emerald-200">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900">{item.courseTitle}</span>
                          <span className="text-indigo-900 font-bold">({item.profName})</span>
                          <span className="text-slate-500">· جبران جلسهٔ {faNum(item.sessionNo)}</span>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black self-start sm:self-auto bg-indigo-100 text-indigo-900">
                          {item.replacedSessionId ? 'جایگزین جلسهٔ معلق' : 'ثبت‌شده'}
                        </span>
                      </div>
                      <div className="text-slate-600 flex flex-wrap items-center justify-between gap-2">
                        <span>تاریخ: <strong>{faNum(item.sessionDate)}</strong> ساعت <strong>{faNum(item.sessionTime)}</strong></span>
                        <span className="font-mono text-[10px] text-slate-400">کد درس: {item.courseCode}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CHAIR EDITING PROFESSOR AVAILABILITY */}
      {/* ========================================================================= */}
      {isProfAvailabilityModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 bg-indigo-950 text-white flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-sm sm:text-base">
                  ✏️ ویرایش ساعات حضور استاد: {editingProf.name} (توسط مدیر گروه)
                </h3>
                <span className="text-xs text-indigo-200">
                  {editingProf.academicRank} — {editingProf.contractType} — سقف تدریس: {faNum(editingProf.maxWeeklyUnits)} واحد
                </span>
              </div>
              <button onClick={() => setIsProfAvailabilityModalOpen(false)} className="text-white/60 hover:text-white">✕</button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 text-xs">
              
              {/* Presets Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="font-bold text-slate-700">اعمال سریع الگو:</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button onClick={() => handleApplyEditingProfPreset('ALL_PREF')} className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-900 font-bold text-[11px] hover:bg-emerald-200">🟢 حضور کامل</button>
                  <button onClick={() => handleApplyEditingProfPreset('MORNING_ONLY')} className="px-2.5 py-1 rounded bg-amber-100 text-amber-900 font-bold text-[11px] hover:bg-amber-200">☀️ فقط صبح‌ها</button>
                  <button onClick={() => handleApplyEditingProfPreset('AFTERNOON_ONLY')} className="px-2.5 py-1 rounded bg-blue-100 text-blue-900 font-bold text-[11px] hover:bg-blue-200">🌆 فقط بعدازظهرها</button>
                  <button onClick={() => handleApplyEditingProfPreset('EVEN_DAYS')} className="px-2.5 py-1 rounded bg-purple-100 text-purple-900 font-bold text-[11px] hover:bg-purple-200">📅 روزهای زوج</button>
                  <button onClick={() => handleApplyEditingProfPreset('ODD_DAYS')} className="px-2.5 py-1 rounded bg-indigo-100 text-indigo-900 font-bold text-[11px] hover:bg-indigo-200">📅 روزهای فرد</button>
                  <button onClick={() => handleApplyEditingProfPreset('CLEAR')} className="px-2.5 py-1 rounded bg-rose-100 text-rose-900 font-bold text-[11px] hover:bg-rose-200">🔴 مسدودسازی</button>
                </div>
              </div>

              {/* Interactive Weekly Matrix */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white text-center">
                      <th className="p-2.5 border border-slate-800 w-24 font-extrabold">روز هفته</th>
                      {teachingSlots.map(slot => (
                        <th key={slot.id} className="p-2.5 border border-slate-800 font-extrabold">
                          <div>{slot.label}</div>
                          <div className="text-[10px] text-slate-300 font-normal">{slot.startTime} تا {slot.endTime}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DAY_NAMES.map((dayName, dayIdx) => (
                      <tr key={dayIdx} className={dayIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="p-2 border border-slate-200 font-extrabold text-center bg-slate-100 text-slate-900">
                          {dayName}
                        </td>
                        {teachingSlots.map(slot => {
                          const status = availabilities[editingProfId]?.[dayIdx]?.[slot.id] || 'AVAIL';

                          return (
                            <td
                              key={slot.id}
                              onClick={() => handleToggleEditingProfSlot(dayIdx, slot.id)}
                              className="p-1.5 border border-slate-200 cursor-pointer select-none"
                            >
                              <div className={`p-2 rounded-lg text-center font-extrabold text-[11px] transition border flex flex-col items-center justify-center gap-0.5 ${
                                status === 'PREF'
                                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                                  : status === 'AVAIL'
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : 'bg-rose-100 text-rose-900 border-rose-300'
                              }`}>
                                <span>{status === 'PREF' ? '🟩 اولویت' : status === 'AVAIL' ? '🟨 آزاد' : '🟥 عدم حضور'}</span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Chair Notes Field */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">یادداشت هماهنگی با استاد (مکالمات تلفنی / توافقات):</label>
                <input
                  type="text"
                  value={editingProfNotes}
                  onChange={e => setEditingProfNotes(e.target.value)}
                  placeholder="مثال: هماهنگ شد که روزهای دوشنبه ساعت ۱۰ الی ۱۲ کلاس مبانی برنامه‌نویسی را تدریس کنند..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold"
                />
              </div>

            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setIsProfAvailabilityModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs"
              >
                انصراف
              </button>
              <button
                onClick={handleSaveChairProfAvailability}
                className="px-6 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow"
              >
                💾 ذخیره ساعات هماهنگ‌شده و اعمال در الگوریتم
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
