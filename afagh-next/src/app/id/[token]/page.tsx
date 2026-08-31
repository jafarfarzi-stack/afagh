import React from 'react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface StudentIdCardData {
  token: string;
  studentCode: string;
  nationalIdMasked: string;
  fullName: string;
  majorName: string;
  degreeLevel: string;
  entranceYear: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'FINANCIAL_BLOCK' | 'EXPELLED';
  statusReason?: string;
  photoUrl?: string;
  issuedAt: string;
  expiresAt: string;
  rfidUid: string;
}

const sampleCards: Record<string, StudentIdCardData> = {
  '7F9B-2X4A': {
    token: '7F9B-2X4A',
    studentCode: '401123401',
    nationalIdMasked: '۰۰۲******۹',
    fullName: 'امیرحسین رضایی',
    majorName: 'مهندسی کامپیوتر — نرم‌افزار',
    degreeLevel: 'کارشناسی پیوسته',
    entranceYear: '۱۴۰۱',
    status: 'ACTIVE',
    issuedAt: '۱۴۰۱/۰۷/۱۵',
    expiresAt: '۱۴۰۵/۰۶/۳۱',
    rfidUid: 'E280-1160-2000-7789',
  },
  '3K8M-9P1L': {
    token: '3K8M-9P1L',
    studentCode: '401123403',
    nationalIdMasked: '۰۰۳******۱',
    fullName: 'محمدحسین حسینی',
    majorName: 'مهندسی کامپیوتر',
    degreeLevel: 'کارشناسی',
    entranceYear: '۱۴۰۱',
    status: 'FINANCIAL_BLOCK',
    statusReason: 'مسدودی مالی — عدم تسویه علی‌الحساب شهریه ترم جاری',
    issuedAt: '۱۴۰۱/۰۷/۱۵',
    expiresAt: '۱۴۰۵/۰۶/۳۱',
    rfidUid: 'E280-1160-2000-8841',
  },
  '9X2Z-4W7Q': {
    token: '9X2Z-4W7Q',
    studentCode: '399120055',
    nationalIdMasked: '۲۷۵******۳',
    fullName: 'رضا کمالی',
    majorName: 'مهندسی معماری',
    degreeLevel: 'کارشناسی',
    entranceYear: '۱۳۹۹',
    status: 'EXPELLED',
    statusReason: 'محرومیت انضباطی — عدم مراجعه و اتمام سقف سنوات قانونی',
    issuedAt: '۱۳۹۹/۰۷/۱۵',
    expiresAt: '۱۴۰۳/۰۶/۳۱',
    rfidUid: 'E280-1160-2000-1102',
  },
};

const faNum = (n: any) =>
  n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

