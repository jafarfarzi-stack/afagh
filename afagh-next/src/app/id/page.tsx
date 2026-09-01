'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function SecurityGuardScannerPage() {
  const router = useRouter();
  const [inputToken, setInputToken] = useState('');
  const [isSimulatingScan, setIsSimulatingScan] = useState(false);

  const handleScanToken = (token: string) => {
    setIsSimulatingScan(true);
    setTimeout(() => {
      router.push(`/id/${token}`);
    }, 300);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col items-center justify-center p-4" dir="rtl">
      <div className="bg-slate-900 border border-indigo-900/60 p-6 sm:p-8 rounded-3xl max-w-md w-full shadow-2xl space-y-6 text-center">
        <div className="w-16 h-16 bg-gradient-to-tr from-indigo-700 to-indigo-500 rounded-2xl flex items-center justify-center text-white font-black text-2xl mx-auto shadow-lg shadow-indigo-600/40">
          🛡️
        </div>

        <div>
          <h1 className="text-lg sm:text-xl font-black text-white">اپلیکیشن حراست و گیت ورود دانشگاه</h1>
          <p className="text-xs text-indigo-300 mt-1 font-bold">اسکن بارکد QR پویا روی کارت‌های دانشجویی هوشمند</p>
        </div>

        {/* Camera Viewfinder Simulator */}
        <div className="relative w-full h-48 bg-slate-950 rounded-2xl border-2 border-dashed border-indigo-500/60 flex flex-col items-center justify-center space-y-2 overflow-hidden group">
          <div className="absolute inset-x-8 top-1/2 h-0.5 bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse"></div>
          <span className="text-3xl">📷</span>
          <span className="text-xs text-slate-400 font-bold">بارکد کارت دانشجویی را در کادر قرار دهید</span>
        </div>

        {/* Manual Token Search */}
        <form
          onSubmit={e => {
            e.preventDefault();
            if (inputToken) handleScanToken(inputToken.trim().toUpperCase());
          }}
          className="space-y-2"
        >
          <input
            type="text"
            placeholder="کد توکن امنیتی (مثال: 7F9B-2X4A)"
            value={inputToken}
            onChange={e => setInputToken(e.target.value)}
            className="w-full bg-slate-950 border border-indigo-700/60 rounded-xl p-3 text-center font-mono font-bold text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            dir="ltr"
          />
          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-lg transition"
          >
            🔍 بررسی وضعیت کارت در پایگاه داده
          </button>
        </form>

        {/* Quick Demo Test Buttons */}
        <div className="pt-3 border-t border-slate-800 space-y-2 text-xs">
          <span className="text-slate-400 block font-bold">تست سناریوهای گیت ورودی:</span>
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => handleScanToken('7F9B-2X4A')}
              className="p-2 rounded-xl bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-600/50 text-emerald-300 font-bold transition flex items-center justify-between"
            >
              <span>دانشجوی فعال و مجاز (امیرحسین رضایی)</span>
              <span className="font-mono text-[10px]">🟢 سبز</span>
            </button>

            <button
              onClick={() => handleScanToken('3K8M-9P1L')}
              className="p-2 rounded-xl bg-amber-950/60 hover:bg-amber-900 border border-amber-600/50 text-amber-300 font-bold transition flex items-center justify-between"
            >
              <span>دانشجوی مسدود مالی (محمدحسین حسینی)</span>
              <span className="font-mono text-[10px]">🔴 قرمز</span>
            </button>

            <button
              onClick={() => handleScanToken('9X2Z-4W7Q')}
              className="p-2 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-600/50 text-rose-300 font-bold transition flex items-center justify-between"
            >
              <span>دانشجوی اخراجی/محروم (رضا کمالی)</span>
              <span className="font-mono text-[10px]">⛔ باطل</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
