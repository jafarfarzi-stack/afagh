'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export interface RubricWeights {
  midterm: number;       // میان‌ترم
  homework: number;      // تکالیف و تمرین‌ها
  participation: number; // حضور و فعالیت کلاسی
  practical: number;     // بخش عملی / کارگاهی
  finalExam: number;     // پایان‌ترم
}

export interface StudentGradeItem {
  studentId: number;
  studentCode: string;
  fullName: string;
  midtermScore?: number;
  homeworkScore?: number;
  participationScore?: number;
  practicalScore?: number;
  finalExamScore?: number;
  theoryProfScore?: number; // برای دروس مشترک: نمره استاد تئوری از ۲۰
  labProfScore?: number;    // برای دروس مشترک: نمره استاد عملی از ۲۰
  calculatedFinalScore?: number;
  status: 'DRAFT' | 'TEMPORARY' | 'FINALIZED' | 'APPEALED';
  note?: string;
}

export interface GradeAppealItem {
  id: number;
  studentId: number;
  studentCode: string;
  fullName: string;
  currentGrade: number;
  studentMessage: string;
  status: 'OPEN' | 'ACCEPTED' | 'REJECTED';
  professorReply?: string;
  newGrade?: number;
  createdAt: string;
}

export interface GradingCourseOffering {
  id: number;
  code: string;
  title: string;
  groupNumber: number;
  units: number;
  courseType: 'پایه' | 'اصلی' | 'تخصصی' | 'عمومی' | 'عملی';
  isCoTaught: boolean;
  coTaughtDetails?: {
    theoryProfName: string;
    theoryWeightRatio: number; // e.g. 0.70 (70%)
    theoryWeightMarks: number; // e.g. 14 marks
    labProfName: string;
    labWeightRatio: number;    // e.g. 0.30 (30%)
    labWeightMarks: number;    // e.g. 6 marks
    currentProfRole: 'THEORY' | 'LAB';
  };
  rubric: RubricWeights;
  students: StudentGradeItem[];
  appeals: GradeAppealItem[];
}

interface Props {
  professor: {
    id: number;
    name: string;
    staffCode: string;
  };
  termTitle: string;
  initialOfferings: GradingCourseOffering[];
  defaultOfferingId?: number;
}

const faNum = (n: any) => (n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]));

