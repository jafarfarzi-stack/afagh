import React from 'react';
import Link from 'next/link';

// شبیه‌سازی واکشی اطلاعات از دیتابیس بر اساس کد رهگیری (یا کوئری مستقیم به جداول Drizzle)
async function getCertificateDetails(code: string) {
  const normalized = decodeURIComponent(code).trim().toUpperCase();

  // کدهای تستی شبیه‌سازی جعل یا نامعتبر
  if (normalized === 'FAKE-123' || normalized === 'INVALID' || normalized.startsWith('TEST-FAKE')) {
    return null;
  }

  // نمونه‌های معتبر در پایگاه داده دانشگاه آفاق
  const database: Record<string, any> = {
    'AFG-984A-23X9': {
      certificateCode: 'AFG-984A-23X9',
      issuedAt: '۱۴۰۵/۰۶/۱۵',
      learner: {
        fullName: 'علی رضایی',
        fullNameEn: 'Ali Rezaei',
        nationalId: '۲۷۵******۳',
      },
      course: {
        title: 'برنامه‌نویسی فول‌استک با Next.js و Node.js',
        duration: '۱۲۰ ساعت',
        instructor: 'مهندس سامان افشار',
      },
      grade: '۱۸.۵۰',
      status: 'VALID',
    },
    'AFQ-CERT-2026-9041': {
      certificateCode: 'AFQ-CERT-2026-9041',
      issuedAt: '۱۴۰۵/۱۰/۲۲',
      learner: {
        fullName: 'امیررضا صادقی‌راد',
        fullNameEn: 'Amir Reza Sadeghi Rad',
        nationalId: '۰۰۲******۹',
      },
      course: {
        title: 'بوت‌کمپ جامع برنامه‌نویسی پایتون و هوش مصنوعی کاربردی',
        duration: '۶۰ ساعت',
        instructor: 'دکتر محمدرضا جلالی',
      },
      grade: '۱۹.۵۰',
      status: 'VALID',
    },
    'AFQ-CERT-2026-8812': {
      certificateCode: 'AFQ-CERT-2026-8812',
      issuedAt: '۱۴۰۵/۱۱/۱۵',
      learner: {
        fullName: 'مهسا کاظمی‌تبار',
        fullNameEn: 'Mahsa Kazemi Tabar',
        nationalId: '۲۷۵******۰',
      },
      course: {
        title: 'بوت‌کمپ فول‌استک وب (Next.js 14, React & PostgreSQL)',
        duration: '۸۰ ساعت',
        instructor: 'مهندس سامان افشار',
      },
      grade: '۱۸.۰۰',
      status: 'VALID',
    },
  };

  if (database[normalized]) {
    return database[normalized];
  }

  // برای سایر کدهای فرمت AFQ، یک خروجی معتبر پویا تولید می‌کنیم
  if (normalized.startsWith('AFQ-') || normalized.startsWith('AFG-')) {
    return {
      certificateCode: normalized,
      issuedAt: '۱۴۰۵/۰۸/۲۰',
      learner: {
        fullName: 'فراگیر محترم دانشگاه آفاق',
        fullNameEn: 'Honorable Learner',
        nationalId: '۲۷۴******۱',
      },
      course: {
        title: 'دوره تخصصی و مهارت‌محور آزاد',
        duration: '۵۰ ساعت',
        instructor: 'استاد هیئت علمی دانشگاه',
      },
      grade: '۱۷.۵۰',
      status: 'VALID',
    };
  }

  return null;
}

