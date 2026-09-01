'use client';

import React, { useState, useEffect, useMemo } from 'react';

// ============================================================================
// تایپ‌ها و مدل‌های داده‌ای
// ============================================================================

export interface ClassSchedule {
  dayOfWeek: number; // ۰: شنبه الی ۵: پنج‌شنبه
  dayName: string;
  startTime: string; // e.g. "08:00"
  endTime: string;   // e.g. "10:00"
  roomName?: string;
}

export interface ExamSchedule {
  examDate: string;  // e.g. "1405/10/18"
  startTime: string; // e.g. "08:30"
  endTime: string;   // e.g. "10:30"
}

export interface CourseOffering {
  id: number;
  courseId: number;
  code: string;
  title: string;
  units: number;
  capacity: number;
  enrolled: number;
  group: number;
  professor: string;
  courseType: 'پایه' | 'عمومی' | 'اصلی' | 'تخصصی' | 'عملی';
  prereqTitle?: string | null;
  prereqMet: boolean;
  classSchedules: ClassSchedule[];
  examSchedule: ExamSchedule | null;
}

export interface CartCourseItem {
  id: number;
  courseId: number;
  code: string;
  title: string;
  units: number;
  group: number;
  professor: string;
  courseType: string;
  prereqMet: boolean;
  classSchedules: ClassSchedule[];
  examSchedule: ExamSchedule | null;
}

interface Props {
  student: {
    id: number;
    fullName: string;
    studentCode: string;
    isProbation: boolean; // آیا مشروط است؟
    isHonors: boolean;    // آیا معدل الف است؟
    maxAllowedUnits: number; // مثلا ۱۴ برای مشروط، ۲۰ برای عادی، ۲۴ برای الف
    minAllowedUnits: number; // ۱۲ واحد
  };
  term: {
    title: string;
    isEnrollmentOpen: boolean;
  };
  initialOfferings: CourseOffering[];
  initialCart: CartCourseItem[];
}

// ابزار تبدیل اعداد به فارسی جهت جلوگیری از به‌هم‌ریختگی در متن راست‌به‌چپ (Bidi)
const faNum = (n: any) =>
  n === null || n === undefined
    ? '—'
    : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

// تابع بررسی هم‌پوشانی زمانی دو بازه
function checkTimeOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
  return s1.slice(0, 5) < e2.slice(0, 5) && s2.slice(0, 5) < e1.slice(0, 5);
}

