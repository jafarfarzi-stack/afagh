import 'server-only';

import { sql } from 'drizzle-orm';
import { db } from '@/db';
import type { VirtualClassSession } from '@/lib/moodle-bbb';

type Row = {
  courseId: number;
  courseCode: string | null;
  courseTitle: string | null;
  professorName: string | null;
  meetingId: string;
  startTime: string;
  endTime: string;
  isRunning: boolean;
  activeParticipantsCount: number;
  recordingsCount: number;
};

const hhmm = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  const s = String(v);
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return '—';
  return `${m[1].padStart(2, '0')}:${m[2]}`;
};

export async function listTermVirtualClasses(
  studentId: number,
  termId: number | null,
): Promise<VirtualClassSession[]> {
  const rows = ((await db.execute(sql`
    select c.id as "courseId",
           c.code as "courseCode", c.title as "courseTitle",
           (pu."firstName" || ' ' || pu."lastName") as "professorName",
           vc."bbbMeetingId" as "meetingId",
           min(sc."startTime")::text as "startTime",
           max(sc."endTime")::text as "endTime",
           (vc."isRunning" = 1) as "isRunning",
           coalesce(vc."currentAttendanceCount", 0)::int as "activeParticipantsCount",
           (select count(*)::int from virtual_class_recordings vr where vr."classroomId" = vc.id) as "recordingsCount"
      from enrollments en
      join course_offerings o on o.id = en."offeringId"
      join courses c on c.id = o."courseId"
      join virtual_classrooms vc on vc."courseOfferingId" = o.id
      left join staff st on st.id = o."professorId"
      left join users pu on pu.id = st."userId"
      left join schedules sc on sc."offeringId" = o.id and sc."scheduleType" = 'CLASS'
     where en."studentId" = ${studentId}
       and (${termId === null ? sql`true` : sql`o."termId" = ${termId}`})
     order by c.code, vc."meetingName"
  `)).rows ?? []) as unknown as Row[];

  return rows.map(r => ({
    courseId: Number(r.courseId),
    courseCode: r.courseCode ?? '',
    courseTitle: r.courseTitle ?? '',
    professorName: r.professorName ?? '',
    meetingId: r.meetingId,
    startTime: hhmm(r.startTime),
    endTime: hhmm(r.endTime),
    isRunning: !!r.isRunning,
    activeParticipantsCount: Number(r.activeParticipantsCount ?? 0),
    recordingsCount: Number(r.recordingsCount ?? 0),
  }));
}