/**
 * منطق خالصِ ساخت ردیف‌های برنامهٔ هفتگی دانشجو — بدون React و بدون
 * وابستگی سروری. از `ScheduleClient` جدا شد تا تست‌ها بتوانند بدون
 * کشیده‌شدن زنجیرهٔ کامپوننت کلاینت (و ماژول‌های server-only) آن را بسنجند.
 */
import {
  professorCalendarDayIndex,
  professorCalendarEntryKey,
} from '@/lib/professor-calendar-layout';
import type { ProfessorCalendarEntry } from '../../professor/professor-calendar-grid';

export type StudentGridWeekType = 'ALL' | 'EVEN' | 'ODD';

export interface StudentGridClass {
  dayOfWeek: number | null;
  dayName: string;
  startTime: string;
  endTime: string;
  room: string;
  building: string;
  weekType: StudentGridWeekType;
}

export interface StudentScheduleCourse {
  enrollmentId: number;
  offeringId: number;
  code: string;
  title: string;
  units: number;
  courseType: string;
  group: number;
  status: string;
  professor: string;
  enrolledCount: number | null;
  capacity: number | null;
  sharedScheduleGroupKey: string | null;
  classes: StudentGridClass[];
  exam: {
    examDate: string;
    startTime: string;
    endTime: string;
    room?: string;
  } | null;
}

export type StudentCalendarEntry = ProfessorCalendarEntry & {
  sharedScheduleGroupKey: string | null;
  roomKey: string;
};

export function studentWeekLabel(weekType: StudentGridWeekType): string {
  if (weekType === 'EVEN') return 'هفته زوج';
  if (weekType === 'ODD') return 'هفته فرد';
  return 'هر هفته';
}

export function studentStatusLabel(status: string | null | undefined): string {
  const v = String(status ?? '').toUpperCase();
  if (v === 'WAITLISTED') return 'ذخیره';
  if (v === 'PENDING_COUNCIL') return 'در انتظار شورا';
  return 'ثبت نهایی';
}

export function buildStudentCalendarEntries(courses: StudentScheduleCourse[]): StudentCalendarEntry[] {
  const out: StudentCalendarEntry[] = [];
  for (const c of courses) {
    for (const cls of c.classes) {
      if (professorCalendarDayIndex(cls.dayOfWeek) == null) continue;
      const startTime = String(cls.startTime ?? '').slice(0, 5);
      const endTime = String(cls.endTime ?? '').slice(0, 5);
      if (!startTime || !endTime) continue;
      const row = {
        id: c.offeringId,
        dayOfWeek: cls.dayOfWeek,
        startTime,
        endTime,
        weekType: cls.weekType,
      };
      out.push({
        key: professorCalendarEntryKey(row),
        id: c.offeringId,
        code: c.code,
        title: c.title,
        groupNumber: c.group,
        dayOfWeek: cls.dayOfWeek,
        startTime,
        endTime,
        roomName: cls.room || '',
        buildingName: cls.building || '',
        weekType: cls.weekType,
        courseType: c.courseType,
        professorName: c.professor,
        enrolledCount: c.enrolledCount,
        capacity: c.capacity,
        sharedScheduleGroupKey: c.sharedScheduleGroupKey,
        roomKey: cls.room || '',
      });
    }
  }
  return out;
}