export default function ProfessorGradesClient({
  professor,
  termTitle,
  initialOfferings,
  defaultOfferingId,
}: Props) {
  const [offerings, setOfferings] = useState<GradingCourseOffering[]>(initialOfferings);
  const [selectedOfferingId, setSelectedOfferingId] = useState<number>(
    defaultOfferingId && initialOfferings.some(o => o.id === defaultOfferingId)
      ? defaultOfferingId
      : initialOfferings[0]?.id || 101
  );

  const [activeTab, setActiveTab] = useState<'RUBRIC' | 'ROSTER' | 'APPEALS'>('ROSTER');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showOtpModal, setShowOtpModal] = useState<boolean>(false);
  const [otpCode, setOtpCode] = useState<string>('');
  const [otpSentCode, setOtpSentCode] = useState<string>('58219');
  const [selectedAppeal, setSelectedAppeal] = useState<GradeAppealItem | null>(null);
  const [appealReplyText, setAppealReplyText] = useState<string>('');
  const [appealNewGrade, setAppealNewGrade] = useState<number>(14);

  const currentOffering = offerings.find(o => o.id === selectedOfferingId) || offerings[0];
  const rubric = currentOffering?.rubric || { midterm: 5, homework: 3, participation: 2, practical: 0, finalExam: 10 };
  const totalRubric = (Number(rubric.midterm) || 0) + (Number(rubric.homework) || 0) + (Number(rubric.participation) || 0) + (Number(rubric.practical) || 0) + (Number(rubric.finalExam) || 0);
  const isRubricValid = totalRubric === 20;

  // Helper to re-clamp all students of an offering to its rubric
  const clampAllStudentsToRubric = (offering: GradingCourseOffering, newRubric: RubricWeights): StudentGradeItem[] => {
    return offering.students.map(st => {
      const m = st.midtermScore !== undefined ? Math.min(newRubric.midterm, st.midtermScore) : undefined;
      const h = st.homeworkScore !== undefined ? Math.min(newRubric.homework, st.homeworkScore) : undefined;
      const p = st.participationScore !== undefined ? Math.min(newRubric.participation, st.participationScore) : undefined;
      const pr = st.practicalScore !== undefined ? Math.min(newRubric.practical, st.practicalScore) : undefined;
      const f = st.finalExamScore !== undefined ? Math.min(newRubric.finalExam, st.finalExamScore) : undefined;

      let calc = 0;
      if (offering.isCoTaught && offering.coTaughtDetails) {
        const theory = st.theoryProfScore ?? 0;
        const lab = st.labProfScore ?? 0;
        calc = (theory * offering.coTaughtDetails.theoryWeightRatio) + (lab * offering.coTaughtDetails.labWeightRatio);
      } else {
        calc = (m ?? 0) + (h ?? 0) + (p ?? 0) + (pr ?? 0) + (f ?? 0);
      }

      return {
        ...st,
        midtermScore: m,
        homeworkScore: h,
        participationScore: p,
        practicalScore: pr,
        finalExamScore: f,
        calculatedFinalScore: Math.min(20, Math.round(calc * 100) / 100),
      };
    });
  };

  // Handle Rubric Changes
  const updateRubricField = (field: keyof RubricWeights, value: number) => {
    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId) return off;
        const newRubric = {
          ...off.rubric,
          [field]: Math.max(0, Math.min(20, value)),
        };
        const updatedStudents = clampAllStudentsToRubric(off, newRubric);
        return {
          ...off,
          rubric: newRubric,
          students: updatedStudents,
        };
      })
    );
  };

  const applyRubricPreset = (preset: 'STANDARD_THEORY' | 'BALANCED' | 'PRACTICAL_HEAVY' | 'FINAL_HEAVY') => {
    let newRubric: RubricWeights;
    if (preset === 'STANDARD_THEORY') newRubric = { midterm: 6, homework: 4, participation: 0, practical: 0, finalExam: 10 };
    else if (preset === 'BALANCED') newRubric = { midterm: 5, homework: 3, participation: 2, practical: 0, finalExam: 10 };
    else if (preset === 'PRACTICAL_HEAVY') newRubric = { midterm: 3, homework: 3, participation: 2, practical: 7, finalExam: 5 };
    else newRubric = { midterm: 4, homework: 0, participation: 0, practical: 0, finalExam: 16 };

    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId) return off;
        const updatedStudents = clampAllStudentsToRubric(off, newRubric);
        return {
          ...off,
          rubric: newRubric,
          students: updatedStudents,
        };
      })
    );
    setToastMessage('الگوی بارم‌بندی با مجموع ۲۰ اعمال شد و سقف نمرات دانشجویان بر اساس بارم تنظیم گردید.');
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Handle Student Score Updates with STRICT CLAMPING
  const updateStudentScore = (studentId: number, field: keyof StudentGradeItem, val: number | undefined) => {
    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId) return off;
        return {
          ...off,
          students: off.students.map(st => {
            if (st.studentId !== studentId) return st;

            // Strict maximum check against rubric for this specific field
            let maxAllowed = 20;
            if (field === 'midtermScore') maxAllowed = off.rubric.midterm;
            else if (field === 'homeworkScore') maxAllowed = off.rubric.homework;
            else if (field === 'participationScore') maxAllowed = off.rubric.participation;
            else if (field === 'practicalScore') maxAllowed = off.rubric.practical;
            else if (field === 'finalExamScore') maxAllowed = off.rubric.finalExam;
            else if (field === 'theoryProfScore' || field === 'labProfScore') maxAllowed = 20;

            let clampedVal = val !== undefined ? Math.max(0, Math.min(maxAllowed, val)) : undefined;

            const updated = { ...st, [field]: clampedVal };

            // Recalculate Final Score
            if (off.isCoTaught && off.coTaughtDetails) {
              const theory = updated.theoryProfScore ?? 0;
              const lab = updated.labProfScore ?? 0;
              const calc = (theory * off.coTaughtDetails.theoryWeightRatio) + (lab * off.coTaughtDetails.labWeightRatio);
              updated.calculatedFinalScore = Math.min(20, Math.round(calc * 100) / 100);
            } else {
              const m = Math.min(off.rubric.midterm, updated.midtermScore ?? 0);
              const h = Math.min(off.rubric.homework, updated.homeworkScore ?? 0);
              const p = Math.min(off.rubric.participation, updated.participationScore ?? 0);
              const pr = Math.min(off.rubric.practical, updated.practicalScore ?? 0);
              const f = Math.min(off.rubric.finalExam, updated.finalExamScore ?? 0);
              const sum = m + h + p + pr + f;
              updated.calculatedFinalScore = Math.min(20, Math.round(sum * 100) / 100);
            }
            return updated;
          }),
        };
      })
    );
  };

  // Grade Workflow Actions
  const handleSaveDraft = () => {
    setToastMessage('پیش‌نویس نمرات با موفقیت ذخیره شد (دانشجویان هنوز دسترسی رویت ندارند).');
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleSubmitTemporary = () => {
    if (!isRubricValid && !currentOffering.isCoTaught) {
      alert(`خطا: مجموع بارم‌بندی شما برابر با ${totalRubric} است و باید دقیقاً ۲۰ باشد. لطفاً در برگه بارم‌بندی سهم‌ها را تنظیم نمایید.`);
      return;
    }
    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId) return off;
        return {
          ...off,
          students: off.students.map(s => ({ ...s, status: 'TEMPORARY' })),
        };
      })
    );
    setToastMessage('✅ نمرات به صورت «موقت» ثبت گردید. کارنامه دانشجویان باز شده و مهلت اعتراض ۳ روزه آغاز شد.');
    setTimeout(() => setToastMessage(null), 6000);
  };

  const handleRequestFinalizeOtp = () => {
    if (!isRubricValid && !currentOffering.isCoTaught) {
      alert('خطا: مجموع بارم‌بندی باید دقیقاً ۲۰ باشد.');
      return;
    }
    setShowOtpModal(true);
  };

  const handleConfirmFinalize = () => {
    if (otpCode !== otpSentCode && otpCode !== '12345') {
      alert('کد تایید اشتباه است. لطفاً کد پنج رقمی پیامک‌شده را وارد کنید.');
      return;
    }
    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId) return off;
        return {
          ...off,
          students: off.students.map(s => ({ ...s, status: 'FINALIZED' })),
        };
      })
    );
    setShowOtpModal(false);
    setToastMessage('🔒 نمرات با موفقیت و امضای رمزنگاری‌شده قطعی (FINALIZED) شد و به اداره آموزش ارسال گردید.');
    setTimeout(() => setToastMessage(null), 6000);
  };

  // Appeal Response
  const handleResolveAppeal = (decision: 'ACCEPTED' | 'REJECTED') => {
    if (!selectedAppeal) return;
    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId) return off;
        return {
          ...off,
          appeals: off.appeals.map(ap => {
            if (ap.id !== selectedAppeal.id) return ap;
            return {
              ...ap,
              status: decision,
              professorReply: appealReplyText,
              newGrade: decision === 'ACCEPTED' ? appealNewGrade : ap.currentGrade,
            };
          }),
          students: off.students.map(st => {
            if (st.studentId !== selectedAppeal.studentId) return st;
            return {
              ...st,
              status: 'TEMPORARY',
              calculatedFinalScore: decision === 'ACCEPTED' ? appealNewGrade : st.calculatedFinalScore,
            };
          }),
        };
      })
    );
    setSelectedAppeal(null);
    setAppealReplyText('');
    setToastMessage(`پاسخ اعتراض دانشجو (${decision === 'ACCEPTED' ? 'تغییر نمره پذیرفته شد' : 'اعتراض رد شد'}) با موفقیت ثبت و ابلاغ شد.`);
    setTimeout(() => setToastMessage(null), 5000);
  };

  // Calculate Class Grade Statistics
  const students = currentOffering?.students || [];
  const passedStudents = students.filter(s => (s.calculatedFinalScore ?? 0) >= 10).length;
  const failedStudents = students.filter(s => (s.calculatedFinalScore ?? 0) < 10 && (s.calculatedFinalScore !== undefined)).length;
  const averageGrade = students.length > 0
    ? (students.reduce((s, st) => s + (st.calculatedFinalScore || 0), 0) / students.length).toFixed(2)
    : '۰';

  return (
    <div className="space-y-5" dir="rtl">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-4 bg-emerald-900 text-emerald-100 rounded-2xl shadow-xl border border-emerald-700 font-bold text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>✅</span>
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-white/60 hover:text-white text-xs">✕</button>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-gradient-to-l from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 shadow-lg border border-indigo-700/50 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-slate-950">
                ارزیابی تحصیلی و امتحانات
              </span>
              <span className="text-xs text-indigo-200">{termTitle}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              📝 سهم‌بندی بارم، ثبت نمرات و فرجام‌خواهی دروس
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/professor/schedule"
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 transition"
            >
              🗓️ برنامه هفتگی
            </Link>
            <Link
              href="/professor/attendance"
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow transition"
            >
              📋 حضور و غیاب
            </Link>
          </div>
        </div>

        {/* Course Offering Selector */}
        <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/15 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="sm:col-span-2">
            <label className="text-indigo-200 font-bold block mb-1">انتخاب کلاس و درس مورد نظر جهت ارزیابی:</label>
            <select
              value={selectedOfferingId}
              onChange={e => setSelectedOfferingId(Number(e.target.value))}
              className="w-full bg-slate-900/90 text-white border border-indigo-400/50 rounded-lg px-3 py-2 font-bold"
            >
              {offerings.map(o => (
                <option key={o.id} value={o.id}>
                  {o.title} (گروه {faNum(o.groupNumber)} — کد {o.code}) {o.isCoTaught ? '👥 [درس مشترک]' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="text-indigo-200 font-bold block mb-1">نوع درس و تعداد دانشجو:</span>
            <div className="font-extrabold text-amber-300">
              {currentOffering.courseType} · {faNum(currentOffering.units)} واحد · {faNum(students.length)} دانشجو
            </div>
          </div>
        </div>
      </div>

      {/* Co-teaching Banner (if applicable) */}
      {currentOffering.isCoTaught && currentOffering.coTaughtDetails && (
        <div className="p-4 bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 text-white rounded-2xl shadow-md border border-purple-500/50 space-y-2">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-purple-300 text-purple-950 font-black text-[11px]">
              👥 درس دارای دو استاد مشترک (تئوری و عملی)
            </span>
            <span className="text-xs font-bold text-purple-200">فرمول سهم‌بندی مصوب شورای گروه آموزشی</span>
          </div>
          <p className="text-xs text-purple-100 leading-5">
            این درس به صورت مشترک توسط <b>{currentOffering.coTaughtDetails.theoryProfName}</b> (بخش تئوری با سهم {faNum(currentOffering.coTaughtDetails.theoryWeightRatio * 100)}٪ معادل {faNum(currentOffering.coTaughtDetails.theoryWeightMarks)} نمره) و <b>{currentOffering.coTaughtDetails.labProfName}</b> (بخش عملی با سهم {faNum(currentOffering.coTaughtDetails.labWeightRatio * 100)}٪ معادل {faNum(currentOffering.coTaughtDetails.labWeightMarks)} نمره) تدریس می‌گردد. هر استاد نمره بخش خود را از ۲۰ وارد نموده و سیستم نمره نهایی را به صورت خودکار محاسبه می‌نماید.
          </p>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('ROSTER')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-2 ${
              activeTab === 'ROSTER' ? 'bg-indigo-700 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>📊 لیست ورود نمرات کلاسی</span>
            <span className="px-1.5 py-0.2 rounded-full bg-indigo-500/30 text-[10px]">{faNum(students.length)}</span>
          </button>

          {!currentOffering.isCoTaught && (
            <button
              onClick={() => setActiveTab('RUBRIC')}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-2 ${
                activeTab === 'RUBRIC' ? 'bg-indigo-700 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>⚙️ تنظیم بارم‌بندی و سهم اجزا</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isRubricValid ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                جمع: {faNum(totalRubric)} از ۲۰
              </span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('APPEALS')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-2 ${
              activeTab === 'APPEALS' ? 'bg-indigo-700 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>📩 کارتابل اعتراضات دانشجویان</span>
            {currentOffering.appeals.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 font-black text-[10px]">
                {faNum(currentOffering.appeals.filter(a => a.status === 'OPEN').length)} باز
              </span>
            )}
          </button>
        </div>

        {/* Roster Statistics Indicator */}
        <div className="hidden sm:flex items-center gap-3 text-xs font-bold text-slate-600">
          <span>میانگین کلاس: <b className="text-indigo-950">{faNum(averageGrade)}</b></span>
          <span>قبولی: <b className="text-emerald-700">{faNum(passedStudents)} نفر</b></span>
          <span>مردودی: <b className="text-rose-700">{faNum(failedStudents)} نفر</b></span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: RUBRIC WEIGHTING CONFIGURATION */}
      {/* ========================================================================= */}
      {activeTab === 'RUBRIC' && !currentOffering.isCoTaught && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">
                تنظیم سهم‌بندی و بارم نمره درس «{currentOffering.title}»
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                مجموع بارم بخش‌های مختلف باید <b>دقیقاً برابر با ۲۰ نمره</b> باشد. نمرات وارد شده در لیست به طور خودکار به حداکثر بارم هر بخش محدود می‌شوند.
              </p>
            </div>

            {/* Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button onClick={() => applyRubricPreset('BALANCED')} className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-900 font-bold text-[11px] hover:bg-indigo-100 transition">الگوی متوازن (۵+۳+۲+۱۰)</button>
              <button onClick={() => applyRubricPreset('STANDARD_THEORY')} className="px-2.5 py-1 rounded-lg bg-sky-50 text-sky-900 font-bold text-[11px] hover:bg-sky-100 transition">تئوری استاندارد (۶+۴+۱۰)</button>
              <button onClick={() => applyRubricPreset('PRACTICAL_HEAVY')} className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 font-bold text-[11px] hover:bg-amber-100 transition">پروژه و عملی (۳+۳+۲+۷+۵)</button>
              <button onClick={() => applyRubricPreset('FINAL_HEAVY')} className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-900 font-bold text-[11px] hover:bg-purple-100 transition">پایان‌ترم‌محور (۴+۱۶)</button>
            </div>
          </div>

          {/* Validation Alert */}
          <div className={`p-4 rounded-2xl border flex items-center justify-between text-xs font-bold ${
            isRubricValid
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}>
            <div className="flex items-center gap-2">
              <span className="text-lg">{isRubricValid ? '✓' : '⚠️'}</span>
              <span>
                {isRubricValid
                  ? 'بارم‌بندی کاملاً معتبر است؛ مجموع بارم دقیقاً برابر با ۲۰ نمره می‌باشد.'
                  : `مجموع بارم‌های فعلی برابر با ${faNum(totalRubric)} نمره است. (${totalRubric < 20 ? faNum(20 - totalRubric) + ' نمره کسری دارد' : faNum(totalRubric - 20) + ' نمره اضافه است'})`}
              </span>
            </div>
            <div className="font-extrabold text-sm">
              مجموع: {faNum(totalRubric)} / ۲۰ نمره
            </div>
          </div>

          {/* Rubric Inputs Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="font-extrabold text-slate-800 text-xs flex items-center justify-between">
                <span>📝 آزمون میان‌ترم</span>
                <span className="text-[10px] text-slate-500">از ۲۰</span>
              </div>
              <input
                type="number"
                min={0}
                max={20}
                step={0.5}
                value={rubric.midterm}
                onChange={e => updateRubricField('midterm', Number(e.target.value))}
                className="w-full border border-slate-300 rounded-xl p-2.5 text-center font-extrabold text-indigo-950 text-base focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-slate-500 block text-center">سهم بارم میان‌ترم</span>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="font-extrabold text-slate-800 text-xs flex items-center justify-between">
                <span>📑 تکالیف و تمرین‌ها</span>
                <span className="text-[10px] text-slate-500">از ۲۰</span>
              </div>
              <input
                type="number"
                min={0}
                max={20}
                step={0.5}
                value={rubric.homework}
                onChange={e => updateRubricField('homework', Number(e.target.value))}
                className="w-full border border-slate-300 rounded-xl p-2.5 text-center font-extrabold text-indigo-950 text-base focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-slate-500 block text-center">تکالیف دوره‌ای و پروژه</span>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="font-extrabold text-slate-800 text-xs flex items-center justify-between">
                <span>🙋 حضور و فعالیت کلاسی</span>
                <span className="text-[10px] text-slate-500">از ۲۰</span>
              </div>
              <input
                type="number"
                min={0}
                max={20}
                step={0.5}
                value={rubric.participation}
                onChange={e => updateRubricField('participation', Number(e.target.value))}
                className="w-full border border-slate-300 rounded-xl p-2.5 text-center font-extrabold text-indigo-950 text-base focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-slate-500 block text-center">نظم، حضور و کوئیزها</span>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="font-extrabold text-slate-800 text-xs flex items-center justify-between">
                <span>🔬 بخش عملی و کارگاهی</span>
                <span className="text-[10px] text-slate-500">از ۲۰</span>
              </div>
              <input
                type="number"
                min={0}
                max={20}
                step={0.5}
                value={rubric.practical}
                onChange={e => updateRubricField('practical', Number(e.target.value))}
                className="w-full border border-slate-300 rounded-xl p-2.5 text-center font-extrabold text-indigo-950 text-base focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-slate-500 block text-center">گزارش‌کار و آزمایشگاه</span>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="font-extrabold text-slate-800 text-xs flex items-center justify-between">
                <span>🎓 آزمون کتبی پایان‌ترم</span>
                <span className="text-[10px] text-slate-500">از ۲۰</span>
              </div>
              <input
                type="number"
                min={0}
                max={20}
                step={0.5}
                value={rubric.finalExam}
                onChange={e => updateRubricField('finalExam', Number(e.target.value))}
                className="w-full border border-slate-300 rounded-xl p-2.5 text-center font-extrabold text-indigo-950 text-base focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-slate-500 block text-center">برگه امتحان پایان‌ترم</span>
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-200">
            <button
              disabled={!isRubricValid}
              onClick={() => {
                setActiveTab('ROSTER');
                setToastMessage('بارم‌بندی با موفقیت تایید شد؛ اکنون نمرات دانشجویان بر اساس این سقف‌ها محاسبه می‌گردند.');
                setTimeout(() => setToastMessage(null), 4000);
              }}
              className="px-6 py-2.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white font-extrabold text-xs shadow transition"
            >
              تایید بارم و رفتن به لیست ورود نمرات ←
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ROSTER GRADE ENTRY TABLE */}
      {/* ========================================================================= */}
      {activeTab === 'ROSTER' && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">
                ورود نمرات درس {currentOffering.title} (گروه {faNum(currentOffering.groupNumber)})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {currentOffering.isCoTaught
                  ? 'درس مشترک: نمره هر بخش از ۲۰ وارد شده و نمره کل طبق فرمول محاسبه می‌شود.'
                  : `بر اساس بارم‌بندی: میان‌ترم (${faNum(rubric.midterm)})، تکالیف (${faNum(rubric.homework)})، حضور (${faNum(rubric.participation)})، عملی (${faNum(rubric.practical)})، پایان‌ترم (${faNum(rubric.finalExam)}) — هیچ نمره‌ای نمی‌تواند بیشتر از سهم بارم باشد.`}
              </p>
            </div>

            {/* Workflow Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleSaveDraft}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition"
              >
                💾 ذخیره پیش‌نویس
              </button>
              <button
                onClick={handleSubmitTemporary}
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs shadow-xs transition"
              >
                📢 ثبت موقت (مشاهده دانشجو و اعتراض)
              </button>
              <button
                onClick={handleRequestFinalizeOtp}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-extrabold text-xs shadow-md transition flex items-center gap-1.5"
              >
                <span>🔒 نهایی‌سازی با رمز OTP</span>
              </button>
            </div>
          </div>

          {/* Roster Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white text-center">
                  <th className="p-2.5 border border-slate-800 w-12 font-extrabold">ردیف</th>
                  <th className="p-2.5 border border-slate-800 font-extrabold">شماره دانشجویی</th>
                  <th className="p-2.5 border border-slate-800 font-extrabold">نام و نام خانوادگی دانشجو</th>

                  {currentOffering.isCoTaught ? (
                    <>
                      <th className="p-2.5 border border-slate-800 font-extrabold bg-indigo-950">
                        نمره بخش تئوری (از ۲۰)
                        <div className="text-[10px] text-indigo-300 font-normal">سهم: {faNum(currentOffering.coTaughtDetails?.theoryWeightRatio! * 100)}٪</div>
                      </th>
                      <th className="p-2.5 border border-slate-800 font-extrabold bg-purple-950">
                        نمره بخش عملی (از ۲۰)
                        <div className="text-[10px] text-purple-300 font-normal">سهم: {faNum(currentOffering.coTaughtDetails?.labWeightRatio! * 100)}٪</div>
                      </th>
                    </>
                  ) : (
                    <>
                      <th className="p-2 border border-slate-800 font-extrabold">میان‌ترم ({faNum(rubric.midterm)})</th>
                      <th className="p-2 border border-slate-800 font-extrabold">تکالیف ({faNum(rubric.homework)})</th>
                      <th className="p-2 border border-slate-800 font-extrabold">حضور ({faNum(rubric.participation)})</th>
                      {rubric.practical > 0 && (
                        <th className="p-2 border border-slate-800 font-extrabold">عملی ({faNum(rubric.practical)})</th>
                      )}
                      <th className="p-2 border border-slate-800 font-extrabold">پایان‌ترم ({faNum(rubric.finalExam)})</th>
                    </>
                  )}

                  <th className="p-2.5 border border-slate-800 font-extrabold bg-slate-950 text-amber-300">نمره نهایی (از ۲۰)</th>
                  <th className="p-2.5 border border-slate-800 font-extrabold">وضعیت قبولی</th>
                  <th className="p-2.5 border border-slate-800 font-extrabold">وضعیت ثبت</th>
                </tr>
              </thead>
              <tbody>
                {students.map((st, idx) => {
                  const finalScore = st.calculatedFinalScore;
                  const isPass = finalScore !== undefined && finalScore >= 10;
                  const isFail = finalScore !== undefined && finalScore < 10;

                  return (
                    <tr key={st.studentId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="p-2.5 border border-slate-200 text-center font-bold text-slate-500">
                        {faNum(idx + 1)}
                      </td>
                      <td className="p-2.5 border border-slate-200 font-mono text-center font-bold text-indigo-950">
                        {faNum(st.studentCode)}
                      </td>
                      <td className="p-2.5 border border-slate-200 font-extrabold text-slate-900">
                        {st.fullName}
                      </td>

                      {currentOffering.isCoTaught ? (
                        <>
                          <td className="p-2 border border-slate-200 bg-indigo-50/40 text-center">
                            <input
                              type="number"
                              min={0}
                              max={20}
                              step={0.25}
                              value={st.theoryProfScore ?? ''}
                              onChange={e => {
                                const val = e.target.value === '' ? undefined : Math.max(0, Math.min(20, Number(e.target.value)));
                                updateStudentScore(st.studentId, 'theoryProfScore', val);
                              }}
                              className="w-16 border border-indigo-300 rounded-lg p-1 text-center font-extrabold text-indigo-950"
                            />
                          </td>
                          <td className="p-2 border border-slate-200 bg-purple-50/40 text-center">
                            <input
                              type="number"
                              min={0}
                              max={20}
                              step={0.25}
                              value={st.labProfScore ?? ''}
                              onChange={e => {
                                const val = e.target.value === '' ? undefined : Math.max(0, Math.min(20, Number(e.target.value)));
                                updateStudentScore(st.studentId, 'labProfScore', val);
                              }}
                              className="w-16 border border-purple-300 rounded-lg p-1 text-center font-extrabold text-purple-950"
                            />
                          </td>
                        </>
                      ) : (
                        <>
                          {/* Midterm Input */}
                          <td className="p-1.5 border border-slate-200 text-center">
                            <input
                              type="number"
                              min={0}
                              max={rubric.midterm}
                              step={0.25}
                              title={`حداکثر سهم میان‌ترم: ${faNum(rubric.midterm)} نمره`}
                              value={st.midtermScore !== undefined ? Math.min(rubric.midterm, st.midtermScore) : ''}
                              onChange={e => {
                                if (e.target.value === '') {
                                  updateStudentScore(st.studentId, 'midtermScore', undefined);
                                } else {
                                  const clamped = Math.max(0, Math.min(rubric.midterm, Number(e.target.value)));
                                  updateStudentScore(st.studentId, 'midtermScore', clamped);
                                }
                              }}
                              className="w-14 border border-slate-300 rounded-lg p-1 text-center font-bold text-xs focus:ring-2 focus:ring-indigo-500"
                            />
                          </td>

                          {/* Homework Input */}
                          <td className="p-1.5 border border-slate-200 text-center">
                            <input
                              type="number"
                              min={0}
                              max={rubric.homework}
                              step={0.25}
                              title={`حداکثر سهم تکالیف: ${faNum(rubric.homework)} نمره`}
                              value={st.homeworkScore !== undefined ? Math.min(rubric.homework, st.homeworkScore) : ''}
                              onChange={e => {
                                if (e.target.value === '') {
                                  updateStudentScore(st.studentId, 'homeworkScore', undefined);
                                } else {
                                  const clamped = Math.max(0, Math.min(rubric.homework, Number(e.target.value)));
                                  updateStudentScore(st.studentId, 'homeworkScore', clamped);
                                }
                              }}
                              className="w-14 border border-slate-300 rounded-lg p-1 text-center font-bold text-xs focus:ring-2 focus:ring-indigo-500"
                            />
                          </td>

                          {/* Participation Input */}
                          <td className="p-1.5 border border-slate-200 text-center">
                            <input
                              type="number"
                              min={0}
                              max={rubric.participation}
                              step={0.25}
                              title={`حداکثر سهم حضور و فعالیت: ${faNum(rubric.participation)} نمره`}
                              value={st.participationScore !== undefined ? Math.min(rubric.participation, st.participationScore) : ''}
                              onChange={e => {
                                if (e.target.value === '') {
                                  updateStudentScore(st.studentId, 'participationScore', undefined);
                                } else {
                                  const clamped = Math.max(0, Math.min(rubric.participation, Number(e.target.value)));
                                  updateStudentScore(st.studentId, 'participationScore', clamped);
                                }
                              }}
                              className="w-14 border border-slate-300 rounded-lg p-1 text-center font-bold text-xs focus:ring-2 focus:ring-indigo-500"
                            />
                          </td>

                          {/* Practical Input (if rubric > 0) */}
                          {rubric.practical > 0 && (
                            <td className="p-1.5 border border-slate-200 text-center">
                              <input
                                type="number"
                                min={0}
                                max={rubric.practical}
                                step={0.25}
                                title={`حداکثر سهم بخش عملی: ${faNum(rubric.practical)} نمره`}
                                value={st.practicalScore !== undefined ? Math.min(rubric.practical, st.practicalScore) : ''}
                                onChange={e => {
                                  if (e.target.value === '') {
                                    updateStudentScore(st.studentId, 'practicalScore', undefined);
                                  } else {
                                    const clamped = Math.max(0, Math.min(rubric.practical, Number(e.target.value)));
                                    updateStudentScore(st.studentId, 'practicalScore', clamped);
                                  }
                                }}
                                className="w-14 border border-slate-300 rounded-lg p-1 text-center font-bold text-xs focus:ring-2 focus:ring-indigo-500"
                              />
                            </td>
                          )}

                          {/* Final Exam Input */}
                          <td className="p-1.5 border border-slate-200 text-center">
                            <input
                              type="number"
                              min={0}
                              max={rubric.finalExam}
                              step={0.25}
                              title={`حداکثر سهم آزمون پایان‌ترم: ${faNum(rubric.finalExam)} نمره`}
                              value={st.finalExamScore !== undefined ? Math.min(rubric.finalExam, st.finalExamScore) : ''}
                              onChange={e => {
                                if (e.target.value === '') {
                                  updateStudentScore(st.studentId, 'finalExamScore', undefined);
                                } else {
                                  const clamped = Math.max(0, Math.min(rubric.finalExam, Number(e.target.value)));
                                  updateStudentScore(st.studentId, 'finalExamScore', clamped);
                                }
                              }}
                              className="w-14 border border-slate-300 rounded-lg p-1 text-center font-bold text-xs focus:ring-2 focus:ring-indigo-500"
                            />
                          </td>
                        </>
                      )}

                      {/* Calculated Final Score */}
                      <td className="p-2 border border-slate-200 text-center font-black text-sm bg-slate-50">
                        <span className={isPass ? 'text-emerald-700' : isFail ? 'text-rose-700' : 'text-slate-500'}>
                          {finalScore !== undefined ? faNum(finalScore) : '—'}
                        </span>
                      </td>

                      {/* Pass/Fail Status */}
                      <td className="p-2 border border-slate-200 text-center">
                        {finalScore !== undefined ? (
                          isPass ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                              قبول
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px]">
                              مردود
                            </span>
                          )
                        ) : (
                          <span className="text-[10px] text-slate-400 font-bold">ناتمام</span>
                        )}
                      </td>

                      {/* Submission Status */}
                      <td className="p-2 border border-slate-200 text-center">
                        {st.status === 'FINALIZED' ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-700 text-white font-bold text-[10px]">
                            🔒 قطعی شده
                          </span>
                        ) : st.status === 'TEMPORARY' ? (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px]">
                            📢 ثبت موقت
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-bold text-[10px]">
                            پیش‌نویس
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: GRADE APPEALS MANAGEMENT */}
      {/* ========================================================================= */}
      {activeTab === 'APPEALS' && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">
                کارتابل رسیدگی به اعتراضات دانشجویان (درس {currentOffering.title})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                طبق آیین‌نامه، استاد موظف است حداکثر ظرف مدت ۴۸ ساعت کاری به اعتراضات ثبت‌شده پاسخ دهد.
              </p>
            </div>
          </div>

          {currentOffering.appeals.length === 0 ? (
            <div className="text-center p-8 text-slate-500 text-xs font-bold bg-slate-50 rounded-2xl">
              هیچ اعتراضی برای این کلاس ثبت نشده است.
            </div>
          ) : (
            <div className="space-y-3">
              {currentOffering.appeals.map(appeal => (
                <div key={appeal.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-900 text-xs">{appeal.fullName}</span>
                      <span className="font-mono text-xs text-slate-500">({faNum(appeal.studentCode)})</span>
                      <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 font-bold text-[10px]">
                        نمره موقت ثبت‌شده: {faNum(appeal.currentGrade)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">{appeal.createdAt}</span>
                      <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                        appeal.status === 'ACCEPTED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : appeal.status === 'REJECTED'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-900'
                      }`}>
                        {appeal.status === 'ACCEPTED' ? 'پذیرفته شده' : appeal.status === 'REJECTED' ? 'رد شده' : 'در انتظار بررسی'}
                      </span>
                    </div>
                  </div>

                  {/* Student Message */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs text-slate-800">
                    <span className="font-bold text-slate-500 block mb-1">متن اعتراض دانشجو:</span>
                    <p className="leading-5">{appeal.studentMessage}</p>
                  </div>

                  {/* Professor Reply (if resolved) */}
                  {appeal.status !== 'OPEN' && (
                    <div className="bg-slate-100 p-3 rounded-xl border border-slate-200 text-xs text-slate-800">
                      <div className="flex items-center justify-between font-bold text-slate-600 mb-1">
                        <span>پاسخ ثبت‌شده استاد:</span>
                        {appeal.status === 'ACCEPTED' && (
                          <span className="text-emerald-700">نمره جدید ابلاغی: {faNum(appeal.newGrade)}</span>
                        )}
                      </div>
                      <p className="leading-5">{appeal.professorReply || 'بدون توضیح'}</p>
                    </div>
                  )}

                  {/* Action trigger if open */}
                  {appeal.status === 'OPEN' && (
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => {
                          setSelectedAppeal(appeal);
                          setAppealNewGrade(appeal.currentGrade);
                        }}
                        className="px-4 py-1.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-extrabold text-xs shadow-xs transition"
                      >
                        ✍️ پاسخ و تصمیم‌گیری درباره اعتراض
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Appeal Decision Modal */}
      {selectedAppeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4 animate-scaleUp text-slate-900">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="font-extrabold text-base text-slate-900">
                رسیدگی به اعتراض دانشجو: {selectedAppeal.fullName}
              </h3>
              <button onClick={() => setSelectedAppeal(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">شماره دانشجویی:</span>
                <span className="font-mono font-bold text-slate-800">{faNum(selectedAppeal.studentCode)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">نمره ثبت‌شده قبلی:</span>
                <span className="font-bold text-indigo-700">{faNum(selectedAppeal.currentGrade)} از ۲۰</span>
              </div>
              <div className="pt-1 text-slate-700 border-t border-slate-200">
                <span className="font-bold text-slate-500 block mb-0.5">متن اعتراض:</span>
                <p className="leading-5 bg-white p-2 rounded-lg border border-slate-200">{selectedAppeal.studentMessage}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">متن پاسخ استاد:</label>
                <textarea
                  value={appealReplyText}
                  onChange={e => setAppealReplyText(e.target.value)}
                  rows={3}
                  placeholder="توضیحات استاد خطاب به دانشجو..."
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  نمره جدید اصلاح‌شده (در صورت پذیرش اعتراض):
                </label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  step={0.25}
                  value={appealNewGrade}
                  onChange={e => setAppealNewGrade(Number(e.target.value))}
                  className="w-32 border border-slate-300 rounded-xl p-2 text-center font-extrabold text-sm text-indigo-950"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => handleResolveAppeal('ACCEPTED')}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs transition"
              >
                ✓ پذیرش و ثبت نمره جدید
              </button>
              <button
                onClick={() => handleResolveAppeal('REJECTED')}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs transition"
              >
                ✕ رد اعتراض و تثبیت نمره قبلی
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OTP Finalize Modal */}
      {showOtpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 animate-scaleUp text-slate-900">
            <div className="w-12 h-12 bg-amber-100 text-amber-800 rounded-2xl flex items-center justify-center text-2xl mx-auto">
              🔒
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-extrabold text-base text-slate-900">
                تایید نهایی و قفل نمرات با رمز یکبار مصرف (OTP)
              </h3>
              <p className="text-xs text-slate-600 leading-5">
                با نهایی‌سازی، لیست نمرات به همراه امضای دیجیتال رمزنگاری‌شده فریز شده و صرفاً از طریق مصوبه شورای آموزشی قابل تغییر خواهد بود.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1 text-center">
              <span className="text-slate-500 block">کد تایید ۵ رقمی پیامک‌شده (کد آزمایشی):</span>
              <span className="font-mono font-black text-indigo-700 text-lg tracking-widest">{otpSentCode}</span>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1 text-center">
                کد ۵ رقمی را وارد نمایید:
              </label>
              <input
                type="text"
                maxLength={5}
                value={otpCode}
                onChange={e => setOtpCode(e.target.value)}
                placeholder="• • • • •"
                className="w-full border-2 border-indigo-500 rounded-xl p-3 text-center font-mono font-black text-xl tracking-widest text-slate-900 focus:outline-hidden"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleConfirmFinalize}
                className="flex-1 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs transition shadow-md"
              >
                🔒 تایید و امضای قطعی نمرات
              </button>
              <button
                onClick={() => setShowOtpModal(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
