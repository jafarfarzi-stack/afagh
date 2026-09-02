'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';

export interface EnrolledCourseItem {
  enrollmentId: number;
  offeringId: number;
  code: string;
  title: string;
  units: number;
  courseType: string;
  group: number;
  status: string;
  professor: string;
  classes: {
    dayOfWeek: number;
    dayName: string;
    startTime: string;
    endTime: string;
    room: string;
    building?: string;
  }[];
  exam: {
    examDate: string;
    startTime: string;
    endTime: string;
    room?: string;
  } | null;
}

const faNum = (n: any) => (n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]));

function toShamsi(dStr: string | null | undefined): string {
  if (!dStr) return '—';
  // If already in Persian format
  if (dStr.startsWith('13') || dStr.startsWith('14') || dStr.startsWith('۱۴') || dStr.startsWith('۱۳')) {
    return faNum(dStr);
  }
  try {
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return faNum(dStr);
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return faNum(dStr);
  }
}

const DAYS = [
  { id: 0, name: 'شنبه' },
  { id: 1, name: 'یکشنبه' },
  { id: 2, name: 'دوشنبه' },
  { id: 3, name: 'سه‌شنبه' },
  { id: 4, name: 'چهارشنبه' },
  { id: 5, name: 'پنج‌شنبه' },
];

const TIME_SLOTS = [
  { id: 1, label: '۰۸:۰۰ الی ۱۰:۰۰', start: '08:00', end: '10:00' },
  { id: 2, label: '۱۰:۰۰ الی ۱۲:۰۰', start: '10:00', end: '12:00' },
  { id: 3, label: '۱۲:۰۰ الی ۱۴:۰۰ (نماز و ناهار)', start: '12:00', end: '14:00' },
  { id: 4, label: '۱۴:۰۰ الی ۱۶:۰۰', start: '14:00', end: '16:00' },
  { id: 5, label: '۱۶:۰۰ الی ۱۸:۰۰', start: '16:00', end: '18:00' },
];

function checkTimeOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA < endB && endA > startB;
}

const COURSE_COLORS = [
  'bg-blue-100 text-blue-900 border-blue-300',
  'bg-emerald-100 text-emerald-900 border-emerald-300',
  'bg-purple-100 text-purple-900 border-purple-300',
  'bg-amber-100 text-amber-900 border-amber-300',
  'bg-rose-100 text-rose-900 border-rose-300',
  'bg-teal-100 text-teal-900 border-teal-300',
  'bg-indigo-100 text-indigo-900 border-indigo-300',
];

