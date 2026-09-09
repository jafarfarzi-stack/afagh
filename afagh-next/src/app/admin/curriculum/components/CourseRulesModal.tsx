'use client';

// مودال: پیش‌نیاز/هم‌نیاز و کف نمرهٔ یک درس
import { useCurriculum } from '../curriculum-context';
import { faNum, leafCourseCodesOf, leafTotalOf } from '../curriculum-core';

export default function CourseRulesModal() {
  const {
    busy,
    detail,
    handleSaveRules,
    modal,
    ruleCourse,
    ruleForm,
    setModal,
    setRuleCourseId,
    setRuleForm,
    toggleRuleCode,
  } = useCurriculum();

  return (
    <>
{/* ── Modal: Rules (پیش‌نیاز / هم‌نیاز درس) ── */}
      {modal === 'RULES' && ruleCourse && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-5 space-y-3">
            <h3 className="font-extrabold text-slate-900 text-sm">🔗 پیش‌نیاز / هم‌نیاز — {ruleCourse.code} · {ruleCourse.title}</h3>
            <p className="text-[11px] text-slate-500 font-bold leading-relaxed">
              فقط از دروس همین نسخه می‌توان انتخاب کرد (کد نامعتبر و خودارجاعی ممکن نیست). خالی گذاشتن یک گروه + «ثبت» = حذف آن قاعده. نتیجه بلافاصله در تب «بررسی و خاتمه» اعتبارسنجی می‌شود (تشخیص دور و مغایرت ترمی).
            </p>
            {(() => {
              const trees = (detail?.rules ?? []).filter(r => r.courseId === ruleCourse.courseId && (r.ruleType === 'PREREQ' || r.ruleType === 'COREQ'));
              const complex = trees.some(t => leafTotalOf(t.logicTree) !== leafCourseCodesOf(t.logicTree).length);
              if (!complex) return null;
              return <p className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">⚠️ قاعدهٔ فعلی این درس شرط ترکیبی/واحدی دارد؛ با «ثبت»، کل درخت با انتخاب‌های زیر جایگزین می‌شود.</p>;
            })()}
            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-black text-xs text-slate-800">پیش‌نیازها (باید قبلاً گذرانده شود)</span>
                <select value={ruleForm.preOp} onChange={e => setRuleForm({ ...ruleForm, preOp: e.target.value === 'OR' ? 'OR' : 'AND' })}
                  className="border border-slate-300 rounded-lg px-2 py-1 font-bold text-[11px] bg-white">
                  <option value="AND">همه (AND)</option>
                  <option value="OR">یکی (OR)</option>
                </select>
              </div>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {(detail?.courses ?? []).filter(c => c.courseId !== ruleCourse.courseId).map(c => (
                  <label key={c.courseId} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-indigo-50 cursor-pointer text-[11px] font-bold">
                    <input type="checkbox" className="accent-indigo-700 w-3.5 h-3.5 shrink-0"
                      checked={ruleForm.pre.includes(c.code)} onChange={() => toggleRuleCode('pre', c.code)} />
                    <span className="font-mono text-indigo-900 shrink-0">{c.code}</span>
                    <span className="truncate">{c.title}</span>
                  </label>
                ))}
              </div>
              {ruleForm.pre.length > 0 && <p className="text-[10px] font-black text-indigo-700">{faNum(ruleForm.pre.length)} درس به‌عنوان پیش‌نیاز انتخاب شد.</p>}
            </div>
            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-black text-xs text-slate-800">هم‌نیازها (باید هم‌زمان اخذ شود)</span>
                <select value={ruleForm.coOp} onChange={e => setRuleForm({ ...ruleForm, coOp: e.target.value === 'OR' ? 'OR' : 'AND' })}
                  className="border border-slate-300 rounded-lg px-2 py-1 font-bold text-[11px] bg-white">
                  <option value="AND">همه (AND)</option>
                  <option value="OR">یکی (OR)</option>
                </select>
              </div>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {(detail?.courses ?? []).filter(c => c.courseId !== ruleCourse.courseId).map(c => (
                  <label key={c.courseId} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-indigo-50 cursor-pointer text-[11px] font-bold">
                    <input type="checkbox" className="accent-indigo-700 w-3.5 h-3.5 shrink-0"
                      checked={ruleForm.co.includes(c.code)} onChange={() => toggleRuleCode('co', c.code)} />
                    <span className="font-mono text-indigo-900 shrink-0">{c.code}</span>
                    <span className="truncate">{c.title}</span>
                  </label>
                ))}
              </div>
              {ruleForm.co.length > 0 && <p className="text-[10px] font-black text-indigo-700">{faNum(ruleForm.co.length)} درس به‌عنوان هم‌نیاز انتخاب شد.</p>}
            </div>
            <div className="rounded-xl border border-slate-200 p-3 space-y-1.5">
              <label className="block font-bold text-xs text-slate-800">
                کف نمره قبولی این درس در این نسخه (۰ تا ۲۰) — خالی = بدون کف خاص:
                <input type="number" min={0} max={20} step="0.5" value={ruleForm.minGrade}
                  onChange={e => setRuleForm({ ...ruleForm, minGrade: e.target.value })}
                  placeholder="مثلاً ۱۲" dir="ltr"
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2 font-bold" />
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => { setModal(null); setRuleCourseId(null); }} className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs">انصراف</button>
              <button onClick={handleSaveRules} disabled={busy} className="px-5 py-1.5 rounded-lg bg-indigo-700 text-white font-extrabold text-xs disabled:opacity-50">
                ثبت قواعد
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
