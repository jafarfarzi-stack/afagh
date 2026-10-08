import { professorUniqueOfferings, type ProfessorScheduleRow } from '@/lib/professor-data';
import {
  PROFESSOR_GRID_DAYS,
  PROFESSOR_GRID_TIME_SLOTS,
  professorRangeMatch,
} from '@/lib/professor-week-grid';

const faNum = (n: any) => (n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]));

type Props = {
  termTitle: string;
  selectedTermTitle: string | null;
  rows: ProfessorScheduleRow[];
};

const weekTypeLabel = (weekType: ProfessorScheduleRow['weekType']) =>
  weekType === 'EVEN' ? 'هفته زوج' : weekType === 'ODD' ? 'هفته فرد' : 'هر هفته';

/**
 * جدول نیمسالی تکلیف کارتابل جاری.
 *
 * تنها کلاس‌هایی را در شبکهٔ هفتگی نشان می‌دهد که ساعت معتبر دارند؛ هر کلاسِ بدون
 * ساعت در بلوک «کلاس‌های بدون ساعت‌بندی ثبت‌شده» فهرست می‌شود. چون هر دو بلوک از
 * یک آرایهٔ واحد (`rows`) می‌آیند، دیگر نمی‌توانند با هم در تناقض باشند.
 */
export default function ProfessorWeekTable({ termTitle, selectedTermTitle, rows }: Props) {
  const scopeLabel = selectedTermTitle ? `نیمسال «${selectedTermTitle}»` : `نیمسال ${termTitle || 'جاری'}`;
  const offerings = professorUniqueOfferings(rows);
  const scheduled = rows.filter(r => r.hasSchedule);
  const unscheduled = rows.filter(r => !r.hasSchedule);
  const outsideSlots = scheduled.filter(r => r.outsideStandardSlots);

  if (offerings.length === 0) {
    return (
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200">
        <h2 className="font-extrabold text-slate-900 text-base">
          جدول نیمسالی تکلیف کارتابل جاری {termTitle ? `— ${termTitle}` : ''}
        </h2>
        <div className="mt-4 text-center p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-xs font-bold text-slate-500">
          در {scopeLabel} هیچ کلاسی برای شما تخصیص نیافته است. پس از تخصیص درس توسط مدیر گروه،
          برنامهٔ هفتگی به‌صورت خودکار از جدول زمان‌بندی همین‌جا نمایش داده می‌شود.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="font-extrabold text-slate-900 text-base">
            جدول نیمسالی تکلیف کارتابل جاری {termTitle ? `— ${termTitle}` : ''}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            فقط کلاس‌هایی که ساعت ثبت‌شده دارند در جدول دیده می‌شوند؛ بقیه در فهرست پایین همین کارت آمده‌اند.
          </p>
        </div>
        <span className="text-xs font-bold text-slate-500 whitespace-nowrap">
          {faNum(offerings.length)} کلاس · {faNum(scheduled.length)} جلسهٔ زمان‌بندی‌شده
        </span>
      </div>

      {scheduled.length === 0 ? (
        <div className="text-center p-6 bg-amber-50 rounded-2xl border border-dashed border-amber-300 text-xs font-bold text-amber-900 leading-6">
          {faNum(offerings.length)} کلاس در {scopeLabel} به شما تخصیص یافته است، اما هیچ‌کدام ساعت و روزی
          در جدول زمان‌بندی ندارند؛ بنابراین جدول هفتگی خالی است. فهرست دقیق کلاس‌ها در پایین همین کارت آمده است.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-white text-center">
                <th className="p-3 border border-slate-800 w-28 font-extrabold">روز هفته</th>
                {PROFESSOR_GRID_TIME_SLOTS.map(slot => (
                  <th key={slot.id} className="p-3 border border-slate-800 font-extrabold">
                    {slot.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PROFESSOR_GRID_DAYS.map((dayName, dayIdx) => (
                <tr key={dayName} className={dayIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-3 border border-slate-200 font-extrabold text-center bg-slate-100 text-slate-900">
                    {dayName}
                  </td>
                  {PROFESSOR_GRID_TIME_SLOTS.map(slot => {
                    const matched = scheduled.filter(r => {
                      if (r.dayOfWeek !== dayIdx) return false;
                      return professorRangeMatch(r.startTime, r.endTime).slotIds.includes(slot.id);
                    });
                    return (
                      <td key={slot.id} className="p-2 border border-slate-200 min-h-[90px] align-top">
                        {matched.length === 0 ? (
                          <div className="h-full min-h-[80px] flex items-center justify-center text-slate-300 text-[10px] font-bold">
                            —
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {matched.map(item => (
                              <div
                                key={`${item.id}-${item.startTime}-${slot.id}`}
                                className={`p-2.5 rounded-xl border text-right shadow-xs ${
                                  item.courseType === 'عملی'
                                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                                    : 'bg-indigo-50 border-indigo-200 text-indigo-950'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <span className="font-extrabold text-xs text-slate-900 leading-tight">
                                    {item.title}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-white font-mono text-[10px] font-bold text-indigo-900 border border-slate-200">
                                    گروه {faNum(item.groupNumber)}
                                  </span>
                                </div>
                                <div className="text-[11px] font-bold text-slate-700 flex items-center justify-between mb-1">
                                  <span>{item.roomName ? `🏛️ ${item.roomName}` : '🏛️ سالن ثبت نشده'}</span>
                                  <span className="text-slate-500 text-[10px]">{item.buildingName}</span>
                                </div>
                                <div className="text-[10px] font-mono text-slate-600 mb-1">
                                  {faNum(item.startTime)} الی {faNum(item.endTime)}
                                </div>
                                {item.isCoTaught && (
                                  <div className="p-1 rounded bg-purple-100 text-purple-900 text-[10px] font-bold mb-1 border border-purple-200">
                                    👥 مشترک ({item.coRole === 'THEORY' ? 'استاد تئوری' : 'استاد عملی'} · همکار: {item.coPartnerName})
                                  </div>
                                )}
                                <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-200/60">
                                  <span className="font-bold text-slate-600">
                                    👥 {faNum(item.enrolledCount)}/{faNum(item.capacity)} دانشجو
                                  </span>
                                  <span className="font-bold text-slate-500">
                                    {weekTypeLabel(item.weekType)}
                                  </span>
                                </div>
                              </div>
                            ))}
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
      )}

      {unscheduled.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <h3 className="text-xs font-extrabold text-amber-900">
            کلاس‌های بدون ساعت‌بندی ثبت‌شده ({faNum(new Set(unscheduled.map(r => r.id)).size)} کلاس)
          </h3>
          <p className="text-[11px] text-amber-800 leading-5">
            این کلاس‌ها در {scopeLabel} به شما تخصیص یافته‌اند ولی هنوز روز و ساعتی در جدول زمان‌بندی
            برایشان ثبت نشده است؛ به همین دلیل در جدول بالا دیده نمی‌شوند.
          </p>
          <ul className="space-y-1 text-[11px] font-bold text-amber-900">
            {unscheduled.map(r => (
              <li key={`${r.id}-${r.code}-unscheduled`}>
                {r.code} · {r.title} · گروه {faNum(r.groupNumber)} · {faNum(r.units)} واحد · {scopeLabel}
              </li>
            ))}
          </ul>
        </div>
      )}

      {outsideSlots.length > 0 && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 space-y-2">
          <h3 className="text-xs font-extrabold text-sky-900">
            کلاس‌های خارج از بازه‌های ثابت جدول ({faNum(new Set(outsideSlots.map(r => r.id)).size)} کلاس)
          </h3>
          <p className="text-[11px] text-sky-800 leading-5">
            ساعت ثبت‌شدهٔ این کلاس‌ها با هیچ‌یک از بازه‌های ثابت ستون‌های جدول هم‌پوشانی ندارد، پس در
            شبکهٔ بالا جا نمی‌شوند. ساعت واقعی ثبت‌شده در پایگاه داده:
          </p>
          <ul className="space-y-1 text-[11px] font-bold text-sky-900">
            {outsideSlots.map(r => (
              <li key={`${r.id}-${r.startTime}-outside`}>
                {r.dayName} {faNum(r.startTime)} الی {faNum(r.endTime)} · {r.code} · {r.title} · گروه {faNum(r.groupNumber)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