export default function ScheduleClient({
  student,
  term,
  courses,
}: {
  student: {
    name: string;
    studentCode: string;
    majorName: string;
    degreeTitle: string;
    currentTermNo: number;
    entryYear: number;
  };
  term: {
    title: string;
    termCode: string;
  };
  courses: EnrolledCourseItem[];
}) {
  const totalUnits = useMemo(() => courses.reduce((sum, c) => sum + c.units, 0), [courses]);

  // زمان‌بندی امتحانات به ترتیب تاریخ
  const sortedExams = useMemo(() => {
    return courses
      .filter(c => c.exam != null)
      .map(c => ({
        code: c.code,
        title: c.title,
        group: c.group,
        units: c.units,
        professor: c.professor,
        examDate: c.exam!.examDate,
        startTime: c.exam!.startTime,
        endTime: c.exam!.endTime,
        room: c.exam!.room || 'سالن امتحانات مرکزی',
      }))
      .sort((a, b) => a.examDate.localeCompare(b.examDate));
  }, [courses]);

  return (
    <div className="space-y-5 text-slate-800 font-sans" dir="rtl">
      {/* Action Bar (Print & Back) */}
      <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm print:hidden">
        <div className="flex items-center gap-2">
          <Link
            href="/student/enroll"
            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-xl font-bold transition-colors flex items-center gap-1"
          >
            <span>🛒</span>
            <span>بازگشت به انتخاب واحد</span>
          </Link>
          <span className="text-xs text-slate-400">|</span>
          <span className="text-xs text-slate-600 font-bold">
            تاییدیه رسمی انتخاب واحد — {term.title}
          </span>
        </div>

        <button
          onClick={() => window.print()}
          className="text-xs bg-indigo-700 hover:bg-indigo-800 text-white px-4 py-2 rounded-xl font-extrabold transition-all shadow-md active:scale-95 flex items-center gap-1.5"
        >
          <span>🖨️</span>
          <span>چاپ تاییدیه تحصیلی و برنامه هفتگی</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* سربرگ رسمی تاییدیه تحصیلی (Official University Letterhead)        */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div className="print-area bg-white rounded-2xl border-2 border-slate-300 p-5 sm:p-7 shadow-md space-y-5 print:border-none print:shadow-none print:p-0">
        {/* هدر رسمی با آرم و بارکد */}
        <div className="border-b-2 border-slate-800 pb-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-950 text-white flex items-center justify-center font-black text-2xl shadow-sm">
              آ
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black text-slate-900">
                دانشگاه غیرانتفاعی آفاق ارومیه
              </h1>
              <p className="text-xs text-slate-600 font-bold mt-0.5">
                معاونت آموزشی و تحصیلات تکمیلی — اداره کل آموزش
              </p>
            </div>
          </div>

          <div className="text-center">
            <h2 className="text-sm sm:text-base font-black text-indigo-950 bg-indigo-50 border border-indigo-200 px-4 py-1.5 rounded-xl">
              تاییدیه رسمی ثبت‌نام و برنامه هفتگی تحصیلی
            </h2>
            <p className="text-xs text-slate-500 font-bold mt-1">
              {term.title} (کد نیمسال: {faNum(term.termCode)})
            </p>
          </div>

          <div className="text-left text-xs font-mono text-slate-600 space-y-0.5">
            <div>تاریخ صدور: {faNum('1405/06/15')}</div>
            <div>شماره تاییدیه: {faNum('AF-1405-')}{faNum(student.studentCode)}</div>
            <div className="text-[10px] text-emerald-700 font-bold font-sans">وضعیت: تایید قطعی آموزش ✓</div>
          </div>
        </div>

        {/* مشخصات هویتی و تحصیلی دانشجو */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
          <div>
            <span className="text-slate-500 block text-[11px]">نام و نام خانوادگی:</span>
            <span className="font-extrabold text-slate-900 text-sm">{student.name}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[11px]">شماره دانشجویی:</span>
            <span className="font-extrabold text-slate-900 font-mono text-sm" dir="ltr">
              {faNum(student.studentCode)}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-[11px]">رشته و گرایش تحصیلی:</span>
            <span className="font-extrabold text-slate-900">{student.majorName}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[11px]">مقطع و ترم تحصیلی:</span>
            <span className="font-extrabold text-slate-900">
              {student.degreeTitle} (ترم {faNum(student.currentTermNo)})
            </span>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* جدول برنامه هفتگی کلاسی (Weekly Timetable Grid with Classrooms)  */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
              <span>📅</span>
              <span>جدول زمان‌بندی و برنامهٔ هفتگی کلاس‌ها (به همراه شماره کلاس و ساختمان):</span>
            </h3>
            <span className="text-xs bg-indigo-50 text-indigo-900 border border-indigo-200 px-2.5 py-0.5 rounded-lg font-bold font-mono">
              مجموع کل: {faNum(totalUnits)} واحد ({faNum(courses.length)} درس)
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-300">
            <table className="w-full text-center text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-800 border-b border-slate-300">
                  <th className="p-2.5 border-l border-slate-300 w-24 font-extrabold">ایام هفته</th>
                  {TIME_SLOTS.map(slot => (
                    <th key={slot.id} className="p-2 border-l border-slate-300 font-extrabold">
                      <div>{slot.label}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day, dayIdx) => {
                  return (
                    <tr key={day.id} className="border-b border-slate-200 h-20 hover:bg-slate-50/50">
                      {/* روز هفته */}
                      <td className="p-2 border-l border-slate-300 font-extrabold bg-slate-50 text-slate-800">
                        {day.name}
                      </td>

                      {/* ساعات کلاسی */}
                      {TIME_SLOTS.map((slot, slotIdx) => {
                        // یافتن کلاسی که در این روز و بازه زمانی برگزار می‌شود
                        const matchingClasses: { course: EnrolledCourseItem; cls: EnrolledCourseItem['classes'][0]; colorIdx: number }[] = [];

                        courses.forEach((c, cIdx) => {
                          c.classes.forEach(cls => {
                            if (cls.dayOfWeek === day.id) {
                              if (checkTimeOverlap(cls.startTime, cls.endTime, slot.start, slot.end)) {
                                matchingClasses.push({ course: c, cls, colorIdx: cIdx % COURSE_COLORS.length });
                              }
                            }
                          });
                        });

                        return (
                          <td key={slot.id} className="p-1 border-l border-slate-200 align-middle">
                            {matchingClasses.length === 0 ? (
                              <span className="text-slate-300 text-[11px]">—</span>
                            ) : (
                              <div className="space-y-1">
                                {matchingClasses.map(({ course, cls, colorIdx }, mIdx) => (
                                  <div
                                    key={mIdx}
                                    className={`p-2 rounded-xl border text-right shadow-sm ${COURSE_COLORS[colorIdx]}`}
                                  >
                                    <div className="font-extrabold text-xs text-slate-900 leading-tight">
                                      {course.title}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1 text-[10px] mt-1 text-slate-700">
                                      <span className="font-bold bg-white/80 px-1.5 py-0.5 rounded">
                                        گروه {faNum(course.group)}
                                      </span>
                                      <span className="font-bold bg-white/80 px-1.5 py-0.5 rounded">
                                        استاد: {course.professor}
                                      </span>
                                    </div>
                                    {/* نمایش صریح شماره کلاس و ساختمان */}
                                    <div className="mt-1 font-bold text-[11px] text-indigo-950 bg-white/90 px-2 py-0.5 rounded border border-indigo-200 flex items-center gap-1">
                                      <span>🏛️</span>
                                      <span>مکان: {cls.room}</span>
                                      {cls.building && <span>({cls.building})</span>}
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

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* جدول فهرست دروس اخذ شده (List of Enrolled Courses)               */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-2">
          <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
            <span>📋</span>
            <span>فهرست دروس قطعی و ثبت‌نام‌شده:</span>
          </h3>

          <div className="overflow-x-auto rounded-xl border border-slate-300">
            <table className="w-full text-right text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-800 border-b border-slate-300">
                <tr>
                  <th className="p-2 border-l border-slate-300 text-center w-12">ردیف</th>
                  <th className="p-2 border-l border-slate-300 text-center w-20">کد درس</th>
                  <th className="p-2 border-l border-slate-300">نام درس</th>
                  <th className="p-2 border-l border-slate-300 text-center w-16">گروه</th>
                  <th className="p-2 border-l border-slate-300 text-center w-14">واحد</th>
                  <th className="p-2 border-l border-slate-300">نوع درس</th>
                  <th className="p-2 border-l border-slate-300">استاد درس</th>
                  <th className="p-2 border-l border-slate-300">محل و زمان کلاس</th>
                  <th className="p-2 border-l border-slate-300 text-center">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c, idx) => (
                  <tr key={c.offeringId} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="p-2 border-l border-slate-200 text-center font-bold">{faNum(idx + 1)}</td>
                    <td className="p-2 border-l border-slate-200 text-center font-mono" dir="ltr">
                      {c.code}
                    </td>
                    <td className="p-2 border-l border-slate-200 font-extrabold text-slate-900">{c.title}</td>
                    <td className="p-2 border-l border-slate-200 text-center font-bold">
                      گروه {faNum(c.group)}
                    </td>
                    <td className="p-2 border-l border-slate-200 text-center font-bold font-mono">
                      {faNum(c.units)}
                    </td>
                    <td className="p-2 border-l border-slate-200 text-slate-600">{c.courseType}</td>
                    <td className="p-2 border-l border-slate-200 font-medium">{c.professor}</td>
                    <td className="p-2 border-l border-slate-200 text-slate-700">
                      {c.classes.map((cls, i) => (
                        <div key={i} className="text-[11px]">
                          • {cls.dayName} ساعت {faNum(cls.startTime)} تا {faNum(cls.endTime)} — <b>{cls.room}</b>
                        </div>
                      ))}
                    </td>
                    <td className="p-2 border-l border-slate-200 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                        ثبت نهایی ✓
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* جدول برنامه امتحانات پایان‌ترم (Final Exam Schedule)             */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-2">
          <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
            <span>📝</span>
            <span>برنامه زمان‌بندی و سالن امتحانات پایان‌ترم (به ترتیب تقویم آزمون):</span>
          </h3>

          <div className="overflow-x-auto rounded-xl border border-slate-300">
            <table className="w-full text-right text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-800 border-b border-slate-300">
                <tr>
                  <th className="p-2 border-l border-slate-300 text-center w-12">ردیف</th>
                  <th className="p-2 border-l border-slate-300 text-center w-28">تاریخ امتحان</th>
                  <th className="p-2 border-l border-slate-300 text-center w-28">ساعت آزمون</th>
                  <th className="p-2 border-l border-slate-300">عنوان درس</th>
                  <th className="p-2 border-l border-slate-300 text-center w-16">گروه</th>
                  <th className="p-2 border-l border-slate-300">استاد درس</th>
                  <th className="p-2 border-l border-slate-300">سالن آزمون</th>
                </tr>
              </thead>
              <tbody>
                {sortedExams.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-slate-400">
                      برنامه امتحانی برای دروس این ترم ثبت نشده است.
                    </td>
                  </tr>
                ) : (
                  sortedExams.map((ex, idx) => (
                    <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50">
                      <td className="p-2 border-l border-slate-200 text-center font-bold">{faNum(idx + 1)}</td>
                      <td className="p-2 border-l border-slate-200 text-center font-bold text-indigo-950 font-mono">
                        {toShamsi(ex.examDate)}
                      </td>
                      <td className="p-2 border-l border-slate-200 text-center font-bold text-slate-800 font-mono">
                        {faNum(ex.startTime)} الی {faNum(ex.endTime)}
                      </td>
                      <td className="p-2 border-l border-slate-200 font-extrabold text-slate-900">{ex.title}</td>
                      <td className="p-2 border-l border-slate-200 text-center font-bold">
                        گروه {faNum(ex.group)}
                      </td>
                      <td className="p-2 border-l border-slate-200">{ex.professor}</td>
                      <td className="p-2 border-l border-slate-200 font-bold text-emerald-800">
                        {ex.room}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* مهر رسمی و امضای دیجیتال اداره آموزش دانشگاه */}
        <div className="pt-6 border-t border-slate-300 flex flex-wrap items-center justify-between gap-6 text-xs text-slate-700">
          <div className="space-y-1">
            <p className="font-bold">ملاحظات و قوانین آموزشی:</p>
            <p className="text-[11px] text-slate-500 max-w-md">
              ۱. حضور در جلسات کلاس درس الزامی بوده و غیبت بیش از ۳/۱۶ موجب حذف ماده درسی خواهد شد.
              <br />
              ۲. همراه داشتن این تاییدیه در ایام برگزاری امتحانات پایان‌ترم الزامی است.
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-center p-3 border-2 border-dashed border-indigo-300 rounded-xl bg-indigo-50/50">
              <div className="text-[10px] text-indigo-800 font-bold">مهر الکترونیک و اصالت سند</div>
              <div className="text-xs font-black text-indigo-950 mt-1 font-mono">🔒 AFAGH-VERIFIED-2026</div>
              <div className="text-[9px] text-indigo-600 mt-0.5">اداره کل خدمات آموزشی آفاق</div>
            </div>

            <div className="text-center space-y-1">
              <div className="font-bold text-slate-900">مسئول ثبت‌نام و آموزش</div>
              <div className="w-28 h-10 border-b border-slate-400 mx-auto"></div>
              <div className="text-[10px] text-slate-500">امضا و تایید سیستمی</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
