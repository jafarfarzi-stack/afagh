'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export interface EnrolledStudentAttendance {
  studentId: number;
  studentCode: string;
  fullName: string;
  avatarUrl?: string;
  totalPriorAbsents: number;
  status: 'PRESENT' | 'ABSENT' | 'EXCUSED' | 'LATE';
  lateMinutes?: number;
  note?: string;
}

export interface AttendanceCourseOffering {
  id: number;
  code: string;
  title: string;
  groupNumber: number;
  units: number;
  roomName: string;
  scheduleTime: string;
  students: EnrolledStudentAttendance[];
}

interface Props {
  professor: {
    id: number;
    name: string;
    staffCode: string;
  };
  termTitle: string;
  initialOfferings: AttendanceCourseOffering[];
  defaultOfferingId?: number;
}

const faNum = (n: any) => (n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]));

export default function ProfessorAttendanceClient({
  professor,
  termTitle,
  initialOfferings,
  defaultOfferingId,
}: Props) {
  const [offerings, setOfferings] = useState<AttendanceCourseOffering[]>(initialOfferings);
  const [selectedOfferingId, setSelectedOfferingId] = useState<number>(
    defaultOfferingId && initialOfferings.some(o => o.id === defaultOfferingId)
      ? defaultOfferingId
      : initialOfferings[0]?.id || 101
  );

  const [sessionNo, setSessionNo] = useState<number>(7);
  const [sessionDate, setSessionDate] = useState<string>('۱۴۰۵/۰۸/۱۲');
  const [sessionTopic, setSessionTopic] = useState<string>('پیاده‌سازی الگوریتم زمان‌بندی پردازنده‌ها و مدیریت بن‌بست (Deadlock)');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState<boolean>(false);

  const currentOffering = offerings.find(o => o.id === selectedOfferingId) || offerings[0];
  const students = currentOffering?.students || [];

  // Statistics
  const totalStudents = students.length;
  const presentCount = students.filter(s => s.status === 'PRESENT' || s.status === 'LATE').length;
  const absentCount = students.filter(s => s.status === 'ABSENT').length;
  const excusedCount = students.filter(s => s.status === 'EXCUSED').length;
  const attendanceRate = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

  const setStudentStatus = (studentId: number, status: 'PRESENT' | 'ABSENT' | 'EXCUSED' | 'LATE') => {
    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId) return off;
        return {
          ...off,
          students: off.students.map(st => {
            if (st.studentId !== studentId) return st;
            return {
              ...st,
              status,
              lateMinutes: status === 'LATE' ? (st.lateMinutes || 15) : undefined,
            };
          }),
        };
      })
    );
    setIsSaved(false);
  };

  const setStudentLateMinutes = (studentId: number, mins: number) => {
    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId) return off;
        return {
          ...off,
          students: off.students.map(st => (st.studentId === studentId ? { ...st, lateMinutes: mins } : st)),
        };
      })
    );
    setIsSaved(false);
  };

  const setStudentNote = (studentId: number, note: string) => {
    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId) return off;
        return {
          ...off,
          students: off.students.map(st => (st.studentId === studentId ? { ...st, note } : st)),
        };
      })
    );
    setIsSaved(false);
  };

  const markAll = (status: 'PRESENT' | 'ABSENT') => {
    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId) return off;
        return {
          ...off,
          students: off.students.map(st => ({
            ...st,
            status,
            lateMinutes: undefined,
          })),
        };
      })
    );
    setIsSaved(false);
    setToastMessage(status === 'PRESENT' ? 'همه دانشجویان حاضر ثبت شدند.' : 'وضعیت دانشجویان ریست شد.');
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSave = () => {
    setIsSaved(true);
    setToastMessage(`✅ لیست حضور و غیاب جلسه شماره ${faNum(sessionNo)} درس «${currentOffering.title}» با موفقیت در سامانه دانشگاه ثبت گردید.`);
    setTimeout(() => setToastMessage(null), 6000);
  };

  return (
    <div className="space-y-5" dir="rtl">
      
      {/* Toast */}
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
                سامانه هوشمند آموزش
              </span>
              <span className="text-xs text-indigo-200">{termTitle}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              📋 ثبت و مدیریت حضور و غیاب کلاسی دانشجویان
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
              href="/professor/grades"
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow transition"
            >
              📝 بارم‌بندی و نمرات
            </Link>
          </div>
        </div>

        {/* Controls: Select Course, Session & Date */}
        <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/15 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="text-indigo-200 font-bold block mb-1">انتخاب کلاس و درس:</label>
            <select
              value={selectedOfferingId}
              onChange={e => setSelectedOfferingId(Number(e.target.value))}
              className="w-full bg-slate-900/90 text-white border border-indigo-400/50 rounded-lg px-3 py-2 font-bold"
            >
              {offerings.map(o => (
                <option key={o.id} value={o.id}>
                  {o.title} (گروه {faNum(o.groupNumber)} — کد {o.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-indigo-200 font-bold block mb-1">شماره جلسه آموزشی:</label>
            <select
              value={sessionNo}
              onChange={e => setSessionNo(Number(e.target.value))}
              className="w-full bg-slate-900/90 text-white border border-indigo-400/50 rounded-lg px-3 py-2 font-bold"
            >
              {Array.from({ length: 16 }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>
                  جلسه {faNum(n)} از ۱۶ جلسه ترم
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-indigo-200 font-bold block mb-1">تاریخ برگزاری جلسه:</label>
            <input
              type="text"
              value={sessionDate}
              onChange={e => setSessionDate(e.target.value)}
              className="w-full bg-slate-900/90 text-white border border-indigo-400/50 rounded-lg px-3 py-2 font-bold"
            />
          </div>
        </div>
      </div>

      {/* Session Details & Topic Card */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-950 font-extrabold text-xs">
              🏛️ {currentOffering.roomName}
            </span>
            <span className="text-xs text-slate-600 font-bold">
              ⏰ {currentOffering.scheduleTime}
            </span>
            <span className="text-xs text-slate-600 font-bold">
              📚 {faNum(currentOffering.units)} واحد
            </span>
          </div>

          {/* Quick Bulk Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => markAll('PRESENT')}
              className="px-3 py-1.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-xs transition flex items-center gap-1"
            >
              <span>🟢 ثبت حضور همگی</span>
            </button>
            <button
              onClick={() => markAll('ABSENT')}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
            >
              بازنشانی
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1">
            موضوع و سرفصل تدریس شده در این جلسه:
          </label>
          <input
            type="text"
            value={sessionTopic}
            onChange={e => setSessionTopic(e.target.value)}
            placeholder="مثال: فصل چهارم - مدیریت حافظه و الگوریتم‌های جایگزینی صفحه..."
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Real-time Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-extrabold text-lg">
            👥
          </div>
          <div>
            <div className="text-xs text-slate-500 font-bold">کل دانشجویان کلاس</div>
            <div className="text-lg font-black text-slate-900">{faNum(totalStudents)} نفر</div>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-extrabold text-lg">
            ✓
          </div>
          <div>
            <div className="text-xs text-slate-500 font-bold">حاضرین در جلسه</div>
            <div className="text-lg font-black text-emerald-700">{faNum(presentCount)} نفر ({faNum(attendanceRate)}٪)</div>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-extrabold text-lg">
            ✕
          </div>
          <div>
            <div className="text-xs text-slate-500 font-bold">غایبین غیرموجه</div>
            <div className="text-lg font-black text-rose-700">{faNum(absentCount)} نفر</div>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-extrabold text-lg">
            ⏳
          </div>
          <div>
            <div className="text-xs text-slate-500 font-bold">غیبت‌های موجه</div>
            <div className="text-lg font-black text-amber-700">{faNum(excusedCount)} نفر</div>
          </div>
        </div>
      </div>

      {/* Student Attendance List */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div>
            <h3 className="font-extrabold text-slate-900 text-base">
              فهرست دانشجویان و ثبت وضعیت حضور جلسه {faNum(sessionNo)}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              ماده ۳/۱۶ آیین‌نامه: غیبت بیش از ۳ جلسه منجر به حذف خودکار درس خواهد شد.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-extrabold text-xs shadow transition flex items-center gap-1.5"
            >
              <span>💾 ثبت و تایید نهایی حضور و غیاب</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-white text-center">
                <th className="p-3 border border-slate-800 w-12 font-extrabold">ردیف</th>
                <th className="p-3 border border-slate-800 font-extrabold">شماره دانشجویی</th>
                <th className="p-3 border border-slate-800 font-extrabold">نام و نام خانوادگی دانشجو</th>
                <th className="p-3 border border-slate-800 font-extrabold">جمع غیبت قبلی</th>
                <th className="p-3 border border-slate-800 font-extrabold min-w-[280px]">وضعیت حضور در جلسه</th>
                <th className="p-3 border border-slate-800 font-extrabold">یادداشت کلاسی</th>
              </tr>
            </thead>
            <tbody>
              {students.map((st, idx) => {
                const totalWithCurrent = st.totalPriorAbsents + (st.status === 'ABSENT' ? 1 : 0);
                const isWarning = totalWithCurrent >= 3;

                return (
                  <tr key={st.studentId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="p-3 border border-slate-200 text-center font-bold text-slate-500">
                      {faNum(idx + 1)}
                    </td>
                    <td className="p-3 border border-slate-200 font-mono text-center font-bold text-indigo-950">
                      {faNum(st.studentCode)}
                    </td>
                    <td className="p-3 border border-slate-200 font-extrabold text-slate-900">
                      <div className="flex items-center justify-between">
                        <span>{st.fullName}</span>
                        {isWarning && (
                          <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px] border border-rose-300">
                            ⚠️ خطر حذف (ماده ۳/۱۶)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 border border-slate-200 text-center font-bold">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${st.totalPriorAbsents > 2 ? 'bg-rose-100 text-rose-900 font-extrabold' : 'bg-slate-100 text-slate-800'}`}>
                        {faNum(st.totalPriorAbsents)} جلسه
                      </span>
                    </td>
                    <td className="p-2 border border-slate-200">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setStudentStatus(st.studentId, 'PRESENT')}
                          className={`px-2.5 py-1.5 rounded-xl font-bold text-[11px] transition ${
                            st.status === 'PRESENT'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          🟢 حاضر
                        </button>
                        <button
                          type="button"
                          onClick={() => setStudentStatus(st.studentId, 'ABSENT')}
                          className={`px-2.5 py-1.5 rounded-xl font-bold text-[11px] transition ${
                            st.status === 'ABSENT'
                              ? 'bg-rose-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          🔴 غایب
                        </button>
                        <button
                          type="button"
                          onClick={() => setStudentStatus(st.studentId, 'EXCUSED')}
                          className={`px-2.5 py-1.5 rounded-xl font-bold text-[11px] transition ${
                            st.status === 'EXCUSED'
                              ? 'bg-amber-500 text-slate-950 shadow-xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          🟡 موجه
                        </button>
                        <button
                          type="button"
                          onClick={() => setStudentStatus(st.studentId, 'LATE')}
                          className={`px-2.5 py-1.5 rounded-xl font-bold text-[11px] transition ${
                            st.status === 'LATE'
                              ? 'bg-sky-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          🔵 تاخیر
                        </button>

                        {st.status === 'LATE' && (
                          <div className="flex items-center gap-1 mr-1">
                            <input
                              type="number"
                              min={1}
                              max={60}
                              value={st.lateMinutes || 15}
                              onChange={e => setStudentLateMinutes(st.studentId, Number(e.target.value))}
                              className="w-12 border border-slate-300 rounded-lg p-1 text-center font-bold text-xs"
                            />
                            <span className="text-[10px] text-slate-500">دقیقه</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-2 border border-slate-200">
                      <input
                        type="text"
                        value={st.note || ''}
                        onChange={e => setStudentNote(st.studentId, e.target.value)}
                        placeholder="ثبت توضیح (اختیاری)..."
                        className="w-full border border-slate-300 rounded-lg p-1.5 text-xs text-slate-800"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Submit Bottom Bar */}
        <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-600 font-bold">
            در صورت تایید نهایی، پیامک عدم حضور برای دانشجویان غایب ارسال خواهد گردید.
          </div>

          <button
            onClick={handleSave}
            className="px-7 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-extrabold text-xs shadow-lg transition"
          >
            💾 ثبت نهایی جلسه {faNum(sessionNo)} و ارسال به آموزش
          </button>
        </div>
      </div>

    </div>
  );
}
