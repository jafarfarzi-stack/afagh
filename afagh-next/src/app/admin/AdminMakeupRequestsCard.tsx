'use client';

import React, { useState } from 'react';

export interface AdminMakeupRequest {
  id: number;
  professorName: string;
  staffCode: string;
  courseTitle: string;
  courseCode: string;
  groupNumber: number;
  replacedSessionNo: number;
  absenceReason: string;
  sessionDate: string;
  sessionTime: string;
  topic: string;
  status: 'PENDING_ROOM' | 'APPROVED' | 'REJECTED';
  allocatedRoom?: string;
  rejectionReason?: string;
  enrolledStudentsCount: number;
  submittedAt: string;
  approvedAt?: string;
}

const INITIAL_REQUESTS: AdminMakeupRequest[] = [
  {
    id: 101,
    professorName: 'دکتر جمیل احمدی',
    staffCode: '۱۱۰۲',
    courseTitle: 'سیستم‌های عامل',
    courseCode: '۱۱۱۲۳۰۳',
    groupNumber: 1,
    replacedSessionNo: 8,
    absenceReason: 'ماموریت علمی و شرکت در کنفرانس بین‌المللی هوش مصنوعی',
    sessionDate: '۱۴۰۵/۰۹/۰۸',
    sessionTime: '۱۳:۳۰ الی ۱۵:۳۰',
    topic: 'فصل ۸: مدیریت حافظه مجازی و الگوریتم‌های جایگزینی صفحه',
    status: 'PENDING_ROOM',
    enrolledStudentsCount: 38,
    submittedAt: '۱۴۰۵/۰۸/۲۵ - ۱۰:۱۵',
  },
  {
    id: 102,
    professorName: 'دکتر سارا رضایی',
    staffCode: '۱۱۰۵',
    courseTitle: 'پایگاه داده‌ها',
    courseCode: '۱۱۱۲۳۰۲',
    groupNumber: 2,
    replacedSessionNo: 5,
    absenceReason: 'تداخل با جلسه دفاعیه پایان‌نامه کارشناسی ارشد',
    sessionDate: '۱۴۰۵/۰۹/۱۲',
    sessionTime: '۱۰:۰۰ الی ۱۲:۰۰',
    topic: 'فصل ۵: نرمال‌سازی و طراحی پایگاه داده رابطه‌ای (3NF و BCNF)',
    status: 'PENDING_ROOM',
    enrolledStudentsCount: 32,
    submittedAt: '۱۴۰۵/۰۸/۲۶ - ۱۱:۳۰',
  },
  {
    id: 103,
    professorName: 'دکتر علی حسینی',
    staffCode: '۱۱۰۴',
    courseTitle: 'فیزیک عمومی ۱',
    courseCode: '۱۱۱۲۱۰۵',
    groupNumber: 1,
    replacedSessionNo: 3,
    absenceReason: 'مرخصی استعلاجی پزشک',
    sessionDate: '۱۴۰۵/۰۹/۰۵',
    sessionTime: '۰۸:۰۰ الی ۱۰:۰۰',
    topic: 'قوانین نیوتن و دینامیک ذرات',
    status: 'APPROVED',
    allocatedRoom: 'کلاس ۲۰۲ (ساختمان آموزش - ظرفیت ۴۰ نفر)',
    enrolledStudentsCount: 35,
    submittedAt: '۱۴۰۵/۰۸/۲۰ - ۰۹:۰۰',
    approvedAt: '۱۴۰۵/۰۸/۲۱ - ۱۲:۳۰',
  },
];

const AVAILABLE_EMPTY_ROOMS = [
  'کلاس ۳۰۴ (ساختمان آموزش - ظرفیت ۴۵ نفر)',
  'کلاس ۲۰۲ (ساختمان آموزش - ظرفیت ۴۰ نفر)',
  'کلاس ۳۰۱ (ساختمان ابن‌سینا - ظرفیت ۵۰ نفر)',
  'سایت تخصصی کامپیوتر ۱۰۲ (دانشکده فنی - ظرفیت ۳۲ نفر)',
  'آزمایشگاه نرم‌افزار ۱ (مجتمع آزمایشگاه‌ها - ظرفیت ۲۸ نفر)',
  'آمفی‌تئاتر مرکزی (ساختمان اداری - ظرفیت ۱۲۰ نفر)',
];

