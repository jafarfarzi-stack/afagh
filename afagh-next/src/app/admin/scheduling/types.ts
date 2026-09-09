// ═══════════════════════════════════════════════════════════════════════
//  قرارداد دادهٔ کارتابل برنامه‌ریزی درسی — فقط type/interface (بدون React).
//  SchedulingWorkspace دقیقاً خروجی getSchedulingWorkspaceAction است.
// ═══════════════════════════════════════════════════════════════════════

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

/** تب‌های اصلی کارتابل (کلید رندر در Shell) */
export type PlanningTab =
  | 'CURRICULUM_ASSIGN' | 'PROF_QUOTAS' | 'DEPT_ROOMS' | 'SCENARIOS'
  | 'PROFESSOR_SCHEDULE' | 'APPROVED' | 'TERM_CALENDAR';

/** فیلتر نمای هفته — «کلیه» حالت نمایشی است، نه نوع تکرار */
export type WeekView = WeekRecurrence | 'ALL_VIEW';

export type ToastKind = 'success' | 'info' | 'warning';
export type ToastMsg = { text: string; type: ToastKind };

/** تنظیمات تقویم نیمسال (گام ۷) */
export type TermCalendarConfig = {
  classStartDate: string;
  classEndDate: string;
  examStartDate: string;
  examEndDate: string;
  holidays: string;
  sessionsCount: number;
};

/** نمای جلسهٔ تولیدشده برای هر ارائه */
export type SessionsByOffering = Record<number, { total: number; makeup: number; firstDate: string | null }>;
