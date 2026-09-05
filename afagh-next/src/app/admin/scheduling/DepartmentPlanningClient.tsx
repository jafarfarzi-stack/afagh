'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import {
  getSchedulingWorkspaceAction, generateClassSessionsAction,
  supplyGroupDraftsAction, getSmartSuggestionsAction, getSchedulingHealthAction, transitionSchedulingPhaseAction,
  type GenerateSessionsOutcome, type SmartSlot, type SchedulingHealthReport, type SchedulingWorkspaceResult,
} from './actions';

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
  courseId: number;
  courseDeptId: number | null;
  programId: number;
  programTitle: string;
  cohortId: string;
  cohortTitle: string;
  code: string;
  title: string;
  units: number;
  groupNumber: number;
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
  programs: { id: number; code: string; title: string; facultyName: string; degreeLevel: string; facultyId: number | null }[];
  cohorts: { entryYear: number; expectedStudents: number }[];
  classrooms: { id: number; name: string; buildingName: string; capacity: number; roomType: string }[];
  allocatedRoomIds: number[];
  professors: { id: number; name: string; staffCode: string | null; academicRank: string | null; departmentName: string | null }[];
  demands: {
    offeringId: number; courseId: number; courseDeptId: number | null;
    code: string; title: string; units: string; courseType: string;
    capacity: number; groupNumber: number; professorId: number | null; isCoTaught: boolean;
    enrolledCount: number; programId: number; programTitle: string;
    cohortId: string; cohortTitle: string;
  }[];
  departments: { id: number; name: string }[];
  availabilities: { staffId: number; dayOfWeek: number | null; startTime: string | null; endTime: string | null; status: string | null }[];
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
    courseId: d.courseId,
    courseDeptId: d.courseDeptId,
    programId: d.programId,
    programTitle: d.programTitle,
    cohortId: d.cohortId,
    cohortTitle: d.cohortTitle,
    code: d.code,
    title: d.title,
    units: Number(d.units) || 0,
    groupNumber: d.groupNumber,
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

