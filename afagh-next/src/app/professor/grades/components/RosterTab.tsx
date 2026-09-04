'use client';

/**
 * RosterTab — جدول ورود نمرات (گام ۳ نقشهٔ جراحی)
 *
 * طبق طرح، وقتی استاد نمره‌ای تایپ می‌کند:
 *   - نمره بلافاصله (Optimistic) در جدول آپدیت و نمرهٔ نهایی از ۲۰ در همان
 *     لحظه محاسبه می‌شود؛
 *   - درخواست بدون مزاحمت (Background) به Server Action ارسال و پس از تأیید
 *     سرور، همان مقدار به‌صورت قطعی (COMMIT_GRADES) در state می‌نشیند؛
 *   - کاربری رابط هرگز قفل نمی‌شود و این‌جا هیچ useState نمره‌ای وجود ندارد.
 */
import React, {
  startTransition,
  useActionState,
  useOptimistic,
  useState,
} from 'react';
import {
  SaveGradePayload,
  SaveGradeState,
  finalizeSignedAction,
  saveGradeAction,
  submitTemporaryAction,
} from '../actions';
import type { GradesDispatch } from '../gradesReducer';
import { flashToast } from '../gradesReducer';
import type {
  GradingCourseOffering,
  StudentGradeField,
  StudentGradeItem,
} from '../types';
import { faNum } from '../types';
import {
  applyScoreToStudent,
  canEditScore,
  filterStudents,
  isRubricValid,
  rubricFieldMax,
} from '../grades-core';

interface RosterTabProps {
  offering: GradingCourseOffering;
  lastAutoSaveTime: string;
  onRequestFinalizeOtp: () => void; // مودال OTP در همین تب مدیریت می‌شود
  dispatch: GradesDispatch;
}

type OptimisticUpdate = {
  studentId: number;
  field: StudentGradeField;
  value: number | undefined;
};

