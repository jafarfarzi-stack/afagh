'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createShortCourseAction, issueCertificateAction, updateRegistrationAction,
} from './actions';

export interface AdminLearnerRecord {
  /** شناسهٔ ردیف ثبت‌نام — کلید واقعی عملیات‌ها در پایگاه داده */
  registrationId: number;
  id: number;
  fullName: string;
  fullNameEn: string;
  nationalId: string;
  mobile: string;
  courseId: number;
  amountPaid: number;
  discountCode?: string;
  attendanceCount: number;
  totalSessions: number;
  finalGrade?: number;
  isPassed: boolean;
  certificateNumber?: string;
  certificateIssued: boolean;
  registeredAt: string;
  paymentStatus?: string;
}

export interface AdminCourseItem {
  id: number;
  code: string;
  title: string;
  titleEn: string;
  category: string;
  hours: number;
  tuitionPrice: number;
  capacity: number;
  enrolledCount: number;
  instructorName: string;
  passingGrade: number;
  maxAbsences: number;
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED';
  learners: AdminLearnerRecord[];
}

const faNum = (n: any) =>
  n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

const formatPrice = (p: number) => faNum(p.toLocaleString('fa-IR')) + ' تومان';

export default function AdminShortCoursesClient({
  initialCourses,
}: {
  initialCourses: AdminCourseItem[];
}) {
  const router = useRouter();
  const [courses, setCourses] = useState<AdminCourseItem[]>(initialCourses);
  const [selectedCourseId, setSelectedCourseId] = useState<number>(initialCourses[0]?.id || 0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'ROSTER' | 'NEW_COURSE' | 'DISCOUNTS' | 'FINANCIAL'>('ROSTER');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New Course Form State
  const [newTitle, setNewTitle] = useState('');
  const [newTitleEn, setNewTitleEn] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newCategory, setNewCategory] = useState('مهندسی و هوش مصنوعی');
  const [newHours, setNewHours] = useState(40);
  const [newPrice, setNewPrice] = useState(3000000);
  const [newCapacity, setNewCapacity] = useState(30);
  const [newInstructor, setNewInstructor] = useState('');

  // Discount Codes State
  const [discounts, setDiscounts] = useState([
    { code: 'AFAGH30', percent: 30, used: 14, max: 100, validUntil: '۱۴۰۵/۱۲/۲۹' },
    { code: 'NOROOZ', percent: 20, used: 8, max: 50, validUntil: '۱۴۰۵/۱۱/۳۰' },
    { code: 'STUDENT', percent: 30, used: 25, max: 200, validUntil: '۱۴۰۵/۱۲/۲۹' },
  ]);
  const [newDiscountCode, setNewDiscountCode] = useState('');
  const [newDiscountPercent, setNewDiscountPercent] = useState(25);

  const currentCourse = courses.find(c => c.id === selectedCourseId) || courses[0];

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  // KPI Calculations
  const stats = useMemo(() => {
    let totalLearners = 0;
    let totalIncome = 0;
    let totalCerts = 0;

    courses.forEach(c => {
      c.learners.forEach(l => {
        totalLearners++;
        totalIncome += l.amountPaid;
        if (l.certificateIssued) totalCerts++;
      });
    });

    return { totalLearners, totalIncome, totalCerts, activeCourses: courses.length };
  }, [courses]);

  /**
   * ثبت نمره/حضور در پایگاه داده.
   * پیش‌تر فقط در state مرورگر عوض می‌شد و قاعدهٔ قبولی («نمره ≥ ۱۲ و غیبت ≤ ۳»)
   * هاردکد بود؛ حالا حد نصاب از خودِ دوره خوانده می‌شود و نتیجه از سرور
   * برمی‌گردد.
   */
  const updateLearnerData = async (
    registrationId: number,
    field: 'attendanceCount' | 'finalGrade',
    value: number | undefined
  ) => {
    setBusyId(registrationId);
    const res = await updateRegistrationAction({
      registrationId,
      ...(field === 'finalGrade' ? { finalGrade: value ?? null } : { attendanceCount: value }),
    });
    setBusyId(null);
    if (!res.ok) {
      showToast(`⚠️ ${res.error}`);
      return;
    }
    setCourses(prev =>
      prev.map(c => ({
        ...c,
        learners: c.learners.map(l =>
          l.registrationId === registrationId
            ? { ...l, finalGrade: res.data.finalGrade || undefined, attendanceCount: res.data.attendanceCount, isPassed: res.data.isPassed }
            : l
        ),
      }))
    );
  };

  /**
   * صدور گواهینامهٔ واقعی: شماره از ترتیب پایگاه داده و اثر انگشت SHA-256 از
   * محتوای گواهینامه ساخته می‌شود. پیش‌تر یک عدد تصادفی در state نوشته می‌شد و
   * پورتال استعلام عمومی هرگز آن را پیدا نمی‌کرد.
   */
  const handleIssueCertificate = async (registrationId: number) => {
    setBusyId(registrationId);
    const res = await issueCertificateAction(registrationId);
    setBusyId(null);
    if (!res.ok) {
      showToast(`⚠️ ${res.error}`);
      return;
    }
    setCourses(prev =>
      prev.map(c => ({
        ...c,
        learners: c.learners.map(l =>
          l.registrationId === registrationId
            ? { ...l, certificateIssued: true, certificateNumber: res.data.certificateNumber }
            : l
        ),
      }))
    );
    showToast(`🎓 گواهینامهٔ «${res.data.certificateNumber}» صادر و در پورتال استعلام عمومی ثبت شد.`);
  };

  /** تعریف دوره در پایگاه داده و بارگذاری دوبارهٔ فهرست از سرور */
  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newCode || !newInstructor) {
      alert('لطفاً تمامی فیلدهای الزامی دوره را تکمیل فرمایید.');
      return;
    }
    const res = await createShortCourseAction({
      code: newCode, title: newTitle, titleEn: newTitleEn, category: newCategory,
      hours: newHours, tuitionPrice: newPrice, capacity: newCapacity, instructorName: newInstructor,
    });
    if (!res.ok) {
      showToast(`⚠️ ${res.error}`);
      return;
    }
    setNewTitle(''); setNewTitleEn(''); setNewCode(''); setNewInstructor('');
    showToast(`✅ دورهٔ «${newTitle}» در پایگاه داده ثبت شد.`);
    router.refresh();
    setActiveTab('ROSTER');
  };

  // Add Discount Code Handler
  const handleCreateDiscount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDiscountCode) return;
    setDiscounts(prev => [
      ...prev,
      {
        code: newDiscountCode.toUpperCase().trim(),
        percent: newDiscountPercent,
        used: 0,
        max: 100,
        validUntil: '۱۴۰۵/۱۲/۲۹',
      },
    ]);
    setNewDiscountCode('');
    showToast('کد تخفیف جدید با موفقیت فعال شد.');
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-4 bg-emerald-900 text-emerald-100 rounded-2xl shadow-xl border border-emerald-700 font-bold text-sm flex items-center justify-between animate-fadeIn">
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
      <div className="bg-gradient-to-l from-indigo-950 via-slate-900 to-indigo-900 text-white rounded-3xl p-6 shadow-xl border border-indigo-800/50 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-400 text-slate-950">
              آموزش‌های آزاد و بوت‌کمپ‌ها
            </span>
            <span className="text-xs text-indigo-300">مدیریت دوره‌های تخصصی و گواهینامه‌ها</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black">
            🏆 پنل مدیریت دوره‌های کوتاه‌مدت و صدور مدارک رسمی
          </h1>
          <p className="text-xs text-indigo-200 mt-1">
            مرکز درآمدزایی و مهارت‌آموزی آزاد دانشگاه آفاق · اتصال مستقیم به درگاه پرداخت و استعلام QR
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/open-courses"
            target="_blank"
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-lg transition flex items-center gap-1.5"
          >
            <span>🌐 مشاهده کاتالوگ عمومی</span>
            <span>↗</span>
          </Link>
          <Link
            href="/verify-certificate"
            target="_blank"
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition"
          >
            🔍 سامانه استعلام مدارک
          </Link>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs text-slate-500 font-bold">📚 دوره‌های فعال</span>
          <div className="text-2xl font-black text-indigo-950 font-mono">{faNum(stats.activeCourses)} دوره</div>
          <span className="text-[10px] text-emerald-600 font-bold">ترم پاییز و زمستان ۱۴۰۵</span>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs text-slate-500 font-bold">👥 کل فراگیران ثبت‌نامی</span>
          <div className="text-2xl font-black text-slate-900 font-mono">{faNum(stats.totalLearners)} نفر</div>
          <span className="text-[10px] text-indigo-600 font-bold">از سراسر کشور</span>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs text-slate-500 font-bold">💰 درآمد وصول‌شده شهریه</span>
          <div className="text-2xl font-black text-emerald-700 font-mono">{formatPrice(stats.totalIncome)}</div>
          <span className="text-[10px] text-slate-400">تراکنش‌های قطعی شاپرک</span>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs text-slate-500 font-bold">🎓 گواهینامه‌های صادرشده</span>
          <div className="text-2xl font-black text-amber-600 font-mono">{faNum(stats.totalCerts)} فقره</div>
          <span className="text-[10px] text-amber-700 font-bold">دارای بارکد QR و استعلام معتبر</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 pb-2 gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('ROSTER')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 ${
              activeTab === 'ROSTER'
                ? 'bg-indigo-900 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>📋 لیست فراگیران، نمرات و صدور گواهی</span>
          </button>

          <button
            onClick={() => setActiveTab('NEW_COURSE')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 ${
              activeTab === 'NEW_COURSE'
                ? 'bg-indigo-900 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>+ تعریف دوره و بوت‌کمپ جدید</span>
          </button>

          <button
            onClick={() => setActiveTab('DISCOUNTS')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 ${
              activeTab === 'DISCOUNTS'
                ? 'bg-indigo-900 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>🎟️ کدهای تخفیف و جشنواره</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: ROSTER & CERTIFICATE ISSUANCE */}
      {/* ========================================================================= */}
      {activeTab === 'ROSTER' && (
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
          {/* Select Active Course */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex-1">
              <label className="text-xs font-bold text-slate-600 block mb-1">
                انتخاب دوره آموزشی جهت ثبت نمرات و صدور مدرک:
              </label>
              <select
                value={selectedCourseId}
                onChange={e => setSelectedCourseId(Number(e.target.value))}
                className="w-full sm:w-auto bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
              >
                {courses.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.code}) · مدرس: {c.instructorName} · {faNum(c.learners.length)} فراگیر
                  </option>
                ))}
              </select>
            </div>

            <div className="text-xs text-slate-500 font-bold">
              شهریه دوره: <span className="text-indigo-950 font-black">{formatPrice(currentCourse.tuitionPrice)}</span>
            </div>
          </div>

          {/* Learners Table */}
          {currentCourse.learners.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-slate-500 text-xs font-bold">
              هنوز فراگیری در این دوره ثبت‌نام نکرده است.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white text-right">
                    <th className="p-3">ردیف</th>
                    <th className="p-3">نام و نام‌خانوادگی</th>
                    <th className="p-3">کد ملی</th>
                    <th className="p-3">شماره تماس</th>
                    <th className="p-3">مبلغ پرداختی</th>
                    <th className="p-3 text-center">جلسات حضور</th>
                    <th className="p-3 text-center">نمره نهایی (از ۲۰)</th>
                    <th className="p-3 text-center">وضعیت قبولی</th>
                    <th className="p-3 text-left">صدور گواهینامه رسمی</th>
                  </tr>
                </thead>
                <tbody>
                  {currentCourse.learners.map((learner, idx) => (
                    <tr key={learner.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                      <td className="p-3 text-slate-500 font-bold">{faNum(idx + 1)}</td>
                      <td className="p-3 font-black text-slate-900">
                        {learner.fullName}
                        <span className="block text-[10px] text-slate-400 font-mono" dir="ltr">
                          {learner.fullNameEn}
                        </span>
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-700" dir="ltr">
                        {learner.nationalId}
                      </td>
                      <td className="p-3 font-mono text-slate-700" dir="ltr">
                        {learner.mobile}
                      </td>
                      <td className="p-3 font-mono font-bold text-emerald-700">
                        {formatPrice(learner.amountPaid)}
                      </td>

                      {/* Attendance input */}
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={learner.totalSessions}
                            value={learner.attendanceCount}
                            onChange={e =>
                              updateLearnerData(learner.id, 'attendanceCount', Number(e.target.value))
                            }
                            className="w-12 border border-slate-300 rounded-lg p-1 text-center font-bold text-xs"
                          />
                          <span className="text-slate-400">/ {faNum(learner.totalSessions)}</span>
                        </div>
                      </td>

                      {/* Final Grade input */}
                      <td className="p-3 text-center">
                        <input
                          type="number"
                          min={0}
                          max={20}
                          step={0.5}
                          placeholder="—"
                          value={learner.finalGrade ?? ''}
                          onChange={e =>
                            updateLearnerData(
                              learner.registrationId,
                              'finalGrade',
                              e.target.value === '' ? undefined : Number(e.target.value)
                            )
                          }
                          className="w-14 border border-slate-300 rounded-lg p-1 text-center font-black text-xs text-indigo-950 focus:ring-2 focus:ring-indigo-500"
                        />
                      </td>

                      {/* Pass / Fail Badge */}
                      <td className="p-3 text-center">
                        {learner.finalGrade !== undefined ? (
                          learner.isPassed ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-black text-[10px]">
                              ✓ قبول
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-black text-[10px]">
                              مردود
                            </span>
                          )
                        ) : (
                          <span className="text-[10px] text-slate-400 font-bold">درحال ارزیابی</span>
                        )}
                      </td>

                      {/* Certificate Status & Action */}
                      <td className="p-3 text-left">
                        {learner.certificateIssued ? (
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-xl bg-amber-100 text-amber-900 font-mono font-black text-[10px]">
                              {learner.certificateNumber}
                            </span>
                            <Link
                              href={`/verify-certificate/${learner.certificateNumber}`}
                              target="_blank"
                              className="px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-900 border border-indigo-200 font-bold text-[10px] hover:bg-indigo-100 transition"
                            >
                              مشاهده گواهی ↗
                            </Link>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleIssueCertificate(learner.registrationId)}
                            disabled={!learner.isPassed || busyId === learner.registrationId}
                            className="px-3 py-1.5 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-black text-[11px] shadow-xs transition disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            🎓 صدور گواهینامه دیجیتال
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DEFINE NEW SHORT COURSE / BOOTCAMP */}
      {/* ========================================================================= */}
      {activeTab === 'NEW_COURSE' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-5 max-w-3xl">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="font-black text-slate-900 text-base">تعریف دوره آموزشی یا بوت‌کمپ تخصصی جدید</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              پس از ثبت، دوره فوراً در کاتالوگ عمومی و درگاه ثبت‌نام آنلاین فعال می‌گردد.
            </p>
          </div>

          <form onSubmit={handleCreateCourse} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-700 font-bold mb-1">عنوان فارسی دوره *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: بوت‌کمپ هوش مصنوعی و پردازش زبان طبیعی"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">عنوان انگلیسی دوره (جهت گواهینامه)</label>
                <input
                  type="text"
                  placeholder="e.g. AI & NLP Engineering Bootcamp"
                  value={newTitleEn}
                  onChange={e => setNewTitleEn(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-slate-900 font-mono focus:ring-2 focus:ring-indigo-500"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">کد یکتای دوره *</label>
                <input
                  type="text"
                  required
                  placeholder="BOOT-NLP-505"
                  value={newCode}
                  onChange={e => setNewCode(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">دسته‌بندی موضوعی</label>
                <select
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-slate-900"
                >
                  <option value="مهندسی و هوش مصنوعی">مهندسی و هوش مصنوعی</option>
                  <option value="برنامه‌نویسی و وب">برنامه‌نویسی و وب</option>
                  <option value="معماری و عمران">معماری و عمران</option>
                  <option value="مدیریت و مالی">مدیریت و مالی</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">نام و مرتبه علمی مدرس *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: دکتر آرش نیازی"
                  value={newInstructor}
                  onChange={e => setNewInstructor(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">طول مدت دوره (ساعت آموزشی)</label>
                <input
                  type="number"
                  min={10}
                  max={200}
                  value={newHours}
                  onChange={e => setNewHours(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-slate-900 font-mono focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">مبلغ شهریه دوره (تومان) *</label>
                <input
                  type="number"
                  min={0}
                  step={100000}
                  value={newPrice}
                  onChange={e => setNewPrice(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-xl p-2.5 font-mono font-bold text-emerald-700 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">ظرفیت پذیرش (نفر)</label>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={newCapacity}
                  onChange={e => setNewCapacity(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-xl p-2.5 font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="submit"
                className="px-6 py-3 rounded-2xl bg-indigo-900 hover:bg-indigo-950 text-white font-black text-xs shadow-lg transition"
              >
                + ثبت و انتشار دوره در کاتالوگ عمومی
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: PROMO & DISCOUNT CODES */}
      {/* ========================================================================= */}
      {activeTab === 'DISCOUNTS' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-5 max-w-3xl">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="font-black text-slate-900 text-base">مدیریت کدهای تخفیف و کوپن‌های جشنواره</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              کدهای فعال جهت ارائه به دانشجویان، پرسنل یا کمپین‌های تبلیغاتی.
            </p>
          </div>

          {/* New Discount Form */}
          <form onSubmit={handleCreateDiscount} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="font-bold text-xs text-slate-800">ایجاد کد تخفیف جدید:</div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                required
                placeholder="کد تخفیف (مثال: YALDA40)"
                value={newDiscountCode}
                onChange={e => setNewDiscountCode(e.target.value)}
                className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-900"
                dir="ltr"
              />
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={newDiscountPercent}
                  onChange={e => setNewDiscountPercent(Number(e.target.value))}
                  className="w-16 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-center font-bold"
                />
                <span className="text-xs font-bold text-slate-600">درصد تخفیف</span>
              </div>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-black text-xs transition shadow-xs"
              >
                + افزودن کد
              </button>
            </div>
          </form>

          {/* Discounts List */}
          <div className="space-y-2">
            {discounts.map((d, i) => (
              <div
                key={i}
                className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 rounded-xl bg-indigo-100 text-indigo-950 font-mono font-black text-xs">
                    {d.code}
                  </span>
                  <span className="font-black text-emerald-700">{faNum(d.percent)}٪ تخفیف</span>
                  <span className="text-slate-500">
                    استفاده‌شده: {faNum(d.used)} از {faNum(d.max)}
                  </span>
                </div>

                <span className="text-[11px] font-mono text-slate-400">مهلت اعتبار: {faNum(d.validUntil)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
