'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export interface VerifiedCertificate {
  certificateNumber: string;
  verificationHash: string;
  fullNameFa: string;
  fullNameEn: string;
  nationalIdMasked: string;
  courseTitleFa: string;
  courseTitleEn: string;
  courseHours: number;
  instructorNameFa: string;
  instructorNameEn: string;
  grade: number;
  gradeStatus: 'عالی (A+)' | 'خیلی خوب (A)' | 'خوب (B)' | 'قبول (Pass)';
  issueDateFa: string;
  issueDateEn: string;
  status: 'VALID' | 'REVOKED' | 'EXPIRED';
}

const faNum = (n: any) =>
  n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

export default function VerifyCertificateClient({
  initialCode,
  sampleCertificates,
}: {
  initialCode?: string;
  sampleCertificates: Record<string, VerifiedCertificate>;
}) {
  const [searchCode, setSearchCode] = useState<string>(initialCode || 'AFQ-CERT-2026-9041');
  const [currentCert, setCurrentCert] = useState<VerifiedCertificate | null>(
    initialCode && sampleCertificates[initialCode]
      ? sampleCertificates[initialCode]
      : sampleCertificates['AFQ-CERT-2026-9041'] || null
  );
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string>('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError('');
    setIsSearching(true);

    const key = searchCode.trim().toUpperCase();
    setTimeout(() => {
      if (sampleCertificates[key]) {
        setCurrentCert(sampleCertificates[key]);
      } else {
        setCurrentCert(null);
        setSearchError('گواهینامه‌ای با این شماره سریال در پایگاه داده دانشگاه آفاق یافت نشد.');
      }
      setIsSearching(false);
    }, 400);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans" dir="rtl">
      {/* Header */}
      <header className="border-b border-indigo-900/60 bg-slate-950/90 backdrop-blur-md sticky top-0 z-40 print:hidden">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-indigo-600 flex items-center justify-center font-black text-white text-base shadow-lg shadow-indigo-600/30">
              آ
            </div>
            <div>
              <h1 className="font-black text-sm sm:text-base text-white">
                سامانه برخط استعلام اصالت گواهینامه‌های رسمی دانشگاه آفاق
              </h1>
              <p className="text-[11px] text-indigo-300">
                AFAGH University Official Certificate Verification Portal
              </p>
            </div>
          </div>

          <Link
            href="/open-courses"
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition"
          >
            ← کاتالوگ دوره‌های آزاد
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Verification Search Bar (Hidden during print) */}
        <div className="bg-slate-900 p-5 rounded-3xl border border-indigo-900/50 shadow-xl space-y-3 print:hidden">
          <h2 className="font-black text-base text-white flex items-center gap-2">
            <span>🔍</span>
            <span>استعلام شماره سریال یا کد رهگیری گواهینامه:</span>
          </h2>
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="شماره سریال گواهی (مثال: AFQ-CERT-2026-9041 یا AFQ-CERT-2026-8812)"
              value={searchCode}
              onChange={e => setSearchCode(e.target.value)}
              className="flex-1 bg-slate-950 border border-indigo-700/60 rounded-2xl px-4 py-3 text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              dir="ltr"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-lg shadow-indigo-600/30 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSearching ? <span className="animate-spin text-sm">⏳</span> : <span>استعلام اصالت</span>}
            </button>
          </form>

          {searchError && (
            <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-2xl text-rose-300 text-xs font-bold">
              ⚠️ {searchError}
            </div>
          )}

          <div className="text-[11px] text-slate-400 flex flex-wrap gap-2 items-center">
            <span>شماره‌های نمونه معتبر جهت تست:</span>
            <button
              onClick={() => {
                setSearchCode('AFQ-CERT-2026-9041');
                setCurrentCert(sampleCertificates['AFQ-CERT-2026-9041']);
                setSearchError('');
              }}
              className="font-mono text-indigo-400 hover:underline"
            >
              AFQ-CERT-2026-9041 (پایتون و هوش مصنوعی)
            </button>
            <span>·</span>
            <button
              onClick={() => {
                setSearchCode('AFQ-CERT-2026-8812');
                setCurrentCert(sampleCertificates['AFQ-CERT-2026-8812']);
                setSearchError('');
              }}
              className="font-mono text-indigo-400 hover:underline"
            >
              AFQ-CERT-2026-8812 (فول‌استک وب)
            </button>
          </div>
        </div>

        {/* Certificate Validated Banner (Print: Hidden) */}
        {currentCert && (
          <div className="p-4 bg-emerald-950/80 border border-emerald-500/60 rounded-3xl text-emerald-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xl print:hidden">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-xl font-black">
                ✓
              </div>
              <div>
                <h3 className="font-black text-sm text-white">اصالت این گواهینامه رسماً تایید می‌شود</h3>
                <p className="text-xs text-emerald-300">
                  صادره از دانشگاه آفاق با ثبت در بایگانی دیجیتال آموزش‌های آزاد و مهر الکترونیکی یکتا.
                </p>
              </div>
            </div>

            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md transition flex items-center gap-1.5 shrink-0"
            >
              <span>🖨️ چاپ / ذخیره PDF رسمی</span>
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* OFFICIAL BILINGUAL CERTIFICATE DOCUMENT (HIGH-RES PRINTABLE VIEW) */}
        {/* ========================================================================= */}
        {currentCert && (
          <div className="relative bg-white text-slate-900 rounded-3xl p-8 sm:p-12 shadow-2xl border-8 border-double border-indigo-950/20 space-y-8 overflow-hidden print:p-8 print:border-4 print:shadow-none print:rounded-none">
            {/* Background Watermark Crest */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
              <span className="text-[280px] font-black">AFAGH</span>
            </div>

            {/* Certificate Header */}
            <div className="flex items-center justify-between pb-6 border-b-2 border-slate-200">
              <div className="text-right space-y-0.5">
                <p className="font-bold text-xs text-slate-500">جمهوری اسلامی ایران</p>
                <p className="font-black text-base text-indigo-950">دانشگاه آفاق</p>
                <p className="text-[11px] text-slate-600 font-bold">مرکز آموزش‌های تخصصی و آزاد</p>
              </div>

              {/* Official University Crest / Seal */}
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-indigo-950 to-indigo-800 text-amber-300 flex items-center justify-center font-black text-2xl border-4 border-amber-400 shadow-md mx-auto">
                  آ
                </div>
                <span className="text-[10px] font-black tracking-widest text-slate-500 block mt-1">
                  EST. 2007
                </span>
              </div>

              <div className="text-left space-y-0.5" dir="ltr">
                <p className="font-bold text-xs text-slate-500">ISLAMIC REPUBLIC OF IRAN</p>
                <p className="font-black text-base text-indigo-950">AFAGH UNIVERSITY</p>
                <p className="text-[11px] text-slate-600 font-bold">Continuing Education Center</p>
              </div>
            </div>

            {/* Certificate Title Banner */}
            <div className="text-center space-y-1">
              <h2 className="text-2xl sm:text-3xl font-black text-indigo-950 tracking-tight">
                گواهیـنامـه پایـان دوره تـخصـصی
              </h2>
              <p className="text-sm font-black text-slate-500 tracking-wider font-mono uppercase" dir="ltr">
                CERTIFICATE OF COMPLETION & PROFESSIONAL PROFICIENCY
              </p>
            </div>

            {/* Body Text */}
            <div className="space-y-6 text-sm sm:text-base leading-8 text-slate-800 text-justify">
              <p>
                بدین‌وسیله گواهی می‌شود سرکار خانم / جناب آقای{' '}
                <b className="text-indigo-950 text-lg underline decoration-amber-400 decoration-2 underline-offset-4">
                  {currentCert.fullNameFa}
                </b>{' '}
                (با کد ملی: <span className="font-mono font-bold">{currentCert.nationalIdMasked}</span>)، دوره
                تخصصی و مهارتی{' '}
                <b className="text-indigo-950 text-base">«{currentCert.courseTitleFa}»</b> به مدت{' '}
                <b className="text-slate-950 font-mono font-black">{faNum(currentCert.courseHours)} ساعت آموزشی</b>{' '}
                را با تدریس استاد محترم <b>{currentCert.instructorNameFa}</b> با موفقیت و کسب نمره{' '}
                <b className="text-emerald-700 font-mono font-black">{faNum(currentCert.grade)} از ۲۰</b> ({currentCert.gradeStatus}) به پایان رسانده است.
              </p>

              {/* English Version */}
              <p className="text-xs sm:text-sm leading-6 text-slate-600 font-sans border-t border-slate-100 pt-4" dir="ltr">
                This is to certify that <b>{currentCert.fullNameEn}</b> has successfully completed the professional
                bootcamp course in <b>&ldquo;{currentCert.courseTitleEn}&rdquo;</b> comprising{' '}
                <b>{currentCert.courseHours} credit hours</b>, taught by <b>{currentCert.instructorNameEn}</b>,
                achieving a final grade of <b>{currentCert.grade}/20</b> with honorable standing.
              </p>
            </div>

            {/* Footer Signatures & QR Code */}
            <div className="pt-8 border-t-2 border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-6 items-center">
              {/* Instructor Signature */}
              <div className="text-center space-y-1">
                <div className="h-12 flex items-center justify-center">
                  <span className="font-serif italic text-indigo-900 font-bold text-lg">
                    {currentCert.instructorNameFa}
                  </span>
                </div>
                <p className="font-black text-xs text-slate-900">مدرس و ارزیاب دوره</p>
                <p className="text-[10px] text-slate-500 font-mono" dir="ltr">
                  Lead Course Instructor
                </p>
              </div>

              {/* QR Code & Digital Verification Hash */}
              <div className="text-center space-y-1 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <div className="w-16 h-16 bg-white p-1 rounded-xl border border-slate-300 mx-auto flex items-center justify-center font-mono text-[9px] text-slate-400">
                  [QR-CODE]
                </div>
                <span className="text-[10px] font-mono font-black text-indigo-950 block" dir="ltr">
                  {currentCert.certificateNumber}
                </span>
                <span className="text-[8px] font-mono text-slate-400 block break-all truncate max-w-[180px] mx-auto" dir="ltr">
                  SHA256: {currentCert.verificationHash.slice(0, 24)}...
                </span>
              </div>

              {/* Center Director Signature */}
              <div className="text-center space-y-1">
                <div className="h-12 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full border-2 border-indigo-900/30 flex items-center justify-center font-black text-indigo-900 text-xs shadow-inner">
                    مهر دانشگاه
                  </div>
                </div>
                <p className="font-black text-xs text-slate-900">رئیس مرکز آموزش‌های آزاد دانشگاه</p>
                <p className="text-[10px] text-slate-500 font-mono" dir="ltr">
                  Director of Continuing Education
                </p>
              </div>
            </div>

            {/* Issue Date Footer */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-3 border-t border-slate-100 font-mono">
              <span>تاریخ صدور: {faNum(currentCert.issueDateFa)}</span>
              <span>Issue Date: {currentCert.issueDateEn}</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
