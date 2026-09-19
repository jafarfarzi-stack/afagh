'use client';

// بنر + فیلتر درختی دانشکده ← گروه ← رشته + دکمهٔ «نسخهٔ جدید»
import { useCurriculum } from '../curriculum-context';
import { faNum } from '../curriculum-core';
import { termCountForDegree } from '@/lib/term-plan';

export default function CurriculumHeader() {
  const {
    departments,
    deptFilter,
    faculties,
    facultyFilter,
    filteredMajors,
    majorVersions,
    majors,
    selectedMajorId,
    setDeptFilter,
    setDetail,
    setFacultyFilter,
    setModal,
    setSelectedMajorId,
    setSelectedVersionId,
    tracks,
  } = useCurriculum();

  return (
    <>
      {/* Header */}
      <div className="bg-gradient-to-l from-indigo-950 via-indigo-900 to-slate-900 text-white rounded-2xl p-5 shadow-lg border border-indigo-700/50">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-slate-950">ماژول برنامهٔ درسی</span>
              <span className="text-xs text-indigo-200">{faNum(majorVersions.length)} نسخه در {majors.find(m => m.id === selectedMajorId)?.name ?? '—'}</span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">📚 مدیریت نسخه‌های برنامهٔ درسی (چرخهٔ حیات مصوب)</h1>
          </div>
          <button
            onClick={() => setModal('NEW_VERSION')}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 text-slate-950 font-extrabold text-xs shadow-md transition"
          >
            ➕ نسخهٔ جدید
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="text-indigo-200 font-bold block mb-1">دانشکده:</label>
            <select
              value={facultyFilter}
              onChange={e => { setFacultyFilter(e.target.value); setDeptFilter(''); }}
              className="w-full bg-slate-900/90 text-white border border-indigo-400/50 rounded-lg px-2.5 py-2 font-bold"
            >
              <option value="">همه دانشکده‌ها</option>
              {faculties.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-indigo-200 font-bold block mb-1">گروه آموزشی:</label>
            <select
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
              className="w-full bg-slate-900/90 text-white border border-indigo-400/50 rounded-lg px-2.5 py-2 font-bold"
            >
              <option value="">همه گروه‌ها</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-indigo-200 font-bold block mb-1">رشته / مقطع {filteredMajors.length !== majors.length ? `(${faNum(filteredMajors.length)} از ${faNum(majors.length)})` : `(${faNum(majors.length)})`}:</label>
            <select
              value={selectedMajorId}
              onChange={e => { setSelectedMajorId(Number(e.target.value)); setSelectedVersionId(null); setDetail(null); }}
              className="w-full bg-slate-900/90 text-white border border-indigo-400/50 rounded-lg px-2.5 py-2 font-bold"
            >
              {filteredMajors.map(m => (
                <option key={m.id} value={m.id}>
                  {m.code} — {m.name} — {m.degreeTitle ?? '—'}{m.facultyName ? ` (${m.facultyName}${m.departmentName ? ` / ${m.departmentName}` : ''})` : ''}
                </option>
              ))}
              {filteredMajors.length === 0 && <option value={selectedMajorId}>— موردی با این فیلتر یافت نشد —</option>}
            </select>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            {(() => { const m = majors.find(x => x.id === selectedMajorId); if (!m) return null; return (
              <p className="text-[10px] text-indigo-300 font-bold leading-relaxed">
                کد {m.code} · {m.facultyName ?? '—'} · {m.departmentName ?? '—'} · {m.degreeTitle ?? '—'}
                {m.degreeIsGraduate === 1 ? ' (تکمیلی)' : ''} · چارت {faNum(termCountForDegree({ termCount: m.degreeTermCount, code: m.degreeCode, title: m.degreeTitle }))} ترمه
                {' '}· {faNum(m.minUnits ?? 0)} واحد الزامی
                {m.tracks && m.tracks.length > 0 ? ` · گرایش: ${m.tracks.join('، ')}` : ''}
              </p>
            ); })()}
          </div>
          <div className="sm:col-span-2 flex items-end">
            <p className="text-[11px] text-indigo-200 leading-relaxed bg-white/5 rounded-xl p-3 border border-white/10">
              هر تغییر پس از تأیید فقط با <b>نسخهٔ جدید (R1, R2,…)</b> انجام می‌شود؛ نسخهٔ تأییدشده هرگز درجا ویرایش نمی‌شود.
              وضعیت هر نسخه و «یافته‌های اعتبارسنجی» (CheckResult) مستقیماً از موتور واقعی خوانده می‌شود.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