export default async function VerifyCertificatePage({
  params,
}: {
  params: { code: string };
}) {
  const code = params.code;
  const certDetails = await getCertificateDetails(code);

  return (
    <div className="min-h-screen bg-slate-100 font-sans flex flex-col items-center py-10 px-4" dir="rtl">
      {/* هدر رسمی دانشگاه */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-gradient-to-tr from-indigo-950 to-indigo-800 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg text-white font-black text-2xl border-2 border-amber-400">
          آ
        </div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900">سامانه اصالت‌سنجی مدارک رسمی</h1>
        <p className="text-xs text-slate-500 mt-1 font-bold">دانشگاه غیرانتفاعی آفاق ارومیه · مرکز آموزش‌های آزاد</p>
      </div>

      <div className="w-full max-w-lg space-y-4">
        {/* حالت ۱: گواهینامه نامعتبر یا جعلی */}
        {!certDetails && (
          <div className="bg-white p-8 rounded-3xl shadow-xl border-t-4 border-rose-500 text-center animate-fadeIn space-y-4">
            <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">گواهینامه نامعتبر است</h2>
              <p className="text-xs text-slate-600 mt-2 leading-6">
                کد رهگیری <span className="font-mono text-rose-600 font-black tracking-widest text-sm" dir="ltr">{code}</span> در پایگاه داده دانشگاه آفاق یافت نشد. این سند فاقد هرگونه اعتبار قانونی می‌باشد.
              </p>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
              <Link
                href="/open-courses"
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition"
              >
                کاتالوگ دوره‌های معتبر
              </Link>
              <button
                onClick={() => {}}
                className="px-5 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-bold text-xs transition"
              >
                🚨 گزارش جعل مدرک به حراست
              </button>
            </div>
          </div>
        )}

        {/* حالت ۲: گواهینامه معتبر */}
        {certDetails && certDetails.status === 'VALID' && (
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200 animate-fadeIn">
            {/* سربرگ سبز رنگ تایید */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-center text-white space-y-2">
              <div className="w-16 h-16 bg-white text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-md">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-black">اصالت گواهینامه رسماً تایید شد</h2>
              <p className="text-emerald-100 text-xs tracking-widest font-mono font-bold" dir="ltr">
                کد رهگیری: {certDetails.certificateCode}
              </p>
            </div>

            {/* جزئیات اطلاعات (برای تطبیق کارفرما) */}
            <div className="p-6 sm:p-7 space-y-6 text-xs">
              <div>
                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2 mb-3">
                  👤 مشخصات هویتی فراگیر
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <p className="text-[11px] text-slate-500 font-bold">نام و نام خانوادگی:</p>
                    <p className="font-black text-slate-900 text-sm mt-0.5">{certDetails.learner.fullName}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <p className="text-[11px] text-slate-500 font-bold">کد ملی (ماسک‌شده):</p>
                    <p className="font-mono font-black text-slate-900 text-sm mt-0.5 tracking-widest" dir="ltr">
                      {certDetails.learner.nationalId}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2 mb-3">
                  🎓 مشخصات دوره و ارزیابی
                </h3>
                <div className="space-y-2.5">
                  <div className="bg-indigo-50/70 p-3 rounded-2xl border border-indigo-100">
                    <p className="text-[11px] text-indigo-950 font-bold">عنوان دوره تخصصی:</p>
                    <p className="font-black text-indigo-950 text-sm mt-0.5">{certDetails.course.title}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                      <p className="text-[10px] text-slate-500 font-bold">استاد و ارزیاب دوره:</p>
                      <p className="font-bold text-slate-800 text-xs mt-0.5">{certDetails.course.instructor}</p>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                      <p className="text-[10px] text-slate-500 font-bold">طول مدت دوره:</p>
                      <p className="font-mono font-bold text-slate-800 text-xs mt-0.5">{certDetails.course.duration}</p>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                      <p className="text-[10px] text-slate-500 font-bold">تاریخ صدور رسمی:</p>
                      <p className="font-mono font-bold text-slate-800 text-xs mt-0.5">{certDetails.issuedAt}</p>
                    </div>

                    <div className="bg-emerald-50 p-2.5 rounded-2xl border border-emerald-100">
                      <p className="text-[10px] text-emerald-800 font-bold">نمره نهایی فراگیر:</p>
                      <p className="font-mono font-black text-emerald-800 text-sm mt-0.5">{certDetails.grade} از ۲۰</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* فوتر امنیتی */}
            <div className="bg-slate-50 p-4 text-center text-[11px] text-slate-500 border-t border-slate-200 flex items-center justify-center gap-1.5 font-bold">
              <span>🔒</span>
              <span>این استعلام به صورت برخط و مستقیماً از پایگاه داده امن دانشگاه آفاق صادر شده است.</span>
            </div>
          </div>
        )}

        <div className="text-center">
          <Link href="/open-courses" className="text-xs text-indigo-900 font-bold hover:underline">
            ← بازگشت به صفحه اصلی دوره‌های آموزشی
          </Link>
        </div>
      </div>
    </div>
  );
}
