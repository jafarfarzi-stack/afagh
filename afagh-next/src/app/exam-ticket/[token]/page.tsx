import React from 'react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface ExamTicketVerification {
  token: string;
  studentName: string;
  studentCode: string;
  nationalIdMasked: string;
  majorName: string;
  termTitle: string;
  isFinancialCleared: boolean;
  exams: {
    courseTitle: string;
    courseCode: string;
    examDate: string;
    examTime: string;
    hallName: string;
    seatNumber: number;
    professorName: string;
    attendanceStatus: 'PRESENT' | 'ABSENT' | 'NOT_STARTED';
  }[];
}

const sampleTickets: Record<string, ExamTicketVerification> = {
  '8F2A-99B': {
    token: '8F2A-99B',
    studentName: 'امیرحسین رضایی',
    studentCode: '401123401',
    nationalIdMasked: '۰۰۲******۹',
    majorName: 'مهندسی کامپیوتر',
    termTitle: 'نیمسال اول ۱۴۰۵–۱۴۰۶',
    isFinancialCleared: true,
    exams: [
      {
        courseTitle: 'ریاضی عمومی ۱',
        courseCode: '۱۱۱۲۱۰۱',
        examDate: '۱۴۰۵/۱۰/۱۸',
        examTime: '۰۸:۳۰ الی ۱۰:۳۰ (سانس ۱)',
        hallName: 'آمفی‌تئاتر مرکزی',
        seatNumber: 1,
        professorName: 'دکتر جمیل احمدی',
        attendanceStatus: 'PRESENT',
      },
      {
        courseTitle: 'مبانی برنامه‌نویسی',
        courseCode: '۱۱۱۲۱۰۳',
        examDate: '۱۴۰۵/۱۰/۲۲',
        examTime: '۱۱:۰۰ الی ۱۳:۰۰ (سانس ۲)',
        hallName: 'سایت کامپیوتر ۱۰۲',
        seatNumber: 301,
        professorName: 'دکتر سارا رضایی',
        attendanceStatus: 'NOT_STARTED',
      },
    ],
  },
};

const faNum = (n: any) =>
  n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

export default async function ExamTicketGatePage({
  params,
}: {
  params: { token: string };
}) {
  const token = decodeURIComponent(params.token).toUpperCase().trim();
  const ticket = sampleTickets[token] || {
    token,
    studentName: 'دانشجوی رسمی دانشگاه آفاق',
    studentCode: '401123402',
    nationalIdMasked: '۲۷۵******۳',
    majorName: 'مهندسی صنایع',
    termTitle: 'نیمسال اول ۱۴۰۵–۱۴۰۶',
    isFinancialCleared: true,
    exams: [
      {
        courseTitle: 'آمار و احتمالات مهندسی',
        courseCode: '۱۱۱۲۱۰۵',
        examDate: '۱۴۰۵/۱۰/۲۰',
        examTime: '۰۸:۳۰ الی ۱۰:۳۰',
        hallName: 'سالن شماره ۳ امتحانات',
        seatNumber: 45,
        professorName: 'دکتر علیرضا کریمی',
        attendanceStatus: 'NOT_STARTED' as const,
      },
    ],
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col items-center justify-center p-4" dir="rtl">
      <div className="bg-slate-900 border border-indigo-900/60 p-6 rounded-3xl max-w-lg w-full shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center font-black text-white text-base">
              آ
            </div>
            <div>
              <h1 className="font-black text-sm text-white">گیت ورود به حوزه امتحانات دانشگاه آفاق</h1>
              <p className="text-[11px] text-indigo-300">استعلام برخط کارت ورود به جلسه</p>
            </div>
          </div>

          <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-950 text-emerald-300 border border-emerald-600/50">
            ✓ تسویه مالی قطعی
          </span>
        </div>

        {/* Student Info */}
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">نام دانشجو:</span>
            <span className="font-black text-white">{ticket.studentName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">شماره دانشجویی:</span>
            <span className="font-mono font-bold text-amber-300" dir="ltr">
              {ticket.studentCode}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">رشته تحصیلی:</span>
            <span className="text-slate-200">{ticket.majorName}</span>
          </div>
        </div>

        {/* Exams Timetable & Real-time Seating */}
        <div className="space-y-3 text-xs">
          <h2 className="font-bold text-slate-300">📋 دروس امتحانی و صندلی‌های تخصیص‌یافته:</h2>
          {ticket.exams.map((ex, i) => (
            <div
              key={i}
              className="p-3.5 bg-slate-950 rounded-2xl border border-indigo-900/40 space-y-2 hover:border-indigo-600 transition"
            >
              <div className="flex items-center justify-between">
                <span className="font-black text-white text-sm">{ex.courseTitle}</span>
                <span className="px-2.5 py-0.5 rounded-lg bg-indigo-900 text-indigo-200 font-mono font-bold text-[11px]">
                  صندلی: {faNum(ex.seatNumber)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                <div>📅 تاریخ: {faNum(ex.examDate)}</div>
                <div>⏱️ ساعت: {faNum(ex.examTime)}</div>
                <div>🏛️ سالن: {ex.hallName}</div>
                <div>👨‍🏫 مدرس: {ex.professorName}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Proctor Action */}
        <div className="pt-2">
          <Link
            href="/proctor"
            className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs block text-center shadow-lg transition"
          >
            ورود به سامانه حضور و غیاب مراقبین سالن ←
          </Link>
        </div>
      </div>
    </div>
  );
}
