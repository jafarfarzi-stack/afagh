import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { faDigits } from '@/lib/calendar';
import { checkinState, checkinWindowLabel, tehranNow } from '@/lib/room-checkin';
import { listControlledRooms, listMergedTodaySessionsForRooms } from '@/lib/attendance-control';
import { mergeBadgeText, mergeMemberTitles } from '@/lib/merged-class-core';
import AttendanceControlClient, { type ControlRowView } from './AttendanceControlClient';

export const dynamic = 'force-dynamic';

/**
 * کارتابلِ «کنترل‌کنندهٔ حضور و غیاب کلاس‌ها».
 *
 * نقشِ ATTENDANCE_CONTROLLER فقط یک کار دارد: سرِ ساعت سرِ کلاس برسد و
 * «تشکیل کلاس» را ثبت کند. این صفحه دقیقاً همان یک کار را می‌دهد و هیچ
 * دسترسیِ آموزشی/مالیِ دیگری ندارد.
 *
 * دامنه: اتاق‌هایی که در «تخصیص کارشناس به اتاق‌ها» به این کاربر سپرده شده
 * (به‌علاوهٔ اتاقِ درس‌هایی که استثنائاً به او واگذار شده). اگر مدیر تنظیمِ
 * «محدود به اتاق‌های تخصیص‌یافته» را خاموش کند، همهٔ اتاق‌های دانشگاهِ خودش.
 *
 * ⚠ گاردِ نقش این‌جاست؛ ولی مرجعِ نهاییِ ثبت، Server Action است که همه‌چیز را
 *   (اتاق، تاریخ، پنجرهٔ زمانی، مالکیت، مرز دانشگاه) دوباره بررسی می‌کند.
 *
 * کلاس‌های ادغامی: اگر در یک ساعت چند عرضه (مثلاً «ریاضی» و «ریاضی ۱») با یک
 * استاد در یک اتاق برگزار شوند، فقط **یک** ردیف با نشان 🔗 نشان داده می‌شود و
 * ثبتِ آن روی همهٔ اعضا اعمال می‌شود.
 */
export default async function AttendanceControlPage() {
  const user = await requireRole(['ADMIN', 'EDU_EXPERT', 'ATTENDANCE_CONTROLLER']);
  const uni = await getCurrentUniversity().catch(() => null);

  const rooms = await listControlledRooms(user.id, uni?.id ?? null);
  const now = tehranNow();
  const groups = await listMergedTodaySessionsForRooms(rooms.map((r) => r.id), now.jalali);

  const fa = (v: string) => faDigits(v);

  const rows: ControlRowView[] = groups.map((g) => {
    const r = g.members[0];
    const state = checkinState(r.startTime, r.endTime, now.minutes);
    const win = checkinWindowLabel(r.startTime, r.endTime);
    return {
      roomId: r.roomId,
      roomName: r.roomName,
      buildingName: r.buildingName,
      sessionId: r.sessionId,
      startTime: fa(r.startTime),
      endTime: fa(r.endTime),
      courseTitle: r.courseTitle,
      courseCode: fa(r.courseCode),
      groupNumber: fa(String(r.groupNumber)),
      professorName: r.professorName,
      state,
      windowFrom: win ? fa(win.from) : '',
      windowTo: win ? fa(win.to) : '',
      recorded: r.recordedAt != null,
      recordedAtLabel: r.recordedAt
        ? new Date(r.recordedAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
        : null,
      recordedBy: r.recordedBy,
      recordedMethod: r.recordedMethod,
      // ── ادغام ──
      merged: g.merged,
      memberCount: g.members.length,
      memberTitles: mergeMemberTitles(g.members),
      memberSessionIds: g.memberSessionIds,
    };
  });

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3">
        <div className="text-sm font-black text-indigo-900">کنترل حضور و غیاب کلاس‌ها</div>
        <div className="text-[11px] font-bold text-indigo-800/80 leading-6">
          {fa(now.jalali)} · {rooms.length} اتاق تحت مسئولیت شما · ثبت هر جلسه به نامِ استادِ همان درس
          انجام می‌شود و نام شما به‌عنوان ثبت‌کننده در سابقه می‌ماند.
        </div>
      </div>

      {rooms.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center text-xs font-bold text-amber-900 leading-6">
          هنوز هیچ اتاقی به شما سپرده نشده است.
          <br />
          از مدیر سامانه بخواهید در صفحهٔ «تخصیص کارشناس به اتاق‌ها» اتاق‌های تحت مسئولیت شما را تعیین کند.
        </div>
      ) : (
        <AttendanceControlClient rows={rows} minuteNow={now.minutes} />
      )}
    </div>
  );
}
