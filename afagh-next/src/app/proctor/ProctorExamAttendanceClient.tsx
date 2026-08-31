'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';

// ==========================================
// INTERFACES & TYPES
// ==========================================

export type StudentExamStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'VIOLATION' | 'PENDING';

export interface ProctorExamSession {
  id: number;
  courseTitle: string;
  courseCode: string;
  groupNumber: number;
  examDate: string; // e.g. "1405/10/18"
  slotLabel: string; // e.g. "سانس ۱"
  slotTime: string;  // e.g. "۰۸:۳۰ الی ۱۰:۳۰"
  hallName: string;  // e.g. "آمفی‌تئاتر مرکزی"
  startSeat: number; // e.g. 1
  endSeat: number;   // e.g. 60
  totalStudents: number;
  professorName: string;
}

export interface StudentRosterItem {
  id: number;
  seatNumber: number;
  studentName: string;
  studentCode: string;
  nationalCode: string;
  majorTitle: string;
  isFinancialCleared: boolean;
  status: StudentExamStatus;
  scannedAt?: string;
  violationNote?: string;
  violationType?: string;
  qrPayload: string;
}

interface Props {
  user: {
    id: number;
    name: string;
    roles: string[];
  };
}

// ==========================================
// MOCK EXAM SESSIONS
// ==========================================

const ASSIGNED_EXAM_SESSIONS: ProctorExamSession[] = [
  {
    id: 1,
    courseTitle: 'ریاضی عمومی ۱',
    courseCode: '۱۱۱۲۱۰۱',
    groupNumber: 1,
    examDate: '۱۴۰۵/۱۰/۱۸',
    slotLabel: 'سانس ۱',
    slotTime: '۰۸:۳۰ الی ۱۰:۳۰',
    hallName: 'آمفی‌تئاتر مرکزی',
    startSeat: 1,
    endSeat: 60,
    totalStudents: 38,
    professorName: 'دکتر جمیل احمدی',
  },
  {
    id: 2,
    courseTitle: 'مبانی برنامه‌نویسی',
    courseCode: '۱۱۱۲۱۰۳',
    groupNumber: 1,
    examDate: '۱۴۰۵/۱۰/۲۲',
    slotLabel: 'سانس ۲',
    slotTime: '۱۱:۰۰ الی ۱۳:۰۰',
    hallName: 'سایت تخصصی کامپیوتر ۱۰۲',
    startSeat: 301,
    endSeat: 325,
    totalStudents: 25,
    professorName: 'دکتر سارا رضایی',
  },
  {
    id: 3,
    courseTitle: 'فیزیک عمومی ۱',
    courseCode: '۱۱۱۲۱۰۵',
    groupNumber: 1,
    examDate: '۱۴۰۵/۱۰/۲۵',
    slotLabel: 'سانس ۱',
    slotTime: '۰۸:۳۰ الی ۱۰:۳۰',
    hallName: 'سالن امتحانات شماره ۱',
    startSeat: 101,
    endSeat: 140,
    totalStudents: 35,
    professorName: 'دکتر علی حسینی',
  },
];