function mapProfessors(profs: SchedulingWorkspace['professors'], avail: SchedulingWorkspace['availabilities']): ProfessorOption[] {
  return profs.map(p => ({
    id: p.id,
    name: p.name,
    staffCode: p.staffCode ?? '—',
    academicRank: p.academicRank ?? '—',
    contractType: 'تمام‌وقت',
    departmentName: p.departmentName ?? '—',
    maxWeeklyUnits: PROF_DEFAULT_MAX_UNITS,
    maxDailyHours: PROF_DEFAULT_MAX_DAILY_HOURS,
    hasSubmittedAvailability: avail.some(a => a.staffId === p.id),
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
// تنها «سناریوی» مشروع: برنامهٔ مصوب (approvedOfferings از DB)
// هیچ Solver در کلاینت نیست — پیشنهادها از موتور سرور (getSmartSuggestionsAction) می‌آیند.
// ═══════════════════════════════════════════════════════════════════════

function buildRealScenario(
  offerings: DepartmentOffering[],
  hardConflicts: number,
  sessionsTotal: number,
  roomGrants: number,
): AutoScheduleScenario {
  const distinctDays = new Set(offerings.flatMap(o => o.classSchedules.map(cs => cs.dayOfWeek))).size;
  return {
    id: 'BALANCED',
    title: 'برنامهٔ مصوب ترم (دادهٔ واقعی از DB)',
    subtitle: 'جدول‌های نمایشی از schedules و class_sessions ساخته می‌شوند — بدون محاسبهٔ محلی.',
    description: 'این جدول همان برنامهٔ ثبت‌شده در پایگاه داده است؛ هیچ سناریویی در مرورگر ساخته نمی‌شود.',
    badgeColor: 'bg-emerald-100 text-emerald-800',
    accentBorder: 'border-emerald-300',
    bgGradient: 'from-emerald-50 to-white',
    kpi: {
      daysPerWeek: faNum(distinctDays),
      profSatisfaction: '—',
      conflictsRate: hardConflicts > 0 ? `${faNum(hardConflicts)} تداخل سخت` : 'صفر',
      roomEfficiency: faNum(roomGrants),
      studentComfort: '—',
      commuteScore: faNum(sessionsTotal) + ' جلسه',
    },
    offerings,
  };
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
  const [professors, setProfessors] = useState<ProfessorOption[]>(() => mapProfessors(initial.professors, initial.availabilities));
  const [realAvailRows, setRealAvailRows] = useState<SchedulingWorkspace['availabilities']>(initial.availabilities);
  const [courseDemands, setCourseDemands] = useState<CourseDemand[]>(() => mapDemands(initial.demands));

  // Inspector
  const [inspectorProfId, setInspectorProfId] = useState<number>(initial.professors[0]?.id ?? 1);
  // برنامهٔ مصوب واقعی از جدول schedules — تنها منبع جدول‌های نمایشی
  const [approvedOfferings, setApprovedOfferings] = useState<DepartmentOffering[]>(() => mapOfferings(initial.approvedOfferings));
  const [currentRealScenario, setCurrentRealScenario] = useState<AutoScheduleScenario>(() =>
    buildRealScenario(mapOfferings(initial.approvedOfferings), initial.hardConflictCount, initial.sessionsTotal, initial.allocatedRoomIds.length)
  );

  // فاز ۱۲ — پیشنهاد هوشمند موتور (سرور) + تأمین گروه‌ها + سلامت برنامه
  const [suggestedDemandId, setSuggestedDemandId] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<SmartSlot[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [supplying, setSupplying] = useState(false);
  const [phaseBusy, setPhaseBusy] = useState(false);
  const [health, setHealth] = useState<SchedulingHealthReport | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [ownedDeptId, setOwnedDeptId] = useState<number>(initial.departments[0]?.id ?? 0);

  // Modal: مشاهدهٔ فرم واقعی درٔ دسترس بودن استاد (ثبت‌شده توسط خودِ استاد)
  const [isProfAvailabilityModalOpen, setIsProfAvailabilityModalOpen] = useState<boolean>(false);
  const [editingProfId, setEditingProfId] = useState<number>(initial.professors[0]?.id ?? 1);

  // Modals / Toasts
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'warning' } | null>(null);


  const showToast = (text: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4500);
  };

  /** اعمال کامل یک کارتابل واقعی (استفاده در بارگذاری اولیه، تغییر ترم و بعد از هر تغییر) */
  const applyWorkspace = (w: Extract<SchedulingWorkspaceResult, { ok: true }>) => {
    setTerms(w.terms);
    setPrograms(w.programs);
    setCohorts(mapCohorts(w.cohorts));
    setCurrentPhase(w.phases[selectedTermId] ?? 'SUPPLY');
    setClassrooms(mapClassrooms(w.classrooms, w.allocatedRoomIds));
    setProfessors(mapProfessors(w.professors, w.availabilities));
    setRealAvailRows(w.availabilities);
    setCourseDemands(mapDemands(w.demands));
    setApprovedOfferings(mapOfferings(w.approvedOfferings));
    setCurrentRealScenario(buildRealScenario(mapOfferings(w.approvedOfferings), w.hardConflictCount, w.sessionsTotal, w.allocatedRoomIds.length));
    setGeneratedTermSessionsCount(w.sessionsTotal);
    setSessionsByOffering(w.sessionsByOffering);
    setMakeupSessions(w.makeupSessions);
    setHardConflictCount(w.hardConflictCount);
    setSuggestions([]);
    setHealth(null);
    setCalendarConfig(cfg => ({
      ...cfg,
      classStartDate: w.termCalendar?.startJalali ?? '',
      classEndDate: w.termCalendar?.endJalali ?? '',
    }));
  };

  /** تغییر نیمسال → بارگذاری مجدد واقعی از Server Action */
  useEffect(() => {
    const baseId = initial.selectedTermId ?? 0;
    if (selectedTermId === baseId) return;
    let cancelled = false;
    setIsLoadingWorkspace(true);
    getSchedulingWorkspaceAction(selectedTermId)
      .then(w => {
        if (cancelled || !w.ok) return;
        applyWorkspace(w);
      })
      .catch(() => showToast('⚠️ بارگذاری دادهٔ نیمسال از سرور ناموفق بود.', 'warning'))
      .finally(() => { if (!cancelled) setIsLoadingWorkspace(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTermId]);

  /** بازخوانی کارتابل از سرور (بعد از تأمین/تخصیص/گذار فاز) */
  const reloadWorkspace = () => {
    if (!selectedTermId) return;
    setIsLoadingWorkspace(true);
    getSchedulingWorkspaceAction(selectedTermId)
      .then(w => {
        if (!w.ok) { showToast(w.error, 'warning'); return; }
        applyWorkspace(w);
      })
      .catch(() => showToast('⚠️ بازخوانی کارتابل ناموفق بود.', 'warning'))
      .finally(() => setIsLoadingWorkspace(false));
  };

  /** پیشنهاد هوشمند موتور برای یک درس (درٔ دسترس بودن واقعی استاد + اشغال سالن‌ها + زونینگ) */
  const handleSuggestForDemand = async (demandId: number) => {
    const d = courseDemands.find(x => x.id === demandId);
    if (!d || !selectedTermId) return;
    if (!d.preferredProfId) {
      showToast('برای این درس هنوز استادی تعیین نشده است — ابتدا استاد را در گام ۱ انتساب دهید.', 'warning');
      return;
    }
    setSuggestedDemandId(demandId);
    setSuggestLoading(true);
    try {
      const program = programs.find(p => p.id === d.programId);
      const res = await getSmartSuggestionsAction({
        termId: selectedTermId,
        professorId: d.preferredProfId,
        capacity: d.capacity,
        targetFacultyId: program?.facultyId ?? null,
      });
      if (!res.ok) { showToast(res.error, 'warning'); setSuggestions([]); return; }
      setSuggestions(res.suggestions);
      if (!res.suggestions.length) {
        showToast('هیچ اسلات آزادی نیست — احتمالاً استاد هنوز درٔ دسترس بودن خود را برای این ترم اعلام نکرده است (پنل استاد).', 'info');
      }
    } finally {
      setSuggestLoading(false);
    }
  };

  /** ثبت واقعی گروه از پیشنهاد موتور: درج offering + schedule + offering_professors (موتور سرور) */
  const handleSupplyFromSuggestion = async (d: CourseDemand, slot: SmartSlot) => {
    if (!selectedTermId) return;
    const existingGroups = approvedOfferings.filter(o => o.code === d.code).map(o => o.groupNumber);
    const groupNumber = (existingGroups.length ? Math.max(...existingGroups) : 0) + 1;
    setSupplying(true);
    try {
      const res = await supplyGroupDraftsAction({
        termId: selectedTermId,
        courseId: d.courseId,
        ownerDepartmentId: d.courseDeptId ?? ownedDeptId,
        isSharedService: false,
        drafts: [{
          groupNumber, capacity: d.capacity, gender: 'MIXED' as const,
          professorId: d.preferredProfId, classroomId: slot.classroomId,
          dayOfWeek: slot.dayOfWeek, startTime: slot.startTime, endTime: slot.endTime,
        }],
      });
      if (!res.ok) { showToast(res.error ?? 'تأمین گروه ناموفق بود.', 'warning'); return; }
      showToast(`✅ گروه ${faNum(groupNumber)} درس «${d.title}» عرضه و در schedules ثبت شد (شناسهٔ ارائه: ${faNum(res.offeringIds[0] ?? 0)}).`, 'success');
      reloadWorkspace();
    } catch {
      showToast('خطا در ارتباط با سرور.', 'warning');
    } finally {
      setSupplying(false);
    }
  };

  /** گذار فاز برنامه‌ریزی (گیت «انتشار بدون تداخل سخت» در سرور) */
  const handlePhaseTransition = async (to: 'ALLOCATION' | 'REVIEW' | 'PUBLISHED') => {
    if (!selectedTermId) return;
    setPhaseBusy(true);
    try {
      const res = await transitionSchedulingPhaseAction(selectedTermId, to);
      if (!res.ok) { showToast(res.error ?? 'گذار فاز ناموفق بود.', 'warning'); return; }
      setCurrentPhase(res.phase ?? to);
      showToast(`فاز برنامه‌ریزی به «${PHASE_LABELS[to] ?? to}» تغییر کرد.`, 'success');
      reloadWorkspace();
    } finally {
      setPhaseBusy(false);
    }
  };

  /** عارضه‌یابی خودکار برنامه (عرضه در برابر تقاضا / تداخل پنهان / بهره‌وری سالن‌ها) */
  const handleRunHealth = async () => {
    if (!selectedTermId) return;
    setHealthLoading(true);
    try {
      const res = await getSchedulingHealthAction(selectedTermId);
      if (!res.ok) { showToast(res.error, 'warning'); return; }
      setHealth(res.health);
      showToast('گزارش سلامت برنامه با دادهٔ واقعی محاسبه شد.', 'success');
    } finally {
      setHealthLoading(false);
    }
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
    showToast('سقف پیش‌فرض محلی به‌روزرسانی شد — ستون دیتابیسی سقف در فاز بعدی (Migrations) اضافه می‌شود.', 'info');
  };



  // مشاهدهٔ فرم واقعی درٔ دسترس بودن استاد (خواندنی — ثبت فقط از پنل خودِ استاد)
  const handleOpenEditProfAvailability = (profId: number) => {
    setEditingProfId(profId);
    setIsProfAvailabilityModalOpen(true);
  };

  /** وضعیت واقعی اعلام درٔ دسترس بودن در یک اسلات (از professor_availabilities) */
  const realAvailStatus = (profId: number, dayIdx: number, slot: TimeSlot): 'PREF' | 'AVAIL' | 'NONE' => {
    const rows = realAvailRows.filter(r =>
      r.staffId === profId && r.dayOfWeek === dayIdx + 1 &&
      r.startTime != null && r.endTime != null &&
      r.startTime <= slot.startTime && r.endTime > slot.startTime
    );
    if (!rows.length) return 'NONE';
    return rows.some(r => r.status === 'PREF') ? 'PREF' : 'AVAIL';
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

  // Computed state — تنها سناریوی مشروع: برنامهٔ مصوب (واقعی از DB)
  const currentScenario = useMemo(() => currentRealScenario, [currentRealScenario]);

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
              onClick={reloadWorkspace}
              disabled={isLoadingWorkspace}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-extrabold text-xs sm:text-sm shadow-md transition transform active:scale-95 disabled:opacity-50"
            >
              <span>{isLoadingWorkspace ? '⏳ در حال بازخوانی…' : '📥 بازخوانی کارتابل از سرور'}</span>
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
            {faNum(approvedOfferings.length)} کلاس
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
                onClick={() => setActiveMainTab('SCENARIOS')}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-900 to-indigo-950 hover:from-indigo-950 hover:to-slate-950 text-white font-extrabold text-xs shadow-md flex items-center gap-2 transition"
              >
                <span>🧠 رفتن به موتور پیشنهاد هوشمند و تأمین گروه‌ها</span>
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
                فرم درٔ دسترس بودن فقط توسط خودِ استاد از پنل او ثبت می‌شود؛ این‌جا فقط «وضعیت اعلام» و جزئیات واقعی آن نمایش داده می‌شود.
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


                  </div>

                  {/* Edit Professor Availability Button */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleOpenEditProfAvailability(prof.id)}
                      className="px-3 py-1.5 rounded-lg bg-indigo-900 hover:bg-indigo-950 text-white font-extrabold text-xs shadow flex items-center gap-1 transition"
                    >
                      <span>📖 مشاهدهٔ فرم اعلامی استاد</span>
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
      {/* ========================================================================= */}
      {/* STEP 4: تأمین گروه‌ها و پیشنهاد هوشمند موتور (دادهٔ سرور — بدون Solver کلاینت) */}
      {/* ========================================================================= */}
      {activeMainTab === 'SCENARIOS' && (
        <div className="space-y-5">
          <div className="bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-950 text-white rounded-2xl p-4 sm:p-5 space-y-3 border border-indigo-700/50">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="font-extrabold text-sm sm:text-base">
                  🧠 پیشنهاد هوشمند موتور زمان‌بندی (واقعی — روی سرور)
                </h2>
                <p className="text-xs text-indigo-200 leading-relaxed">
                  اسلات‌های پیشنهادی از روی <b>درٔ دسترس بودنِ اعلام‌شدهٔ استاد</b> (پنل استاد)، <b>اشغال واقعی سالن‌ها</b>،
                  <b>زونینگ دانشکده</b> و <b>تناسب ظرفیت</b> محاسبه می‌شوند. ثبت هر پیشنهاد = درج واقعی
                  offering + schedule + استاد در پایگاه داده (تراکنشی + قفل + audit).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSuggestForDemand(suggestedDemandId ?? displayedDemands[0]?.id ?? 0)}
                  disabled={suggestLoading || !displayedDemands.length}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold transition shadow flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span>{suggestLoading ? '⏳ در حال محاسبه…' : '⚡ دریافت پیشنهاد موتور'}</span>
                </button>
                <button
                  onClick={handleRunHealth}
                  disabled={healthLoading || !selectedTermId}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-extrabold transition border border-white/20 disabled:opacity-50"
                >
                  <span>{healthLoading ? '⏳ …' : '🩺 عارضه‌یابی برنامه (Health)'}</span>
                </button>
              </div>
            </div>

            {/* ماشین فازها — گذار واقعی (گیت انتشار در سرور) */}
            <div className="bg-white/10 rounded-xl p-3 border border-white/15 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-indigo-200">ماشین فاز برنامه‌ریزی:</span>
                {(['SUPPLY', 'ALLOCATION', 'REVIEW', 'PUBLISHED'] as const).map(ph => (
                  <span key={ph}
                    className={`px-2.5 py-1 rounded-full font-extrabold text-[11px] border ${
                      currentPhase === ph
                        ? 'bg-amber-400 text-slate-950 border-amber-300'
                        : 'bg-white/10 text-indigo-100 border-white/20'
                    }`}
                  >
                    {PHASE_LABELS[ph] ?? ph}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-indigo-200 font-bold">
                  تداخل سخت فعلی: {faNum(hardConflictCount)} — انتشار فقط بدون قید سخت
                </span>
                {currentPhase === 'SUPPLY' && (
                  <button onClick={() => handlePhaseTransition('ALLOCATION')} disabled={phaseBusy}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-extrabold disabled:opacity-50">
                    {phaseBusy ? '…' : 'تأیید تأمین ← تخصیص'}
                  </button>
                )}
                {currentPhase === 'ALLOCATION' && (
                  <button onClick={() => handlePhaseTransition('REVIEW')} disabled={phaseBusy}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-extrabold disabled:opacity-50">
                    {phaseBusy ? '…' : 'تأیید تخصیص ← بازبینی کارشناس'}
                  </button>
                )}
                {currentPhase === 'REVIEW' && (
                  <button onClick={() => handlePhaseTransition('PUBLISHED')} disabled={phaseBusy}
                    className="px-3.5 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-extrabold disabled:opacity-50"
                    title={hardConflictCount > 0 ? 'ابتدا تداخل‌های سخت را رفع کنید' : ''}
                  >
                    {phaseBusy ? '…' : '🚀 انتشار برنامهٔ نهایی'}
                  </button>
                )}
              </div>
            </div>

            {/* گزارش سلامت (در صورت اجرا) */}
            {health && (
              <div className="bg-emerald-50/10 border border-emerald-300/30 rounded-xl p-3 text-[11px] text-emerald-100 space-y-1">
                <b>گزارش سلامت ترم (واقعی):</b>
                <div>• تداخل‌های پنهان استاد/سالن: {faNum(health.hiddenConflicts.length)}</div>
                <div>• عرضه در برابر تقاضا (گروه‌های کم‌عرضه): {faNum((health.supplyVsDemand ?? []).filter(x => (x.gap ?? 0) > 0).length)}</div>
                <div>• کلاس‌های مشترک بدون تخصیص: {faNum(health.unallocatedShared.length)}</div>
                <div>• سالن‌های با بهره‌وری کمتر از ۵۰٪: {faNum((health.roomShiftUsage ?? []).filter(x => x.utilization < 0.5).length)}</div>
              </div>
            )}
          </div>

          {/* انتخاب درس برای پیشنهاد */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex-1">
                <label className="text-xs font-extrabold text-slate-700 block mb-1.5">درس متقاضی (از ارائه‌های واقعی ترم):</label>
                <select
                  value={suggestedDemandId ?? ''}
                  onChange={e => handleSuggestForDemand(Number(e.target.value))}
                  className="w-full border-2 border-slate-300 rounded-xl px-3 py-2.5 text-xs font-bold bg-white focus:border-indigo-600"
                >
                  <option value="" disabled>— انتخاب درس —</option>
                  {displayedDemands.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.code} — {d.title} (گروه {faNum(d.groupNumber)} — ظرفیت {faNum(d.capacity)}) {d.preferredProfId ? '' : '⚠ بدون استاد'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-full sm:w-72">
                <label className="text-xs font-extrabold text-slate-700 block mb-1.5">گروه سازنده (ownerDepartmentId — پیش‌فرض: گروه درس):</label>
                <select
                  value={ownedDeptId}
                  onChange={e => setOwnedDeptId(Number(e.target.value))}
                  className="w-full border-2 border-slate-300 rounded-xl px-3 py-2.5 text-xs font-bold bg-white focus:border-indigo-600"
                >
                  {initial.departments.map(dep => (
                    <option key={dep.id} value={dep.id}>{dep.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* پیشنهادهای موتور */}
            {suggestLoading ? (
              <div className="text-center py-8 text-xs font-bold text-slate-500">⏳ موتور در حال محاسبهٔ اسلات‌های ممکن است…</div>
            ) : suggestions.length === 0 ? (
              <div className="text-center py-8 text-xs font-bold text-slate-500 space-y-1">
                <div>📭 هنوز پیشنهادی محاسبه نشده است.</div>
                <div className="text-[10px] text-slate-400">یک درس انتخاب کنید؛ اگر استاد درٔ دسترس بودن اعلام نکرده باشد، موتور صادقانه هیچ پیشنهادی برمی‌گرداند.</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {suggestions.map((slot, idx) => {
                  const d = courseDemands.find(x => x.id === suggestedDemandId);
                  return (
                    <div key={idx} className="border-2 border-indigo-100 rounded-2xl p-3.5 bg-gradient-to-br from-indigo-50/60 to-white space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-indigo-900">
                          {DAY_NAMES[(slot.dayOfWeek - 1) % 6]} — {slot.startTime} تا {slot.endTime}
                        </span>
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          امتیاز {faNum(slot.score)}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 font-bold">
                        🏫 {slot.classroomName} (ظرفیت {faNum(slot.classroomCapacity)})
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {slot.reasons.map((r, i) => (
                          <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">{r}</span>
                        ))}
                      </div>
                      <button
                        onClick={() => d && handleSupplyFromSuggestion(d, slot)}
                        disabled={supplying || !d?.preferredProfId}
                        className="w-full py-2 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-extrabold text-xs shadow disabled:opacity-40"
                      >
                        {supplying ? '⏳ در حال ثبت در سرور…' : '📦 عرضهٔ گروه از این پیشنهاد (درج واقعی در DB)'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* وضعیت واقعی برنامه — KPI محاسبه‌شده از DB */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="rounded-2xl p-4 border-2 border-slate-200 bg-white shadow-sm">
              <div className="text-[10px] text-slate-400 font-bold">کلاس‌های مصوب</div>
              <div className="text-xl font-extrabold text-slate-900">{faNum(currentRealScenario.offerings.length)}</div>
            </div>
            <div className="rounded-2xl p-4 border-2 border-slate-200 bg-white shadow-sm">
              <div className="text-[10px] text-slate-400 font-bold">جلسات تولیدشده</div>
              <div className="text-xl font-extrabold text-slate-900">{faNum(generatedTermSessionsCount)}</div>
            </div>
            <div className="rounded-2xl p-4 border-2 border-slate-200 bg-white shadow-sm">
              <div className="text-[10px] text-slate-400 font-bold">تداخل سخت فعلی</div>
              <div className={`text-xl font-extrabold ${hardConflictCount > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{faNum(hardConflictCount)}</div>
            </div>
            <div className="rounded-2xl p-4 border-2 border-slate-200 bg-white shadow-sm">
              <div className="text-[10px] text-slate-400 font-bold">سالن‌های دارای سهمیه</div>
              <div className="text-xl font-extrabold text-slate-900">{faNum(initial.allocatedRoomIds.length)}</div>
            </div>
          </div>

          {/* جدول هفتگی برنامهٔ مصوب */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">
                  جدول هفتگی: {currentScenario.title}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{currentScenario.description}</p>
              </div>
              <button
                onClick={() => setActiveMainTab('APPROVED')}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow-md flex items-center gap-1.5 transition"
              >
                <span>📋 رفتن به گام ۶ (برنامهٔ مصوب و ثبت نهایی)</span>
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
                          o.classSchedules.some(cs =>
                            cs.dayOfWeek === dayIdx &&
                            cs.startTime !== '' &&
                            cs.startTime >= slot.startTime &&
                            cs.startTime < slot.endTime
                          )
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
                                  const schedule = offering.classSchedules.find(cs =>
                                    cs.dayOfWeek === dayIdx && cs.startTime >= slot.startTime && cs.startTime < slot.endTime
                                  )!;
                                  return (
                                    <div
                                      key={offering.id}
                                      className="rounded-lg bg-indigo-50 border border-indigo-200 p-2 text-[10px] space-y-0.5"
                                    >
                                      <div className="font-extrabold text-indigo-900">{offering.code} — {offering.title}</div>
                                      <div className="text-slate-600 font-bold">
                                        گروه {faNum(offering.groupNumber)} · {offering.professorName} · {schedule.roomName}
                                      </div>
                                      <div className="text-slate-400 font-mono">{schedule.startTime} تا {schedule.endTime}</div>
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
                          o.classSchedules.some(cs => cs.dayOfWeek === dayIdx && (
                            cs.slotId === slot.id ||
                            (cs.startTime !== '' && cs.startTime >= slot.startTime && cs.startTime < slot.endTime)
                          ))
                        );

                        const availabilityStatus = realAvailStatus(inspectorProfId, dayIdx, slot);

                        return (
                          <td
                            key={slot.id}
                            className={`p-2 border border-slate-200 align-top min-w-[190px] h-24 ${
                              matchingOfferings.length > 0
                                ? 'bg-indigo-50/80'
                                : availabilityStatus === 'PREF'
                                ? 'bg-emerald-50/40'
                                : availabilityStatus === 'AVAIL'
                                ? 'bg-amber-50/40'
                                : ''
                            }`}
                          >
                            {matchingOfferings.length > 0 ? (
                              <div className="space-y-1">
                                {matchingOfferings.map(offering => {
                                  const schedule = offering.classSchedules.find(cs => cs.dayOfWeek === dayIdx && (
                                    cs.slotId === slot.id ||
                                    (cs.startTime !== '' && cs.startTime >= slot.startTime && cs.startTime < slot.endTime)
                                  ))!;
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
                                  availabilityStatus === 'AVAIL' ? 'text-amber-700' : 'text-slate-400'
                                }`}>
                                  {availabilityStatus === 'PREF' ? '🟩 اولویت استاد' :
                                   availabilityStatus === 'AVAIL' ? '🟨 قابل حضور (اعلام استاد)' : '☁️ اعلام نشده — بدون قید'}
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
                📋 برنامه مصوب و نهایی نیمسال جاری ({faNum(approvedOfferings.length)} کلاس فعال)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                منبع: جدول برنامهٔ مصوب (schedules) — روز، ساعت و سالن واقعی هر کلاس
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
      {/* ========================================================================= */}
      {/* MODAL: مشاهدهٔ فرم واقعی درٔ دسترس بودن استاد (فقط‌خواندنی — ثبت از پنل استاد) */}
      {/* ========================================================================= */}
      {isProfAvailabilityModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 bg-indigo-950 text-white flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-sm sm:text-base">
                  📖 فرم اعلامی درٔ دسترس بودن استاد: {editingProf.name}
                </h3>
                <span className="text-xs text-indigo-200">
                  {editingProf.academicRank} — {editingProf.departmentName}
                </span>
              </div>
              <button onClick={() => setIsProfAvailabilityModalOpen(false)} className="text-white/60 hover:text-white">✕</button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 text-xs">
              {(() => {
                const rows = realAvailRows.filter(r => r.staffId === editingProfId);
                if (!rows.length) {
                  return (
                    <div className="text-center py-10 space-y-2">
                      <div className="text-3xl">⏳</div>
                      <div className="font-extrabold text-slate-700">این استاد هنوز درٔ دسترس بودن خود را اعلام نکرده است.</div>
                      <div className="text-[11px] text-slate-400 font-bold">فرم درٔ دسترس بودن فقط از پنل خودِ استاد (پرتال استاد → درٔ دسترس بودن) ثبت می‌شود.</div>
                    </div>
                  );
                }
                return (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-900 text-white text-center">
                          <th className="p-2.5 border border-slate-800 font-extrabold">روز هفته</th>
                          <th className="p-2.5 border border-slate-800 font-extrabold">از</th>
                          <th className="p-2.5 border border-slate-800 font-extrabold">تا</th>
                          <th className="p-2.5 border border-slate-800 font-extrabold">وضعیت</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, idx) => (
                          <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                            <td className="p-2 border border-slate-200 font-extrabold text-center bg-slate-100 text-slate-900">
                              {r.dayOfWeek ? DAY_NAMES[(r.dayOfWeek - 1) % 6] : '—'}
                            </td>
                            <td className="p-2 border border-slate-200 text-center font-mono font-bold">{faNum(r.startTime ?? '—')}</td>
                            <td className="p-2 border border-slate-200 text-center font-mono font-bold">{faNum(r.endTime ?? '—')}</td>
                            <td className="p-2 border border-slate-200 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                r.status === 'PREF' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {r.status === 'PREF' ? '🟩 اولویت' : '🟨 قابل حضور'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-[11px] text-indigo-900 font-bold leading-relaxed">
                🔒 این داده فقط توسط خودِ استاد ثبت می‌شود و موتور پیشنهاد (getSmartSuggestions) همین بازه‌ها را به‌عنوان
                قید ورودی می‌خواند. ویرایش از این‌جا ممکن نیست.
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setIsProfAvailabilityModalOpen(false)}
                className="px-5 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
