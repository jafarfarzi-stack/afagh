'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';

export interface ClassroomOption {
  id: number;
  name: string;
  buildingName: string;
  capacity: number;
  roomType: string;
}

export interface ProfessorOption {
  id: number;
  name: string;
  staffCode: string;
  academicRank: string;
  contractType: string;
  departmentName: string;
}

export interface CourseCatalogOption {
  id: number;
  code: string;
  title: string;
  units: number;
  courseType: string;
  departmentName: string;
}

export interface DepartmentOffering {
  id: number;
  termId: number;
  courseId: number;
  code: string;
  title: string;
  units: number;
  courseType: string;
  groupNumber: number;
  professorId: number;
  professorName: string;
  capacity: number;
  enrolledCount: number;
  waitlistCapacity: number;
  classSchedules: {
    dayOfWeek: number;
    dayName: string;
    startTime: string;
    endTime: string;
    roomId: number;
    roomName: string;
    buildingName: string;
  }[];
  examSchedule: {
    examDate: string;
    startTime: string;
    endTime: string;
    roomName: string;
  } | null;
}

const faNum = (n: any) => (n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]));

const DAY_NAMES = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه'];

const INITIAL_CLASSROOMS: ClassroomOption[] = [
  { id: 1, name: 'اتاق ۲۰۱', buildingName: 'ساختمان آموزش', capacity: 40, roomType: 'THEORY' },
  { id: 2, name: 'اتاق ۲۰۲', buildingName: 'ساختمان آموزش', capacity: 35, roomType: 'THEORY' },
  { id: 3, name: 'سالن ورزشی', buildingName: 'ساختمان تربیت بدنی', capacity: 40, roomType: 'GYM' },
  { id: 4, name: 'آزمایشگاه کامپیوتر ۱۰۱', buildingName: 'دانشکده فنی', capacity: 25, roomType: 'LAB' },
  { id: 5, name: 'سالن امتحانات مرکزی', buildingName: 'ساختمان مرکزی', capacity: 100, roomType: 'EXAM' },
];

const INITIAL_PROFESSORS: ProfessorOption[] = [
  { id: 1, name: 'دکتر جمیل احمدی', staffCode: '0011111111', academicRank: 'استادیار', contractType: 'تمام‌وقت', departmentName: 'گروه کامپیوتر' },
  { id: 2, name: 'دکتر فاطمه اکبری', staffCode: '0011111112', academicRank: 'دانشیار', contractType: 'تمام‌وقت', departmentName: 'گروه کامپیوتر' },
  { id: 3, name: 'مهندس سهراب کاظمی', staffCode: '0011111113', academicRank: 'مربی', contractType: 'مدعو', departmentName: 'گروه کامپیوتر' },
  { id: 4, name: 'دکتر مریم رضایی', staffCode: '0011111114', academicRank: 'استادیار', contractType: 'تمام‌وقت', departmentName: 'گروه صنایع غذایی' },
];