const INITIAL_STUDENT_ROSTER: StudentRosterItem[] = [
  {
    id: 1,
    seatNumber: 1,
    studentName: 'علی رضایی اصل',
    studentCode: '31412001',
    nationalCode: '0012345678',
    majorTitle: 'مهندسی کامپیوتر',
    isFinancialCleared: true,
    status: 'PRESENT',
    scannedAt: '۰۸:۱۵',
    qrPayload: 'AFAGH-EXAM-31412001-SEAT-01-MATH1',
  },
  {
    id: 2,
    seatNumber: 2,
    studentName: 'زهرا موسوی کیا',
    studentCode: '31412002',
    nationalCode: '0023456789',
    majorTitle: 'مهندسی کامپیوتر',
    isFinancialCleared: true,
    status: 'PRESENT',
    scannedAt: '۰۸:۱۸',
    qrPayload: 'AFAGH-EXAM-31412002-SEAT-02-MATH1',
  },
  {
    id: 3,
    seatNumber: 3,
    studentName: 'محمدحسین حسینی',
    studentCode: '31412003',
    nationalCode: '0034567890',
    majorTitle: 'مهندسی کامپیوتر',
    isFinancialCleared: true,
    status: 'PENDING',
    qrPayload: 'AFAGH-EXAM-31412003-SEAT-03-MATH1',
  },
  {
    id: 4,
    seatNumber: 4,
    studentName: 'فاطمه احمدی‌پور',
    studentCode: '31412004',
    nationalCode: '0045678901',
    majorTitle: 'مهندسی کامپیوتر',
    isFinancialCleared: true,
    status: 'PRESENT',
    scannedAt: '۰۸:۲۲',
    qrPayload: 'AFAGH-EXAM-31412004-SEAT-04-MATH1',
  },
  {
    id: 5,
    seatNumber: 5,
    studentName: 'امیررضا کریمی',
    studentCode: '31412005',
    nationalCode: '0056789012',
    majorTitle: 'مهندسی کامپیوتر',
    isFinancialCleared: true,
    status: 'ABSENT',
    qrPayload: 'AFAGH-EXAM-31412005-SEAT-05-MATH1',
  },
  {
    id: 6,
    seatNumber: 6,
    studentName: 'سارا کاظمی‌نیا',
    studentCode: '31412006',
    nationalCode: '0067890123',
    majorTitle: 'مهندسی کامپیوتر',
    isFinancialCleared: true,
    status: 'LATE',
    scannedAt: '۰۸:۴۰',
    qrPayload: 'AFAGH-EXAM-31412006-SEAT-06-MATH1',
  },
  {
    id: 7,
    seatNumber: 7,
    studentName: 'نیما صادقی راد',
    studentCode: '31412007',
    nationalCode: '0078901234',
    majorTitle: 'مهندسی کامپیوتر',
    isFinancialCleared: true,
    status: 'VIOLATION',
    scannedAt: '۰۸:۲۰',
    violationType: 'همراه داشتن تلفن همراه روشن سر جلسه',
    violationNote: 'تلفن همراه هوشمند در جیب دانشجو در حین آزمون کشف و توسط مراقب ضبط گردید.',
    qrPayload: 'AFAGH-EXAM-31412007-SEAT-07-MATH1',
  },
  {
    id: 8,
    seatNumber: 8,
    studentName: 'مهدی جعفری',
    studentCode: '31412008',
    nationalCode: '0089012345',
    majorTitle: 'مهندسی کامپیوتر',
    isFinancialCleared: true,
    status: 'PENDING',
    qrPayload: 'AFAGH-EXAM-31412008-SEAT-08-MATH1',
  },
  {
    id: 9,
    seatNumber: 9,
    studentName: 'مریم نوری',
    studentCode: '31412009',
    nationalCode: '0090123456',
    majorTitle: 'مهندسی کامپیوتر',
    isFinancialCleared: true,
    status: 'PENDING',
    qrPayload: 'AFAGH-EXAM-31412009-SEAT-09-MATH1',
  },
  {
    id: 10,
    seatNumber: 10,
    studentName: 'حسین عباسی',
    studentCode: '31412010',
    nationalCode: '0101234567',
    majorTitle: 'مهندسی کامپیوتر',
    isFinancialCleared: true,
    status: 'PENDING',
    qrPayload: 'AFAGH-EXAM-31412010-SEAT-10-MATH1',
  },
];

