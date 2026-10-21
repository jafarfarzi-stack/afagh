'use client';

// تب ۳: ترم‌بندی چارت با درگ‌اندراپ + سقف واحد
import { useCurriculum } from '../curriculum-context';
import { STATUS_UI, faNum, semesterUnitTotal } from '../curriculum-core';
import { SUMMER_SEMESTER, isSummerSemester } from '@/lib/term-plan';

export default function SemestersTab() {
  const {
    activeTab,
    chartTermCount,
    degreeMajor,
    detail,
    dragCourseId,
    dropTarget,
    gridTerms,
    handleAssignSemester,
    isDraft,
    isOverflowTerm,
    onCourseDragEnd,
    onCourseDragStart,
    onDropToSemester,
    planTerms,
    selectedVersion,
    semesterCourses,
    setDropTarget,
    totalPlannedUnits,
    unassignedCourses,
  } = useCurriculum();

  if (!selectedVersion) return null;

  return (
    <>
      {/* ترمبندی چارت — تب: ترمبندی چارت */}
      {activeTab === 'SEMESTERS' && detail && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="font-extrabold text-slate-900 text-sm">🗺️ ترمبندی چارت — {selectedVersion.title}</h4>
              <p className="text-[11px] text-slate-500 font-bold mt-0.5">
                چارت {faNum(chartTermCount)} ترمه (مقطع: {degreeMajor?.degreeTitle ?? '—'}{degreeMajor?.degreeIsGraduate === 1 ? ' · تکمیلی' : ''}) + تابستان؛
                موتور انتخاب واحد و تطبیق فارغالتحصیلی بر اساس همین ترمبندی عمل میکنند.
              </p>
            </div>
            <div className="text-[11px] bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 font-black text-indigo-900">
              مجموع واحدهای چارت: {faNum(totalPlannedUnits)} از {faNum(detail.version.totalRequiredUnits)} واحد الزامی
              {detail.version.maxUnitsPerTerm != null ? ` · سقف هر ترم: ${faNum(detail.version.maxUnitsPerTerm)} واحد` : ''}
            </div>
          </div>

          {!isDraft && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-600">
              ⚠️ این نسخه «{(STATUS_UI[selectedVersion.status] ?? { label: selectedVersion.status }).label}» است و فقط مشاهده مجاز است؛ برای تغییر ترمبندی از «🔁 ایجاد نسخهٔ جدید (R+1)» یک پیشنویس بسازید.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {gridTerms.map(sem => {
              const list = semesterCourses.get(sem) ?? [];
              const units = semesterUnitTotal(list);
              const over = detail.version.maxUnitsPerTerm != null && units > (detail.version.maxUnitsPerTerm as number);
              const isDropHere = isDraft && dropTarget === sem;
              const summer = isSummerSemester(sem);
              const overflow = isOverflowTerm(sem);
              const cardCls = summer
                ? 'border-amber-300 bg-amber-50/70'
                : over ? 'border-rose-300 bg-rose-50' : 'border-emerald-200 bg-emerald-50/50';
              return (
                <div
                  key={sem}
                  onDragOver={isDraft ? (e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(sem); }) : undefined}
                  onDragLeave={isDraft ? (() => setDropTarget(cur => (cur === sem ? null : cur))) : undefined}
                  onDrop={isDraft ? (e => onDropToSemester(e, sem)) : undefined}
                  className={`rounded-xl border-2 p-3 space-y-2 transition-colors ${cardCls} ${isDropHere ? '!border-indigo-500 !bg-indigo-50 shadow-lg' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-emerald-950 text-xs">
                      {summer ? '☀️ تابستان' : `ترم ${faNum(sem)}`}
                      {overflow && <span className="mr-1 rounded bg-slate-200 px-1.5 py-0.5 text-[9px] text-slate-600">خارج چارت</span>}
                    </span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${over ? 'bg-rose-200 text-rose-900' : summer ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'}`}>
                      {faNum(units)} واحد
                    </span>
                  </div>
                  {over && <div className="text-[10px] font-bold text-rose-700">⚠️ بیش از سقف ترم!</div>}
                  {list.length === 0 && <div className="text-[10px] text-slate-400 font-bold py-2 text-center">{isDropHere ? '⬇ رها کنید' : '— بدون درس —'}</div>}
                  <div className="space-y-1.5 min-h-[28px]">
                    {list.map(c => (
                      <div
                        key={c.courseId}
                        draggable={isDraft}
                        onDragStart={e => onCourseDragStart(e, c.courseId)}
                        onDragEnd={onCourseDragEnd}
                        title={isDraft ? 'بکشید و در ترم موردنظر رها کنید' : c.title}
                        className={`flex items-center justify-between gap-1 bg-white rounded-lg px-2 py-1 border border-emerald-100 text-[11px] ${isDraft ? 'cursor-grab active:cursor-grabbing' : ''} ${dragCourseId === c.courseId ? 'opacity-40' : ''}`}
                      >
                        {isDraft && <span className="text-slate-300 shrink-0 select-none">⠿</span>}
                        <span className="font-mono text-indigo-900 text-[10px]">{c.code}</span>
                        <span className="truncate font-bold flex-1">{c.title}</span>
                        <span className="text-slate-400 text-[10px]">{faNum(c.units)}</span>
                        {isDraft && (
                          <button
                            onClick={() => handleAssignSemester(c.courseId, null)}
                            title="حذف از این ترم (نامشخص)"
                            className="text-rose-500 hover:text-rose-700 font-black px-1"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            onDragOver={isDraft ? (e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget('pool'); }) : undefined}
            onDragLeave={isDraft ? (() => setDropTarget(cur => (cur === 'pool' ? null : cur))) : undefined}
            onDrop={isDraft ? (e => onDropToSemester(e, null)) : undefined}
            className={`rounded-xl border-2 bg-slate-50 p-3 space-y-2 transition-colors ${isDraft && dropTarget === 'pool' ? '!border-indigo-500 !bg-indigo-50 shadow-lg' : 'border-slate-200'}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-black text-slate-800 text-xs">🌫️ دروس بدون ترم (نامشخص) — {faNum(unassignedCourses.length)} درس</span>
              <span className="text-[10px] text-slate-400 font-bold">{isDraft ? 'بکشید و روی ترم موردنظر رها کنید — یا از منوی هر درس ترم بدهید' : 'با انتخاب «ترم» از منوی هر درس، به ترمبندی اضافه میشود'}</span>
            </div>
            {unassignedCourses.length === 0 && <div className="text-[10px] text-slate-400 font-bold py-2 text-center">{isDraft && dropTarget === 'pool' ? '⬇ اینجا رها کنید تا از ترم خارج شود' : 'همهٔ دروس ترمبندی شدهاند. ✓'}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 min-h-[28px]">
              {unassignedCourses.map(c => (
                <div
                  key={c.courseId}
                  draggable={isDraft}
                  onDragStart={e => onCourseDragStart(e, c.courseId)}
                  onDragEnd={onCourseDragEnd}
                  title={isDraft ? 'بکشید و روی ترم موردنظر رها کنید' : c.title}
                  className={`flex items-center gap-2 bg-white rounded-lg px-2 py-1.5 border border-slate-200 text-[11px] ${isDraft ? 'cursor-grab active:cursor-grabbing' : ''} ${dragCourseId === c.courseId ? 'opacity-40' : ''}`}
                >
                  {isDraft && <span className="text-slate-300 shrink-0 select-none">⠿</span>}
                  <span className="font-mono text-indigo-900 text-[10px]">{c.code}</span>
                  <span className="truncate font-bold flex-1">{c.title}</span>
                  <span className="text-slate-400 text-[10px]">{faNum(c.units)} واحد</span>
                  {isDraft ? (
                    <select
                      value=""
                      onChange={e => e.target.value && handleAssignSemester(c.courseId, Number(e.target.value))}
                      className="border border-slate-300 rounded px-1 py-0.5 font-bold text-[10px] bg-white"
                    >
                      <option value="">ترم…</option>
                      {planTerms.map(s => <option key={s} value={s}>ترم {faNum(s)}</option>)}
                      <option value={SUMMER_SEMESTER}>تابستان</option>
                    </select>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-bold">نامشخص</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