export default function AdminMakeupRequestsCard() {
  const [requests, setRequests] = useState<AdminMakeupRequest[]>(INITIAL_REQUESTS);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [selectedRooms, setSelectedRooms] = useState<Record<number, string>>({
    101: AVAILABLE_EMPTY_ROOMS[0],
    102: AVAILABLE_EMPTY_ROOMS[3],
  });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectionText, setRejectionText] = useState<string>('');

  const handleApprove = (reqId: number) => {
    const req = requests.find(r => r.id === reqId);
    if (!req) return;
    const room = selectedRooms[reqId] || AVAILABLE_EMPTY_ROOMS[0];

    setRequests(prev =>
      prev.map(r =>
        r.id === reqId
          ? {
              ...r,
              status: 'APPROVED',
              allocatedRoom: room,
              approvedAt: 'هم‌اکنون',
            }
          : r
      )
    );

    setToastMessage(
      `✓ درخواست جلسه جبرانی درس «${req.courseTitle}» تایید و کلاس «${room}» تخصیص داده شد. پیامک و اعلان برای استاد (${req.professorName}) و ${req.enrolledStudentsCount} دانشجوی کلاس ارسال گردید.`
    );
    setTimeout(() => setToastMessage(null), 8000);
  };

  const handleReject = (reqId: number) => {
    const req = requests.find(r => r.id === reqId);
    if (!req) return;

    setRequests(prev =>
      prev.map(r =>
        r.id === reqId
          ? {
              ...r,
              status: 'REJECTED',
              rejectionReason: rejectionText || 'عدم امکان برگزاری در تاریخ/ساعت درخواستی با توجه به تقویم آموزشی',
            }
          : r
      )
    );

    setRejectingId(null);
    setRejectionText('');
    setToastMessage(
      `✕ درخواست جلسه جبرانی درس «${req.courseTitle}» رد شد و به استاد (${req.professorName}) اطلاع داده شد.`
    );
    setTimeout(() => setToastMessage(null), 8000);
  };

  const filtered = requests.filter(r => {
    if (filter === 'PENDING') return r.status === 'PENDING_ROOM';
    if (filter === 'APPROVED') return r.status === 'APPROVED';
    if (filter === 'REJECTED') return r.status === 'REJECTED';
    return true;
  });

  const pendingCount = requests.filter(r => r.status === 'PENDING_ROOM').length;

  return (
    <div className="card space-y-4 border-l-4 border-l-indigo-600 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-xl shadow-xs">
            🏛️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-extrabold text-slate-800 text-sm sm:text-base">
                کارتابل درخواست‌های کلاس جبرانی اساتید (تخصیص سالن و تایید آموزش)
              </h2>
              {pendingCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-500 text-white animate-pulse">
                  {pendingCount} نیازمند بررسی
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              درخواست‌های ارجاع‌شده از اساتید جهت بررسی تداخل، تخصیص کلاس خالی دانشگاه و ابلاغ رسمی به دانشجویان
            </p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg transition ${
              filter === 'ALL' ? 'bg-white text-indigo-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            همه ({requests.length})
          </button>
          <button
            onClick={() => setFilter('PENDING')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
              filter === 'PENDING' ? 'bg-amber-500 text-white shadow-xs' : 'text-amber-800 hover:bg-amber-100/60'
            }`}
          >
            <span>⏳ در انتظار تخصیص</span>
            <span className="px-1.5 py-0.2 rounded-full bg-amber-700/40 text-[10px]">{pendingCount}</span>
          </button>
          <button
            onClick={() => setFilter('APPROVED')}
            className={`px-3 py-1.5 rounded-lg transition ${
              filter === 'APPROVED' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-800 hover:bg-emerald-100/60'
            }`}
          >
            ✓ تایید و ابلاغ‌شده ({requests.filter(r => r.status === 'APPROVED').length})
          </button>
          <button
            onClick={() => setFilter('REJECTED')}
            className={`px-3 py-1.5 rounded-lg transition ${
              filter === 'REJECTED' ? 'bg-rose-600 text-white shadow-xs' : 'text-rose-800 hover:bg-rose-100/60'
            }`}
          >
            ✕ رده‌شده ({requests.filter(r => r.status === 'REJECTED').length})
          </button>
        </div>
      </div>

      {/* Toast Alert */}
      {toastMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center justify-between animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <span className="text-base">📢</span>
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-emerald-700 hover:text-emerald-950 text-sm font-black">
            ✕
          </button>
        </div>
      )}

      {/* Request Cards List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs">
            درخواستی با وضعیت انتخابی در کارتابل موجود نیست.
          </div>
        ) : (
          filtered.map(req => {
            const isPending = req.status === 'PENDING_ROOM';
            const isApproved = req.status === 'APPROVED';
            const isRejected = req.status === 'REJECTED';

            return (
              <div
                key={req.id}
                className={`p-4 rounded-2xl border transition-all ${
                  isPending
                    ? 'bg-amber-50/40 border-amber-200 shadow-xs'
                    : isApproved
                    ? 'bg-emerald-50/30 border-emerald-200'
                    : 'bg-rose-50/30 border-rose-200'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  {/* Left: Info */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-slate-900 text-sm">
                        {req.courseTitle} (گروه {req.groupNumber})
                      </span>
                      <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        کد: {req.courseCode}
                      </span>
                      <span className="text-xs font-extrabold text-indigo-900 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full">
                        استاد: {req.professorName} ({req.staffCode})
                      </span>
                      <span
                        className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold ${
                          isPending
                            ? 'bg-amber-200 text-amber-900 border border-amber-300'
                            : isApproved
                            ? 'bg-emerald-200 text-emerald-900 border border-emerald-300'
                            : 'bg-rose-200 text-rose-900 border border-rose-300'
                        }`}
                      >
                        {isPending ? '⏳ نیازمند تخصیص کلاس آموزش' : isApproved ? '✓ تایید و ابلاغ رسمی شده' : '✕ رد شده'}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span>
                        <strong className="text-slate-800">جلسه جبران‌شده:</strong> جلسه {req.replacedSessionNo}
                      </span>
                      <span>
                        <strong className="text-slate-800">علت غیبت:</strong> {req.absenceReason}
                      </span>
                      <span>
                        <strong className="text-slate-800">زمان پیشنهادی:</strong> {req.sessionDate} ساعت {req.sessionTime}
                      </span>
                      <span>
                        <strong className="text-slate-800">تعداد دانشجویان:</strong> {req.enrolledStudentsCount} نفر
                      </span>
                    </div>

                    {req.topic && (
                      <p className="text-xs text-slate-700 bg-white/80 p-2 rounded-lg border border-slate-200 inline-block">
                        <strong>سرفصل مبحث:</strong> {req.topic}
                      </p>
                    )}

                    {isApproved && (
                      <div className="p-2.5 bg-emerald-100/80 border border-emerald-300 rounded-xl text-xs text-emerald-900 font-bold flex flex-wrap items-center justify-between gap-2">
                        <span>🏛️ کلاس تخصیص‌یافته: <strong>{req.allocatedRoom}</strong></span>
                        <span className="text-[11px] text-emerald-800">✓ پیامک زمان و سالن برای استاد و {req.enrolledStudentsCount} دانشجو ارسال شد ({req.approvedAt})</span>
                      </div>
                    )}

                    {isRejected && (
                      <div className="p-2 bg-rose-100/80 border border-rose-300 rounded-xl text-xs text-rose-900 font-bold">
                        <span>دلیل عدم تایید: {req.rejectionReason}</span>
                      </div>
                    )}
                  </div>

                  {/* Right: Education Action Controls */}
                  {isPending && (
                    <div className="bg-white p-3 rounded-xl border border-amber-200 shadow-xs flex flex-col gap-2 min-w-[280px]">
                      <label className="text-[11px] font-bold text-slate-700">
                        🏢 انتخاب کلاس خالی دانشگاه در این سانس:
                      </label>
                      <select
                        value={selectedRooms[req.id] || AVAILABLE_EMPTY_ROOMS[0]}
                        onChange={e => setSelectedRooms({ ...selectedRooms, [req.id]: e.target.value })}
                        className="text-xs border border-slate-300 rounded-lg p-2 font-bold text-slate-800 bg-slate-50 focus:bg-white"
                      >
                        {AVAILABLE_EMPTY_ROOMS.map((rm, idx) => (
                          <option key={idx} value={rm}>
                            🟢 {rm}
                          </option>
                        ))}
                      </select>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => handleApprove(req.id)}
                          className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-xs transition flex items-center justify-center gap-1"
                        >
                          <span>✓ تایید و تخصیص کلاس</span>
                        </button>
                        <button
                          onClick={() => {
                            setRejectingId(req.id);
                            setRejectionText('');
                          }}
                          className="py-2 px-3 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-xs transition"
                        >
                          رد
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Reject Reason Box */}
                {rejectingId === req.id && (
                  <div className="mt-3 p-3 bg-rose-50 rounded-xl border border-rose-300 space-y-2 animate-in fade-in">
                    <label className="text-xs font-bold text-rose-900 block">
                      دلیل رد درخواست جبرانی (جهت اطلاع استاد):
                    </label>
                    <input
                      type="text"
                      value={rejectionText}
                      onChange={e => setRejectionText(e.target.value)}
                      placeholder="مثلاً: تداخل با آزمون‌های هماهنگ دانشگاه در این تاریخ..."
                      className="w-full text-xs border border-rose-300 rounded-lg p-2 bg-white font-bold"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setRejectingId(null)}
                        className="px-3 py-1 rounded bg-slate-200 text-slate-700 text-xs font-bold"
                      >
                        انصراف
                      </button>
                      <button
                        onClick={() => handleReject(req.id)}
                        className="px-4 py-1 rounded bg-rose-700 hover:bg-rose-800 text-white text-xs font-extrabold shadow-xs"
                      >
                        ثبت رد درخواست
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