export default function ProctorExamAttendanceClient({ user }: Props) {
  const [selectedSessionId, setSelectedSessionId] = useState<number>(1);
  const [roster, setRoster] = useState<StudentRosterItem[]>(INITIAL_STUDENT_ROSTER);
  const [scanInput, setScanInput] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'SCANNER' | 'SEATING_GRID' | 'ROSTER_TABLE' | 'VIOLATIONS' | 'FINAL_MINUTES'>('SCANNER');
  const [selectedStudentForModal, setSelectedStudentForModal] = useState<StudentRosterItem | null>(null);

  // Violation Modal State
  const [isViolationModalOpen, setIsViolationModalOpen] = useState<boolean>(false);
  const [violationForm, setViolationForm] = useState({
    studentId: 1,
    violationType: 'همراه داشتن تلفن همراه یا ساعت هوشمند',
    violationNote: '',
  });

  // Final Minutes Submission State
  const [isFinalSubmitting, setIsFinalSubmitting] = useState<boolean>(false);
  const [isMinutesSubmitted, setIsMinutesSubmitted] = useState<boolean>(false);
  const [proctorOtp, setProctorOtp] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const currentSession = useMemo(() => {
    return ASSIGNED_EXAM_SESSIONS.find(s => s.id === selectedSessionId) || ASSIGNED_EXAM_SESSIONS[0];
  }, [selectedSessionId]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 6000);
  };

  // ==========================================
  // SCANNER HANDLER
  // ==========================================
  const handleProcessScan = (payload: string) => {
    const clean = payload.trim();
    if (!clean) return;

    // Search by QR payload, studentCode, nationalCode, or seat number
    const matched = roster.find(
      s =>
        s.qrPayload.toLowerCase() === clean.toLowerCase() ||
        s.studentCode === clean ||
        s.nationalCode === clean ||
        String(s.seatNumber) === clean
    );

    if (matched) {
      const nowTime = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
      setRoster(prev =>
        prev.map(s => (s.id === matched.id ? { ...s, status: 'PRESENT', scannedAt: nowTime } : s))
      );
      setSelectedStudentForModal(matched);
      showToast(`🟢 دانشجو «${matched.studentName}» (صندلی شماره ${matched.seatNumber}) با موفقیت احراز هویت و حاضر ثبت شد.`);
      setScanInput('');
    } else {
      showToast(`⚠️ بارکد / داوطلب با کد «${clean}» در این سالن آزمون یافت نشد. لطفاً کارت ورود به جلسه را مجدداً بررسی کنید.`);
    }
  };

  // Manual Status Change
  const handleSetStudentStatus = (studentId: number, status: StudentExamStatus) => {
    const nowTime = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    setRoster(prev =>
      prev.map(s => (s.id === studentId ? { ...s, status, scannedAt: status === 'PRESENT' || status === 'LATE' ? nowTime : s.scannedAt } : s))
    );
    showToast('وضعیت داوطلب با موفقیت به‌روزرسانی شد.');
  };

  // Record Cheating / Violation
  const handleSaveViolation = () => {
    if (!violationForm.violationNote.trim()) {
      showToast('لطفاً شرح و جزییات صورت‌جلسه تخلف را وارد فرمایید.');
      return;
    }
    setRoster(prev =>
      prev.map(s =>
        s.id === violationForm.studentId
          ? {
              ...s,
              status: 'VIOLATION',
              violationType: violationForm.violationType,
              violationNote: violationForm.violationNote,
            }
          : s
      )
    );
    setIsViolationModalOpen(false);
    setViolationForm({ studentId: 1, violationType: 'همراه داشتن تلفن همراه یا ساعت هوشمند', violationNote: '' });
    showToast('🚨 صورت‌جلسه تخلف امتحانی با موفقیت ثبت و ضمیمه گزارش نهایی جلسه شد.');
  };

  // Final Minutes Submission
  const handleSubmitFinalMinutes = () => {
    if (!proctorOtp.trim()) {
      showToast('لطفاً کد تایید یا رمز مراقب را جهت امضای دیجیتال صورت‌جلسه وارد نمایید.');
      return;
    }
    setIsFinalSubmitting(true);
    setTimeout(() => {
      setIsFinalSubmitting(false);
      setIsMinutesSubmitted(true);
      showToast('📜 صورت‌جلسه رسمی حضور و غیاب آزمون با امضای دیجیتال مراقب با موفقیت ثبت و به اداره آموزش و امتحانات دانشگاه ارسال گردید.');
    }, 1200);
  };

  // Live Statistics
  const stats = useMemo(() => {
    const presentCount = roster.filter(s => s.status === 'PRESENT' || s.status === 'LATE').length;
    const absentCount = roster.filter(s => s.status === 'ABSENT').length;
    const violationCount = roster.filter(s => s.status === 'VIOLATION').length;
    const pendingCount = roster.filter(s => s.status === 'PENDING').length;
    const total = roster.length;
    const percentage = total > 0 ? Math.round((presentCount / total) * 100) : 0;
    return { presentCount, absentCount, violationCount, pendingCount, total, percentage };
  }, [roster]);

  return (
    <div className="space-y-4">
      {/* Top Banner & Active Session Selector */}
      <div className="card bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white p-5 rounded-2xl shadow-lg border border-indigo-800/40">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-3xl shadow-inner">
              📷
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-black text-lg sm:text-xl tracking-tight">
                  سامانه هوشمند حضور و غیاب آزمون با بارکدخوان و QR-Code
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500 text-white shadow-xs">
                  برخط و متصل
                </span>
              </div>
              <p className="text-xs text-indigo-200 mt-1">
                احراز هویت بلادرنگ داوطلبان، اسکن کارت آزمون، نقشه صندلی‌ها و صورت‌جلسه دیجیتال
              </p>
            </div>
          </div>

          {/* Session Selector */}
          <div className="bg-white/10 backdrop-blur-md p-2.5 rounded-xl border border-white/20 flex flex-col gap-1 min-w-[300px]">
            <label className="text-[11px] font-bold text-indigo-200">
              جلسه آزمون اختصاص‌یافته به شما:
            </label>
            <select
              value={selectedSessionId}
              onChange={e => setSelectedSessionId(Number(e.target.value))}
              className="bg-slate-900 text-white border border-indigo-400/60 rounded-lg p-2 text-xs font-bold"
            >
              {ASSIGNED_EXAM_SESSIONS.map(s => (
                <option key={s.id} value={s.id}>
                  {s.courseTitle} ({s.slotLabel} - {s.hallName})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Session Details Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-4 mt-4 border-t border-indigo-800/60 text-xs">
          <div className="p-2.5 bg-indigo-900/50 rounded-xl border border-indigo-700/40">
            <span className="text-indigo-300 block text-[10px]">عنوان درس و استاد:</span>
            <strong className="text-white text-xs">{currentSession.courseTitle} ({currentSession.professorName})</strong>
          </div>
          <div className="p-2.5 bg-indigo-900/50 rounded-xl border border-indigo-700/40">
            <span className="text-indigo-300 block text-[10px]">تاریخ و ساعت برگزاری:</span>
            <strong className="text-white text-xs font-mono">{currentSession.examDate} ({currentSession.slotTime})</strong>
          </div>
          <div className="p-2.5 bg-indigo-900/50 rounded-xl border border-indigo-700/40">
            <span className="text-indigo-300 block text-[10px]">حوزه و سالن آزمون:</span>
            <strong className="text-emerald-300 text-xs font-bold">{currentSession.hallName}</strong>
          </div>
          <div className="p-2.5 bg-indigo-900/50 rounded-xl border border-indigo-700/40">
            <span className="text-indigo-300 block text-[10px]">بازه صندلی‌های این حوزه:</span>
            <strong className="text-amber-300 text-xs font-mono">صندلی {currentSession.startSeat} الی {currentSession.endSeat}</strong>
          </div>
          <div className="p-2.5 bg-indigo-900/50 rounded-xl border border-indigo-700/40">
            <span className="text-indigo-300 block text-[10px]">وضعیت حضور داوطلبان:</span>
            <strong className="text-emerald-400 text-xs font-black">{stats.presentCount} از {stats.total} نفر ({stats.percentage}٪)</strong>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toastMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="text-lg">📢</span>
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-emerald-700 font-black">✕</button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 bg-white p-2 rounded-2xl shadow-xs border border-slate-200">
        <button
          onClick={() => setActiveTab('SCANNER')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'SCANNER' ? 'bg-indigo-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>📷 اسکنر زنده QR-Code و احراز هویت</span>
        </button>

        <button
          onClick={() => setActiveTab('SEATING_GRID')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'SEATING_GRID' ? 'bg-indigo-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>🪑 نقشه زنده چیدمان صندلی‌های سالن</span>
        </button>

        <button
          onClick={() => setActiveTab('ROSTER_TABLE')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'ROSTER_TABLE' ? 'bg-indigo-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>📋 لیست حضور و غیاب داوطلبان ({roster.length} نفر)</span>
        </button>

        <button
          onClick={() => setActiveTab('VIOLATIONS')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'VIOLATIONS' ? 'bg-indigo-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>🚨 صورت‌جلسه تخلفات و تقلب</span>
          {stats.violationCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-black">
              {stats.violationCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('FINAL_MINUTES')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'FINAL_MINUTES' ? 'bg-indigo-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>📜 صورت‌جلسه نهایی و امضای دیجیتال</span>
          {isMinutesSubmitted && (
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-500 text-white text-[10px] font-black">
              ✓ امضا شد
            </span>
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: LIVE QR-CODE SCANNER */}
      {/* ========================================================================= */}
      {activeTab === 'SCANNER' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Scanner Viewport Box */}
          <div className="lg:col-span-2 card space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                <h3 className="font-black text-slate-900 text-sm">
                  دوربین اسکنر بارکد کارت آزمون (فعال)
                </h3>
              </div>
              <span className="text-xs text-slate-500 font-bold">
                کارت ورود به جلسه را مقابل دوربین قرار دهید
              </span>
            </div>

            {/* Simulated Live Camera Frame */}
            <div className="relative aspect-video bg-slate-950 rounded-2xl overflow-hidden border-2 border-indigo-500 shadow-inner flex flex-col items-center justify-center p-6 text-white text-center">
              {/* Corner Target Frame */}
              <div className="absolute inset-12 border-2 border-dashed border-emerald-400 rounded-2xl flex items-center justify-center pointer-events-none">
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-bounce"></div>
              </div>

              <div className="relative z-10 space-y-2 bg-slate-900/80 p-4 rounded-xl backdrop-blur-xs border border-white/10">
                <span className="text-4xl">📷</span>
                <p className="font-bold text-xs">اسکنر بارکد و QR-Code هوشمند فعال است</p>
                <p className="text-[11px] text-slate-300">
                  آماده خوانش کارت‌های آزمون دانشجویان رشته {currentSession.courseTitle}
                </p>
              </div>
            </div>

            {/* Manual / Barcode Gun Input */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                ورود با بارکدخوان دستی / شماره دانشجویی / شماره صندلی:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={scanInput}
                  onChange={e => setScanInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleProcessScan(scanInput);
                  }}
                  placeholder="شماره دانشجویی یا بارکد کارت را وارد یا اسکن کنید (مثلاً 31412001 یا صندلی 3)..."
                  className="flex-1 border-2 border-indigo-300 rounded-xl p-2.5 text-xs font-mono font-bold bg-white focus:border-indigo-600"
                />
                <button
                  onClick={() => handleProcessScan(scanInput)}
                  className="px-5 py-2.5 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-extrabold text-xs shadow transition"
                >
                  ✓ بررسی و ثبت
                </button>
              </div>

              {/* Quick Demo Scan Buttons */}
              <div className="pt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-slate-500 text-[11px] font-bold">تست سریع اسکن کارت:</span>
                {roster.slice(0, 5).map(s => (
                  <button
                    key={s.id}
                    onClick={() => handleProcessScan(s.qrPayload)}
                    className="px-2.5 py-1 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-900 font-bold text-[11px] transition"
                  >
                    اسکن کارت {s.studentName.split(' ')[0]} (صندلی {s.seatNumber})
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Last Scanned Student Card Info */}
          <div className="card space-y-4">
            <h3 className="font-black text-slate-900 text-sm border-b border-slate-100 pb-2">
              مشخصات آخرین داوطلب اسکن‌شده
            </h3>

            {selectedStudentForModal ? (
              <div className="space-y-3">
                <div className="p-4 bg-gradient-to-br from-indigo-50 to-emerald-50 rounded-2xl border border-indigo-200 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-indigo-950 text-white flex items-center justify-center font-black text-lg">
                      {selectedStudentForModal.studentName[0]}
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 text-sm">
                        {selectedStudentForModal.studentName}
                      </h4>
                      <p className="text-[11px] font-mono text-slate-600">
                        ش.د: {selectedStudentForModal.studentCode}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-indigo-100">
                    <div className="p-2 bg-white rounded-lg">
                      <span className="text-slate-500 block text-[10px]">شماره صندلی:</span>
                      <strong className="text-indigo-950 text-sm font-black">
                        صندلی {selectedStudentForModal.seatNumber}
                      </strong>
                    </div>
                    <div className="p-2 bg-white rounded-lg">
                      <span className="text-slate-500 block text-[10px]">وضعیت مالی:</span>
                      <strong className="text-emerald-700 font-bold">✓ تسویه تاییدشده</strong>
                    </div>
                  </div>

                  <div className="p-2 bg-emerald-100/80 rounded-xl text-xs text-emerald-900 font-bold flex items-center justify-between">
                    <span>وضعیت در جلسه:</span>
                    <span className="font-black">✓ حاضر (اسکن در {selectedStudentForModal.scannedAt || 'هم‌اکنون'})</span>
                  </div>
                </div>

                {/* Status Toggle Buttons */}
                <div className="space-y-1.5 pt-2">
                  <span className="text-[11px] font-bold text-slate-600 block">تغییر وضعیت یا ثبت گزارش:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleSetStudentStatus(selectedStudentForModal.id, 'PRESENT')}
                      className="py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                    >
                      🟢 حاضر عادی
                    </button>
                    <button
                      onClick={() => handleSetStudentStatus(selectedStudentForModal.id, 'LATE')}
                      className="py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs"
                    >
                      🟡 تاخیر مجاز
                    </button>
                    <button
                      onClick={() => handleSetStudentStatus(selectedStudentForModal.id, 'ABSENT')}
                      className="py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs"
                    >
                      🔴 غایب
                    </button>
                    <button
                      onClick={() => {
                        setViolationForm({
                          studentId: selectedStudentForModal.id,
                          violationType: 'همراه داشتن تلفن همراه یا ساعت هوشمند',
                          violationNote: '',
                        });
                        setIsViolationModalOpen(true);
                      }}
                      className="py-2 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs"
                    >
                      🚨 ثبت تخلف
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs space-y-2">
                <span className="text-3xl block">📇</span>
                <p>هنوز کارتی اسکن نشده است.</p>
                <p className="text-[10px]">با قرار دادن کارت یا اسکن بارکد، هویت دانشجو در اینجا نمایش می‌یابد.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: VISUAL SEATING PLAN GRID */}
      {/* ========================================================================= */}
      {activeTab === 'SEATING_GRID' && (
        <div className="card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-black text-slate-900 text-base">
                نقشه زنده و تصویری چیدمان صندلی‌های {currentSession.hallName}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                نمایش وضعیت صندلی‌های داوطلبان آزمون با قابلیت کلیک برای مشاهده هویت و تغییر وضعیت
              </p>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-emerald-500"></span> حاضر
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-amber-500"></span> تاخیر
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-rose-500"></span> غایب
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-purple-600"></span> تخلف
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-slate-200"></span> در انتظار
              </span>
            </div>
          </div>

          {/* Seat Grid */}
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2.5 pt-2">
            {roster.map(st => {
              const isPresent = st.status === 'PRESENT';
              const isLate = st.status === 'LATE';
              const isAbsent = st.status === 'ABSENT';
              const isViolation = st.status === 'VIOLATION';
              const isPending = st.status === 'PENDING';

              return (
                <div
                  key={st.id}
                  onClick={() => {
                    setSelectedStudentForModal(st);
                    setActiveTab('SCANNER');
                  }}
                  className={`p-2.5 rounded-xl border text-center cursor-pointer transition transform hover:scale-105 shadow-xs ${
                    isPresent
                      ? 'bg-emerald-100 border-emerald-400 text-emerald-950 font-black'
                      : isLate
                      ? 'bg-amber-100 border-amber-400 text-amber-950 font-black'
                      : isAbsent
                      ? 'bg-rose-100 border-rose-400 text-rose-950 font-black'
                      : isViolation
                      ? 'bg-purple-100 border-purple-500 text-purple-950 font-black'
                      : 'bg-slate-100 border-slate-300 text-slate-600'
                  }`}
                  title={`${st.studentName} — صندلی ${st.seatNumber}`}
                >
                  <span className="text-[10px] block font-mono">صندلی</span>
                  <span className="text-base font-black block font-mono">{st.seatNumber}</span>
                  <span className="text-[10px] truncate block max-w-[70px] mx-auto font-bold mt-0.5">
                    {st.studentName.split(' ')[0]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: ROSTER TABLE */}
      {/* ========================================================================= */}
      {activeTab === 'ROSTER_TABLE' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-black text-slate-900 text-base">
                فهرست کامل داوطلبان سالن {currentSession.hallName}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                تعداد کل: {roster.length} نفر · حاضرین: {stats.presentCount} نفر · غایبین: {stats.absentCount} نفر
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="p-2.5 text-center">شماره صندلی</th>
                  <th className="p-2.5">نام و نام خانوادگی</th>
                  <th className="p-2.5">شماره دانشجویی</th>
                  <th className="p-2.5">کد ملی</th>
                  <th className="p-2.5 text-center">وضعیت حضور</th>
                  <th className="p-2.5 text-center">زمان ثبت</th>
                  <th className="p-2.5 text-left">عملیات سریع</th>
                </tr>
              </thead>
              <tbody>
                {roster.map(st => (
                  <tr key={st.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td className="p-2.5 text-center font-mono font-black text-indigo-950 bg-indigo-50/50">
                      {st.seatNumber}
                    </td>
                    <td className="p-2.5 font-bold text-slate-900">{st.studentName}</td>
                    <td className="p-2.5 font-mono text-slate-700" dir="ltr">{st.studentCode}</td>
                    <td className="p-2.5 font-mono text-slate-500" dir="ltr">{st.nationalCode}</td>
                    <td className="p-2.5 text-center">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-black ${
                          st.status === 'PRESENT'
                            ? 'bg-emerald-100 text-emerald-900'
                            : st.status === 'LATE'
                            ? 'bg-amber-100 text-amber-900'
                            : st.status === 'ABSENT'
                            ? 'bg-rose-100 text-rose-900'
                            : st.status === 'VIOLATION'
                            ? 'bg-purple-200 text-purple-900'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {st.status === 'PRESENT'
                          ? '✓ حاضر'
                          : st.status === 'LATE'
                          ? '🟡 تاخیر'
                          : st.status === 'ABSENT'
                          ? '✕ غایب'
                          : st.status === 'VIOLATION'
                          ? '🚨 تخلف'
                          : 'در انتظار'}
                      </span>
                    </td>
                    <td className="p-2.5 text-center font-mono text-slate-500">
                      {st.scannedAt || '—'}
                    </td>
                    <td className="p-2.5 text-left">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => handleSetStudentStatus(st.id, 'PRESENT')}
                          className="px-2 py-1 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-[10px]"
                        >
                          حاضر
                        </button>
                        <button
                          onClick={() => handleSetStudentStatus(st.id, 'ABSENT')}
                          className="px-2 py-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-900 font-bold text-[10px]"
                        >
                          غایب
                        </button>
                        <button
                          onClick={() => {
                            setViolationForm({
                              studentId: st.id,
                              violationType: 'همراه داشتن یادداشت یا کتاب غیرمجاز',
                              violationNote: '',
                            });
                            setIsViolationModalOpen(true);
                          }}
                          className="px-2 py-1 rounded bg-purple-100 hover:bg-purple-200 text-purple-900 font-bold text-[10px]"
                        >
                          تخلف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: VIOLATIONS & CHEATING REPORTS */}
      {/* ========================================================================= */}
      {activeTab === 'VIOLATIONS' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-black text-slate-900 text-base">
                صورت‌جلسات تخلف و تقلب‌های ثبت‌شده در این حوزه
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                گزارش‌های رسمی ارسالی به کمیته انضباطی و شورای آموزشی دانشگاه
              </p>
            </div>
            <button
              onClick={() => setIsViolationModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-xs shadow flex items-center gap-1.5 transition"
            >
              <span>➕ ثبت تخلف امتحانی جدید</span>
            </button>
          </div>

          {roster.filter(s => s.status === 'VIOLATION').length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs">
              هیچ تخلفی در این جلسه آزمون ثبت نشده است. جلسه در کمال نظم در حال برگزاری است.
            </div>
          ) : (
            <div className="space-y-3">
              {roster
                .filter(s => s.status === 'VIOLATION')
                .map(v => (
                  <div key={v.id} className="p-4 bg-purple-50/70 rounded-2xl border border-purple-300 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🚨</span>
                        <h4 className="font-black text-purple-950 text-sm">
                          {v.studentName} (شماره دانشجویی: {v.studentCode} — صندلی {v.seatNumber})
                        </h4>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full bg-purple-200 text-purple-900 font-black text-[10px]">
                        صورت‌جلسه تخلف تنظیم شد
                      </span>
                    </div>

                    <div className="text-purple-900 space-y-1 pt-1">
                      <p><strong>عنوان تخلف:</strong> {v.violationType}</p>
                      <p><strong>شرح و توضیحات مراقب:</strong> {v.violationNote}</p>
                      <p className="text-[11px] text-purple-700">
                        مراقب تنظیم‌کننده: {user.name} · زمان ثبت: {v.scannedAt || 'هم‌اکنون'}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: FINAL MINUTES & DIGITAL SIGNATURE */}
      {/* ========================================================================= */}
      {activeTab === 'FINAL_MINUTES' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-black text-slate-900 text-base">
                صورت‌جلسه رسمی پایانی آزمون و امضای دیجیتال مراقب
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                تایید نهایی آمار حاضرین، غایبین و ارسال به اداره امتحانات دانشگاه
              </p>
            </div>
            {isMinutesSubmitted && (
              <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 font-black text-xs">
                ✓ صورت‌جلسه با موفقیت ارسال شد
              </span>
            )}
          </div>

          <div className="p-5 bg-gradient-to-br from-slate-50 to-indigo-50 rounded-2xl border border-indigo-200 space-y-4 text-xs">
            <div className="text-center space-y-1 border-b border-indigo-200/60 pb-3">
              <h3 className="font-black text-slate-900 text-base">
                دانشگاه جامع آفاق — صورت‌جلسه رسمی برگزاری آزمون پایان‌ترم
              </h3>
              <p className="text-slate-600 font-bold">
                درس: {currentSession.courseTitle} · تاریخ: {currentSession.examDate} · {currentSession.slotLabel} ({currentSession.slotTime}) · حوزه: {currentSession.hallName}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-white rounded-xl border border-slate-200 text-center">
                <span className="text-slate-500 block text-[10px]">کل داوطلبان:</span>
                <strong className="text-slate-900 text-lg">{stats.total} نفر</strong>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
                <span className="text-emerald-700 block text-[10px]">حاضرین در جلسه:</span>
                <strong className="text-emerald-950 text-lg">{stats.presentCount} نفر</strong>
              </div>
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-center">
                <span className="text-rose-700 block text-[10px]">غایبین:</span>
                <strong className="text-rose-950 text-lg">{stats.absentCount} نفر</strong>
              </div>
              <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-center">
                <span className="text-purple-700 block text-[10px]">موارد تخلف:</span>
                <strong className="text-purple-950 text-lg">{stats.violationCount} مورد</strong>
              </div>
            </div>

            {!isMinutesSubmitted ? (
              <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3 pt-2">
                <label className="font-bold text-slate-800 block">
                  امضای الکترونیکی مراقب آزمون ({user.name}):
                </label>
                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <input
                    type="password"
                    value={proctorOtp}
                    onChange={e => setProctorOtp(e.target.value)}
                    placeholder="رمز عبور یا کد تایید مراقب جهت امضای دیجیتال..."
                    className="flex-1 border border-slate-300 rounded-lg p-2 font-bold text-xs"
                  />
                  <button
                    onClick={handleSubmitFinalMinutes}
                    disabled={isFinalSubmitting}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 text-white font-black text-xs shadow transition"
                  >
                    {isFinalSubmitting ? 'در حال ارسال…' : '✓ امضای دیجیتال و ارسال نهایی صورت‌جلسه'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3.5 bg-emerald-100/90 border border-emerald-300 rounded-xl text-emerald-950 font-bold flex items-center justify-between">
                <div>
                  <span>✓ این صورت‌جلسه توسط <strong>{user.name}</strong> در تاریخ {new Date().toLocaleDateString('fa-IR')} ساعت {new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })} به صورت دیجیتال امضا و در سامانه بایگانی امتحانات دانشگاه ثبت گردید.</span>
                </div>
                <span className="text-xs font-mono bg-white px-2.5 py-1 rounded-lg">کد رهگیری: AFG-MIN-8902</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: RECORD VIOLATION */}
      {/* ========================================================================= */}
      {isViolationModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 bg-purple-950 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-sm sm:text-base">🚨 ثبت صورت‌جلسه تخلف و تقلب امتحانی</h3>
              <button onClick={() => setIsViolationModalOpen(false)} className="text-white/60 hover:text-white">✕</button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">انتخاب داوطلب متخلف:</label>
                <select
                  value={violationForm.studentId}
                  onChange={e => setViolationForm({ ...violationForm, studentId: Number(e.target.value) })}
                  className="w-full border border-slate-300 rounded-lg p-2 font-bold bg-white"
                >
                  {roster.map(st => (
                    <option key={st.id} value={st.id}>
                      {st.studentName} (صندلی {st.seatNumber} — ش.د: {st.studentCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">نوع و عنوان تخلف:</label>
                <select
                  value={violationForm.violationType}
                  onChange={e => setViolationForm({ ...violationForm, violationType: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 font-bold bg-white"
                >
                  <option value="همراه داشتن تلفن همراه یا ساعت هوشمند">همراه داشتن تلفن همراه یا ساعت هوشمند</option>
                  <option value="همراه داشتن یادداشت، کتاب یا جزوه غیرمجاز">همراه داشتن یادداشت، کتاب یا جزوه غیرمجاز</option>
                  <option value="رد و بدل کردن پاسخنامه یا ورقه آزمون">رد و بدل کردن پاسخنامه یا ورقه آزمون</option>
                  <option value="نگاه کردن به برگه دیگران / صحبت با داوطلب مجاور">نگاه کردن به برگه دیگران / صحبت با داوطلب مجاور</option>
                  <option value="اخلال در نظم جلسه و عدم توجه به تذکرات مراقب">اخلال در نظم جلسه و عدم توجه به تذکرات مراقب</option>
                  <option value="جعل هویت و شرکت به جای داوطلب اصلی">جعل هویت و شرکت به جای داوطلب اصلی</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">شرح دقیق و مشاهدات مراقب:</label>
                <textarea
                  rows={3}
                  value={violationForm.violationNote}
                  onChange={e => setViolationForm({ ...violationForm, violationNote: e.target.value })}
                  placeholder="جزییات کامل نحوه کشف تخلف، ضبط مدارک و ضمایم را شرح دهید..."
                  className="w-full border border-slate-300 rounded-lg p-2 font-bold bg-white"
                />
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setIsViolationModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs"
              >
                انصراف
              </button>
              <button
                onClick={handleSaveViolation}
                className="px-5 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-xs shadow"
              >
                🚨 ثبت صورت‌جلسه تخلف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
