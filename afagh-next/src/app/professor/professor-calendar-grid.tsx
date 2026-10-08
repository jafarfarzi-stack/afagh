'use client';

import type { CSSProperties } from 'react';
import { PROFESSOR_GRID_DAYS } from '@/lib/professor-week-grid';
import {
  layoutProfessorCalendarDay,
  professorCalendarDayIndex,
  professorCalendarHourLabels,
  PROFESSOR_CALENDAR_END_MINUTES,
  PROFESSOR_CALENDAR_START_MINUTES,
  type ProfessorCalendarWeekType,
} from '@/lib/professor-calendar-layout';

export interface ProfessorCalendarEntry {
  key: string;
  id: number;
  code: string;
  title: string;
  groupNumber: number;
  dayOfWeek: number | null;
  startTime: string;
  endTime: string;
  roomName: string;
  buildingName: string;
  weekType: ProfessorCalendarWeekType;
  courseType?: string;
  isCoTaught?: boolean;
  coRole?: 'THEORY' | 'LAB';
  coPartnerName?: string;
  enrolledCount?: number | null;
  capacity?: number | null;
  merged?: boolean;
}

const faNum = (n: any) => (n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]));

const HOUR_LABELS = professorCalendarHourLabels();
const TOTAL_MINUTES = PROFESSOR_CALENDAR_END_MINUTES - PROFESSOR_CALENDAR_START_MINUTES;

function WeekBadge({ weekType }: { weekType: ProfessorCalendarWeekType }) {
  if (weekType === 'BOTH') {
    return (
      <span className="prof-week-badge px-1.5 py-0.5 rounded bg-violet-100 text-violet-900 font-bold border border-violet-300 whitespace-nowrap">🔷🔶 زوج و فرد</span>
    );
  }
  if (weekType === 'EVEN') {
    return (
      <span className="prof-week-badge px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-900 font-bold border border-cyan-300 whitespace-nowrap">🔷 هفته زوج</span>
    );
  }
  if (weekType === 'ODD') {
    return (
      <span className="prof-week-badge px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold border border-amber-300 whitespace-nowrap">🔶 هفته فرد</span>
    );
  }
  return (
    <span className="prof-week-badge px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 font-bold whitespace-nowrap">هر هفته</span>
  );
}

export function professorCalendarEntryTime(e: Pick<ProfessorCalendarEntry, 'startTime' | 'endTime'>) {
  return `${faNum(String(e.startTime).slice(0, 5))} الی ${faNum(String(e.endTime).slice(0, 5))}`;
}

