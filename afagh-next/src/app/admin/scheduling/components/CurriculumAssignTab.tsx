'use client';

// گام ۱: چارت دروس و انتساب اساتید
import { usePlanning } from '../PlanningProvider';
import { ProfessorSelect } from './ProfessorSelect';
import { faNum, DEMAND_PAGE, NO_PROFESSOR } from '../planning-core';

export default function CurriculumAssignTab() {
  const {
    currentProgram,
    displayedDemands,
    filteredDemands,
    handleAssignCoProfessor,
    handleAssignProfessorToCourse,
    handleAssignProfessorToGroup,
    handleToggleCoTeaching,
    handleToggleDemandExamMode,
    handleUpdateCoWeights,
    handleUpdateCourseGroupsCount,
    handleUpdateDemandExamDate,
    profAssignedUnitsMap,
    professors,
    setActiveMainTab,
    setDemandLimit,
  } = usePlanning();

  return (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">📚</span>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    چارت درسی رشته «{currentProgram?.title ?? '—'}» و انتساب اساتید به دروس
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
                    const assignedProf = professors.find(p => p.id === demand.preferredProfId) || professors[0] || NO_PROFESSOR;
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
                                  <ProfessorSelect
                                    professors={professors}
                                    value={demand.preferredProfId}
                                    onChange={id => handleAssignProfessorToCourse(demand.id, id)}
                                    label={p => `${p.name} (${p.academicRank} — ${p.contractType})`}
                                    className="w-full border-2 border-indigo-400/80 rounded-lg px-2 py-1 font-extrabold bg-indigo-50/50 text-indigo-950 focus:ring-2 focus:ring-indigo-500"
                                  />
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
                                      <ProfessorSelect
                                        professors={professors}
                                        value={curProfId}
                                        onChange={id => handleAssignProfessorToGroup(demand.id, gNo, id)}
                                        className="w-full border border-indigo-300 rounded px-1.5 py-0.5 font-bold bg-white text-indigo-950 text-xs"
                                      />
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
                                <ProfessorSelect
                                  professors={professors}
                                  value={demand.preferredProfId}
                                  onChange={id => handleAssignProfessorToCourse(demand.id, id)}
                                  className="w-full border border-indigo-300 rounded px-2 py-1 font-extrabold bg-white text-indigo-950 text-xs"
                                />
                              </div>

                              {/* Lab / Practical Professor */}
                              <div className="space-y-0.5">
                                <div className="flex items-center justify-between text-[10px] font-bold text-slate-700">
                                  <span>🔬 استاد بخش عملی:</span>
                                  <span className="text-purple-900">سهم: {faNum((demand.labWeightRatio || 0.3) * 100)}٪ ({faNum((demand.labWeightRatio || 0.3) * 20)} نمره)</span>
                                </div>
                                <ProfessorSelect
                                  professors={professors}
                                  value={demand.coProfId || professors[2]?.id || professors[0]?.id || 0}
                                  onChange={id => handleAssignCoProfessor(demand.id, id)}
                                  className="w-full border border-purple-300 rounded px-2 py-1 font-extrabold bg-white text-purple-950 text-xs"
                                />
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
              {displayedDemands.length < filteredDemands.length && (
                <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs">
                  <span className="font-bold text-slate-600">
                    نمایش {faNum(displayedDemands.length)} ردیف از {faNum(filteredDemands.length)} ردیف
                  </span>
                  <button
                    type="button"
                    onClick={() => setDemandLimit(n => n + DEMAND_PAGE)}
                    className="rounded-lg bg-indigo-900 px-4 py-2 font-black text-white transition hover:bg-indigo-950"
                  >
                    نمایش {faNum(Math.min(DEMAND_PAGE, filteredDemands.length - displayedDemands.length))} ردیف بعدی
                  </button>
                </div>
              )}
            </div>
          </div>
  );
}