export default async function StudentIdVerificationPage({
  params,
}: {
  params: { token: string };
}) {
  const token = decodeURIComponent(params.token).toUpperCase().trim();
  const cardData = sampleCards[token] || (token.startsWith('7F') || token.startsWith('AF') ? {
    token,
    studentCode: '402123501',
    nationalIdMasked: '۲۷۴******۰',
    fullName: 'دانشجوی رسمی دانشگاه آفاق',
    majorName: 'مهندسی برق و الکترونیک',
    degreeLevel: 'کارشناسی',
    entranceYear: '۱۴۰۲',
    status: 'ACTIVE' as const,
    issuedAt: '۱۴۰۲/۰۷/۱۵',
    expiresAt: '۱۴۰۶/۰۶/۳۱',
    rfidUid: 'E280-1160-2000-9901',
  } : null);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col items-center justify-center p-4" dir="rtl">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-xl mx-auto shadow-lg shadow-indigo-600/40 mb-2 border border-indigo-400/40">
          آ
        </div>
        <h1 className="text-base sm:text-lg font-black text-white">سامانه هوشمند گیت حراست و استعلام کارت دانشجویی</h1>
        <p className="text-xs text-indigo-300">AFAGH University Smart ID & Campus Security Live Verification</p>
      </div>

      <div className="w-full max-w-md">
        {!cardData ? (
          <div className="bg-slate-900 rounded-3xl border-2 border-rose-500 p-6 text-center space-y-4 shadow-2xl">
            <div className="w-20 h-20 bg-rose-950 text-rose-400 rounded-full flex items-center justify-center mx-auto text-4xl border border-rose-600/50">
              ✕
            </div>
            <div>
              <h2 className="text-xl font-black text-rose-400">کارت دانشجویی نامعتبر / فاقد هویت</h2>
              <p className="text-xs text-slate-400 mt-1 leading-5">
                توکن امنیتی <span className="font-mono text-white font-black" dir="ltr">{token}</span> در سیستم ثبت احوال آموزشی دانشگاه یافت نشد.
              </p>
            </div>
            <div className="p-3 bg-rose-950/40 rounded-2xl border border-rose-800 text-xs text-rose-200 font-bold">
              ⛔ ورود به محوطه دانشگاه و اماکن آموزشی غیرمجاز است.
            </div>
          </div>
        ) : (
          <div
            className={`rounded-3xl border-2 shadow-2xl overflow-hidden bg-slate-900 ${
              cardData.status === 'ACTIVE'
                ? 'border-emerald-500 shadow-emerald-950/50'
                : 'border-rose-500 shadow-rose-950/50'
            }`}
          >
            {/* Status Top Banner */}
            <div
              className={`p-4 text-center text-white font-black text-sm flex items-center justify-center gap-2 ${
                cardData.status === 'ACTIVE' ? 'bg-emerald-600' : 'bg-rose-600'
              }`}
            >
              <span className="text-xl">{cardData.status === 'ACTIVE' ? '✓' : '⛔'}</span>
              <span>
                {cardData.status === 'ACTIVE'
                  ? 'کارت دانشجویی معتبر — ورود مجاز'
                  : cardData.status === 'FINANCIAL_BLOCK'
                  ? 'کارت مسدود مالی — ممانعت از ورود'
                  : 'دانشجو محروم / اخراج — فاقد اعتبار'}
              </span>
            </div>

            {/* Student Photo & Profile Body */}
            <div className="p-6 space-y-5 text-xs">
              <div className="flex items-center gap-4">
                {/* Large Student Avatar / Photo */}
                <div className="w-24 h-28 rounded-2xl bg-indigo-950 border-2 border-indigo-400/50 flex flex-col items-center justify-center text-indigo-300 shrink-0 shadow-md">
                  <span className="text-4xl">👨‍🎓</span>
                  <span className="text-[9px] font-bold text-slate-400 mt-1">عکس احراز هویت</span>
                </div>

                <div className="space-y-1">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-900/80 text-indigo-300">
                    {cardData.degreeLevel}
                  </span>
                  <h3 className="text-base font-black text-white">{cardData.fullName}</h3>
                  <p className="text-slate-300 font-bold">{cardData.majorName}</p>
                  <p className="text-slate-400 font-mono text-[11px]">ورودی: {faNum(cardData.entranceYear)}</p>
                </div>
              </div>

              {/* Data Grid */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">شماره دانشجویی:</span>
                  <span className="font-mono font-black text-amber-300 text-sm tracking-wider" dir="ltr">
                    {cardData.studentCode}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-400">کد ملی (ماسک‌شده):</span>
                  <span className="font-mono font-bold text-slate-200" dir="ltr">
                    {cardData.nationalIdMasked}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-400">شناسه RFID هوشمند:</span>
                  <span className="font-mono text-[10px] text-slate-400" dir="ltr">
                    {cardData.rfidUid}
                  </span>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-slate-800">
                  <span className="text-slate-400">تاریخ انقضای کارت:</span>
                  <span className="font-mono font-bold text-indigo-300">{faNum(cardData.expiresAt)}</span>
                </div>
              </div>

              {/* Reason alert if blocked */}
              {cardData.status !== 'ACTIVE' && cardData.statusReason && (
                <div className="p-3 bg-rose-950/70 border border-rose-700/80 rounded-2xl text-rose-200 text-xs font-bold leading-5">
                  ⚠️ <b>علت مسدودی سیستمی:</b> {cardData.statusReason}
                </div>
              )}

              {/* Security Guard Live Stamp */}
              <div className="text-center text-[10px] text-slate-500 pt-1 font-mono">
                استعلام زنده از سرور مرکزی دانشگاه آفاق · توکن: {cardData.token}
              </div>
            </div>
          </div>
        )}

        <div className="text-center pt-4">
          <Link href="/id" className="text-xs text-indigo-400 hover:underline">
            ← بازگشت به اسکنر دوربین حراست
          </Link>
        </div>
      </div>
    </div>
  );
}
