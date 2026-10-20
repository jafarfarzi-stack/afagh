import React from 'react';
import Link from 'next/link';
import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  class_sessions,
  classrooms,
  courses,
  course_offerings,
  offering_professors,
  professor_class_attendance,
  universities,
} from '@/db/schema';
import { getSessionUser, getStaffByUser } from '@/lib/auth';
import { faDigits } from '@/lib/calendar';
import {
  checkinState,
  checkinWindowLabel,
  parseRoomCode,
  tehranNow,
} from '@/lib/room-checkin';
import { recordRoomAttendance } from './actions';

export const dynamic = 'force-dynamic';

const MSG: Record<string, string> = {
  ok: 'حضور شما با موفقیت ثبت شد.',
  already: 'حضور شما برای این جلسه قبلاً ثبت شده است.',
};

const ERR: Record<string, string> = {
  badroom: 'کد این QR معتبر نیست. لطفاً QR سردر کلاس را دوباره اسکن کنید.',
  nosession: 'جلسهٔ معتبری برای ثبت حضور یافت نشد.',
  notstaff: 'این صفحه مخصوص استادان است. با حساب استاد وارد شوید.',
  wrongroom: 'این جلسه در این اتاق برگزار نمی‌شود.',
  notoday: 'این جلسه امروز برگزار نمی‌شود.',
  window: 'اکنون خارج از بازهٔ مجاز ثبت حضور است.',
  notyours: 'شما استاد این درس نیستید.',
  wronguni: 'این اتاق به دانشگاه دیگری تعلق دارد.',
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 font-sans flex flex-col items-center justify-center py-8 px-4" dir="rtl">
      <div className="w-full max-w-md space-y-3">{children}</div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-6 space-y-4">{children}</div>
  );
}

function Notice({ kind, text }: { kind: 'ok' | 'err' | 'info'; text: string }) {
  const tone =
    kind === 'ok'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
      : kind === 'err'
        ? 'bg-rose-50 border-rose-200 text-rose-800'
        : 'bg-amber-50 border-amber-200 text-amber-800';
  return (
    <div className={`rounded-2xl border px-4 py-3 text-xs font-bold leading-6 ${tone}`}>{text}</div>
  );
}