const INITIAL_COURSE_CATALOG: CourseCatalogOption[] = [
  { id: 1, code: '1112101', title: 'ریاضی عمومی ۱', units: 3, courseType: 'پایه', departmentName: 'گروه کامپیوتر' },
  { id: 2, code: '1112102', title: 'ریاضی عمومی ۲', units: 3, courseType: 'پایه', departmentName: 'گروه کامپیوتر' },
  { id: 3, code: '1112103', title: 'مبانی برنامه‌نویسی', units: 4, courseType: 'پایه', departmentName: 'گروه کامپیوتر' },
  { id: 4, code: '1112104', title: 'برنامه‌نویسی پیشرفته', units: 3, courseType: 'اصلی', departmentName: 'گروه کامپیوتر' },
  { id: 5, code: '1112201', title: 'ساختمان داده‌ها', units: 3, courseType: 'اصلی', departmentName: 'گروه کامپیوتر' },
  { id: 6, code: '1112202', title: 'مفاهیم ابتدایی ریاضیات', units: 3, courseType: 'پایه', departmentName: 'گروه کامپیوتر' },
  { id: 7, code: '1112301', title: 'معماری کامپیوتر', units: 3, courseType: 'تخصصی', departmentName: 'گروه کامپیوتر' },
  { id: 8, code: '1112302', title: 'پایگاه داده‌ها', units: 3, courseType: 'تخصصی', departmentName: 'گروه کامپیوتر' },
  { id: 9, code: '1112105', title: 'آزمایشگاه فیزیک', units: 1, courseType: 'پایه', departmentName: 'گروه کامپیوتر' },
  { id: 10, code: '1112106', title: 'اندیشه اسلامی ۱', units: 2, courseType: 'عمومی', departmentName: 'گروه معارف' },
  { id: 11, code: '1112107', title: 'زبان انگلیسی عمومی', units: 3, courseType: 'عمومی', departmentName: 'گروه زبان' },
  { id: 12, code: '1112108', title: 'تربیت بدنی ۱', units: 2, courseType: 'عمومی', departmentName: 'گروه تربیت بدنی' },
  { id: 13, code: '1112303', title: 'شبکه‌های کامپیوتری', units: 3, courseType: 'تخصصی', departmentName: 'گروه کامپیوتر' },
];

const INITIAL_OFFERINGS: DepartmentOffering[] = [
  {
    id: 1,
    termId: 2,
    courseId: 2,
    code: '1112102',
    title: 'ریاضی عمومی ۲',
    units: 3,
    courseType: 'پایه',
    groupNumber: 1,
    professorId: 1,
    professorName: 'دکتر جمیل احمدی',
    capacity: 35,
    enrolledCount: 28,
    waitlistCapacity: 5,
    classSchedules: [
      { dayOfWeek: 0, dayName: 'شنبه', startTime: '10:00', endTime: '12:00', roomId: 1, roomName: 'اتاق ۲۰۱', buildingName: 'ساختمان آموزش' },
    ],
    examSchedule: { examDate: '1405/10/07', startTime: '14:00', endTime: '16:00', roomName: 'اتاق ۲۰۱' },
  },
  {
    id: 2,
    termId: 2,
    courseId: 4,
    code: '1112104',
    title: 'برنامه‌نویسی پیشرفته',
    units: 3,
    courseType: 'اصلی',
    groupNumber: 1,
    professorId: 1,
    capacity: 35,
    enrolledCount: 32,
    waitlistCapacity: 5,
    classSchedules: [
      { dayOfWeek: 0, dayName: 'شنبه', startTime: '08:00', endTime: '10:00', roomId: 1, roomName: 'اتاق ۲۰۱', buildingName: 'ساختمان آموزش' },
    ],
    examSchedule: { examDate: '1405/10/04', startTime: '10:00', endTime: '12:00', roomName: 'اتاق ۲۰۱' },
  },
  {
    id: 3,
    termId: 2,
    courseId: 5,
    code: '1112201',
    title: 'ساختمان داده‌ها',
    units: 3,
    courseType: 'اصلی',
    groupNumber: 1,
    professorId: 2,
    professorName: 'دکتر فاطمه اکبری',
    capacity: 30,
    enrolledCount: 29,
    waitlistCapacity: 5,
    classSchedules: [
      { dayOfWeek: 1, dayName: 'یکشنبه', startTime: '08:00', endTime: '10:30', roomId: 2, roomName: 'اتاق ۲۰۲', buildingName: 'ساختمان آموزش' },
    ],
    examSchedule: { examDate: '1405/10/04', startTime: '10:00', endTime: '12:00', roomName: 'اتاق ۲۰۲' },
  },
  {
    id: 4,
    termId: 2,
    courseId: 5,
    code: '1112201',
    title: 'ساختمان داده‌ها',
    units: 3,
    courseType: 'اصلی',
    groupNumber: 2,
    professorId: 2,
    professorName: 'دکتر فاطمه اکبری',
    capacity: 30,
    enrolledCount: 22,
    waitlistCapacity: 5,
    classSchedules: [
      { dayOfWeek: 2, dayName: 'دوشنبه', startTime: '08:00', endTime: '10:30', roomId: 2, roomName: 'اتاق ۲۰۲', buildingName: 'ساختمان آموزش' },
    ],
    examSchedule: { examDate: '1405/10/06', startTime: '10:00', endTime: '12:00', roomName: 'اتاق ۲۰۲' },
  },
  {
    id: 5,
    termId: 2,
    courseId: 7,
    code: '1112301',
    title: 'معماری کامپیوتر',
    units: 3,
    courseType: 'تخصصی',
    groupNumber: 1,
    professorId: 3,
    professorName: 'مهندس سهراب کاظمی',
    capacity: 30,
    enrolledCount: 25,
    waitlistCapacity: 5,
    classSchedules: [
      { dayOfWeek: 1, dayName: 'یکشنبه', startTime: '10:30', endTime: '12:00', roomId: 1, roomName: 'اتاق ۲۰۱', buildingName: 'ساختمان آموزش' },
    ],
    examSchedule: { examDate: '1405/10/09', startTime: '14:00', endTime: '16:00', roomName: 'اتاق ۲۰۱' },
  },
  {
    id: 6,
    termId: 2,
    courseId: 9,
    code: '1112105',
    title: 'آزمایشگاه فیزیک',
    units: 1,
    courseType: 'پایه',
    groupNumber: 1,
    professorId: 3,
    professorName: 'مهندس سهراب کاظمی',
    capacity: 24,
    enrolledCount: 20,
    waitlistCapacity: 0,
    classSchedules: [
      { dayOfWeek: 3, dayName: 'سه‌شنبه', startTime: '08:00', endTime: '10:00', roomId: 4, roomName: 'آزمایشگاه کامپیوتر ۱۰۱', buildingName: 'دانشکده فنی' },
    ],
    examSchedule: null,
  },
];

