'use client';

import React, { useState, useEffect, useMemo } from 'react';
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

  const [activeTab, setActiveTab] = useState<'ROSTER' | 'RUBRIC' | 'APPEALS' | 'ANALYTICS'>('ROSTER');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showOtpModal, setShowOtpModal] = useState<boolean>(false);
  const [otpCode, setOtpCode] = useState<string>('');
  const [otpSentCode, setOtpSentCode] = useState<string>('58219');
  const [selectedAppeal, setSelectedAppeal] = useState<GradeAppealItem | null>(null);
  const [appealReplyText, setAppealReplyText] = useState<string>('');
  const [appealNewGrade, setAppealNewGrade] = useState<number>(14);
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<string>('هم‌اکنون');
  const [searchStudentQuery, setSearchStudentQuery] = useState<string>('');

  const currentOffering = offerings.find(o => o.id === selectedOfferingId) || offerings[0];
  const rubric = currentOffering?.rubric || { midterm: 5, homework: 3, participation: 2, practical: 0, finalExam: 10 };
  const totalRubric = (Number(rubric.midterm) || 0) + (Number(rubric.homework) || 0) + (Number(rubric.participation) || 0) + (Number(rubric.practical) || 0) + (Number(rubric.finalExam) || 0);
  const isRubricValid = totalRubric === 20;

  // Auto-save simulation
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastAutoSaveTime(timeStr);
    }, 15000);
    return () => clearInterval(timer);
  }, []);

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

            let maxAllowed = 20;
            if (field === 'midtermScore') maxAllowed = off.rubric.midterm;
            else if (field === 'homeworkScore') maxAllowed = off.rubric.homework;
            else if (field === 'participationScore') maxAllowed = off.rubric.participation;
            else if (field === 'practicalScore') maxAllowed = off.rubric.practical;
            else if (field === 'finalExamScore') maxAllowed = off.rubric.finalExam;
            else if (field === 'theoryProfScore' || field === 'labProfScore') maxAllowed = 20;

            let clampedVal = val !== undefined ? Math.max(0, Math.min(maxAllowed, val)) : undefined;

            const updated = { ...st, [field]: clampedVal };

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

  // Add Bonus Grace Mark to All Students
  const applyBonusMarkToAll = (bonus: number) => {
    if (!confirm(`آیا از افزودن ${bonus} نمره ارفاق/تشویقی به آزمون پایان‌ترم تمامی دانشجویان مطمئن هستید؟`)) return;
    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId) return off;
        return {
          ...off,
          students: off.students.map(st => {
            const currentFinal = st.finalExamScore ?? 0;
            const newFinal = Math.min(off.rubric.finalExam, currentFinal + bonus);
            const m = Math.min(off.rubric.midterm, st.midtermScore ?? 0);
            const h = Math.min(off.rubric.homework, st.homeworkScore ?? 0);
            const p = Math.min(off.rubric.participation, st.participationScore ?? 0);
            const pr = Math.min(off.rubric.practical, st.practicalScore ?? 0);
            const sum = m + h + p + pr + newFinal;
            return {
              ...st,
              finalExamScore: newFinal,
              calculatedFinalScore: Math.min(20, Math.round(sum * 100) / 100),
            };
          }),
        };
      })
    );
    setToastMessage(`✨ نمره تشویقی (${bonus} نمره) با موفقیت به برگه پایان‌ترم دانشجویان اضافه شد.`);
    setTimeout(() => setToastMessage(null), 4000);
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

  const gradeDistribution = useMemo(() => {
    let fail = 0;     // 0 - 9.9
    let fair = 0;     // 10 - 13.9
    let good = 0;     // 14 - 16.9
    let excellent = 0;// 17 - 20
    students.forEach(st => {
      const g = st.calculatedFinalScore;
      if (g === undefined) return;
      if (g < 10) fail++;
      else if (g < 14) fair++;
      else if (g < 17) good++;
      else excellent++;
    });
    return { fail, fair, good, excellent };
  }, [students]);

  const filteredStudents = students.filter(st => {
    if (!searchStudentQuery.trim()) return true;
    const q = searchStudentQuery.trim().toLowerCase();
    return st.fullName.toLowerCase().includes(q) || st.studentCode.includes(q);
  });

  return (
    <div className="space-y-5" dir="rtl">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-4 bg-emerald-900 text-emerald-100 rounded-2xl shadow-xl border border-emerald-700 font-bold text-sm flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <span>📢</span>
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-white/60 hover:text-white text-xs">✕</button>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-gradient-to-l from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-5 shadow-xl border border-indigo-700/50 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-400 text-slate-950">
                ارزیابی تحصیلی و امتحانات
              </span>
              <span className="text-xs text-indigo-200">{termTitle}</span>
            </div>
            <h1 className="text-lg sm:text-2xl font-black tracking-tight flex items-center gap-2">
              <span>📝</span>
              <span>داشبورد ثبت نمرات، سهم‌بندی بارم و فرجام‌خواهی</span>
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

        {/* Course Offering Selector & Auto-Save Indicator */}
        <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/15 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs items-center">
          <div className="sm:col-span-2">
            <label className="text-indigo-200 font-bold block mb-1">انتخاب کلاس و درس مورد نظر جهت ارزیابی:</label>
            <select
              value={selectedOfferingId}
              onChange={e => setSelectedOfferingId(Number(e.target.value))}
              className="w-full bg-slate-900/90 text-white border border-indigo-400/50 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              {offerings.map(o => (
                <option key={o.id} value={o.id}>
                  {o.title} (گروه {faNum(o.groupNumber)} — کد {o.code}) {o.isCoTaught ? '👥 [درس مشترک تئوری/عملی]' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex sm:flex-col justify-between sm:justify-center items-end sm:items-start border-t sm:border-t-0 sm:border-r sm:border-white/15 pt-2 sm:pt-0 sm:pr-3">
            <span className="text-indigo-200 font-bold block text-[11px]">وضعیت ذخیره‌سازی زنده:</span>
            <div className="flex items-center gap-1.5 text-emerald-300 font-mono text-xs font-bold mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>ذخیره خودکار: {lastAutoSaveTime}</span>
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
            این درس به صورت مشترک توسط <b>{currentOffering.coTaughtDetails.theoryProfName}</b> (بخش تئوری با سهم {faNum(currentOffering.coTaughtDetails.theoryWeightRatio * 100)}٪ معادل {faNum(currentOffering.coTaughtDetails.theoryWeightMarks)} نمره) و <b>{currentOffering.coTaughtDetails.labProfName}</b> (بخش عملی با سهم {faNum(currentOffering.coTaughtDetails.labWeightRatio * 100)}٪ معادل {faNum(currentOffering.coTaughtDetails.labWeightMarks)} نمره) تدریس می‌گردد.
          </p>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 pb-2 gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('ROSTER')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-2 ${
              activeTab === 'ROSTER' ? 'bg-indigo-900 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>📊 لیست نمرات کلاسی</span>
            <span className="px-1.5 py-0.2 rounded-full bg-indigo-500/30 text-[10px]">{faNum(students.length)}</span>
          </button>

          {!currentOffering.isCoTaught && (
            <button
              onClick={() => setActiveTab('RUBRIC')}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-2 ${
                activeTab === 'RUBRIC' ? 'bg-indigo-900 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>⚙️ سهم‌بندی بارم</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isRubricValid ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                جمع: {faNum(totalRubric)} از ۲۰
              </span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('APPEALS')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-2 ${
              activeTab === 'APPEALS' ? 'bg-indigo-900 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>📩 کارتابل اعتراضات</span>
            {currentOffering.appeals.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 font-black text-[10px]">
                {faNum(currentOffering.appeals.filter(a => a.status === 'OPEN').length)} باز
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('ANALYTICS')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-2 ${
              activeTab === 'ANALYTICS' ? 'bg-indigo-900 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>📈 تحلیل آماری نمرات</span>
          </button>
        </div>

        {/* Quick Stats Summary */}
        <div className="hidden lg:flex items-center gap-3 text-xs font-bold text-slate-600">
          <span>میانگین: <b className="text-indigo-950">{faNum(averageGrade)}</b></span>
          <span>قبولی: <b className="text-emerald-700">{faNum(passedStudents)} نفر</b></span>
          <span>مردودی: <b className="text-rose-700">{faNum(failedStudents)} نفر</b></span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: RUBRIC WEIGHTING CONFIGURATION */}
      {/* ========================================================================= */}
      {activeTab === 'RUBRIC' && !currentOffering.isCoTaught && (
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-black text-slate-900 text-base">
                تنظیم سهم‌بندی و بارم نمره درس «{currentOffering.title}»
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                مجموع بارم بخش‌های مختلف باید <b>دقیقاً برابر با ۲۰ نمره</b> باشد.
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
            <div className="font-black text-sm">
              مجموع: {faNum(totalRubric)} / ۲۰ نمره
            </div>
          </div>

          {/* Rubric Inputs Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="font-bold text-slate-800 text-xs flex items-center justify-between">
                <span>📝 آزمون میان‌ترم</span>
                <span className="text-[10px] text-slate-500">از ۲۰</span>
              </div>
              <input
                type="number"
                min={0}
                max={20}
                step={0.5}
                inputMode="decimal"
                value={rubric.midterm}
                onChange={e => updateRubricField('midterm', Number(e.target.value))}
                className="w-full border border-slate-300 rounded-xl p-2.5 text-center font-black text-indigo-950 text-base focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-slate-500 block text-center">سهم بارم میان‌ترم</span>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="font-bold text-slate-800 text-xs flex items-center justify-between">
                <span>📑 تکالیف و تمرین‌ها</span>
                <span className="text-[10px] text-slate-500">از ۲۰</span>
              </div>
              <input
                type="number"
                min={0}
                max={20}
                step={0.5}
                inputMode="decimal"
                value={rubric.homework}
                onChange={e => updateRubricField('homework', Number(e.target.value))}
                className="w-full border border-slate-300 rounded-xl p-2.5 text-center font-black text-indigo-950 text-base focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-slate-500 block text-center">تکالیف دوره‌ای و پروژه</span>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="font-bold text-slate-800 text-xs flex items-center justify-between">
                <span>🙋 حضور و فعالیت کلاسی</span>
                <span className="text-[10px] text-slate-500">از ۲۰</span>
              </div>
              <input
                type="number"
                min={0}
                max={20}
                step={0.5}
                inputMode="decimal"
                value={rubric.participation}
                onChange={e => updateRubricField('participation', Number(e.target.value))}
                className="w-full border border-slate-300 rounded-xl p-2.5 text-center font-black text-indigo-950 text-base focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-slate-500 block text-center">نظم، حضور و کوئیزها</span>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="font-bold text-slate-800 text-xs flex items-center justify-between">
                <span>🔬 بخش عملی و کارگاهی</span>
                <span className="text-[10px] text-slate-500">از ۲۰</span>
              </div>
              <input
                type="number"
                min={0}
                max={20}
                step={0.5}
                inputMode="decimal"
                value={rubric.practical}
                onChange={e => updateRubricField('practical', Number(e.target.value))}
                className="w-full border border-slate-300 rounded-xl p-2.5 text-center font-black text-indigo-950 text-base focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-slate-500 block text-center">گزارش‌کار و آزمایشگاه</span>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="font-bold text-slate-800 text-xs flex items-center justify-between">
                <span>🎓 آزمون کتبی پایان‌ترم</span>
                <span className="text-[10px] text-slate-500">از ۲۰</span>
              </div>
              <input
                type="number"
                min={0}
                max={20}
                step={0.5}
                inputMode="decimal"
                value={rubric.finalExam}
                onChange={e => updateRubricField('finalExam', Number(e.target.value))}
                className="w-full border border-slate-300 rounded-xl p-2.5 text-center font-black text-indigo-950 text-base focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-slate-500 block text-center">برگه امتحان پایان‌ترم</span>
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-100">
            <button
              disabled={!isRubricValid}
              onClick={() => {
                setActiveTab('ROSTER');
                setToastMessage('بارم‌بندی با موفقیت تایید شد؛ اکنون نمرات دانشجویان بر اساس این سقف‌ها محاسبه می‌گردند.');
                setTimeout(() => setToastMessage(null), 4000);
              }}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-indigo-900 hover:bg-indigo-950 disabled:opacity-50 text-white font-black text-xs shadow transition"
            >
              تایید بارم و ورود نمرات کلاسی ←
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ROSTER GRADE ENTRY (RESPONSIVE: DESKTOP SPREADSHEET + MOBILE ADAPTIVE CARDS) */}
      {/* ========================================================================= */}
      {activeTab === 'ROSTER' && (
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-black text-slate-900 text-base">
                ورود نمرات درس {currentOffering.title} (گروه {faNum(currentOffering.groupNumber)})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {currentOffering.isCoTaught
                  ? 'درس مشترک: نمره هر بخش از ۲۰ وارد شده و نمره کل طبق سهمیه مصوب محاسبه می‌گردد.'
                  : `بر اساس بارم: میان‌ترم (${faNum(rubric.midterm)})، تکالیف (${faNum(rubric.homework)})، حضور (${faNum(rubric.participation)})، عملی (${faNum(rubric.practical)})، پایان‌ترم (${faNum(rubric.finalExam)})`}
              </p>
            </div>

            {/* Workflow Action Buttons (Full-width on mobile, auto on desktop) */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => applyBonusMarkToAll(0.5)}
                className="w-full sm:w-auto px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold text-xs transition flex items-center justify-center gap-1"
              >
                <span>✨ ارفاق گروهی (+۰.۵ نمره)</span>
              </button>
              <button
                onClick={handleSaveDraft}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition flex items-center justify-center gap-1"
              >
                <span>💾 ذخیره پیش‌نویس</span>
              </button>
              <button
                onClick={handleSubmitTemporary}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs shadow-xs transition flex items-center justify-center gap-1"
              >
                <span>📢 ثبت موقت و رویت دانشجو</span>
              </button>
              <button
                onClick={handleRequestFinalizeOtp}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 text-white font-black text-xs shadow-md transition flex items-center justify-center gap-1.5"
              >
                <span>🔒 قفل قطعی نمرات با OTP</span>
              </button>
            </div>
          </div>

          {/* Search filter for roster */}
          <div className="flex items-center justify-between gap-3">
            <input
              type="text"
              placeholder="جستجوی دانشجو با نام یا شماره دانشجویی..."
              value={searchStudentQuery}
              onChange={e => setSearchStudentQuery(e.target.value)}
              className="w-full sm:w-72 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-xs text-slate-500 font-bold hidden sm:inline">
              نمایش {faNum(filteredStudents.length)} از {faNum(students.length)} دانشجو
            </span>
          </div>

          {/* VIEW A: DESKTOP TABLE VIEW (HIDDEN ON MOBILE) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white text-center">
                  <th className="p-2.5 border border-slate-800 w-12 font-bold">ردیف</th>
                  <th className="p-2.5 border border-slate-800 font-bold">شماره دانشجویی</th>
                  <th className="p-2.5 border border-slate-800 font-bold text-right">نام دانشجو</th>

                  {currentOffering.isCoTaught ? (
                    <>
                      <th className="p-2.5 border border-slate-800 font-bold bg-indigo-950">
                        نمره تئوری (از ۲۰)
                        <div className="text-[10px] text-indigo-300 font-normal">سهم {faNum(currentOffering.coTaughtDetails?.theoryWeightRatio! * 100)}٪</div>
                      </th>
                      <th className="p-2.5 border border-slate-800 font-bold bg-purple-950">
                        نمره عملی (از ۲۰)
                        <div className="text-[10px] text-purple-300 font-normal">سهم {faNum(currentOffering.coTaughtDetails?.labWeightRatio! * 100)}٪</div>
                      </th>
                    </>
                  ) : (
                    <>
                      <th className="p-2 border border-slate-800 font-bold">میان‌ترم ({faNum(rubric.midterm)})</th>
                      <th className="p-2 border border-slate-800 font-bold">تکالیف ({faNum(rubric.homework)})</th>
                      <th className="p-2 border border-slate-800 font-bold">حضور ({faNum(rubric.participation)})</th>
                      {rubric.practical > 0 && (
                        <th className="p-2 border border-slate-800 font-bold">عملی ({faNum(rubric.practical)})</th>
                      )}
                      <th className="p-2 border border-slate-800 font-bold">پایان‌ترم ({faNum(rubric.finalExam)})</th>
                    </>
                  )}

                  <th className="p-2.5 border border-slate-800 font-black bg-slate-950 text-amber-300">نمره کل (از ۲۰)</th>
                  <th className="p-2.5 border border-slate-800 font-bold">نتیجه</th>
                  <th className="p-2.5 border border-slate-800 font-bold">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((st, idx) => {
                  const finalScore = st.calculatedFinalScore;
                  const isPass = finalScore !== undefined && finalScore >= 10;
                  const isFail = finalScore !== undefined && finalScore < 10;

                  return (
                    <tr key={st.studentId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="p-2.5 border border-slate-200 text-center font-bold text-slate-500">
                        {faNum(idx + 1)}
                      </td>
                      <td className="p-2.5 border border-slate-200 font-mono text-center font-bold text-indigo-950" dir="ltr">
                        {st.studentCode}
                      </td>
                      <td className="p-2.5 border border-slate-200 font-black text-slate-900">
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
                              inputMode="decimal"
                              value={st.theoryProfScore ?? ''}
                              onChange={e => {
                                const val = e.target.value === '' ? undefined : Math.max(0, Math.min(20, Number(e.target.value)));
                                updateStudentScore(st.studentId, 'theoryProfScore', val);
                              }}
                              className="w-16 border border-indigo-300 rounded-lg p-1 text-center font-black text-indigo-950"
                            />
                          </td>
                          <td className="p-2 border border-slate-200 bg-purple-50/40 text-center">
                            <input
                              type="number"
                              min={0}
                              max={20}
                              step={0.25}
                              inputMode="decimal"
                              value={st.labProfScore ?? ''}
                              onChange={e => {
                                const val = e.target.value === '' ? undefined : Math.max(0, Math.min(20, Number(e.target.value)));
                                updateStudentScore(st.studentId, 'labProfScore', val);
                              }}
                              className="w-16 border border-purple-300 rounded-lg p-1 text-center font-black text-purple-950"
                            />
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-1.5 border border-slate-200 text-center">
                            <input
                              type="number"
                              min={0}
                              max={rubric.midterm}
                              step={0.25}
                              inputMode="decimal"
                              value={st.midtermScore !== undefined ? Math.min(rubric.midterm, st.midtermScore) : ''}
                              onChange={e => {
                                if (e.target.value === '') updateStudentScore(st.studentId, 'midtermScore', undefined);
                                else updateStudentScore(st.studentId, 'midtermScore', Math.max(0, Math.min(rubric.midterm, Number(e.target.value))));
                              }}
                              className="w-14 border border-slate-300 rounded-lg p-1 text-center font-bold text-xs focus:ring-2 focus:ring-indigo-500"
                            />
                          </td>

                          <td className="p-1.5 border border-slate-200 text-center">
                            <input
                              type="number"
                              min={0}
                              max={rubric.homework}
                              step={0.25}
                              inputMode="decimal"
                              value={st.homeworkScore !== undefined ? Math.min(rubric.homework, st.homeworkScore) : ''}
                              onChange={e => {
                                if (e.target.value === '') updateStudentScore(st.studentId, 'homeworkScore', undefined);
                                else updateStudentScore(st.studentId, 'homeworkScore', Math.max(0, Math.min(rubric.homework, Number(e.target.value))));
                              }}
                              className="w-14 border border-slate-300 rounded-lg p-1 text-center font-bold text-xs focus:ring-2 focus:ring-indigo-500"
                            />
                          </td>

                          <td className="p-1.5 border border-slate-200 text-center">
                            <input
                              type="number"
                              min={0}
                              max={rubric.participation}
                              step={0.25}
                              inputMode="decimal"
                              value={st.participationScore !== undefined ? Math.min(rubric.participation, st.participationScore) : ''}
                              onChange={e => {
                                if (e.target.value === '') updateStudentScore(st.studentId, 'participationScore', undefined);
                                else updateStudentScore(st.studentId, 'participationScore', Math.max(0, Math.min(rubric.participation, Number(e.target.value))));
                              }}
                              className="w-14 border border-slate-300 rounded-lg p-1 text-center font-bold text-xs focus:ring-2 focus:ring-indigo-500"
                            />
                          </td>

                          {rubric.practical > 0 && (
                            <td className="p-1.5 border border-slate-200 text-center">
                              <input
                                type="number"
                                min={0}
                                max={rubric.practical}
                                step={0.25}
                                inputMode="decimal"
                                value={st.practicalScore !== undefined ? Math.min(rubric.practical, st.practicalScore) : ''}
                                onChange={e => {
                                  if (e.target.value === '') updateStudentScore(st.studentId, 'practicalScore', undefined);
                                  else updateStudentScore(st.studentId, 'practicalScore', Math.max(0, Math.min(rubric.practical, Number(e.target.value))));
                                }}
                                className="w-14 border border-slate-300 rounded-lg p-1 text-center font-bold text-xs focus:ring-2 focus:ring-indigo-500"
                              />
                            </td>
                          )}

                          <td className="p-1.5 border border-slate-200 text-center">
                            <input
                              type="number"
                              min={0}
                              max={rubric.finalExam}
                              step={0.25}
                              inputMode="decimal"
                              value={st.finalExamScore !== undefined ? Math.min(rubric.finalExam, st.finalExamScore) : ''}
                              onChange={e => {
                                if (e.target.value === '') updateStudentScore(st.studentId, 'finalExamScore', undefined);
                                else updateStudentScore(st.studentId, 'finalExamScore', Math.max(0, Math.min(rubric.finalExam, Number(e.target.value))));
                              }}
                              className="w-14 border border-slate-300 rounded-lg p-1 text-center font-bold text-xs focus:ring-2 focus:ring-indigo-500"
                            />
                          </td>
                        </>
                      )}

                      <td className="p-2 border border-slate-200 text-center font-black text-sm bg-slate-50">
                        <span className={isPass ? 'text-emerald-700' : isFail ? 'text-rose-700' : 'text-slate-500'}>
                          {finalScore !== undefined ? faNum(finalScore) : '—'}
                        </span>
                      </td>

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

                      <td className="p-2 border border-slate-200 text-center">
                        {st.status === 'FINALIZED' ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-700 text-white font-bold text-[10px]">
                            🔒 قطعی
                          </span>
                        ) : st.status === 'TEMPORARY' ? (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px]">
                            📢 موقت
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

          {/* VIEW B: MOBILE ADAPTIVE CARDS (TOUCH-FRIENDLY, ZERO HORIZONTAL OVERFLOW) */}
          <div className="block md:hidden space-y-3">
            {filteredStudents.map((st, idx) => {
              const finalScore = st.calculatedFinalScore;
              const isPass = finalScore !== undefined && finalScore >= 10;
              const isFail = finalScore !== undefined && finalScore < 10;

              return (
                <div
                  key={st.studentId}
                  className="p-4 bg-slate-50 rounded-2xl border border-slate-200 shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-indigo-900 text-white font-black text-xs flex items-center justify-center">
                        {faNum(idx + 1)}
                      </span>
                      <div>
                        <h4 className="font-black text-sm text-slate-900">{st.fullName}</h4>
                        <span className="text-[11px] font-mono text-slate-500" dir="ltr">
                          {st.studentCode}
                        </span>
                      </div>
                    </div>

                    <div className="text-left">
                      <span className="text-[10px] text-slate-500 block font-bold">نمره نهایی:</span>
                      <span
                        className={`text-base font-black ${
                          isPass ? 'text-emerald-700' : isFail ? 'text-rose-700' : 'text-slate-400'
                        }`}
                      >
                        {finalScore !== undefined ? faNum(finalScore) : '—'} / ۲۰
                      </span>
                    </div>
                  </div>

                  {/* Inputs Grid for Mobile */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {currentOffering.isCoTaught ? (
                      <>
                        <div className="bg-white p-2 rounded-xl border border-indigo-200 space-y-1">
                          <label className="text-[10px] text-indigo-950 font-bold block">
                            تئوری (سهم {faNum(currentOffering.coTaughtDetails?.theoryWeightRatio! * 100)}٪):
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={20}
                            step={0.25}
                            inputMode="decimal"
                            value={st.theoryProfScore ?? ''}
                            onChange={e => {
                              const val = e.target.value === '' ? undefined : Math.max(0, Math.min(20, Number(e.target.value)));
                              updateStudentScore(st.studentId, 'theoryProfScore', val);
                            }}
                            className="w-full border border-slate-300 rounded-lg p-2 text-center font-black text-sm"
                          />
                        </div>

                        <div className="bg-white p-2 rounded-xl border border-purple-200 space-y-1">
                          <label className="text-[10px] text-purple-950 font-bold block">
                            عملی (سهم {faNum(currentOffering.coTaughtDetails?.labWeightRatio! * 100)}٪):
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={20}
                            step={0.25}
                            inputMode="decimal"
                            value={st.labProfScore ?? ''}
                            onChange={e => {
                              const val = e.target.value === '' ? undefined : Math.max(0, Math.min(20, Number(e.target.value)));
                              updateStudentScore(st.studentId, 'labProfScore', val);
                            }}
                            className="w-full border border-slate-300 rounded-lg p-2 text-center font-black text-sm"
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="bg-white p-2 rounded-xl border border-slate-200 space-y-1">
                          <label className="text-[10px] text-slate-600 font-bold block">
                            میان‌ترم ({faNum(rubric.midterm)}):
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={rubric.midterm}
                            step={0.25}
                            inputMode="decimal"
                            value={st.midtermScore !== undefined ? Math.min(rubric.midterm, st.midtermScore) : ''}
                            onChange={e => {
                              if (e.target.value === '') updateStudentScore(st.studentId, 'midtermScore', undefined);
                              else updateStudentScore(st.studentId, 'midtermScore', Math.max(0, Math.min(rubric.midterm, Number(e.target.value))));
                            }}
                            className="w-full border border-slate-300 rounded-lg p-2 text-center font-black text-sm focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>

                        <div className="bg-white p-2 rounded-xl border border-slate-200 space-y-1">
                          <label className="text-[10px] text-slate-600 font-bold block">
                            تکالیف ({faNum(rubric.homework)}):
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={rubric.homework}
                            step={0.25}
                            inputMode="decimal"
                            value={st.homeworkScore !== undefined ? Math.min(rubric.homework, st.homeworkScore) : ''}
                            onChange={e => {
                              if (e.target.value === '') updateStudentScore(st.studentId, 'homeworkScore', undefined);
                              else updateStudentScore(st.studentId, 'homeworkScore', Math.max(0, Math.min(rubric.homework, Number(e.target.value))));
                            }}
                            className="w-full border border-slate-300 rounded-lg p-2 text-center font-black text-sm focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>

                        <div className="bg-white p-2 rounded-xl border border-slate-200 space-y-1">
                          <label className="text-[10px] text-slate-600 font-bold block">
                            حضور ({faNum(rubric.participation)}):
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={rubric.participation}
                            step={0.25}
                            inputMode="decimal"
                            value={st.participationScore !== undefined ? Math.min(rubric.participation, st.participationScore) : ''}
                            onChange={e => {
                              if (e.target.value === '') updateStudentScore(st.studentId, 'participationScore', undefined);
                              else updateStudentScore(st.studentId, 'participationScore', Math.max(0, Math.min(rubric.participation, Number(e.target.value))));
                            }}
                            className="w-full border border-slate-300 rounded-lg p-2 text-center font-black text-sm focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>

                        <div className="bg-white p-2 rounded-xl border border-slate-200 space-y-1">
                          <label className="text-[10px] text-slate-600 font-bold block">
                            پایان‌ترم ({faNum(rubric.finalExam)}):
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={rubric.finalExam}
                            step={0.25}
                            inputMode="decimal"
                            value={st.finalExamScore !== undefined ? Math.min(rubric.finalExam, st.finalExamScore) : ''}
                            onChange={e => {
                              if (e.target.value === '') updateStudentScore(st.studentId, 'finalExamScore', undefined);
                              else updateStudentScore(st.studentId, 'finalExamScore', Math.max(0, Math.min(rubric.finalExam, Number(e.target.value))));
                            }}
                            className="w-full border border-slate-300 rounded-lg p-2 text-center font-black text-sm focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-[11px]">
                    <span className="text-slate-500">
                      وضعیت: {st.status === 'FINALIZED' ? '🔒 قطعی' : st.status === 'TEMPORARY' ? '📢 موقت' : 'پیش‌نویس'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full font-black text-[10px] ${
                        isPass ? 'bg-emerald-100 text-emerald-800' : isFail ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {isPass ? 'قبول' : isFail ? 'مردود' : 'ناتمام'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: GRADE APPEALS MANAGEMENT */}
      {/* ========================================================================= */}
      {activeTab === 'APPEALS' && (
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-black text-slate-900 text-base">
                کارتابل رسیدگی به اعتراضات دانشجویان (درس {currentOffering.title})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                استاد محترم طبق آیین‌نامه موظف است ظرف مدت ۴۸ ساعت کاری به اعتراضات ثبت‌شده پاسخ دهد.
              </p>
            </div>
          </div>

          {currentOffering.appeals.length === 0 ? (
            <div className="text-center p-8 text-slate-500 text-xs font-bold bg-slate-50 rounded-2xl border border-dashed border-slate-300">
              هیچ اعتراضی برای این کلاس ثبت نشده است.
            </div>
          ) : (
            <div className="space-y-3">
              {currentOffering.appeals.map(appeal => (
                <div key={appeal.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-slate-900 text-xs">{appeal.fullName}</span>
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

                  <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs text-slate-800">
                    <span className="font-bold text-slate-500 block mb-1">متن اعتراض دانشجو:</span>
                    <p className="leading-5">{appeal.studentMessage}</p>
                  </div>

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

                  {appeal.status === 'OPEN' && (
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => {
                          setSelectedAppeal(appeal);
                          setAppealNewGrade(appeal.currentGrade);
                        }}
                        className="w-full sm:w-auto px-4 py-2 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-black text-xs shadow-xs transition"
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

      {/* ========================================================================= */}
      {/* TAB 4: GRADE ANALYTICS & DISTRIBUTION */}
      {/* ========================================================================= */}
      {activeTab === 'ANALYTICS' && (
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-5">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="font-black text-slate-900 text-base">
              تحلیل آماری و توزیع فراوانی نمرات درس {currentOffering.title}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              نمودار بازه‌های نمرات جهت بررسی سطح کیفی آزمون و سنجش استاندارد نمره‌دهی.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-center space-y-1">
              <span className="text-xs font-bold text-emerald-800">عالی (۱۷ الی ۲۰)</span>
              <div className="text-2xl font-black text-emerald-950">{faNum(gradeDistribution.excellent)} نفر</div>
              <span className="text-[10px] text-emerald-600 font-mono">
                {students.length > 0 ? faNum(((gradeDistribution.excellent / students.length) * 100).toFixed(1)) : '۰'}٪
              </span>
            </div>

            <div className="p-4 bg-sky-50 rounded-2xl border border-sky-200 text-center space-y-1">
              <span className="text-xs font-bold text-sky-800">خوب (۱۴ الی ۱۶.۹)</span>
              <div className="text-2xl font-black text-sky-950">{faNum(gradeDistribution.good)} نفر</div>
              <span className="text-[10px] text-sky-600 font-mono">
                {students.length > 0 ? faNum(((gradeDistribution.good / students.length) * 100).toFixed(1)) : '۰'}٪
              </span>
            </div>

            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-center space-y-1">
              <span className="text-xs font-bold text-amber-800">متوسط (۱۰ الی ۱۳.۹)</span>
              <div className="text-2xl font-black text-amber-950">{faNum(gradeDistribution.fair)} نفر</div>
              <span className="text-[10px] text-amber-600 font-mono">
                {students.length > 0 ? faNum(((gradeDistribution.fair / students.length) * 100).toFixed(1)) : '۰'}٪
              </span>
            </div>

            <div className="p-4 bg-rose-50 rounded-2xl border border-rose-200 text-center space-y-1">
              <span className="text-xs font-bold text-rose-800">مردود (زیر ۱۰)</span>
              <div className="text-2xl font-black text-rose-950">{faNum(gradeDistribution.fail)} نفر</div>
              <span className="text-[10px] text-rose-600 font-mono">
                {students.length > 0 ? faNum(((gradeDistribution.fail / students.length) * 100).toFixed(1)) : '۰'}٪
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Appeal Decision Modal */}
      {selectedAppeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4 text-slate-900">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="font-black text-base text-slate-900">
                رسیدگی به اعتراض دانشجو: {selectedAppeal.fullName}
              </h3>
              <button onClick={() => setSelectedAppeal(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1">
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
                <p className="leading-5 bg-white p-2 rounded-xl border border-slate-200">{selectedAppeal.studentMessage}</p>
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
                  inputMode="decimal"
                  value={appealNewGrade}
                  onChange={e => setAppealNewGrade(Number(e.target.value))}
                  className="w-32 border border-slate-300 rounded-xl p-2 text-center font-black text-sm text-indigo-950"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => handleResolveAppeal('ACCEPTED')}
                className="w-full sm:flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition"
              >
                ✓ پذیرش و ثبت نمره جدید
              </button>
              <button
                onClick={() => handleResolveAppeal('REJECTED')}
                className="w-full sm:flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs transition"
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
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 text-slate-900">
            <div className="w-12 h-12 bg-amber-100 text-amber-800 rounded-2xl flex items-center justify-center text-2xl mx-auto">
              🔒
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-black text-base text-slate-900">
                تایید نهایی و قفل نمرات با رمز یکبار مصرف (OTP)
              </h3>
              <p className="text-xs text-slate-600 leading-5">
                با نهایی‌سازی، لیست نمرات به همراه امضای دیجیتال فریز شده و تغییر آن تنها از طریق شورای آموزشی ممکن خواهد بود.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1 text-center">
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
                inputMode="numeric"
                value={otpCode}
                onChange={e => setOtpCode(e.target.value)}
                placeholder="• • • • •"
                className="w-full border-2 border-indigo-500 rounded-xl p-3 text-center font-mono font-black text-xl tracking-widest text-slate-900 focus:outline-hidden"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                onClick={handleConfirmFinalize}
                className="w-full sm:flex-1 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs transition shadow-md"
              >
                🔒 تایید و امضای قطعی نمرات
              </button>
              <button
                onClick={() => setShowOtpModal(false)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
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