export default function ProfessorCalendarGrid({ entries }: { entries: ProfessorCalendarEntry[] }) {
  const byDay: ProfessorCalendarEntry[][] = Array.from({ length: PROFESSOR_GRID_DAYS.length }, () => []);
  for (const e of entries) {
    const d = professorCalendarDayIndex(e.dayOfWeek);
    if (d == null) continue;
    byDay[d].push(e);
  }
  const placed = byDay.map(list => layoutProfessorCalendarDay(list));
  const hasEven = entries.some(e => e.weekType === 'EVEN');
  const hasOdd = entries.some(e => e.weekType === 'ODD');
  const hasBoth = entries.some(e => e.weekType === 'BOTH');
  const hasAll = entries.some(e => e.weekType === 'ALL');

  return (
    <div className="space-y-3">
      <style>{'.prof-week-card{container-type:inline-size}.prof-week-card .prof-week-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}[data-narrow="true"] .prof-week-card{padding:4px !important;line-height:1.3 !important}[data-narrow="true"] .prof-week-title{font-size:10px !important}[data-narrow="true"] .prof-week-code{font-size:9px !important}[data-narrow="true"] .prof-week-essential{font-size:9px !important}[data-narrow="true"] .prof-week-detail{display:none !important}@container (max-width:150px){.prof-week-detail{display:none}.prof-week-title{font-size:10px}.prof-week-code{font-size:9px}.prof-week-essential{font-size:9px}}'}</style>
      {(hasEven || hasOdd || hasBoth) && (
        <div className="prof-week-legend flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
          <span className="text-slate-500">راهنمای هفته‌ها:</span>
          {hasAll && <span className="prof-week-badge px-2 py-0.5 rounded-lg bg-slate-200 text-slate-800">هر هفته — همه هفته‌ها</span>}
          {hasEven && <span className="prof-week-badge px-2 py-0.5 rounded-lg bg-cyan-100 text-cyan-900 border border-cyan-300">🔷 هفته زوج — فقط هفته‌های زوج</span>}
          {hasOdd && <span className="prof-week-badge px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300">🔶 هفته فرد — فقط هفته‌های فرد</span>}
          {hasBoth && <span className="prof-week-badge px-2 py-0.5 rounded-lg bg-violet-100 text-violet-900 border border-violet-300">🔷🔶 زوج و فرد — همه هفته‌ها</span>}
        </div>
      )}

      <div className="prof-week-scroll overflow-x-auto rounded-2xl border border-slate-200">
        <div className="prof-cal min-w-[960px]" dir="rtl" style={{ '--cal-hour': '56px' } as CSSProperties}>
          <div className="prof-cal-head grid sticky top-0 z-20 bg-slate-900 text-white text-center" style={{ gridTemplateColumns: '56px repeat(7, minmax(0, 1fr))' }}>
            <div className="prof-cal-sticky prof-cal-gutter-head sticky right-0 z-30 p-2 border border-slate-800 font-extrabold bg-slate-900 text-[11px]">ساعت</div>
            {PROFESSOR_GRID_DAYS.map(day => (
              <div key={day} className="prof-cal-day-head p-2 border border-slate-800 font-extrabold text-xs whitespace-nowrap bg-slate-900">
                {day}
              </div>
            ))}
          </div>

          <div className="prof-cal-body grid" style={{ gridTemplateColumns: '56px repeat(7, minmax(0, 1fr))' }}>
            <div className="prof-cal-sticky prof-cal-gutter sticky right-0 z-10 bg-white border-l border-slate-200">
              <div className="relative w-full" style={{ height: 'calc(var(--cal-hour) * 12)' }}>
                {HOUR_LABELS.map((label, i) => (
                  <div
                    key={label}
                    className="prof-cal-gutter-label absolute inset-x-0 text-center text-[10px] font-bold text-slate-500 whitespace-nowrap"
                    style={{ top: `${(i / 12) * 100}%`, transform: i === 0 ? 'translateY(0)' : i === 12 ? 'translateY(-100%)' : 'translateY(-50%)' }}
                  >
                    {faNum(label)}
                  </div>
                ))}
              </div>
            </div>

            {PROFESSOR_GRID_DAYS.map((day, dayIdx) => (
              <div key={day} className="prof-cal-day border-l border-slate-200 last:border-l-0 bg-white">
                <div className="relative w-full" style={{ height: 'calc(var(--cal-hour) * 12)' }}>
                  {Array.from({ length: 12 }, (_, h) => (
                    <div key={`h-${h}`}>
                      <div
                        className="prof-cal-hour-line absolute inset-x-0 border-t border-slate-300"
                        style={{ top: `${((h * 60) / TOTAL_MINUTES) * 100}%` }}
                      />
                      <div
                        className="prof-cal-half-line absolute inset-x-0 border-t border-dashed border-slate-100"
                        style={{ top: `${(((h * 60) + 30) / TOTAL_MINUTES) * 100}%` }}
                      />
                    </div>
                  ))}
                  <div className="prof-cal-hour-line absolute inset-x-0 border-t border-slate-300" style={{ top: '100%' }} />

                  {placed[dayIdx].length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-200 text-lg font-black select-none">—</div>
                  )}

                  {placed[dayIdx].map((p, i) => {
                    const e = p.entry as ProfessorCalendarEntry;
                    return (
                      <div
                        key={`${p.key}#${i}`}
                        className="absolute p-[2px]"
                        data-narrow={p.columnCount > 1 ? 'true' : 'false'}
                        data-cols={p.columnCount}
                        style={{
                          top: `${p.topPercent}%`,
                          height: `${p.heightPercent}%`,
                          left: `${p.leftPercent}%`,
                          width: `${p.widthPercent}%`,
                          minHeight: '40px',
                        }}
                      >
                        <div
                          title={`${e.title} — ${e.code} · ${professorCalendarEntryTime(e)}${e.roomName ? ` · ${e.roomName}` : ''}`}
                          className={`prof-week-card h-full overflow-hidden p-1.5 rounded-lg border text-right shadow-xs leading-4 ${
                            e.courseType === 'عملی'
                              ? 'bg-amber-50 border-amber-300 text-amber-950'
                              : 'bg-indigo-50 border-indigo-200 text-indigo-950'
                          }`}
                        >
                          <div className="prof-week-title font-extrabold text-[11px] text-slate-900 leading-5 truncate" title={e.title}>
                            {e.title}
                          </div>
                          <div className="prof-week-code font-mono text-[10px] font-bold text-indigo-900 whitespace-nowrap truncate" title={`${e.code} · گروه ${e.groupNumber}`}>
                            {e.code} · گروه {faNum(e.groupNumber)}
                          </div>
                          <div className="prof-week-essential text-[10px] font-mono font-bold text-slate-600 whitespace-nowrap">
                            {professorCalendarEntryTime(e)}
                          </div>
                          <div
                            className="prof-week-essential text-[10px] font-bold text-slate-700 whitespace-nowrap truncate"
                            title={e.roomName ? `${e.roomName}${e.buildingName ? ` · ${e.buildingName}` : ''}` : 'سالن ثبت نشده'}
                          >
                            {e.roomName ? `🏛️ ${e.roomName}` : '🏛️ سالن ثبت نشده'}<span className="prof-week-detail">{e.buildingName ? ` · ${e.buildingName}` : ''}</span>
                          </div>
                          {e.merged && (
                            <div className="prof-week-badge mt-0.5 inline-block px-1.5 py-0.5 rounded bg-teal-100 text-teal-950 font-bold border border-teal-300 text-[10px] whitespace-nowrap">
                              🔗 کلاس ادغامی
                            </div>
                          )}
                          {e.isCoTaught && (
                            <div className="prof-week-detail mt-0.5 px-1 py-0.5 rounded bg-purple-100 text-purple-900 text-[10px] font-bold border border-purple-200 leading-4 truncate" title={e.coPartnerName ? `مشترک · ${e.coPartnerName}` : 'مشترک'}>
                              👥 مشترک{e.coPartnerName ? ` · ${e.coPartnerName}` : ''}
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-1 text-[10px] pt-0.5 mt-0.5 border-t border-slate-200/60">
                            <span className="prof-week-detail font-bold text-slate-600 whitespace-nowrap">
                              {e.enrolledCount != null ? `👥 ${faNum(e.enrolledCount)}/${faNum(e.capacity)}` : '👥'}
                            </span>
                            <WeekBadge weekType={e.weekType} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
