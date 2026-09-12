'use client';

// تب ۲: دروس کاتالوگ (نقش، الزامی، پیش‌نیاز، تأییدیه‌ها)
import { useCurriculum } from '../curriculum-context';
import { ROLE_LABELS, faDate, faNum, semLabel } from '../curriculum-core';
import { describeLogicNode } from '@/lib/curriculum-types';
import { SUMMER_SEMESTER } from '@/lib/term-plan';

export default function CoursesTab() {
  const {
    activeTab,
    busy,
    courseCodeOf,
    detail,
    handleAssignSemester,
    handleMarkGradReq,
    handleRemoveCourse,
    handleSyncRoles,
    handleUpdateGradReq,
    handleUpdateRequired,
    handleUpdateRole,
    isDraft,
    openRules,
    planTerms,
    roleTargets,
    ruleText,
    setModal,
    totalPlannedUnits,
    typeSummary,
  } = useCurriculum();

  return (
    <>
      {/* Courses — تب: دروس کاتالوگ */}
      {activeTab === 'COURSES' && detail && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-extrabold text-slate-900 text-sm">📖 دروس نسخه ({faNum(detail.courses.length)} درس)</h4>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setModal('NEW_COURSE')}
                className="px-3 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white font-extrabold text-[11px]"
              >
                ✨ تعریف درس جدید
              </button>
              {isDraft && (
                <>
                  <button
                    onClick={() => setModal('ADD_COURSE')}
                    className="px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-[11px]"
                  >
                    ➕ افزودن درس از بانک
                  </button>
                  {detail.courses.length > 0 && (
                    <button
                      onClick={handleSyncRoles}
                      disabled={busy}
                      title="نقش همهٔ دروس نسخه از روی ستون «نوع درس» بانک بازخوانی می‌شود (تغییرات دستی بازنویسی می‌شود)"
                      className="px-3 py-2 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-extrabold text-[11px] disabled:opacity-50"
                    >
                      🔄 همگام‌سازی نقش از بانک
                    </button>
                  )}
                  {detail.courses.length > 0 && (
                    <button
                      onClick={handleMarkGradReq}
                      disabled={busy}
                      title="همهٔ دروس الزامی (تیک «الزامی در ترم») و نقش‌های تخصصی/پایه به‌عنوان «شرط فارغ‌التحصیلی» علامت می‌خورند؛ مواردی که قبلاً علامت خورده‌اند دست‌نخورده می‌مانند"
                      className="px-3 py-2 rounded-lg bg-teal-100 hover:bg-teal-200 text-teal-900 font-extrabold text-[11px] disabled:opacity-50"
                    >
                      🎓 شرط فارغ‌التحصیلی برای دروس الزامی
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          {detail.courses.length === 0 && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs font-bold text-slate-500">
              هنوز درسی به این نسخه افزوده نشده است.
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white text-center">
                  <th className="p-2.5 border border-slate-800 w-10">ردیف</th>
                  <th className="p-2.5 border border-slate-800">کد</th>
                  <th className="p-2.5 border border-slate-800">عنوان درس</th>
                  <th className="p-2.5 border border-slate-800">واحد</th>
                  <th className="p-2.5 border border-slate-800">نقش</th>
                  <th className="p-2.5 border border-slate-800">ترم پیشنهادی</th>
                  <th className="p-2.5 border border-slate-800">الزامی در ترم</th>
                  <th className="p-2.5 border border-slate-800" title="درس‌هایی که گذراندن‌شان برای فارغ‌التحصیلی اجباری است؛ موتور تطبیق فارغ‌التحصیلی فقط همین‌ها را چک می‌کند">شرط فارغ‌التحصیلی</th>
                  <th className="p-2.5 border border-slate-800">پیش‌نیاز / هم‌نیاز</th>
                  <th className="p-2.5 border border-slate-800">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {detail.courses.map((c, idx) => (
                  <tr key={c.courseId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                    <td className="p-2 border border-slate-200 text-center text-slate-500 font-bold">{faNum(idx + 1)}</td>
                    <td className="p-2 border border-slate-200 font-mono text-center font-bold text-indigo-900">{c.code}</td>
                    <td className="p-2 border border-slate-200 font-extrabold text-right">{c.title}</td>
                    <td className="p-2 border border-slate-200 text-center font-black">{faNum(c.units)}</td>
                    <td className="p-2 border border-slate-200 text-center">
                      {isDraft ? (
                        <select
                          value={c.roleType}
                          onChange={e => handleUpdateRole(c.courseId, e.target.value)}
                          className="border border-slate-300 rounded px-1.5 py-1 font-bold bg-white"
                        >
                          {Object.entries(ROLE_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-bold">{ROLE_LABELS[c.roleType] ?? c.roleType}</span>
                      )}
                    </td>
                    <td className="p-2 border border-slate-200 text-center">
                      {isDraft ? (
                        <select
                          value={c.recommendedSemester ?? ''}
                          onChange={e => handleAssignSemester(c.courseId, e.target.value ? Number(e.target.value) : null)}
                          className="border border-slate-300 rounded px-1.5 py-1 font-bold bg-white"
                        >
                          <option value="">نامشخص</option>
                          {planTerms.map(s => <option key={s} value={s}>ترم {faNum(s)}</option>)}
                          <option value={SUMMER_SEMESTER}>تابستان</option>
                        </select>
                      ) : (
                        <span className="font-bold">{semLabel(c.recommendedSemester)}</span>
                      )}
                    </td>
                    <td className="p-2 border border-slate-200 text-center">
                      <input
                        type="checkbox"
                        checked={c.isRequired === 1}
                        disabled={!isDraft}
                        onChange={e => handleUpdateRequired(c.courseId, e.target.checked ? 1 : 0)}
                        className="accent-indigo-700 w-4 h-4"
                      />
                    </td>
                    <td className="p-2 border border-slate-200 text-center">
                      <input
                        type="checkbox"
                        checked={c.isGraduationRequired === 1}
                        disabled={!isDraft}
                        onChange={e => handleUpdateGradReq(c.courseId, e.target.checked ? 1 : 0)}
                        className="accent-indigo-700 w-4 h-4"
                      />
                    </td>
                    <td className="p-2 border border-slate-200 text-center">
                      <div className="text-[10px] font-bold text-slate-600 leading-relaxed max-w-44">
                        {(() => {
                          const pre = ruleText(c.courseId, 'PREREQ');
                          const co = ruleText(c.courseId, 'COREQ');
                          if (!pre && !co && c.minGrade == null) return <span className="text-slate-300">—</span>;
                          return (<>
                            {pre && <div className="truncate" title={pre}>پیش: {pre}</div>}
                            {co && <div className="truncate" title={co}>هم: {co}</div>}
                            {c.minGrade != null && <div className="text-indigo-700">کف: {faNum(c.minGrade)}</div>}
                          </>);
                        })()}
                      </div>
                      {isDraft && (
                        <button
                          onClick={() => openRules(c.courseId)}
                          className="mt-1 px-2 py-1 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-900 font-extrabold text-[10px]"
                        >
                          🔗 ویرایش
                        </button>
                      )}
                    </td>
                    <td className="p-2 border border-slate-200 text-center">
                      {isDraft && (
                        <button
                          onClick={() => handleRemoveCourse(c.courseId)}
                          className="px-2 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 font-extrabold text-[10px]"
                        >
                          حذف
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* جمع‌بندی نوع درس — معادل «نمایش اطلاعات نوع درس» مدل قدیم (جمع ۲) */}
          {detail.courses.length > 0 && (
            <div className="pt-3 border-t border-slate-200 space-y-2">
              <h5 className="font-extrabold text-slate-900 text-xs">📊 جمع‌بندی نوع درس (ثبت‌شده در این نسخه)</h5>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white text-center">
                      <th className="p-2.5 border border-slate-800">نوع درس</th>
                      <th className="p-2.5 border border-slate-800">تعداد درس (جمع ۲)</th>
                      <th className="p-2.5 border border-slate-800">مجموع واحد</th>
                      <th className="p-2.5 border border-slate-800" title="سهم واحد مقرر این نقش — در تب «بررسی و خاتمه» تنظیم می‌شود">سهم مقرر</th>
                    </tr>
                  </thead>
                  <tbody>
                    {typeSummary.map(r => {
                      const target = roleTargets[r.role];
                      const short = target != null && r.units < target;
                      return (
                        <tr key={r.role} className={`text-center ${short ? 'bg-amber-50' : ''}`}>
                          <td className="p-2 border border-slate-200 font-extrabold">{ROLE_LABELS[r.role] ?? r.role}</td>
                          <td className="p-2 border border-slate-200 font-black">{faNum(r.count)}</td>
                          <td className={`p-2 border border-slate-200 font-black ${short ? 'text-amber-700' : ''}`}>
                            {faNum(r.units)}{short && ` (کسری ${faNum(target - r.units)})`}
                          </td>
                          <td className="p-2 border border-slate-200 font-black text-slate-500">{target != null ? `${faNum(target)} واحد` : '—'}</td>
                        </tr>
                      );
                    })}
                    <tr className="text-center bg-indigo-50 font-black">
                      <td className="p-2 border border-indigo-200">جمع کل</td>
                      <td className="p-2 border border-indigo-200">{faNum(detail.courses.length)} درس</td>
                      <td className="p-2 border border-indigo-200">{faNum(totalPlannedUnits)} از {faNum(detail.version.totalRequiredUnits)} واحد الزامی</td>
                      <td className="p-2 border border-indigo-200">
                        {Object.keys(roleTargets).length > 0
                          ? `${faNum(Object.values(roleTargets).reduce((s, v) => s + v, 0))} واحد مقرر`
                          : 'تعیین‌نشده'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-slate-400 font-bold">حداقل تعداد هر نقش (COURSE_TYPES_COMPLETE) و سهم واحد هر نقش (ROLE_UNITS_COVERAGE) در تب «بررسی و خاتمه» کنترل می‌شود.</p>
            </div>
          )}

          {/* Rules */}
          {(detail.rules.length > 0) && (
            <div className="pt-3 border-t border-slate-200 space-y-2">
              <h5 className="font-extrabold text-slate-900 text-xs">🔗 قواعد پیش‌نیاز / هم‌نیاز / نمرهٔ قبولی (از course_rules — درخت منطقی)</h5>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {detail.rules.map((r, i) => (
                  <div key={i} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px]">
                    <span className="font-black text-indigo-900">{courseCodeOf.get(r.courseId) ?? r.courseId}</span>
                    <span className="text-slate-400 mx-1">·</span>
                    <span className="font-bold text-slate-600">
                      {r.ruleType === 'PREREQ' ? 'پیش‌نیاز' : r.ruleType === 'COREQ' ? 'هم‌نیاز' : r.ruleType === 'PASSING_GRADE' ? 'نمرهٔ قبولی' : r.ruleType}
                    </span>
                    <div className="text-slate-700 font-bold mt-1">{describeLogicNode(r.logicTree, code => courseCodeOf.get(Number(code)) ?? code) || '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Approvals */}
          {(detail.approvals.length > 0) && (
            <div className="pt-3 border-t border-slate-200 space-y-1.5">
              <h5 className="font-extrabold text-slate-900 text-xs">📜 تاریخچهٔ تأیید (append-only)</h5>
              {detail.approvals.map((a, i) => (
                <div key={a.id ?? i} className="flex items-center justify-between gap-2 bg-indigo-50/60 rounded-lg p-2 text-[11px]">
                  <span className="font-bold text-slate-700">
                    {a.fromStatus} ← {a.toStatus} <span className="text-slate-400">({a.approvalType})</span>
                  </span>
                  <span className="text-slate-500">{faDate(a.approvedAt)}{a.decisionNote ? ` — ${a.decisionNote}` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
