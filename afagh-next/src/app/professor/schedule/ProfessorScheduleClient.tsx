'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export interface ProfessorScheduleOffering {
  id: number;
  code: string;
  title: string;
  units: number;
  courseType: 'پایه' | 'اصلی' | 'تخصصی' | 'عمومی' | 'عملی';
  groupNumber: number;
  enrolledCount: number;
  capacity: number;
  dayOfWeek: number; // 0: شنبه ... 5: پنج‌شنبه
  dayName: string;
  startTime: string;
  endTime: string;
  roomName: string;
  buildingName: string;
  weekType: 'ALL' | 'EVEN' | 'ODD';
  isCoTaught?: boolean;
  coRole?: 'THEORY' | 'LAB';
  coPartnerName?: string;
}

interface Props {
  professor: {
    id: number;
    name: string;
    staffCode: string;
    academicRank: string;
    contractType: string;
    departmentName: string;
  };
  termTitle: string;
  initialOfferings: ProfessorScheduleOffering[];
}

const faNum = (n: any) => (n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]));

const DAY_NAMES = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه'];

const TIME_SLOTS = [
  { id: 1, label: '۰۸:۰۰ الی ۱۰:۰۰', startTime: '08:00', endTime: '10:00' },
  { id: 2, label: '۱۰:۰۰ الی ۱۲:۰۰', startTime: '10:00', endTime: '12:00' },
  { id: 3, label: '۱۳:۳۰ الی ۱۵:۳۰', startTime: '13:30', endTime: '15:30' },
  { id: 4, label: '۱۵:۳۰ الی ۱۷:۳۰', startTime: '15:30', endTime: '17:30' },
  { id: 5, label: '۱۷:۳۰ الی ۱۹:۳۰', startTime: '17:30', endTime: '19:30' },
];