export default async function RoomCheckinPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const { code } = await params;
  const sp = await searchParams;
  const roomId = parseRoomCode(code);

  const msg = sp.msg ? MSG[sp.msg] : null;
  const err = sp.err ? ERR[sp.err] ?? 'خطای نامشخص رخ داد.' : null;

  if (!roomId) {
    return (
      <Shell>
        <Card>
          <h1 className="text-lg font-black text-slate-900 text-center">QR نامعتبر</h1>
          <Notice kind="err" text={ERR.badroom} />
        </Card>
      </Shell>
    );
  }

  const [room] = await db
    .select({
      id: classrooms.id,
      name: classrooms.name,
      buildingName: classrooms.buildingName,
      floor: classrooms.floor,
      isActive: classrooms.isActive,
      universityId: classrooms.universityId,
    })
    .from(classrooms)
    .where(eq(classrooms.id, roomId))
    .limit(1);

  if (!room) {
    return (
      <Shell>
        <Card>
          <h1 className="text-lg font-black text-slate-900 text-center">اتاق یافت نشد</h1>
          <Notice kind="err" text="این اتاق در سامانه ثبت نشده است. با ادارهٔ آموزش تماس بگیرید." />
        </Card>
      </Shell>
    );
  }

  const uniTitle = room.universityId
    ? (await db
        .select({ title: universities.title })
        .from(universities)
        .where(eq(universities.id, room.universityId))
        .limit(1))[0]?.title ?? null
    : null;

  const roomLine = [room.buildingName, room.floor].filter(Boolean).join(' · ');

  const header = (
    <div className="text-center space-y-1">
      <div className="w-14 h-14 bg-gradient-to-tr from-indigo-950 to-indigo-800 rounded-2xl flex items-center justify-center mx-auto shadow-lg text-white font-black text-xl border-2 border-amber-400">
        آ
      </div>
      <div className="text-[11px] font-bold text-slate-500">{uniTitle ?? 'سامانه جامع آفاق'}</div>
      <h1 className="text-xl font-black text-slate-900">ثبت حضور استاد</h1>
      <div className="text-xs font-bold text-slate-600">
        اتاق {faDigits(room.name)}
        {roomLine ? <span className="text-slate-400"> — {faDigits(roomLine)}</span> : null}
      </div>
      {room.isActive === 0 ? (
        <div className="text-[10px] font-bold text-amber-700">این اتاق در سامانه غیرفعال است.</div>
      ) : null}
    </div>
  );

  const user = await getSessionUser();
  if (!user) {
    return (
      <Shell>
        <Card>
          {header}
          <Notice kind="info" text="برای ثبت حضور باید با حساب استاد وارد سامانه شوید." />
          <Link
            href={`/login?next=${encodeURIComponent(`/p/room-${roomId}`)}`}
            className="block w-full py-3 rounded-2xl bg-indigo-900 hover:bg-indigo-950 text-white font-black text-xs text-center shadow-md transition"
          >
            ورود به سامانه
          </Link>
        </Card>
      </Shell>
    );
  }

  const me = await getStaffByUser(user.id);
  if (!me) {
    return (
      <Shell>
        <Card>
          {header}
          <Notice kind="err" text="برای این حساب پروندهٔ هیئت علمی ثبت نشده است؛ این صفحه مخصوص استادان است." />
        </Card>
      </Shell>
    );
  }

  // مرزِ بین‌دانشگاهی: QRِ یک اتاق نباید برنامهٔ اتاقِ دانشگاه دیگر را نشان دهد.
  // شناسهٔ اتاق عددی و ترتیبی است، پس بدون این گارد با حدسِ شماره می‌شد
  // برنامهٔ کلاس‌های دانشگاه دیگر را دید. (نوشتن از قبل با مالکیتِ ارائه بسته است.)
  const myUni = me.universityId ?? user.universityId ?? null;
  if (myUni != null && room.universityId != null && myUni !== room.universityId) {
    return (
      <Shell>
        <Card>
          {header}
          <Notice kind="err" text="این اتاق به دانشگاه دیگری تعلق دارد و در دسترس حساب شما نیست." />
        </Card>
      </Shell>
    );
  }

  const now = tehranNow();

  const todayRows = await db
    .select({
      id: class_sessions.id,
      startTime: class_sessions.startTime,
      endTime: class_sessions.endTime,
      offeringId: class_sessions.offeringId,
      professorId: course_offerings.professorId,
      courseTitle: courses.title,
      courseCode: courses.code,
      groupNumber: course_offerings.groupNumber,
    })
    .from(class_sessions)
    .innerJoin(course_offerings, eq(course_offerings.id, class_sessions.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(and(
      eq(class_sessions.roomId, roomId),
      eq(class_sessions.isActive, 1),
      eq(class_sessions.sessionDate, now.jalali),
    ))
    .orderBy(asc(class_sessions.startTime));

  // استادِ مشترک: مالکِ ارائه نیست ولی در offering_professors ثبت شده است.
  const notMine = todayRows.filter(r => r.professorId !== me.id);
  let sharedOfferingIds = new Set<number>();
  if (notMine.length > 0) {
    const shared = await db
      .select({ offeringId: offering_professors.offeringId })
      .from(offering_professors)
      .where(and(
        eq(offering_professors.staffId, me.id),
        inArray(offering_professors.offeringId, [...new Set(notMine.map(r => r.offeringId))]),
      ));
    sharedOfferingIds = new Set(shared.map(s => s.offeringId));
  }

  const mine = todayRows
    .filter(r => r.professorId === me.id || sharedOfferingIds.has(r.offeringId))
    .map(r => ({
      ...r,
      state: checkinState(r.startTime, r.endTime, now.minutes),
      window: checkinWindowLabel(r.startTime, r.endTime),
    }));

  const mineIds = mine.map(m => m.id);
  const recordedRows = mineIds.length
    ? await db
        .select({
          sessionId: professor_class_attendance.sessionId,
          recordedAt: professor_class_attendance.recordedAt,
          verificationMethod: professor_class_attendance.verificationMethod,
        })
        .from(professor_class_attendance)
        .where(and(
          inArray(professor_class_attendance.sessionId, mineIds),
          eq(professor_class_attendance.staffId, me.id),
        ))
    : [];
  const recordedBy = new Map(recordedRows.map(r => [r.sessionId, r]));

  const withRecord = mine.map(m => ({ ...m, recorded: recordedBy.get(m.id) ?? null }));
  const focus =
    withRecord.find(m => m.state === 'OPEN' && !m.recorded) ??
    withRecord.find(m => m.state === 'OPEN') ??
    withRecord.find(m => m.state === 'BEFORE') ??
    withRecord[withRecord.length - 1] ??
    null;

  // اگر امروز کلاسی در این اتاق نداریم، نزدیک‌ترین جلساتِ آیندهٔ همین استاد را نشان بده.
  let upcoming: { id: number; sessionDate: string; startTime: string; endTime: string; courseTitle: string; courseCode: string }[] = [];
  if (!focus) {
    const nextRows = await db
      .select({
        id: class_sessions.id,
        sessionDate: class_sessions.sessionDate,
        startTime: class_sessions.startTime,
        endTime: class_sessions.endTime,
        offeringId: class_sessions.offeringId,
        professorId: course_offerings.professorId,
        courseTitle: courses.title,
        courseCode: courses.code,
      })
      .from(class_sessions)
      .innerJoin(course_offerings, eq(course_offerings.id, class_sessions.offeringId))
      .innerJoin(courses, eq(courses.id, course_offerings.courseId))
      .where(and(
        eq(class_sessions.roomId, roomId),
        eq(class_sessions.isActive, 1),
        gt(class_sessions.sessionDate, now.jalali),
      ))
      .orderBy(asc(class_sessions.sessionDate), asc(class_sessions.startTime))
      .limit(12);

    const nextNotMine = nextRows.filter(r => r.professorId !== me.id);
    let nextShared = new Set<number>();
    if (nextNotMine.length > 0) {
      const shared = await db
        .select({ offeringId: offering_professors.offeringId })
        .from(offering_professors)
        .where(and(
          eq(offering_professors.staffId, me.id),
          inArray(offering_professors.offeringId, [...new Set(nextNotMine.map(r => r.offeringId))]),
        ));
      nextShared = new Set(shared.map(s => s.offeringId));
    }

    upcoming = nextRows
      .filter(r => r.professorId === me.id || nextShared.has(r.offeringId))
      .slice(0, 3);
  }

  const timeLabel = (start: string, end: string) =>
    `${faDigits(start)} تا ${faDigits(end)}`;

  return (
    <Shell>
      <Card>
        {header}

        {msg ? <Notice kind="ok" text={msg} /> : null}
        {err ? <Notice kind="err" text={err} /> : null}

        {!focus ? (
          <>
            <Notice kind="info" text="امروز برای شما در این اتاق کلاسی ثبت نشده است." />
            {upcoming.length > 0 ? (
              <div className="space-y-2">
                <div className="text-[11px] font-black text-slate-700">جلسات بعدی شما در این اتاق</div>
                {upcoming.map(u => (
                  <div key={u.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-xs font-black text-slate-800">{u.courseTitle}</div>
                    <div className="text-[10px] font-bold text-slate-500 mt-0.5" dir="ltr">
                      {faDigits(u.courseCode)} · {faDigits(u.sessionDate)} · {timeLabel(u.startTime, u.endTime)}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-1">
              <div className="text-sm font-black text-slate-900">{focus.courseTitle}</div>
              <div className="text-[11px] font-bold text-slate-500" dir="ltr">
                {faDigits(focus.courseCode)} · گروه {faDigits(focus.groupNumber)}
              </div>
              <div className="text-[11px] font-bold text-slate-600">
                {timeLabel(focus.startTime, focus.endTime)}
              </div>
            </div>

            {focus.recorded ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-center space-y-1">
                <div className="text-2xl">✅</div>
                <div className="text-xs font-black text-emerald-800">حضور شما ثبت شده است</div>
                {focus.recorded.recordedAt ? (
                  <div className="text-[10px] font-bold text-emerald-700">
                    زمان ثبت: {faDigits(new Date(focus.recorded.recordedAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }))}
                  </div>
                ) : null}
              </div>
            ) : focus.state === 'OPEN' ? (
              <form action={recordRoomAttendance} className="space-y-2">
                <input type="hidden" name="code" value={`room-${roomId}`} />
                <input type="hidden" name="sessionId" value={focus.id} />
                <button
                  type="submit"
                  className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-md transition"
                >
                  ثبت حضور من
                </button>
                {focus.window ? (
                  <div className="text-[10px] font-bold text-slate-500 text-center">
                    بازهٔ مجاز ثبت: {faDigits(focus.window.from)} تا {faDigits(focus.window.to)}
                  </div>
                ) : null}
              </form>
            ) : focus.state === 'BEFORE' ? (
              <Notice
                kind="info"
                text={focus.window
                  ? `پنجرهٔ ثبت حضور از ساعت ${faDigits(focus.window.from)} باز می‌شود.`
                  : 'پنجرهٔ ثبت حضور هنوز باز نشده است.'}
              />
            ) : (
              <Notice kind="err" text="زمان مجاز ثبت حضور این جلسه گذشته است. در صورت نیاز با ادارهٔ آموزش تماس بگیرید." />
            )}
          </>
        )}

        <div className="text-[10px] font-bold text-slate-400 text-center pt-2 border-t border-slate-100">
          {faDigits(now.jalali)} · این صفحه فقط برای ثبت حضور استاد است.
        </div>
      </Card>
    </Shell>
  );
}