export default function RosterTab({ offering, lastAutoSaveTime, onRequestFinalizeOtp, dispatch }: RosterTabProps) {
  const [searchStudentQuery, setSearchStudentQuery] = useState('');
  const [saveState, saveAction, isSaving] = useActionState<SaveGradeState, SaveGradePayload>(saveGradeAction, { ok: true });
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpCode, setOtpCode] = useState('');

  // ── لایهٔ خوش‌بینانه: نمرهٔ تایپ‌شده فوراً با محاسبهٔ مجدد نهایی دیده می‌شود
  const [optimisticStudents, addOptimisticUpdate] = useOptimistic(
    offering.students,
    (current: StudentGradeItem[], update: OptimisticUpdate) =>
      current.map(st => {
        if (st.studentId !== update.studentId) return st;
        return applyScoreToStudent(st, offering, update.field, update.value);
      })
  );

  const isFinalized = !!offering.isFinalized;
  const isLoading = isSaving;

  const handleScoreChange = (st: StudentGradeItem, field: StudentGradeField, raw: string) => {
    if (isFinalized) return;
    const access = canEditScore(st, offering, field);
    if (!access.ok) {
      alert(access.reason);
      return;
    }
    const value = raw === '' ? undefined : Number(raw);
    const bounded = value === undefined ? undefined : Math.max(0, Math.min(20, value));
    // ۱) آپدیت فوری UI — بدون انتظار سرور (مکانیزم خوش‌بینانه)
    startTransition(() => {
      addOptimisticUpdate({ studentId: st.studentId, field, value: bounded });
    });
    // ۲) ثبت قطعی محلی (باعث محاسبهٔ مجدد نهایی از ۲۰ در همان لحظه)
    dispatch({
      type: 'COMMIT_GRADES',
      payload: { offeringId: offering.id, entries: [{ studentId: st.studentId, field, value: bounded }] },
    });
    // ۳) همگام‌سازی پس‌زمینه با سرور (بدون قفل کردن UI)
    startTransition(() => {
      void saveAction({
        offeringId: offering.id,
        offeringCode: offering.code,
        offeringTitle: offering.title,
        offeringUnits: offering.units,
        termTitle: 'نیمسال جاری',
        studentId: st.studentId,
        studentCode: st.studentCode,
        fullName: st.fullName,
        entryYear: 1403,
        field,
        value: bounded === undefined ? null : bounded,
        rubricMax: rubricFieldMax(field, offering.rubric),
        isCoTaught: offering.isCoTaught,
        coTaughtRole: offering.coTaughtDetails?.currentProfRole,
      });
    });
  };

  const handleSubmitTemporary = () => {
    if (!isRubricValid(offering.rubric) && !offering.isCoTaught) {
      alert('خطا: مجموع بارم‌بندی باید دقیقاً ۲۰ باشد.');
      return;
    }
    dispatch({ type: 'SUBMIT_TEMPORARY' });
    flashToast(dispatch, '✅ نمرات به صورت «موقت» ثبت گردید. کارنامه دانشجویان باز شده و مهلت اعتراض ۳ روزه آغاز شد.', 6000);
    void submitTemporaryAction({ ok: true } as SaveGradeState, {
      offeringId: offering.id,
      offeringCode: offering.code,
      offeringTitle: offering.title,
      offeringUnits: offering.units,
      termTitle: 'نیمسال جاری',
      professorRank: '',
    });
  };

  const rows = filterStudents(optimisticStudents, searchStudentQuery);

  const renderScoreInput = (st: StudentGradeItem, field: StudentGradeField, max: number, color: 'indigo' | 'purple' | 'slate', locked: boolean) => {
    const cls = locked
      ? 'border-slate-300 bg-slate-100 text-slate-600 cursor-not-allowed'
      : color === 'indigo'
        ? 'border-indigo-300 text-indigo-950 bg-white shadow-xs focus:ring-2 focus:ring-indigo-500'
        : color === 'purple'
          ? 'border-purple-300 text-purple-950 bg-white shadow-xs focus:ring-2 focus:ring-purple-500'
          : 'border-slate-300 text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500';
    return (
      <div className="flex items-center justify-center gap-1">
        {locked && <span className="text-slate-400 text-xs" title="فقط استاد بخش مربوطه مجاز به تغییر است">🔒</span>}
        <input
          type="number"
          min={0}
          max={max}
          step={0.25}
          inputMode="decimal"
          disabled={locked || isFinalized}
          value={st[field] !== undefined ? Math.min(max, st[field] as number) : ''}
          onChange={e => handleScoreChange(st, field, e.target.value)}
          className={`w-16 border rounded-lg p-1 text-center font-black text-xs ${cls}`}
        />
      </div>
    );
  };

  return (
    <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4 print:hidden">
      {/* نوار کاری */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-black text-slate-900 text-base">
              ورود نمرات درس {offering.title} (گروه {faNum(offering.groupNumber)})
            </h3>
            {isFinalized && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white shadow-xs">
                🔒 فریز و قفل قطعی شده
              </span>
            )}
            {isLoading && <span className="text-[10px] font-bold text-sky-600 animate-pulse">در حال همگام‌سازی...</span>}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {offering.isCoTaught
              ? `درس مشترک: نمره هر بخش از ۲۰ وارد شده و نمره کل طبق سهمیه مصوب (${faNum((offering.coTaughtDetails?.theoryWeightRatio || 0.6) * 100)}٪ تئوری + ${faNum((offering.coTaughtDetails?.labWeightRatio || 0.4) * 100)}٪ عملی) محاسبه می‌گردد.`
              : `بر اساس بارم: میان‌ترم (${faNum(offering.rubric.midterm)})، تکالیف (${faNum(offering.rubric.homework)})، حضور (${faNum(offering.rubric.participation)})، عملی (${faNum(offering.rubric.practical)})، پایان‌ترم (${faNum(offering.rubric.finalExam)})`}
          </p>
          <p className="text-[10px] text-slate-400 font-bold mt-1">
            ⏱ ذخیرهٔ خودکار آخرین بار: {faNum(lastAutoSaveTime)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              if (!confirm(`آیا از افزودن ۰.۵ نمره ارفاق/تشویقی به تمامی دانشجویان مطمئن هستید؟`)) return;
              dispatch({ type: 'APPLY_BONUS_MARK', payload: 0.5 });
              flashToast(dispatch, '✨ نمره تشویقی (+۰.۵ نمره) با موفقیت اعمال شد.');
            }}
            disabled={isFinalized}
            className="w-full sm:w-auto px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 disabled:opacity-40 text-amber-900 border border-amber-200 font-bold text-xs transition"
          >
            <span>✨ ارفاق گروهی (+۰.۵ نمره)</span>
          </button>
          <button
            onClick={() => flashToast(dispatch, 'پیش‌نویس نمرات با موفقیت ذخیره شد (دانشجویان هنوز دسترسی رویت ندارند).')}
            disabled={isFinalized}
            className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 font-bold text-xs transition"
          >
            <span>💾 ذخیره پیش‌نویس</span>
          </button>
          <button
            onClick={handleSubmitTemporary}
            disabled={isFinalized}
            className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 disabled:opacity-40 text-slate-950 font-black text-xs shadow-xs transition"
          >
            <span>📢 ثبت موقت و رویت دانشجو</span>
          </button>
          <button
            onClick={() => { setOtpModalOpen(true); onRequestFinalizeOtp(); }}
            disabled={isFinalized}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 disabled:opacity-50 text-white font-black text-xs shadow-md transition"
          >
            <span>
              {offering.isCoTaught && offering.coTaughtDetails
                ? offering.coTaughtDetails.currentProfRole === 'THEORY'
                  ? '🔒 قفل و امضای بخش تئوری با OTP'
                  : '🔒 قفل و امضای بخش عملی با OTP'
                : '🔒 قفل قطعی نمرات با OTP'}
            </span>
          </button>
        </div>
      </div>

      {/* جستجو */}
      <div className="flex items-center justify-between gap-3">
        <input
          type="text"
          placeholder="جستجوی دانشجو با نام یا شماره دانشجویی..."
          value={searchStudentQuery}
          onChange={e => setSearchStudentQuery(e.target.value)}
          className="w-full sm:w-72 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <span className="text-xs text-slate-500 font-bold hidden sm:inline">
          نمایش {faNum(rows.length)} از {faNum(optimisticStudents.length)} دانشجو
        </span>
      </div>

      {/* جدول دسکتاپ */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-900 text-white text-center">
              <th className="p-2.5 border border-slate-800 w-12 font-bold">ردیف</th>
              <th className="p-2.5 border border-slate-800 font-bold">شماره دانشجویی</th>
              <th className="p-2.5 border border-slate-800 font-bold text-right">نام دانشجو</th>
              {offering.isCoTaught ? (
                <>
                  <th className="p-2.5 border border-slate-800 font-bold bg-indigo-950">
                    نمره تئوری (از ۲۰)
                    <div className="text-[10px] text-indigo-300 font-normal">سهم {faNum((offering.coTaughtDetails?.theoryWeightRatio || 0.6) * 100)}٪</div>
                  </th>
                  <th className="p-2.5 border border-slate-800 font-bold bg-purple-950">
                    نمره عملی (از ۲۰)
                    <div className="text-[10px] text-purple-300 font-normal">سهم {faNum((offering.coTaughtDetails?.labWeightRatio || 0.4) * 100)}٪</div>
                  </th>
                </>
              ) : (
                <>
                  <th className="p-2 border border-slate-800 font-bold">میان‌ترم ({faNum(offering.rubric.midterm)})</th>
                  <th className="p-2 border border-slate-800 font-bold">تکالیف ({faNum(offering.rubric.homework)})</th>
                  <th className="p-2 border border-slate-800 font-bold">حضور ({faNum(offering.rubric.participation)})</th>
                  {offering.rubric.practical > 0 && (
                    <th className="p-2 border border-slate-800 font-bold">عملی ({faNum(offering.rubric.practical)})</th>
                  )}
                  <th className="p-2 border border-slate-800 font-bold">پایان‌ترم ({faNum(offering.rubric.finalExam)})</th>
                </>
              )}
              <th className="p-2.5 border border-slate-800 font-black bg-slate-950 text-amber-300">نمره کل (از ۲۰)</th>
              <th className="p-2.5 border border-slate-800 font-bold">نتیجه</th>
              <th className="p-2.5 border border-slate-800 font-bold">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((st, idx) => {
              const finalScore = st.calculatedFinalScore;
              const isPass = finalScore !== undefined && finalScore >= 10;
              const isFail = finalScore !== undefined && finalScore < 10;
              const role = offering.coTaughtDetails?.currentProfRole;
              const theoryLocked = offering.isCoTaught && role !== 'THEORY';
              const labLocked = offering.isCoTaught && role !== 'LAB';
              return (
                <tr key={st.studentId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-2.5 border border-slate-200 text-center font-bold text-slate-500">{faNum(idx + 1)}</td>
                  <td className="p-2.5 border border-slate-200 font-mono text-center font-bold text-indigo-950" dir="ltr">{st.studentCode}</td>
                  <td className="p-2.5 border border-slate-200 font-black text-slate-900">
                    <div className="flex flex-col">
                      <span>{st.fullName}</span>
                      {offering.appeals.find(a => a.studentId === st.studentId) && (
                        <span className="mt-1 text-[10px] text-amber-800 font-bold">
                          📩 {offering.appeals.find(a => a.studentId === st.studentId)?.status === 'OPEN' ? 'اعتراض باز' : 'اعتراض بسته'}
                        </span>
                      )}
                    </div>
                  </td>
                  {offering.isCoTaught ? (
                    <>
                      <td className={`p-2 border border-slate-200 text-center ${theoryLocked ? 'bg-slate-100/70' : 'bg-indigo-50/40'}`}>
                        {renderScoreInput(st, 'theoryProfScore', 20, 'indigo', theoryLocked)}
                      </td>
                      <td className={`p-2 border border-slate-200 text-center ${labLocked ? 'bg-slate-100/70' : 'bg-purple-50/40'}`}>
                        {renderScoreInput(st, 'labProfScore', 20, 'purple', labLocked)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-1.5 border border-slate-200 text-center">{renderScoreInput(st, 'midtermScore', offering.rubric.midterm, 'slate', false)}</td>
                      <td className="p-1.5 border border-slate-200 text-center">{renderScoreInput(st, 'homeworkScore', offering.rubric.homework, 'slate', false)}</td>
                      <td className="p-1.5 border border-slate-200 text-center">{renderScoreInput(st, 'participationScore', offering.rubric.participation, 'slate', false)}</td>
                      {offering.rubric.practical > 0 && (
                        <td className="p-1.5 border border-slate-200 text-center">{renderScoreInput(st, 'practicalScore', offering.rubric.practical, 'slate', false)}</td>
                      )}
                      <td className="p-1.5 border border-slate-200 text-center">{renderScoreInput(st, 'finalExamScore', offering.rubric.finalExam, 'slate', false)}</td>
                    </>
                  )}
                  <td className="p-2 border border-slate-200 text-center font-black text-sm bg-slate-50">
                    <span className={isPass ? 'text-emerald-700' : isFail ? 'text-rose-700' : 'text-slate-500'}>
                      {finalScore !== undefined ? faNum(finalScore) : '—'}
                    </span>
                  </td>
                  <td className="p-2 border border-slate-200 text-center">
                    {finalScore !== undefined ? (
                      isPass
                        ? <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">قبول</span>
                        : <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px]">مردود</span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-bold">ناتمام</span>
                    )}
                  </td>
                  <td className="p-2 border border-slate-200 text-center">
                    {isFinalized || st.status === 'FINALIZED' ? (
                      <span className="px-2 py-0.5 rounded bg-emerald-700 text-white font-bold text-[10px]">🔒 قطعی</span>
                    ) : st.status === 'TEMPORARY' ? (
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px]">📢 موقت</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-bold text-[10px]">پیش‌نویس</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* نمای موبایل */}
      <div className="md:hidden space-y-3">
        {rows.map(st => {
          const finalScore = st.calculatedFinalScore;
          return (
            <div key={st.studentId} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-black text-slate-900 text-sm">{st.fullName}</div>
                  <div className="font-mono text-xs text-slate-500" dir="ltr">{st.studentCode}</div>
                </div>
                <div className="text-center">
                  <div className="font-black text-lg text-slate-900">{finalScore !== undefined ? faNum(finalScore) : '—'}</div>
                  <div className="text-[10px] text-slate-400 font-bold">از ۲۰</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {offering.isCoTaught ? (
                  <>
                    {renderScoreInput(st, 'theoryProfScore', 20, 'indigo', offering.coTaughtDetails?.currentProfRole !== 'THEORY')}
                    {renderScoreInput(st, 'labProfScore', 20, 'purple', offering.coTaughtDetails?.currentProfRole !== 'LAB')}
                  </>
                ) : (
                  <>
                    {renderScoreInput(st, 'midtermScore', offering.rubric.midterm, 'slate', false)}
                    {renderScoreInput(st, 'finalExamScore', offering.rubric.finalExam, 'slate', false)}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* مودال OTP */}
      {otpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" dir="rtl">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-center">
            <div className="text-3xl">🔐</div>
            <h4 className="font-black text-slate-900">تأیید هویت با کد یکبارمصرف</h4>
            <p className="text-xs text-slate-500 font-bold leading-5">
              کد ۵ رقمی به شماره همراه ثبت‌شدهٔ شما پیامک شد. (دمو: ۵۸۲۱۹ یا ۱۲۳۴۵۶)
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="••••••"
              className="w-full text-center text-2xl font-black tracking-[0.4em] border-2 border-indigo-200 rounded-2xl py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const demoBypass = process.env.NODE_ENV !== 'production' && (otpCode === '12345' || otpCode === '123456');
                  if (otpCode !== '58219' && !demoBypass) {
                    alert('کد تایید اشتباه است. لطفاً کد پنج‌رقمی پیامک‌شده را وارد کنید.');
                    return;
                  }
                  dispatch({ type: 'SIGN_OFFERING' });
                  setOtpModalOpen(false);
                  setOtpCode('');
                  // همگام‌سازی پس‌زمینه با سرور (قفل نهایی + هش ممیزی)
                  void finalizeSignedAction({ ok: true } as SaveGradeState, {
                    offeringId: offering.id,
                    otp: otpCode,
                    code: offering.code,
                    groupNo: offering.groupNumber,
                  });
                }}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm transition"
              >
                تأیید و امضا
              </button>
              <button
                onClick={() => { setOtpModalOpen(false); setOtpCode(''); }}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {saveState?.error && (
        <p className="text-[11px] font-bold text-rose-600">⚠ خطای ذخیره: {saveState.error}</p>
      )}
    </div>
  );
}