export default function ProfessorScheduleClient({ professor, termTitle, initialOfferings }: Props) {
  const [offerings] = useState<ProfessorScheduleOffering[]>(initialOfferings);
  const [selectedWeekFilter, setSelectedWeekFilter] = useState<'ALL' | 'EVEN' | 'ODD'>('ALL');

  // KPI Calculations
  const totalUnits = offerings.reduce((s, o) => s + Number(o.units || 0), 0);
  const totalStudents = offerings.reduce((s, o) => s + Number(o.enrolledCount || 0), 0);
  const totalClasses = offerings.length;
  const daysWithClass = new Set(offerings.map(o => o.dayOfWeek)).size;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-5" dir="rtl">
      
      {/* Header Bar */}
      <div className="bg-gradient-to-l from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 shadow-lg border border-indigo-700/50 space-y-4 print:bg-white print:text-black print:border-none print:shadow-none">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-400 text-slate-950 print:border print:border-black">
                برنامه آموزشی مصوب
              </span>
              <span className="text-xs text-indigo-200 print:text-slate-700">{termTitle}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              🗓️ برنامه هفتگی تدریس و زمان‌بندی کلاس‌ها
            </h1>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={handlePrint}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 transition flex items-center gap-1.5"
            >
              <span>🖨️ چاپ برنامه هفتگی</span>
            </button>
            <Link
              href="/professor/attendance"
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow transition"
            >
              📋 ثبت حضور و غیاب
            </Link>
            <Link
              href="/professor/grades"
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow transition"
            >
              📝 بارم‌بندی و ثبت نمرات
            </Link>
          </div>
        </div>

        {/* Professor & Term Info Cards */}
        <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/15 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs print:bg-slate-50 print:border-slate-300 print:text-black">
          <div>
            <span className="text-indigo-200 print:text-slate-600 block mb-0.5">نام استاد:</span>
            <span className="font-extrabold text-white print:text-black">{professor.name}</span>
          </div>
          <div>
            <span className="text-indigo-200 print:text-slate-600 block mb-0.5">کد پرسنلی / مرتبه:</span>
            <span className="font-extrabold text-white print:text-black">{faNum(professor.staffCode)} · {professor.academicRank}</span>
          </div>
          <div>
            <span className="text-indigo-200 print:text-slate-600 block mb-0.5">نوع همکاری / گروه:</span>
            <span className="font-extrabold text-white print:text-black">{professor.contractType} · {professor.departmentName}</span>
          </div>
          <div>
            <span className="text-indigo-200 print:text-slate-600 block mb-0.5">مجموع ساعات و واحدها:</span>
            <span className="font-extrabold text-amber-300 print:text-indigo-900">{faNum(totalUnits)} واحد ({faNum(totalClasses)} گروه درسی)</span>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:hidden">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-extrabold text-lg">
            📚
          </div>
          <div>
            <div className="text-xs text-slate-500 font-bold">تعداد کلاس‌های ترم</div>
            <div className="text-lg font-black text-slate-900">{faNum(totalClasses)} گروه درسی</div>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-extrabold text-lg">
            ⚡
          </div>
          <div>
            <div className="text-xs text-slate-500 font-bold">مجموع واحدهای تدریس</div>
            <div className="text-lg font-black text-slate-900">{faNum(totalUnits)} واحد</div>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-extrabold text-lg">
            👥
          </div>
          <div>
            <div className="text-xs text-slate-500 font-bold">تعداد کل دانشجویان</div>
            <div className="text-lg font-black text-slate-900">{faNum(totalStudents)} دانشجو</div>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-extrabold text-lg">
            📅
          </div>
          <div>
            <div className="text-xs text-slate-500 font-bold">روزهای حضور در هفته</div>
            <div className="text-lg font-black text-slate-900">{faNum(daysWithClass)} روز در هفته</div>
          </div>
        </div>
      </div>

      {/* Filter by Week Type */}
      <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-slate-200 shadow-xs print:hidden">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-600">فیلتر نمایش هفته:</span>
          <button
            onClick={() => setSelectedWeekFilter('ALL')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
              selectedWeekFilter === 'ALL' ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            همه جلسات (زوج و فرد)
          </button>
          <button
            onClick={() => setSelectedWeekFilter('EVEN')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
              selectedWeekFilter === 'EVEN' ? 'bg-cyan-700 text-white' : 'bg-cyan-50 text-cyan-800 hover:bg-cyan-100'
            }`}
          >
            🔷 فقط هفته‌های زوج
          </button>
          <button
            onClick={() => setSelectedWeekFilter('ODD')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
              selectedWeekFilter === 'ODD' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
            }`}
          >
            🔶 فقط هفته‌های فرد
          </button>
        </div>

        <div className="text-xs text-slate-500 font-medium hidden sm:block">
          🏛️ کلاس‌ها در ساختمان دانشکده مهندسی و سالن‌های آزمایشگاهی متمرکز شده‌اند.
        </div>
      </div>

      {/* Weekly Schedule Grid */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div>
            <h3 className="font-extrabold text-slate-900 text-base">
              جدول هفتگی تشکیل کلاس‌های درسی
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              شامل شماره کلاس فیزیکی، ساختمان و تعداد دانشجویان ثبت‌نامی هر گروه
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-white text-center">
                <th className="p-3 border border-slate-800 w-28 font-extrabold">روز هفته</th>
                {TIME_SLOTS.map(slot => (
                  <th key={slot.id} className="p-3 border border-slate-800 font-extrabold">
                    <div>{slot.label}</div>
                    <div className="text-[10px] text-slate-300 font-normal mt-0.5">{slot.startTime} الی {slot.endTime}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAY_NAMES.map((dayName, dayIdx) => {
                const dayOfferings = offerings.filter(o => o.dayOfWeek === dayIdx);

                return (
                  <tr key={dayIdx} className={dayIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="p-3 border border-slate-200 font-extrabold text-center bg-slate-100 text-slate-900">
                      {dayName}
                    </td>

                    {TIME_SLOTS.map(slot => {
                      const matched = dayOfferings.filter(o => {
                        const isTime = o.startTime <= slot.startTime && o.endTime >= slot.endTime;
                        if (!isTime) return false;
                        if (selectedWeekFilter === 'EVEN' && o.weekType === 'ODD') return false;
                        if (selectedWeekFilter === 'ODD' && o.weekType === 'EVEN') return false;
                        return true;
                      });

                      return (
                        <td key={slot.id} className="p-2 border border-slate-200 min-h-[90px] align-top">
                          {matched.length === 0 ? (
                            <div className="h-full min-h-[80px] flex items-center justify-center text-slate-300 text-[10px] font-bold">
                              —
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {matched.map(item => (
                                <div
                                  key={item.id}
                                  className={`p-2.5 rounded-xl border text-right transition shadow-xs ${
                                    item.courseType === 'عملی'
                                      ? 'bg-amber-50 border-amber-300 text-amber-950'
                                      : 'bg-indigo-50 border-indigo-200 text-indigo-950'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1 mb-1">
                                    <span className="font-extrabold text-xs text-slate-900 leading-tight">
                                      {item.title}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-white font-mono text-[10px] font-bold text-indigo-900 border border-slate-200">
                                      گروه {faNum(item.groupNumber)}
                                    </span>
                                  </div>

                                  <div className="text-[11px] font-bold text-slate-700 flex items-center justify-between mb-1">
                                    <span>🏛️ {item.roomName}</span>
                                    <span className="text-slate-500 text-[10px]">{item.buildingName}</span>
                                  </div>

                                  {/* Co-teaching indicator if applicable */}
                                  {item.isCoTaught && (
                                    <div className="p-1 rounded bg-purple-100 text-purple-900 text-[10px] font-bold mb-1 border border-purple-200">
                                      👥 مشترک ({item.coRole === 'THEORY' ? 'استاد تئوری' : 'استاد عملی'} · همکار: {item.coPartnerName})
                                    </div>
                                  )}

                                  <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-200/60">
                                    <span className="font-bold text-slate-600">
                                      👥 {faNum(item.enrolledCount)}/{faNum(item.capacity)} دانشجو
                                    </span>
                                    <span>
                                      {item.weekType === 'EVEN' ? (
                                        <span className="px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-900 font-bold">هفته زوج</span>
                                      ) : item.weekType === 'ODD' ? (
                                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold">هفته فرد</span>
                                      ) : (
                                        <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 font-bold">هر هفته</span>
                                      )}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Course Offerings List & Quick Links */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4 print:hidden">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h3 className="font-extrabold text-slate-900 text-base">
            فهرست تفکیکی دروس تخصیص‌یافته به استاد در این نیمسال
          </h3>
          <span className="text-xs text-slate-500 font-bold">
            مجموع {faNum(offerings.length)} کلاس فعال
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-white text-center">
                <th className="p-2.5 border border-slate-800 w-12">ردیف</th>
                <th className="p-2.5 border border-slate-800">کد درس</th>
                <th className="p-2.5 border border-slate-800">عنوان درس</th>
                <th className="p-2.5 border border-slate-800">گروه</th>
                <th className="p-2.5 border border-slate-800">واحد</th>
                <th className="p-2.5 border border-slate-800">نوع درس</th>
                <th className="p-2.5 border border-slate-800">روز و ساعت</th>
                <th className="p-2.5 border border-slate-800">محل برگزاری (کلاس)</th>
                <th className="p-2.5 border border-slate-800">ثبت‌نامی</th>
                <th className="p-2.5 border border-slate-800">عملیات آموزشی</th>
              </tr>
            </thead>
            <tbody>
              {offerings.map((item, idx) => (
                <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-2 border border-slate-200 text-center font-bold text-slate-500">{faNum(idx + 1)}</td>
                  <td className="p-2 border border-slate-200 font-mono text-center font-bold text-indigo-900">{item.code}</td>
                  <td className="p-2 border border-slate-200 font-extrabold text-slate-900">
                    <div>{item.title}</div>
                    {item.isCoTaught && (
                      <div className="text-[10px] text-purple-700 font-bold">
                        👥 درس مشترک با {item.coPartnerName} ({item.coRole === 'THEORY' ? 'بخش تئوری' : 'بخش عملی'})
                      </div>
                    )}
                  </td>
                  <td className="p-2 border border-slate-200 text-center font-bold">گروه {faNum(item.groupNumber)}</td>
                  <td className="p-2 border border-slate-200 text-center font-bold">{faNum(item.units)}</td>
                  <td className="p-2 border border-slate-200 text-center">
                    <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${item.courseType === 'عملی' ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-900'}`}>
                      {item.courseType}
                    </span>
                  </td>
                  <td className="p-2 border border-slate-200 font-bold text-slate-800">
                    {item.dayName} {faNum(item.startTime)} الی {faNum(item.endTime)}
                  </td>
                  <td className="p-2 border border-slate-200 font-extrabold text-emerald-900">
                    🏛️ {item.roomName} ({item.buildingName})
                  </td>
                  <td className="p-2 border border-slate-200 text-center font-bold">
                    {faNum(item.enrolledCount)} / {faNum(item.capacity)}
                  </td>
                  <td className="p-2 border border-slate-200 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <Link
                        href={`/professor/attendance?offeringId=${item.id}`}
                        className="px-2 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-[10px] transition"
                      >
                        📋 حضور و غیاب
                      </Link>
                      <Link
                        href={`/professor/grades?offeringId=${item.id}`}
                        className="px-2 py-1 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-900 font-bold text-[10px] transition"
                      >
                        📝 ثبت نمره
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