export default function DepartmentPlanningClient() {
  const [offerings, setOfferings] = useState<DepartmentOffering[]>(INITIAL_OFFERINGS);
  const [classrooms] = useState<ClassroomOption[]>(INITIAL_CLASSROOMS);
  const [professors] = useState<ProfessorOption[]>(INITIAL_PROFESSORS);
  const [coursesBank] = useState<CourseCatalogOption[]>(INITIAL_COURSE_CATALOG);

  // Filters
  const [selectedDepartment, setSelectedDepartment] = useState('گروه کامپیوتر');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeView, setActiveView] = useState<'LIST' | 'ROOM_MATRIX'>('LIST');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  // New Offering Form
  const [form, setForm] = useState({
    courseId: 1,
    groupNumber: 1,
    professorId: 1,
    capacity: 35,
    waitlistCapacity: 5,
    dayOfWeek: 0,
    startTime: '08:00',
    endTime: '10:00',
    roomId: 1,
    examDate: '1405/10/12',
    examStartTime: '10:00',
    examEndTime: '12:00',
  });

  const selectedCourseObj = useMemo(() => coursesBank.find(c => c.id === form.courseId) || coursesBank[0], [coursesBank, form.courseId]);
  const selectedProfObj = useMemo(() => professors.find(p => p.id === form.professorId) || professors[0], [professors, form.professorId]);
  const selectedRoomObj = useMemo(() => classrooms.find(r => r.id === form.roomId) || classrooms[0], [classrooms, form.roomId]);

  // Check room & professor conflicts
  const validationWarning = useMemo(() => {
    // بررسی تداخل اتاق
    const roomConflict = offerings.find(o =>
      o.classSchedules.some(cs => cs.roomId === form.roomId && cs.dayOfWeek === form.dayOfWeek && cs.startTime < form.endTime && form.startTime < cs.endTime)
    );
    if (roomConflict) {
      return `⚠️ تداخل فیزیکی کلاس: ${selectedRoomObj.name} در روز ${DAY_NAMES[form.dayOfWeek]} ساعت ${faNum(form.startTime)}-${faNum(form.endTime)} توسط درس «${roomConflict.title}» اشغال است.`;
    }

    // بررسی تداخل استاد
    const profConflict = offerings.find(o =>
      o.professorId === form.professorId &&
      o.classSchedules.some(cs => cs.dayOfWeek === form.dayOfWeek && cs.startTime < form.endTime && form.startTime < cs.endTime)
    );
    if (profConflict) {
      return `⚠️ تداخل زمانی استاد: استاد ${selectedProfObj.name} در این ساعت همزمان درس «${profConflict.title}» را تدریس می‌نماید.`;
    }

    return null;
  }, [offerings, form, selectedRoomObj, selectedProfObj]);

  const handleSaveOffering = () => {
    if (validationWarning) {
      if (!confirm(`${validationWarning}\n\nآیا با وجود هشدار فوق مایل به ثبت هستید؟`)) return;
    }

    const nextId = Math.max(...offerings.map(o => o.id), 0) + 1;
    const newOff: DepartmentOffering = {
      id: nextId,
      termId: 2,
      courseId: selectedCourseObj.id,
      code: selectedCourseObj.code,
      title: selectedCourseObj.title,
      units: selectedCourseObj.units,
      courseType: selectedCourseObj.courseType,
      groupNumber: form.groupNumber,
      professorId: selectedProfObj.id,
      professorName: selectedProfObj.name,
      capacity: form.capacity,
      enrolledCount: 0,
      waitlistCapacity: form.waitlistCapacity,
      classSchedules: [
        {
          dayOfWeek: form.dayOfWeek,
          dayName: DAY_NAMES[form.dayOfWeek],
          startTime: form.startTime,
          endTime: form.endTime,
          roomId: selectedRoomObj.id,
          roomName: selectedRoomObj.name,
          buildingName: selectedRoomObj.buildingName,
        },
      ],
      examSchedule: {
        examDate: form.examDate,
        startTime: form.examStartTime,
        endTime: form.examEndTime,
        roomName: selectedRoomObj.name,
      },
    };

    setOfferings(prev => [newOff, ...prev]);
    setIsModalOpen(false);
    showToast(`✅ درس «${newOff.title}» (گروه ${faNum(newOff.groupNumber)}) با موفقیت ارائه و در سامانه ثبت شد.`);
  };

  const handleDeleteOffering = (id: number) => {
    if (!confirm(`آیا از حذف این ارائه درسی مطمئن هستید؟`)) return;
    setOfferings(prev => prev.filter(o => o.id !== id));
    showToast('ارائه درسی با موفقیت حذف گردید.');
  };

  const filteredOfferings = useMemo(() => {
    return offerings.filter(o => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return o.title.toLowerCase().includes(q) || o.code.includes(q) || o.professorName.toLowerCase().includes(q);
    });
  }, [offerings, searchQuery]);

  return (
    <div className="space-y-4 text-slate-800 font-sans" dir="rtl">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-5 left-5 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl border border-indigo-500/50 flex items-center gap-3 backdrop-blur-md animate-fade-in">
          <span>✨</span>
          <span className="text-xs font-bold">{toastMsg}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 text-white p-5 rounded-2xl shadow-lg border border-indigo-900/50 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-300 text-xs font-medium mb-1">
            <Link href="/admin" className="hover:underline">داشبورد مدیریت</Link>
            <span>/</span>
            <span>برنامه‌ریزی آموزشی و درسی</span>
            <span>/</span>
            <span className="text-white font-bold">کارتابل مدیر گروه آموزشی</span>
          </div>
          <h1 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
            <span>🗓️</span>
            <span>سامانهٔ برنامه‌ریزی درسی، تخصیص استاد و کلاس‌های آموزشی</span>
          </h1>
          <p className="text-xs text-indigo-200 mt-1">
            ارائه دروس ترمیک، تعریف گروه‌های موازی ۱ و ۲، تخصیص روز و ساعت، انتساب اتاق کلاسی و بررسی عدم تداخل.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-black text-xs px-4 py-2.5 rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5"
          >
            <span>➕</span>
            <span>ارائه و تعریف کلاس جدید</span>
          </button>
          <button
            onClick={() => window.print()}
            className="bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs px-3.5 py-2.5 rounded-xl font-bold transition-all flex items-center gap-1.5"
          >
            <span>🖨️</span>
            <span>چاپ برنامه گروه</span>
          </button>
        </div>
      </div>

      {/* Summary Stats & Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm text-center">
          <div className="text-xl font-black text-indigo-950 font-mono">{faNum(offerings.length)}</div>
          <div className="text-xs text-slate-500 font-bold mt-0.5">کل کلاس‌های ارائه‌شده</div>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm text-center">
          <div className="text-xl font-black text-emerald-700 font-mono">
            {faNum(offerings.reduce((s, o) => s + o.enrolledCount, 0))} / {faNum(offerings.reduce((s, o) => s + o.capacity, 0))}
          </div>
          <div className="text-xs text-slate-500 font-bold mt-0.5">ظرفیت ثبت‌نام‌شده</div>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm text-center">
          <div className="text-xl font-black text-purple-900 font-mono">{faNum(professors.length)}</div>
          <div className="text-xs text-slate-500 font-bold mt-0.5">اساتید فعال در ترم</div>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm text-center">
          <div className="text-xl font-black text-amber-900 font-mono">{faNum(classrooms.length)}</div>
          <div className="text-xs text-slate-500 font-bold mt-0.5">کلاس‌ها و آزمایشگاه‌ها</div>
        </div>
      </div>

      {/* View Switcher & Search Bar */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveView('LIST')}
            className={`text-xs font-bold px-4 py-2 rounded-xl transition-all ${
              activeView === 'LIST'
                ? 'bg-indigo-950 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            📋 فهرست تفصیلی ارائه‌ها
          </button>
          <button
            onClick={() => setActiveView('ROOM_MATRIX')}
            className={`text-xs font-bold px-4 py-2 rounded-xl transition-all ${
              activeView === 'ROOM_MATRIX'
                ? 'bg-indigo-950 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            🏛️ ماتریس اشغال کلاس‌ها و اتاق‌ها
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="جستجوی درس، کد یا استاد..."
            className="text-xs border border-slate-300 rounded-xl px-3 py-1.5 w-60 bg-slate-50 focus:bg-white"
          />
        </div>
      </div>

      {/* View 1: List Table */}
      {activeView === 'LIST' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-800 border-b border-slate-300">
                <tr>
                  <th className="p-3 border-l border-slate-200 text-center w-12">ردیف</th>
                  <th className="p-3 border-l border-slate-200 text-center w-20">کد درس</th>
                  <th className="p-3 border-l border-slate-200">عنوان درس</th>
                  <th className="p-3 border-l border-slate-200 text-center w-16">گروه</th>
                  <th className="p-3 border-l border-slate-200 text-center w-14">واحد</th>
                  <th className="p-3 border-l border-slate-200">استاد مدرس</th>
                  <th className="p-3 border-l border-slate-200">جلسات و شماره کلاس</th>
                  <th className="p-3 border-l border-slate-200">امتحان پایان‌ترم</th>
                  <th className="p-3 border-l border-slate-200 text-center w-24">ظرفیت</th>
                  <th className="p-3 border-l border-slate-200 text-center w-20">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filteredOfferings.map((o, idx) => (
                  <tr key={o.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="p-3 border-l border-slate-200 text-center font-bold text-slate-600">{faNum(idx + 1)}</td>
                    <td className="p-3 border-l border-slate-200 text-center font-mono" dir="ltr">
                      {o.code}
                    </td>
                    <td className="p-3 border-l border-slate-200 font-extrabold text-slate-900">
                      {o.title}
                      <span className="block text-[11px] text-slate-500 font-normal mt-0.5">{o.courseType}</span>
                    </td>
                    <td className="p-3 border-l border-slate-200 text-center font-bold">
                      <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-900 border border-indigo-200 font-bold">
                        گروه {faNum(o.groupNumber)}
                      </span>
                    </td>
                    <td className="p-3 border-l border-slate-200 text-center font-bold font-mono">{faNum(o.units)}</td>
                    <td className="p-3 border-l border-slate-200 font-medium text-slate-800">{o.professorName}</td>

                    {/* زمان و مکان کلاس */}
                    <td className="p-3 border-l border-slate-200 text-slate-700">
                      {o.classSchedules.map((cs, i) => (
                        <div key={i} className="space-y-0.5">
                          <span className="font-bold text-slate-900">
                            {cs.dayName} ساعت {faNum(cs.startTime)} تا {faNum(cs.endTime)}
                          </span>
                          <span className="inline-flex items-center gap-1 mr-2 px-2 py-0.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-200 text-[11px] font-bold">
                            🏛️ {cs.roomName} ({cs.buildingName})
                          </span>
                        </div>
                      ))}
                    </td>

                    {/* امتحان */}
                    <td className="p-3 border-l border-slate-200 text-slate-600 text-[11px]">
                      {o.examSchedule ? (
                        <div>
                          <div>📅 {faNum(o.examSchedule.examDate)}</div>
                          <div>🕒 {faNum(o.examSchedule.startTime)} الی {faNum(o.examSchedule.endTime)}</div>
                        </div>
                      ) : (
                        <span className="text-slate-400">بدون امتحان کتبی</span>
                      )}
                    </td>

                    <td className="p-3 border-l border-slate-200 text-center">
                      <span className="font-bold text-slate-900">{faNum(o.enrolledCount)}</span>
                      <span className="text-slate-400 text-[10px]"> / {faNum(o.capacity)}</span>
                    </td>

                    <td className="p-3 border-l border-slate-200 text-center">
                      <button
                        onClick={() => handleDeleteOffering(o.id)}
                        className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2 py-1 rounded font-bold transition-colors text-xs"
                      >
                        حذف
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View 2: Classroom Occupation Matrix */}
      {activeView === 'ROOM_MATRIX' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="font-extrabold text-sm text-slate-900">
              🏛️ جدول ماتریسی وضعیت اشغال کلاس‌ها و اتاق‌های آموزشی
            </h3>
            <span className="text-xs text-slate-500">تفکیک بر اساس روزهای هفته و ساعات رسمی</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {classrooms.map(room => {
              const roomOfferings = offerings.filter(o => o.classSchedules.some(cs => cs.roomId === room.id));

              return (
                <div key={room.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                    <span className="font-extrabold text-xs text-slate-900">{room.name}</span>
                    <span className="text-[11px] bg-white text-indigo-900 border border-slate-300 px-2 py-0.5 rounded font-bold">
                      ظرفیت: {faNum(room.capacity)} نفر
                    </span>
                  </div>

                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 text-xs">
                    {roomOfferings.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic py-2">کلاسی در این اتاق تخصیص نیافته است.</p>
                    ) : (
                      roomOfferings.map(ro => (
                        <div key={ro.id} className="p-2 bg-white rounded-lg border border-slate-200 shadow-xs space-y-0.5">
                          <div className="font-bold text-slate-900">{ro.title} (گروه {faNum(ro.groupNumber)})</div>
                          <div className="text-[11px] text-slate-600">استاد: {ro.professorName}</div>
                          <div className="text-[10px] text-indigo-800 font-bold">
                            {ro.classSchedules.map(cs => `${cs.dayName} ${faNum(cs.startTime)}-${faNum(cs.endTime)}`).join(' و ')}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal: ارائه درس جدید توسط مدیر گروه */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-indigo-950 to-slate-900 text-white px-4 py-3 flex items-center justify-between">
              <h3 className="font-extrabold text-sm flex items-center gap-2">
                <span>➕</span>
                <span>ارائه و برنامه‌ریزی کلاس درسی جدید</span>
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-300 hover:text-white font-bold">✕</button>
            </div>

            <div className="p-4 space-y-3 text-xs max-h-[75vh] overflow-y-auto">
              {/* درس و گروه */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">انتخاب عنوان درس از چارت:</label>
                  <select
                    value={form.courseId}
                    onChange={e => setForm({ ...form, courseId: Number(e.target.value) })}
                    className="w-full border border-slate-300 px-3 py-1.5 rounded font-bold text-slate-800"
                  >
                    {coursesBank.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.title} ({c.units} واحد - {c.courseType})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">شماره گروه:</label>
                  <select
                    value={form.groupNumber}
                    onChange={e => setForm({ ...form, groupNumber: Number(e.target.value) })}
                    className="w-full border border-slate-300 px-3 py-1.5 rounded font-bold"
                  >
                    <option value={1}>گروه ۱</option>
                    <option value={2}>گروه ۲</option>
                    <option value={3}>گروه ۳</option>
                    <option value={4}>گروه ۴</option>
                  </select>
                </div>
              </div>

              {/* استاد */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">استاد مدرس کلاس:</label>
                <select
                  value={form.professorId}
                  onChange={e => setForm({ ...form, professorId: Number(e.target.value) })}
                  className="w-full border border-slate-300 px-3 py-1.5 rounded font-bold"
                >
                  {professors.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.academicRank} — {p.contractType})
                    </option>
                  ))}
                </select>
              </div>

              {/* زمان‌بندی و شماره اتاق */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <span className="font-bold text-indigo-950 block">زمان‌بندی هفتگی و تخصیص اتاق کلاس:</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <span className="text-[11px] text-slate-500 block mb-0.5">روز جلسه:</span>
                    <select
                      value={form.dayOfWeek}
                      onChange={e => setForm({ ...form, dayOfWeek: Number(e.target.value) })}
                      className="w-full border border-slate-300 px-2 py-1 rounded"
                    >
                      {DAY_NAMES.map((d, i) => (
                        <option key={i} value={i}>{d}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-500 block mb-0.5">ساعت شروع:</span>
                    <input
                      type="text"
                      value={form.startTime}
                      onChange={e => setForm({ ...form, startTime: e.target.value })}
                      className="w-full border border-slate-300 px-2 py-1 rounded font-mono text-center"
                    />
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-500 block mb-0.5">ساعت پایان:</span>
                    <input
                      type="text"
                      value={form.endTime}
                      onChange={e => setForm({ ...form, endTime: e.target.value })}
                      className="w-full border border-slate-300 px-2 py-1 rounded font-mono text-center"
                    />
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-500 block mb-0.5">شماره اتاق / کلاس:</span>
                    <select
                      value={form.roomId}
                      onChange={e => setForm({ ...form, roomId: Number(e.target.value) })}
                      className="w-full border border-slate-300 px-2 py-1 rounded font-bold text-emerald-900"
                    >
                      {classrooms.map(r => (
                        <option key={r.id} value={r.id}>{r.name} ({r.buildingName})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* امتحان و ظرفیت */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">تاریخ امتحان پایان‌ترم:</label>
                  <input
                    type="text"
                    value={form.examDate}
                    onChange={e => setForm({ ...form, examDate: e.target.value })}
                    className="w-full border border-slate-300 px-3 py-1 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">ظرفیت کلاس (نفر):</label>
                  <input
                    type="number"
                    value={form.capacity}
                    onChange={e => setForm({ ...form, capacity: Number(e.target.value) })}
                    className="w-full border border-slate-300 px-3 py-1 rounded font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">ظرفیت اتاق انتظار:</label>
                  <input
                    type="number"
                    value={form.waitlistCapacity}
                    onChange={e => setForm({ ...form, waitlistCapacity: Number(e.target.value) })}
                    className="w-full border border-slate-300 px-3 py-1 rounded font-mono"
                  />
                </div>
              </div>

              {/* هشدار تداخل زنده */}
              {validationWarning && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 font-bold">
                  {validationWarning}
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-1.5 rounded bg-slate-200 text-slate-700 font-bold text-xs">
                انصراف
              </button>
              <button
                onClick={handleSaveOffering}
                className="px-5 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow"
              >
                ذخیره و ارائه کلاس
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
