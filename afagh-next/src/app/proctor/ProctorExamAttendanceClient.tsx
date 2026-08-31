'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';

// ==========================================
// INTERFACES & TYPES
// ==========================================

export type StudentExamStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'VIOLATION' | 'PENDING';

export interface CoursePacketInfo {
  courseCode: string;
  courseTitle: string;
  professorName: string;
  expectedSheets: number;
  actualSheets?: number;
  status: 'PENDING' | 'CONFIRMED' | 'DISCREPANCY';
  discrepancyNote?: string;
}

export interface ProctorExamSession {
  id: number;
  hallName: string;
  examDate: string;
  slotLabel: string;
  slotTime: string;
  isTimeWindowOpen: boolean;
  timeWindowMessage: string;
  invigilatorClockInTime?: string;
  handoverStatus: 'IN_PROGRESS' | 'AWAITING_VAULT' | 'FINALIZED_BY_VAULT';
  coursePackets: CoursePacketInfo[];
}

export interface StudentRosterItem {
  id: number;
  seatNumber: number;
  studentName: string;
  studentCode: string;
  nationalCode: string;
  majorTitle: string;
  courseCode: string;
  courseTitle: string;
  isFinancialCleared: boolean;
  hasTemporaryPermit: boolean; // تعهد موقت کتبی به آموزش
  status: StudentExamStatus;
  checkInMethod?: 'QR_SCAN' | 'MANUAL_BY_INVIGILATOR' | 'SYSTEM_EXCUSE';
  verifiedByStaffName?: string;
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

const faNum = (n: any) =>
  n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

// ==========================================
// MOCK MULTI-COURSE SESSIONS
// ==========================================

const INITIAL_SESSIONS: ProctorExamSession[] = [
  {
    id: 1,
    hallName: 'آمفی‌تئاتر مرکزی (سالن تجمیعی ۱)',
    examDate: '۱۴۰۵/۱۰/۱۸',
    slotLabel: 'سانس ۱',
    slotTime: '۰۸:۳۰ الی ۱۰:۳۰',
    isTimeWindowOpen: true,
    timeWindowMessage: 'پنجره زمانی فعال است (۰۸:۰۰ الی ۱۱:۰۰)',
    invigilatorClockInTime: '۰۸:۰۵:۱۴',
    handoverStatus: 'IN_PROGRESS',
    coursePackets: [
      {
        courseCode: '۱۱۱۲۱۰۱',
        courseTitle: 'ریاضی عمومی ۱',
        professorName: 'دکتر جمیل احمدی',
        expectedSheets: 20,
        status: 'PENDING',
      },
      {
        courseCode: '۱۱۱۲۱۰۳',
        courseTitle: 'مبانی برنامه‌نویسی',
        professorName: 'دکتر سارا رضایی',
        expectedSheets: 15,
        status: 'PENDING',
      },
      {
        courseCode: '۱۱۱۲۱۰۹',
        courseTitle: 'زبان تخصصی مهندسی',
        professorName: 'دکتر علیرضا قنبری',
        expectedSheets: 10,
        status: 'PENDING',
      },
    ],
  },
  {
    id: 2,
    hallName: 'سایت تخصصی کامپیوتر ۱۰۲',
    examDate: '۱۴۰۵/۱۰/۲۲',
    slotLabel: 'سانس ۲',
    slotTime: '۱۱:۰۰ الی ۱۳:۰۰',
    isTimeWindowOpen: false,
    timeWindowMessage: 'دسترسی در تاریخ ۱۴۰۵/۱۰/۲۲ ساعت ۱۰:۳۰ باز خواهد شد',
    handoverStatus: 'IN_PROGRESS',
    coursePackets: [
      {
        courseCode: '۱۱۱۲۲۰۲',
        courseTitle: 'پایگاه داده‌ها',
        professorName: 'مهندس سامان افشار',
        expectedSheets: 25,
        status: 'PENDING',
      },
    ],
  },
];

const INITIAL_ROSTER: StudentRosterItem[] = [
  {
    id: 1,
    seatNumber: 1,
    studentName: 'علی رضایی اصل',
    studentCode: '31412001',
    nationalCode: '۰۰۱۲۳۴۵۶۷۸',
    majorTitle: 'مهندسی کامپیوتر',
    courseCode: '۱۱۱۲۱۰۱',
    courseTitle: 'ریاضی عمومی ۱',
    isFinancialCleared: true,
    hasTemporaryPermit: false,
    status: 'PRESENT',
    checkInMethod: 'QR_SCAN',
    scannedAt: '۰۸:۱۵',
    qrPayload: 'AFAGH-EXAM-31412001-SEAT-01-MATH1',
  },
  {
    id: 2,
    seatNumber: 2,
    studentName: 'زهرا موسوی کیا',
    studentCode: '31412002',
    nationalCode: '۰۰۲۳۴۵۶۷۸۹',
    majorTitle: 'مهندسی کامپیوتر',
    courseCode: '۱۱۱۲۱۰۱',
    courseTitle: 'ریاضی عمومی ۱',
    isFinancialCleared: true,
    hasTemporaryPermit: false,
    status: 'PRESENT',
    checkInMethod: 'QR_SCAN',
    scannedAt: '۰۸:۱۸',
    qrPayload: 'AFAGH-EXAM-31412002-SEAT-02-MATH1',
  },
  {
    id: 3,
    seatNumber: 3,
    studentName: 'محمدحسین حسینی',
    studentCode: '31412003',
    nationalCode: '۰۰۳۴۵۶۷۸۹۰',
    majorTitle: 'مهندسی کامپیوتر',
    courseCode: '۱۱۱۲۱۰۱',
    courseTitle: 'ریاضی عمومی ۱',
    isFinancialCleared: false,
    hasTemporaryPermit: true, // ورود با تعهد موقت
    status: 'PENDING',
    qrPayload: 'AFAGH-EXAM-31412003-SEAT-03-MATH1',
  },
  {
    id: 4,
    seatNumber: 21,
    studentName: 'سینا پاشایی',
    studentCode: '31412021',
    nationalCode: '۲۷۴۸۹۱۲۳۴۰',
    majorTitle: 'مهندسی فناوری اطلاعات',
    courseCode: '۱۱۱۲۱۰۳',
    courseTitle: 'مبانی برنامه‌نویسی',
    isFinancialCleared: true,
    hasTemporaryPermit: false,
    status: 'PRESENT',
    checkInMethod: 'QR_SCAN',
    scannedAt: '۰۸:۲۲',
    qrPayload: 'AFAGH-EXAM-31412021-SEAT-21-PROG1',
  },
  {
    id: 5,
    seatNumber: 22,
    studentName: 'یلدا ابراهیمی',
    studentCode: '31412022',
    nationalCode: '۰۰۴۵۶۷۸۹۰۱',
    majorTitle: 'مهندسی کامپیوتر',
    courseCode: '۱۱۱۲۱۰۳',
    courseTitle: 'مبانی برنامه‌نویسی',
    isFinancialCleared: true,
    hasTemporaryPermit: false,
    status: 'PENDING',
    qrPayload: 'AFAGH-EXAM-31412022-SEAT-22-PROG1',
  },
  {
    id: 6,
    seatNumber: 36,
    studentName: 'کیان سلطانی',
    studentCode: '31412036',
    nationalCode: '۰۰۵۶۷۸۹۰۱۲',
    majorTitle: 'مهندسی صنایع',
    courseCode: '۱۱۱۲۱۰۹',
    courseTitle: 'زبان تخصصی مهندسی',
    isFinancialCleared: true,
    hasTemporaryPermit: false,
    status: 'PRESENT',
    checkInMethod: 'QR_SCAN',
    scannedAt: '۰۸:۲۵',
    qrPayload: 'AFAGH-EXAM-31412036-SEAT-36-LANG',
  },
];

export default function ProctorExamAttendanceClient({ user }: Props) {
  const [sessions, setSessions] = useState<ProctorExamSession[]>(INITIAL_SESSIONS);
  const [selectedSessionId, setSelectedSessionId] = useState<number>(1);
  const [roster, setRoster] = useState<StudentRosterItem[]>(INITIAL_ROSTER);

  const [activeTab, setActiveTab] = useState<'SCANNER' | 'ROSTER' | 'VAULT_HANDOVER'>('SCANNER');
  const [filterCourseCode, setFilterCourseCode] = useState<string>('ALL');
  const [searchStudentQuery, setSearchStudentQuery] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Manual Check-in / Violation Modal States
  const [selectedStudentForManual, setSelectedStudentForManual] = useState<StudentRosterItem | null>(null);
  const [violationStudent, setViolationStudent] = useState<StudentRosterItem | null>(null);
  const [violationType, setViolationType] = useState('همراه داشتن یادداشت یا تلفن همراه');
  const [violationNote, setViolationNote] = useState('');

  // Vault Manager Handover Sheet Counts Input
  const [vaultSheetsInput, setVaultSheetsInput] = useState<Record<string, number>>({});
  const [vaultDiscrepancyReason, setVaultDiscrepancyReason] = useState<string>('');

  const currentSession = sessions.find(s => s.id === selectedSessionId) || sessions[0];

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 5000);
  };

  // Auto Clock-In for Invigilator
  const handleInvigilatorClockIn = () => {
    const nowStr = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setSessions(prev =>
      prev.map(s => (s.id === selectedSessionId ? { ...s, invigilatorClockInTime: nowStr } : s))
    );
    showToast(`🟢 اعلام حضور مراقب (${user.name}) با موفقیت در ساعت ${nowStr} ثبت و به سامانه حقوق و دستمزد ابلاغ شد.`);
  };

  // Instant QR Scan Simulation
  const handleSimulateQrScan = (studentId: number) => {
    const timeNow = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    setRoster(prev =>
      prev.map(st =>
        st.id === studentId
          ? {
              ...st,
              status: 'PRESENT',
              checkInMethod: 'QR_SCAN',
              scannedAt: timeNow,
              verifiedByStaffName: user.name,
            }
          : st
      )
    );
    showToast(`✓ حضور دانشجو با اسکن QR Code در ساعت ${timeNow} ثبت شد.`);
  };

  // Manual Check-in (for Students with Temporary Permits or No Card)
  const handleConfirmManualCheckIn = (st: StudentRosterItem) => {
    const timeNow = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    setRoster(prev =>
      prev.map(item =>
        item.id === st.id
          ? {
              ...item,
              status: 'PRESENT',
              checkInMethod: 'MANUAL_BY_INVIGILATOR',
              scannedAt: timeNow,
              verifiedByStaffName: user.name,
            }
          : item
      )
    );
    setSelectedStudentForManual(null);
    showToast(`✓ حضور دستی دانشجو «${st.studentName}» (${st.hasTemporaryPermit ? 'با مجوز تعهد آموزش' : 'تایید مراقب'}) ثبت شد.`);
  };

  // Record Violation (ثبت صورت‌جلسه تخلف)
  const handleRecordViolation = () => {
    if (!violationStudent) return;
    setRoster(prev =>
      prev.map(item =>
        item.id === violationStudent.id
          ? {
              ...item,
              status: 'VIOLATION',
              violationType,
              violationNote,
              verifiedByStaffName: user.name,
            }
          : item
      )
    );
    setViolationStudent(null);
    setViolationNote('');
    showToast(`🚨 صورت‌جلسه تخلف انضباطی برای دانشجو «${violationStudent.studentName}» ثبت و ضمیمه آزمون شد.`);
  };

  // Submit Exam Session to Vault
  const handleInitiateVaultHandover = () => {
    setSessions(prev =>
      prev.map(s => (s.id === selectedSessionId ? { ...s, handoverStatus: 'AWAITING_VAULT' } : s))
    );
    setActiveTab('VAULT_HANDOVER');
    showToast('🔒 جلسه آزمون قفل شد. لطفاً برگه‌های امتحانی را به تفکیک بسته درسی به مسئول مخزن تحویل دهید.');
  };

  // Vault Manager Confirms Receipt
  const handleConfirmVaultPacket = (courseCode: string, expected: number) => {
    const actual = vaultSheetsInput[courseCode] ?? expected;
    const isMatched = actual === expected;

    setSessions(prev =>
      prev.map(s => {
        if (s.id !== selectedSessionId) return s;
        const updatedPackets = s.coursePackets.map(p => {
          if (p.courseCode !== courseCode) return p;
          return {
            ...p,
            actualSheets: actual,
            status: isMatched ? ('CONFIRMED' as const) : ('DISCREPANCY' as const),
            discrepancyNote: isMatched ? undefined : `کسری برگه: ${expected - actual} برگه مفقود/مغایرت`,
          };
        });

        const allConfirmed = updatedPackets.every(p => p.status === 'CONFIRMED');

        return {
          ...s,
          coursePackets: updatedPackets,
          handoverStatus: allConfirmed ? 'FINALIZED_BY_VAULT' : 'AWAITING_VAULT',
        };
      })
    );

    if (isMatched) {
      showToast(`🟢 بسته درسی ${courseCode} (${expected} برگه) با موفقیت در مخزن تحویل و مهروموم شد.`);
    } else {
      showToast(`🔴 هشدار مغایرت در بسته ${courseCode}! تحویل ${actual} از ${expected} برگه. پرونده در وضعیت قرنطینه قرار گرفت.`);
    }
  };

  const filteredRoster = roster.filter(st => {
    if (filterCourseCode !== 'ALL' && st.courseCode !== filterCourseCode) return false;
    if (searchStudentQuery.trim()) {
      const q = searchStudentQuery.trim().toLowerCase();
      return (
        st.studentName.toLowerCase().includes(q) ||
        st.studentCode.includes(q) ||
        String(st.seatNumber).includes(q)
      );
    }
    return true;
  });

  const stats = useMemo(() => {
    const total = roster.length;
    const present = roster.filter(s => s.status === 'PRESENT').length;
    const pending = roster.filter(s => s.status === 'PENDING').length;
    const violations = roster.filter(s => s.status === 'VIOLATION').length;
    return { total, present, pending, violations };
  }, [roster]);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-4 bg-emerald-950 text-emerald-100 rounded-2xl shadow-xl border border-emerald-600 font-bold text-sm flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <span>📢</span>
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-white/60 hover:text-white text-xs">
            ✕
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-l from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 shadow-xl border border-indigo-700/50 space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-400 text-slate-950">
                اپلیکیشن اختصاصی مراقبین و گیت امتحانات (PWA)
              </span>
              <span className="text-xs text-indigo-200">
                مراقب حاضر: <b className="text-white">{user.name}</b>
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black">
              📋 مدیریت هوشمند حضور و غیاب سالن امتحانات و زنجیره تحویل مخزن
            </h1>
            <p className="text-xs text-indigo-300 mt-1">
              اسکن زنده بارکد کارت ورود به جلسه · ثبت حضور دستی با تعهد آموزش · تحویل بسته‌های درسی به مخزن
            </p>
          </div>

          {/* Time Fence & Clock-in Indicator */}
          <div className="flex flex-wrap items-center gap-3">
            {currentSession.invigilatorClockInTime ? (
              <div className="p-3 bg-emerald-950/80 border border-emerald-500/60 rounded-2xl text-emerald-300 font-mono text-xs font-bold shadow-inner flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>حضور مراقب ثبت شد: {faNum(currentSession.invigilatorClockInTime)}</span>
              </div>
            ) : (
              <button
                onClick={handleInvigilatorClockIn}
                disabled={!currentSession.isTimeWindowOpen}
                className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-lg shadow-emerald-700/30 transition flex items-center gap-2 disabled:opacity-50"
              >
                <span>🟢 اعلام حضور و باز کردن سالن امتحان</span>
              </button>
            )}
          </div>
        </div>

        {/* Exam Session Selector */}
        <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/15 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs items-center">
          <div className="sm:col-span-2">
            <label className="text-indigo-200 font-bold block mb-1">سالن و حوزه امتحانی انتخابی:</label>
            <select
              value={selectedSessionId}
              onChange={e => setSelectedSessionId(Number(e.target.value))}
              className="w-full bg-slate-900 text-white border border-indigo-400/50 rounded-xl px-3 py-2 font-bold"
            >
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.hallName} ({s.examDate} — {s.slotLabel}: {faNum(s.slotTime)})
                </option>
              ))}
            </select>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-indigo-200 font-bold block">وضعیت پنجره زمانی:</span>
            <span
              className={`font-bold inline-block mt-1 ${
                currentSession.isTimeWindowOpen ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              {currentSession.timeWindowMessage}
            </span>
          </div>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs text-slate-500 font-bold">کل داوطلبان سالن</span>
          <div className="text-2xl font-black text-indigo-950 font-mono">{faNum(stats.total)} نفر</div>
          <span className="text-[10px] text-slate-400">۳ بسته درسی تجمیعی</span>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs text-slate-500 font-bold">حاضران تاییدشده</span>
          <div className="text-2xl font-black text-emerald-700 font-mono">{faNum(stats.present)} نفر</div>
          <span className="text-[10px] text-emerald-600 font-bold">اسکن QR و دستی</span>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs text-slate-500 font-bold">در انتظار ورود / غایب</span>
          <div className="text-2xl font-black text-amber-600 font-mono">{faNum(stats.pending)} نفر</div>
          <span className="text-[10px] text-amber-700 font-bold">صندلی خالی</span>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs text-slate-500 font-bold">تخلفات انضباطی</span>
          <div className="text-2xl font-black text-rose-700 font-mono">{faNum(stats.violations)} مورد</div>
          <span className="text-[10px] text-rose-600 font-bold">دارای صورت‌جلسه</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 pb-2 gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('SCANNER')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 ${
              activeTab === 'SCANNER'
                ? 'bg-indigo-900 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>📷 اسکنر بارکد QR و حضور سریع</span>
          </button>

          <button
            onClick={() => setActiveTab('ROSTER')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 ${
              activeTab === 'ROSTER'
                ? 'bg-indigo-900 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>🗺️ نقشه صندلی‌ها و ثبت دستی</span>
            <span className="px-1.5 py-0.2 rounded-full bg-indigo-500/30 text-[10px]">{faNum(roster.length)}</span>
          </button>

          <button
            onClick={() => setActiveTab('VAULT_HANDOVER')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 ${
              activeTab === 'VAULT_HANDOVER'
                ? 'bg-indigo-900 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>🔒 تحویل بسته‌های درسی به مخزن</span>
            {currentSession.handoverStatus === 'FINALIZED_BY_VAULT' && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                ✓ تایید کامل مخزن
              </span>
            )}
          </button>
        </div>

        {/* Finish Exam Button */}
        {currentSession.handoverStatus === 'IN_PROGRESS' && (
          <button
            onClick={handleInitiateVaultHandover}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 text-white font-black text-xs shadow-md transition flex items-center gap-1.5"
          >
            <span>🔒 پایان زمان آزمون و قفل لیست برای تحویل به مخزن</span>
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: FAST SCANNER VIEW */}
      {/* ========================================================================= */}
      {activeTab === 'SCANNER' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-black text-slate-900 text-base">اسکنر دوربین مراقبین (تایید آنی ورود)</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                با قرار دادن بارکد کارت دانشجو در کادر دوربین، حضور دانشجو ثبت و عکس پرسنلی جهت تطبیق چهره نمایش داده می‌شود.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            {/* Camera Viewfinder */}
            <div className="bg-slate-950 rounded-3xl p-6 border-2 border-indigo-600/50 shadow-2xl flex flex-col items-center justify-center space-y-3 min-h-[260px] relative overflow-hidden">
              <div className="absolute inset-x-12 top-1/2 h-0.5 bg-emerald-400 shadow-[0_0_12px_#34d399] animate-pulse"></div>
              <div className="w-20 h-20 rounded-2xl bg-indigo-900/60 border border-indigo-500/50 flex items-center justify-center text-4xl shadow-inner">
                📷
              </div>
              <span className="text-xs font-bold text-slate-300">دوربین فعال است · اسکن بارکد QR داوطلب</span>
            </div>

            {/* Simulated Live Scan Queue */}
            <div className="space-y-3">
              <h4 className="font-black text-xs text-slate-800">تست شبیه‌سازی اسکن داوطلبان حاضر در سالن:</h4>
              <div className="space-y-2">
                {roster.map(st => (
                  <div
                    key={st.id}
                    className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between text-xs hover:bg-slate-100 transition"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-indigo-900 text-white font-mono font-bold text-xs flex items-center justify-center">
                          {faNum(st.seatNumber)}
                        </span>
                        <span className="font-black text-slate-900">{st.studentName}</span>
                        {st.hasTemporaryPermit && (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px]">
                            مجوز تعهد موقت
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500">
                        درس: {st.courseTitle} ({st.courseCode})
                      </p>
                    </div>

                    <div>
                      {st.status === 'PRESENT' ? (
                        <span className="px-3 py-1 rounded-xl bg-emerald-100 text-emerald-800 font-black text-xs">
                          ✓ حاضر ({faNum(st.scannedAt)})
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSimulateQrScan(st.id)}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-xs transition"
                        >
                          اسکن بارکد 📷
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: SEAT MAP & MANUAL ATTENDANCE ROSTER */}
      {/* ========================================================================= */}
      {activeTab === 'ROSTER' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-black text-slate-900 text-base">لیست داوطلبان و ثبت حضور دستی</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                امکان ثبت حضور دستی برای دانشجویانی که کارت به همراه ندارند اما تعهد موقت آموزش دارند.
              </p>
            </div>

            {/* Filter by Course Packet */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterCourseCode}
                onChange={e => setFilterCourseCode(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800"
              >
                <option value="ALL">همه بسته‌های درسی سالن</option>
                {currentSession.coursePackets.map(p => (
                  <option key={p.courseCode} value={p.courseCode}>
                    بسته: {p.courseTitle} ({p.courseCode})
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="جستجوی نام یا صندلی..."
                value={searchStudentQuery}
                onChange={e => setSearchStudentQuery(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white text-right">
                  <th className="p-3 text-center">شماره صندلی</th>
                  <th className="p-3">نام و نام‌خانوادگی</th>
                  <th className="p-3">شماره دانشجویی</th>
                  <th className="p-3">عنوان درس امتحانی</th>
                  <th className="p-3">وضعیت مجوز ورود</th>
                  <th className="p-3 text-center">نحوه ثبت حضور</th>
                  <th className="p-3 text-left">عملیات مراقب</th>
                </tr>
              </thead>
              <tbody>
                {filteredRoster.map(st => (
                  <tr key={st.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td className="p-3 text-center">
                      <span className="w-8 h-8 rounded-xl bg-indigo-950 text-amber-300 font-mono font-black text-sm inline-flex items-center justify-center">
                        {faNum(st.seatNumber)}
                      </span>
                    </td>
                    <td className="p-3 font-black text-slate-900">{st.studentName}</td>
                    <td className="p-3 font-mono text-slate-600" dir="ltr">
                      {st.studentCode}
                    </td>
                    <td className="p-3 font-bold text-indigo-950">
                      {st.courseTitle}{' '}
                      <span className="text-[10px] text-slate-400 font-mono">({st.courseCode})</span>
                    </td>
                    <td className="p-3">
                      {st.isFinancialCleared ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                          ✓ تسویه قطعی
                        </span>
                      ) : st.hasTemporaryPermit ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold text-[10px]">
                          ⚠️ دارای تعهد موقت آموزش
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px]">
                          ⛔ فاقد مجوز
                        </span>
                      )}
                    </td>

                    <td className="p-3 text-center">
                      {st.status === 'PRESENT' ? (
                        <span className="px-2.5 py-1 rounded-xl bg-emerald-100 text-emerald-800 font-black text-[11px] block">
                          ✓ حاضر ({st.checkInMethod === 'QR_SCAN' ? 'اسکن QR' : 'دستی توسط مراقب'})
                        </span>
                      ) : st.status === 'VIOLATION' ? (
                        <span className="px-2.5 py-1 rounded-xl bg-rose-100 text-rose-800 font-black text-[11px] block">
                          🚨 تخلف انضباطی
                        </span>
                      ) : (
                        <span className="text-slate-400 font-bold">صندلی خالی (غایب)</span>
                      )}
                    </td>

                    <td className="p-3 text-left">
                      <div className="flex items-center justify-end gap-1.5">
                        {st.status === 'PENDING' && (
                          <button
                            onClick={() => setSelectedStudentForManual(st)}
                            className="px-3 py-1.5 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-bold text-xs transition"
                          >
                            ثبت حضور دستی
                          </button>
                        )}

                        <button
                          onClick={() => setViolationStudent(st)}
                          className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] transition"
                        >
                          ثبت تخلف 🚨
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
      {/* TAB 3: CHAIN OF CUSTODY - COURSE PACKETS HANDOVER TO VAULT */}
      {/* ========================================================================= */}
      {activeTab === 'VAULT_HANDOVER' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-black text-slate-900 text-base">
                زنجیره تحویل برگه‌های امتحانی به مسئول مخزن (Chain of Custody)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                تحویل فیزیکی برگه‌ها به تفکیک بسته‌های درسی و تسویه حق‌الزحمه مراقبت پس از تایید کامل مخزن.
              </p>
            </div>

            {currentSession.handoverStatus === 'FINALIZED_BY_VAULT' ? (
              <span className="px-4 py-2 rounded-2xl bg-emerald-600 text-white font-black text-xs shadow-md">
                ✓ کلیه بسته‌ها با موفقیت تحویل مخزن شد (حق‌الزحمه تایید شد)
              </span>
            ) : (
              <span className="px-4 py-2 rounded-2xl bg-amber-500 text-slate-950 font-black text-xs shadow-md">
                ⏳ در انتظار شمارش و تایید مسئول مخزن
              </span>
            )}
          </div>

          {/* Handover Summary Cards per Course Packet */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {currentSession.coursePackets.map(packet => {
              const isConfirmed = packet.status === 'CONFIRMED';
              const isDiscrepancy = packet.status === 'DISCREPANCY';

              return (
                <div
                  key={packet.courseCode}
                  className={`p-5 rounded-3xl border-2 transition shadow-sm space-y-4 ${
                    isConfirmed
                      ? 'bg-emerald-50/70 border-emerald-400'
                      : isDiscrepancy
                      ? 'bg-rose-50/70 border-rose-400'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-900 text-white">
                      بسته: {packet.courseCode}
                    </span>
                    <span
                      className={`text-xs font-black ${
                        isConfirmed
                          ? 'text-emerald-700'
                          : isDiscrepancy
                          ? 'text-rose-700'
                          : 'text-slate-500'
                      }`}
                    >
                      {isConfirmed ? '🟢 تحویل کامل' : isDiscrepancy ? '🔴 مغایرت' : '⏳ در انتظار'}
                    </span>
                  </div>

                  <div>
                    <h4 className="font-black text-sm text-slate-900">{packet.courseTitle}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">مدرس: {packet.professorName}</p>
                  </div>

                  <div className="bg-white p-3 rounded-2xl border border-slate-200 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">برگه‌های مورد انتظار (حاضرین):</span>
                      <span className="font-mono font-black text-indigo-950 text-sm">
                        {faNum(packet.expectedSheets)} برگه
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <span className="text-slate-500">تعداد شمارش‌شده مخزن:</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={packet.expectedSheets}
                        onChange={e =>
                          setVaultSheetsInput({
                            ...vaultSheetsInput,
                            [packet.courseCode]: Number(e.target.value),
                          })
                        }
                        className="w-16 border border-slate-300 rounded-xl p-1 text-center font-mono font-black text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  {packet.discrepancyNote && (
                    <p className="text-[11px] text-rose-700 font-bold bg-rose-100 p-2 rounded-xl">
                      ⚠️ {packet.discrepancyNote}
                    </p>
                  )}

                  <button
                    onClick={() => handleConfirmVaultPacket(packet.courseCode, packet.expectedSheets)}
                    className={`w-full py-2.5 rounded-xl font-black text-xs transition shadow-xs ${
                      isConfirmed
                        ? 'bg-emerald-700 text-white'
                        : 'bg-indigo-900 hover:bg-indigo-950 text-white'
                    }`}
                  >
                    {isConfirmed ? '✓ بسته تایید و مهروموم شد' : 'ثبت و تایید تحویل بسته 📥'}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Vault Handshake QR Code Display */}
          <div className="bg-slate-950 text-white p-6 rounded-3xl border border-indigo-900/60 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-center sm:text-right">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-800 text-indigo-200">
                بارکد دیجیتال دست‌دادن (Handshake QR Code)
              </span>
              <h4 className="text-base font-black">تحویل نهایی جلسه آزمون به مخزن مرکزی قرنطینه</h4>
              <p className="text-xs text-slate-400 leading-5 max-w-lg">
                مسئول محترم مخزن با اسکن این بارکد روی گوشی مراقب، صورت‌جلسه فیزیکی را تایید نموده و فرآیند تسویه حق‌الزحمه مراقب فعال می‌شود.
              </p>
            </div>

            <div className="bg-white p-3 rounded-2xl text-slate-900 text-center space-y-1 shadow-lg shrink-0">
              <div className="w-24 h-24 bg-slate-100 rounded-xl flex items-center justify-center font-mono text-[10px] text-slate-500 border border-slate-300">
                [QR-HANDOVER]
              </div>
              <span className="text-[10px] font-mono font-black block" dir="ltr">
                AFQ-VAULT-SESS-01
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Manual Check-In Modal */}
      {selectedStudentForManual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 text-slate-900 animate-scaleUp">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-900 flex items-center justify-center text-2xl mx-auto">
                ✍️
              </div>
              <h3 className="font-black text-base">تایید حضور دستی داوطلب</h3>
              <p className="text-xs text-slate-500">
                ثبت در لاگ بازرسی با شناسه مراقب: <b>{user.name}</b>
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">نام دانشجو:</span>
                <span className="font-black">{selectedStudentForManual.studentName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">شماره صندلی:</span>
                <span className="font-mono font-bold text-indigo-950">{faNum(selectedStudentForManual.seatNumber)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">درس امتحانی:</span>
                <span className="font-bold">{selectedStudentForManual.courseTitle}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200">
                <span className="text-slate-500">وضعیت مجوز:</span>
                <span className="font-bold text-amber-800">
                  {selectedStudentForManual.hasTemporaryPermit
                    ? 'دارای تعهد موقت آموزش ✓'
                    : 'بدون کارت — با تایید هویت مراقب'}
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => handleConfirmManualCheckIn(selectedStudentForManual)}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition shadow-md"
              >
                ✓ تایید و ثبت حضور دستی
              </button>
              <button
                onClick={() => setSelectedStudentForManual(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Violation Modal */}
      {violationStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 text-slate-900 animate-scaleUp">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center text-2xl mx-auto">
                🚨
              </div>
              <h3 className="font-black text-base text-rose-700">ثبت صورت‌جلسه تخلف امتحانی</h3>
              <p className="text-xs text-slate-500">
                دانشجو: <b>{violationStudent.studentName}</b> (صندلی {faNum(violationStudent.seatNumber)})
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">نوع تخلف کشف‌شده:</label>
                <select
                  value={violationType}
                  onChange={e => setViolationType(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900"
                >
                  <option value="همراه داشتن یادداشت یا تلفن همراه">همراه داشتن یادداشت، کتابچه یا تلفن همراه</option>
                  <option value="رد و بدل کردن ورقه یا صحبت با داوطلب مجاور">رد و بدل کردن ورقه یا صحبت با داوطلب مجاور</option>
                  <option value="نگاه به برگه دیگران">نگاه به برگه دیگران</option>
                  <option value="جعل هویت و شرکت به جای داوطلب اصلی">جعل هویت و شرکت به جای داوطلب اصلی</option>
                  <option value="اخلال در نظم جلسه آزمون">اخلال در نظم جلسه آزمون</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">مشاهدات و توضیحات مراقب:</label>
                <textarea
                  rows={3}
                  value={violationNote}
                  onChange={e => setViolationNote(e.target.value)}
                  placeholder="نحوه کشف تخلف و ضمائم ضبط‌شده را شرح دهید..."
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-bold focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleRecordViolation}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs transition shadow-md"
              >
                🚨 ثبت قطعی صورت‌جلسه تخلف
              </button>
              <button
                onClick={() => setViolationStudent(null)}
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