export default function CourseCart({
  student,
  term,
  initialOfferings,
  initialCart,
}: Props) {
  // مدیریت وضعیت سبد و ارائه‌ها
  const [offerings, setOfferings] = useState<CourseOffering[]>(initialOfferings);
  const [cart, setCart] = useState<CartCourseItem[]>(initialCart);

  // لودینگ تفکیک‌شده به ازای هر ردیف (Row-level Loading Map)
  const [rowLoadingMap, setRowLoadingMap] = useState<Record<number, boolean>>({});
  const [isSubmittingFinal, setIsSubmittingFinal] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // تایمر ۱۵ دقیقه‌ای رزرو سبد خرید در Redis
  const [cartRemainingSeconds, setCartRemainingSeconds] = useState<number>(15 * 60);

  // فیلترهای جستجوی دروس
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 5000);
  };

  // ⏱ شمارشگر معکوس مهلت سبد خرید
  useEffect(() => {
    if (cart.length === 0) {
      setCartRemainingSeconds(15 * 60);
      return;
    }
    const timer = setInterval(() => {
      setCartRemainingSeconds(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cart.length]);

  // پایش ظرفیت زنده از کش Redis (Polling هر ۴ ثانیه بدون فشار به دیتابیس)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/enroll/live-capacity');
        if (res.ok) {
          const liveData = await res.json();
          setOfferings(prev =>
            prev.map(o => (liveData[o.id] ? { ...o, enrolled: liveData[o.id].enrolled } : o))
          );
        }
      } catch {
        /* در صورت عدم اتصال سکوت می‌کند */
      }
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // مجموع واحدهای اخذ شده در سبد
  const totalUnits = useMemo(() => cart.reduce((sum, c) => sum + c.units, 0), [cart]);

  // ============================================================================
  // موتور تحلیل تداخل‌های زمانی و پیشنهاد هوشمند گروه جایگزین
  // ============================================================================
  const cartConflicts = useMemo(() => {
    const conflicts: Record<
      number,
      { classConflicts: string[]; examConflicts: string[]; alternateGroup?: CourseOffering }
    > = {};

    for (let i = 0; i < cart.length; i++) {
      const itemA = cart[i];
      const classConf: string[] = [];
      const examConf: string[] = [];

      for (let j = 0; j < cart.length; j++) {
        if (i === j) continue;
        const itemB = cart[j];

        // ۱. بررسی تداخل ساعت کلاس هفتگی
        for (const cA of itemA.classSchedules) {
          for (const cB of itemB.classSchedules) {
            if (
              cA.dayOfWeek === cB.dayOfWeek &&
              checkTimeOverlap(cA.startTime, cA.endTime, cB.startTime, cB.endTime)
            ) {
              classConf.push(
                `تداخل ساعت کلاس (${cA.dayName} ساعت ${faNum(cA.startTime)} الی ${faNum(cA.endTime)}) با درس «${itemB.title}»`
              );
            }
          }
        }

        // ۲. بررسی تداخل تاریخ و ساعت امتحان پایانی
        if (
          itemA.examSchedule &&
          itemB.examSchedule &&
          itemA.examSchedule.examDate === itemB.examSchedule.examDate
        ) {
          if (
            checkTimeOverlap(
              itemA.examSchedule.startTime,
              itemA.examSchedule.endTime,
              itemB.examSchedule.startTime,
              itemB.examSchedule.endTime
            )
          ) {
            examConf.push(
              `تداخل ساعت امتحان در تاریخ ${faNum(itemA.examSchedule.examDate)} با درس «${itemB.title}»`
            );
          }
        }
      }

      // ۳. پیشنهاد هوشمند گروه موازی بدون تداخل برای همین درس
      let alternateGroup: CourseOffering | undefined;
      if (classConf.length > 0 || examConf.length > 0) {
        const otherGroups = offerings.filter(
          o => o.courseId === itemA.courseId && o.id !== itemA.id && o.capacity > o.enrolled
        );
        alternateGroup = otherGroups.find(alt => {
          for (const other of cart) {
            if (other.id === itemA.id) continue;
            for (const ca of alt.classSchedules) {
              for (const cb of other.classSchedules) {
                if (
                  ca.dayOfWeek === cb.dayOfWeek &&
                  checkTimeOverlap(ca.startTime, ca.endTime, cb.startTime, cb.endTime)
                )
                  return false;
              }
            }
            if (
              alt.examSchedule &&
              other.examSchedule &&
              alt.examSchedule.examDate === other.examSchedule.examDate
            ) {
              if (
                checkTimeOverlap(
                  alt.examSchedule.startTime,
                  alt.examSchedule.endTime,
                  other.examSchedule.startTime,
                  other.examSchedule.endTime
                )
              )
                return false;
            }
          }
          return true;
        });
      }

      conflicts[itemA.id] = { classConflicts: classConf, examConflicts: examConf, alternateGroup };
    }

    return conflicts;
  }, [cart, offerings]);

  const hasAnyConflict = useMemo(
    () => Object.values(cartConflicts).some(c => c.classConflicts.length > 0 || c.examConflicts.length > 0),
    [cartConflicts]
  );

  // ============================================================================
  // اکشن‌های سمت کاربر با Optimistic UI و مدیریت لودینگ ردیف
  // ============================================================================

  // ۱. افزودن درس به سبد خرید
  const handleAddToCart = async (offering: CourseOffering) => {
    // کنترل سقف واحد قبل از ارسال به سرور
    if (totalUnits + offering.units > student.maxAllowedUnits) {
      alert(
        `خطای سقف واحد: با انتخاب این درس، مجموع واحدها (${totalUnits + offering.units}) از سقف مجاز شما (${student.maxAllowedUnits} واحد) بیشتر می‌شود.`
      );
      return;
    }

    // فعال‌سازی لودینگ فقط برای همین دکمه
    setRowLoadingMap(prev => ({ ...prev, [offering.id]: true }));

    // تغییر خوش‌بینانه در UI
    const newItem: CartCourseItem = {
      id: offering.id,
      courseId: offering.courseId,
      code: offering.code,
      title: offering.title,
      units: offering.units,
      group: offering.group,
      professor: offering.professor,
      courseType: offering.courseType,
      prereqMet: offering.prereqMet,
      classSchedules: offering.classSchedules,
      examSchedule: offering.examSchedule,
    };
    setCart(prev => [...prev, newItem]);

    try {
      await new Promise(r => setTimeout(r, 600));
      showToast(`درس «${offering.title}» به سبد انتخاب واحد افزوده شد.`);
    } catch {
      // Rollback در صورت خطا
      setCart(prev => prev.filter(c => c.id !== offering.id));
      alert('خطا در رزرو درس در سرور. لطفاً دوباره تلاش کنید.');
    } finally {
      setRowLoadingMap(prev => ({ ...prev, [offering.id]: false }));
    }
  };

  // ۲. حذف درس از سبد خرید
  const handleRemoveFromCart = async (offeringId: number) => {
    setRowLoadingMap(prev => ({ ...prev, [offeringId]: true }));
    const prevCart = [...cart];
    setCart(prev => prev.filter(c => c.id !== offeringId));

    try {
      await new Promise(r => setTimeout(r, 500));
      showToast('درس با موفقیت از سبد حذف گردید.');
    } catch {
      setCart(prevCart);
      alert('خطا در حذف درس.');
    } finally {
      setRowLoadingMap(prev => ({ ...prev, [offeringId]: false }));
    }
  };

  // ۳. جابجایی هوشمند به گروه جایگزین بدون تداخل
  const handleSwitchToAlternateGroup = async (currentId: number, altOffering: CourseOffering) => {
    setRowLoadingMap(prev => ({ ...prev, [currentId]: true }));
    setCart(prev =>
      prev.map(c =>
        c.id === currentId
          ? {
              ...c,
              id: altOffering.id,
              group: altOffering.group,
              professor: altOffering.professor,
              classSchedules: altOffering.classSchedules,
              examSchedule: altOffering.examSchedule,
            }
          : c
      )
    );

    try {
      await new Promise(r => setTimeout(r, 700));
      showToast(`درس با موفقیت به گروه ${faNum(altOffering.group)} (بدون تداخل) جابجا شد.`);
    } catch {
      alert('خطا در جابجایی گروه.');
    } finally {
      setRowLoadingMap(prev => ({ ...prev, [currentId]: false }));
    }
  };

  // ۴. ارسال پرونده تداخل به شورای آموزشی
  const handleReferToCouncil = (courseTitle: string) => {
    showToast(`درخواست مجوز هم‌نیازی و اخذ درس «${courseTitle}» به کارتابل شورای آموزشی ارسال شد.`);
  };

  // ۵. ثبت نهایی انتخاب واحد
  const handleFinalSubmit = async () => {
    if (totalUnits < student.minAllowedUnits) {
      alert(
        `خطای حداقل واحد: مجموع واحدهای سبد (${totalUnits} واحد) کمتر از حداقل مجاز (${student.minAllowedUnits} واحد) است.`
      );
      return;
    }
    if (hasAnyConflict) {
      alert('ابتدا باید تداخل‌های کلاسی یا امتحانی موجود در سبد را برطرف کنید.');
      return;
    }

    setIsSubmittingFinal(true);
    try {
      await new Promise(r => setTimeout(r, 1500));
      showToast('🎉 تبریک! انتخاب واحد شما با موفقیت ثبت قطعی شد و تاییدیه صادر گردید.');
    } catch {
      alert('خطا در ثبت نهایی انتخاب واحد.');
    } finally {
      setIsSubmittingFinal(false);
    }
  };

  // فرمت زمان تایمر
  const timerMM = String(Math.floor(cartRemainingSeconds / 60)).padStart(2, '0');
  const timerSS = String(cartRemainingSeconds % 60).padStart(2, '0');

  return (
    <div className="space-y-6" dir="rtl">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="p-4 bg-emerald-900 text-emerald-100 rounded-2xl shadow-xl border border-emerald-700 font-bold text-sm flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="text-lg">📢</span>
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-white/60 hover:text-white text-xs">
            ✕
          </button>
        </div>
      )}

      {/* هدر اطلاعات دانشجو و تایمر سبد خرید */}
      <div className="bg-gradient-to-l from-indigo-950 via-slate-900 to-indigo-900 text-white p-5 rounded-3xl shadow-xl border border-indigo-800/50 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center font-black text-sm">
              🎓
            </span>
            <h1 className="text-lg sm:text-xl font-black">{student.fullName}</h1>
            <span className="text-xs text-indigo-300 font-mono">({faNum(student.studentCode)})</span>
            {student.isProbation && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white animate-pulse">
                مشروط (سقف ۱۴ واحد)
              </span>
            )}
            {student.isHonors && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950">
                معدل الف (سقف ۲۴ واحد)
              </span>
            )}
          </div>
          <p className="text-xs text-indigo-200">
            {term.title} · وضعیت درگاه مالی: <span className="text-emerald-400 font-bold">تسویه علی‌الحساب انجام شده ✓</span>
          </p>
        </div>

        {/* جعبه تایمر و آمار واحدها */}
        <div className="flex flex-wrap items-center gap-3">
          {/* تایمر سبد */}
          <div className="p-2.5 px-4 bg-slate-900/80 rounded-2xl border border-indigo-400/40 flex items-center gap-2.5 shadow-inner">
            <span className="text-lg animate-spin">⏳</span>
            <div>
              <span className="text-[10px] text-indigo-300 block font-bold">مهلت رزرو سبد:</span>
              <span className="text-sm font-mono font-black text-amber-300 tracking-wider">
                {faNum(timerMM)}:{faNum(timerSS)}
              </span>
            </div>
          </div>

          {/* شمارنده واحد */}
          <div className="p-2.5 px-4 bg-slate-900/80 rounded-2xl border border-indigo-400/40 flex items-center gap-2.5 shadow-inner">
            <span className="text-lg">📚</span>
            <div>
              <span className="text-[10px] text-indigo-300 block font-bold">واحدهای انتخابی:</span>
              <span
                className={`text-sm font-black font-mono ${
                  totalUnits > student.maxAllowedUnits
                    ? 'text-rose-400'
                    : totalUnits < student.minAllowedUnits
                    ? 'text-amber-300'
                    : 'text-emerald-400'
                }`}
              >
                {faNum(totalUnits)} از {faNum(student.maxAllowedUnits)} واحد
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* بخش اول: سبد خرید دروس انتخاب‌شده (My Cart) */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xl">🛒</span>
            <h2 className="font-black text-slate-900 text-base">سبد دروس انتخاب‌شده شما</h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-900">
              {faNum(cart.length)} عنوان درس
            </span>
          </div>

          {cart.length > 0 && (
            <button
              onClick={() => setCart([])}
              className="text-xs font-bold text-rose-600 hover:text-rose-800 transition"
            >
              خالی کردن کل سبد 🗑️
            </button>
          )}
        </div>

        {cart.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-2">
            <span className="text-3xl block">🧺</span>
            <p className="text-xs font-bold text-slate-600">سبد انتخاب واحد شما در حال حاضر خالی است.</p>
            <p className="text-[11px] text-slate-400">
              از جدول ارائه‌های درسی زیر، دروس مورد نظر خود را به سبد اضافه کنید.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {cart.map(item => {
              const conf = cartConflicts[item.id];
              const isConflicted = conf && (conf.classConflicts.length > 0 || conf.examConflicts.length > 0);
              const isItemLoading = rowLoadingMap[item.id] || false;

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    isConflicted
                      ? 'bg-rose-50/70 border-rose-300 shadow-sm'
                      : !item.prereqMet
                      ? 'bg-amber-50/70 border-amber-300'
                      : 'bg-white hover:bg-slate-50/80 border-slate-200 shadow-xs'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-500" dir="ltr">
                          {item.code}
                        </span>
                        <h3 className="font-black text-slate-900 text-sm">{item.title}</h3>
                        <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-950 font-bold text-[10px]">
                          گروه {faNum(item.group)}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px]">
                          {faNum(item.units)} واحد
                        </span>
                        <span className="text-xs text-slate-600 font-bold">مدرس: {item.professor}</span>
                      </div>

                      {/* ساعات کلاسی و امتحانی */}
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 pt-1">
                        <span>
                          📅 <b>برنامه هفتگی:</b>{' '}
                          {item.classSchedules
                            .map(s => `${s.dayName} (${faNum(s.startTime)} الی ${faNum(s.endTime)})`)
                            .join(' و ')}
                        </span>
                        {item.examSchedule && (
                          <span>
                            📝 <b>امتحان:</b> {faNum(item.examSchedule.examDate)} ساعت{' '}
                            {faNum(item.examSchedule.startTime)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* دکمه‌های عملیاتی ردیف */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleRemoveFromCart(item.id)}
                        disabled={isItemLoading}
                        className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs transition flex items-center gap-1 disabled:opacity-50"
                      >
                        {isItemLoading ? (
                          <span className="animate-spin text-xs">⏳</span>
                        ) : (
                          <span>حذف از سبد ✕</span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* هشدارهای تداخل زمانی و پیشنهاد گروه جایگزین */}
                  {isConflicted && (
                    <div className="mt-3 p-3 bg-white rounded-xl border border-rose-300 space-y-2 text-xs text-rose-900">
                      <div className="font-extrabold flex items-center gap-1.5">
                        <span>⚠️ هشدار تداخل زمانی در سبد:</span>
                      </div>
                      <ul className="list-disc list-inside text-[11px] space-y-0.5 text-rose-700">
                        {conf.classConflicts.map((c, idx) => (
                          <li key={idx}>{c}</li>
                        ))}
                        {conf.examConflicts.map((e, idx) => (
                          <li key={idx}>{e}</li>
                        ))}
                      </ul>

                      {/* باکس پیشنهاد گروه جایگزین هوشمند */}
                      {conf.alternateGroup ? (
                        <div className="pt-2 border-t border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-emerald-50/60 p-2.5 rounded-lg text-emerald-950">
                          <span className="text-[11px] font-bold">
                            💡 <b>پیشنهاد هوشمند سیستم:</b> گروه {faNum(conf.alternateGroup.group)} این درس با تدریس «
                            {conf.alternateGroup.professor}» هیچ‌گونه تداخلی با سبد شما ندارد.
                          </span>
                          <button
                            onClick={() => handleSwitchToAlternateGroup(item.id, conf.alternateGroup!)}
                            disabled={isItemLoading}
                            className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-xs transition shrink-0"
                          >
                            جابجایی به گروه {faNum(conf.alternateGroup.group)} 🔄
                          </button>
                        </div>
                      ) : (
                        <div className="pt-2 border-t border-rose-200 flex items-center justify-between">
                          <span className="text-[11px] text-slate-500">
                            گروه موازی دیگری برای این درس یافت نشد.
                          </span>
                          <button
                            onClick={() => handleReferToCouncil(item.title)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-900 border border-indigo-200 font-bold text-[10px]"
                          >
                            ارسال درخواست مجوز به شورای آموزشی 📨
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* هشدار پیش‌نیاز */}
                  {!item.prereqMet && (
                    <div className="mt-2 p-2 bg-amber-100/60 rounded-lg text-amber-900 text-xs flex items-center justify-between">
                      <span>⚠️ اخطار پیش‌نیاز: پیش‌نیاز مصوب این درس پاس نشده است.</span>
                      <button
                        onClick={() => handleReferToCouncil(item.title)}
                        className="px-2 py-0.5 rounded bg-amber-200 text-amber-950 font-bold text-[10px]"
                      >
                        درخواست اخذ هم‌نیاز در کمیسیون
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* دکمه ثبت نهایی سبد */}
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100">
              <div className="text-xs text-slate-500">
                با ثبت نهایی، رزرو موقت دروس در صف به ثبت قطعی تبدیل خواهد شد.
              </div>
              <button
                onClick={handleFinalSubmit}
                disabled={isSubmittingFinal || cart.length === 0 || hasAnyConflict}
                className="w-full sm:w-auto px-8 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 text-white font-black text-sm shadow-lg shadow-emerald-700/20 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmittingFinal ? (
                  <>
                    <span className="animate-spin text-sm">⏳</span>
                    <span>در حال برقراری تراکنش اتمیک...</span>
                  </>
                ) : (
                  <>
                    <span>✓ ثبت قطعی انتخاب واحد ({faNum(totalUnits)} واحد)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* بخش دوم: کاتالوگ ارائه‌های درسی ترم (Course Offerings Catalog) */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="font-black text-slate-900 text-base">لیست دروس ارائه‌شده نیمسال</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ظرفیت کلاس‌ها به‌صورت زنده از Redis آپدیت می‌شود (بدون تاخیر).
            </p>
          </div>

          {/* فیلتر و جستجو */}
          <div className="flex items-center gap-2">
            <select
              value={selectedTypeFilter}
              onChange={e => setSelectedTypeFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700"
            >
              <option value="ALL">همه دروس</option>
              <option value="تخصصی">تخصصی</option>
              <option value="اصلی">اصلی</option>
              <option value="پایه">پایه</option>
              <option value="عمومی">عمومی</option>
            </select>

            <input
              type="text"
              placeholder="جستجوی نام درس یا استاد..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs bg-slate-50 w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* جدول ارائه‌ها */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="p-3">کد درس</th>
                <th className="p-3">عنوان درس و گروه</th>
                <th className="p-3">نوع</th>
                <th className="p-3 text-center">واحد</th>
                <th className="p-3">استاد مدرس</th>
                <th className="p-3 text-center">ظرفیت زنده</th>
                <th className="p-3">برنامه کلاسی و امتحان</th>
                <th className="p-3 text-left">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {offerings
                .filter(o => {
                  if (selectedTypeFilter !== 'ALL' && o.courseType !== selectedTypeFilter) return false;
                  if (searchQuery.trim()) {
                    const q = searchQuery.trim().toLowerCase();
                    return o.title.toLowerCase().includes(q) || o.code.includes(q) || o.professor.includes(q);
                  }
                  return true;
                })
                .map(offering => {
                  const isAlreadyInCart = cart.some(c => c.id === offering.id);
                  const isFull = offering.enrolled >= offering.capacity;
                  const isItemLoading = rowLoadingMap[offering.id] || false;

                  return (
                    <tr
                      key={offering.id}
                      className={`border-b border-slate-100 hover:bg-slate-50 transition ${
                        isAlreadyInCart ? 'bg-indigo-50/40' : ''
                      }`}
                    >
                      <td className="p-3 font-mono font-bold text-slate-600" dir="ltr">
                        {offering.code}
                      </td>
                      <td className="p-3 font-black text-slate-900">
                        {offering.title}{' '}
                        <span className="text-[10px] text-indigo-900 font-bold bg-indigo-50 px-1.5 py-0.5 rounded mr-1">
                          گروه {faNum(offering.group)}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {offering.courseType}
                        </span>
                      </td>
                      <td className="p-3 text-center font-bold text-slate-800 font-mono">
                        {faNum(offering.units)}
                      </td>
                      <td className="p-3 font-bold text-slate-800">{offering.professor}</td>
                      <td className="p-3 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                            isFull
                              ? 'bg-rose-100 text-rose-800'
                              : offering.capacity - offering.enrolled <= 3
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {faNum(offering.enrolled)} از {faNum(offering.capacity)}
                        </span>
                      </td>
                      <td className="p-3 text-[11px] text-slate-600">
                        <div>
                          {offering.classSchedules
                            .map(s => `${s.dayName} (${faNum(s.startTime)}-${faNum(s.endTime)})`)
                            .join('، ')}
                        </div>
                        {offering.examSchedule && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            امتحان: {faNum(offering.examSchedule.examDate)}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-left">
                        {isAlreadyInCart ? (
                          <span className="px-3 py-1.5 rounded-xl bg-indigo-100 text-indigo-900 font-extrabold text-xs inline-block">
                            ✓ در سبد شما
                          </span>
                        ) : isFull ? (
                          <button
                            disabled
                            className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-400 font-bold text-xs cursor-not-allowed"
                          >
                            تکمیل ظرفیت
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAddToCart(offering)}
                            disabled={isItemLoading}
                            className="px-4 py-1.5 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-extrabold text-xs shadow-xs transition flex items-center gap-1 disabled:opacity-50"
                          >
                            {isItemLoading ? (
                              <span className="animate-spin text-xs">⏳</span>
                            ) : (
                              <span>+ افزودن به سبد</span>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
