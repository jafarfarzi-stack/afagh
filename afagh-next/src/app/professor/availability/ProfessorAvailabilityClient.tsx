'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export type SlotStatus = 'PREF' | 'AVAIL' | 'UNAVAIL';

interface Props {
  professor: {
    id: number;
    name: string;
    staffCode: string;
    academicRank: string;
    contractType: string;
    departmentName: string;
    maxWeeklyUnits: number;
  };
  terms: {
    id: number;
    code: string;
    title: string;
    isCurrent: boolean;
  }[];
}

const faNum = (n: any) => (n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]));

const DAY_NAMES = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه'];

const DEFAULT_TIME_SLOTS = [
  { id: 1, label: '۰۸:۰۰ الی ۱۰:۰۰', startTime: '08:00', endTime: '10:00', isBreak: false },
  { id: 2, label: '۱۰:۰۰ الی ۱۲:۰۰', startTime: '10:00', endTime: '12:00', isBreak: false },
  { id: 3, label: '۱۲:۰۰ الی ۱۳:۳۰ (نماز و ناهار)', startTime: '12:00', endTime: '13:30', isBreak: true },
  { id: 4, label: '۱۳:۳۰ الی ۱۵:۳۰', startTime: '13:30', endTime: '15:30', isBreak: false },
  { id: 5, label: '۱۵:۳۰ الی ۱۷:۳۰', startTime: '15:30', endTime: '17:30', isBreak: false },
  { id: 6, label: '۱۷:۳۰ الی ۱۹:۳۰', startTime: '17:30', endTime: '19:30', isBreak: false },
];

export default function ProfessorAvailabilityClient({ professor, terms }: Props) {
  const [selectedTermId, setSelectedTermId] = useState<number>(terms[0]?.id || 14051);
  const [notes, setNotes] = useState<string>('ترجیحاً جلسات در ساعات صبحگاهی دوشنبه و شنبه تنظیم شوند.');
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // [dayIdx (0..5)][slotId (1..6)] = SlotStatus
  const [availability, setAvailability] = useState<{ [d: number]: { [s: number]: SlotStatus } }>(() => {
    const initial: { [d: number]: { [s: number]: SlotStatus } } = {};
    for (let d = 0; d < 6; d++) {
      initial[d] = {};
      for (let s = 1; s <= 6; s++) {
        if (d === 0 || d === 2) {
          initial[d][s] = s <= 2 ? 'PREF' : 'AVAIL';
        } else if (d === 3) {
          initial[d][s] = 'UNAVAIL'; // روز پژوهشی سه‌شنبه
        } else {
          initial[d][s] = 'AVAIL';
        }
      }
    }
    return initial;
  });

  const toggleSlot = (d: number, s: number) => {
    setAvailability(prev => {
      const current = prev[d]?.[s] || 'AVAIL';
      const next: SlotStatus = current === 'PREF' ? 'AVAIL' : current === 'AVAIL' ? 'UNAVAIL' : 'PREF';
      return {
        ...prev,
        [d]: {
          ...prev[d],
          [s]: next,
        },
      };
    });
  };

  const applyPreset = (preset: 'ALL_PREF' | 'MORNING_ONLY' | 'AFTERNOON_ONLY' | 'EVEN_DAYS' | 'ODD_DAYS' | 'CLEAR') => {
    const updated: { [d: number]: { [s: number]: SlotStatus } } = {};
    for (let d = 0; d < 6; d++) {
      updated[d] = {};
      for (let s = 1; s <= 6; s++) {
        if (preset === 'ALL_PREF') updated[d][s] = 'PREF';
        else if (preset === 'CLEAR') updated[d][s] = 'UNAVAIL';
        else if (preset === 'MORNING_ONLY') updated[d][s] = (s === 1 || s === 2) ? 'PREF' : 'UNAVAIL';
        else if (preset === 'AFTERNOON_ONLY') updated[d][s] = (s === 4 || s === 5 || s === 6) ? 'PREF' : 'UNAVAIL';
        else if (preset === 'EVEN_DAYS') updated[d][s] = (d % 2 === 0) ? 'PREF' : 'UNAVAIL';
        else if (preset === 'ODD_DAYS') updated[d][s] = (d % 2 === 1) ? 'PREF' : 'UNAVAIL';
      }
    }
    setAvailability(updated);
  };

  const handleSubmit = () => {
    setIsSubmitted(true);
    setToastMessage('✅ فرم ساعات حضور و آمادگی تدریس شما برای نیمسال انتخابی با موفقیت در سامانه ثبت و به کارتابل مدیر گروه ارسال شد.');
    setTimeout(() => setToastMessage(null), 5000);
  };

  const currentTerm = terms.find(t => t.id === selectedTermId) || terms[0];

  return (
    <div className="space-y-5" dir="rtl">
      
      {/* Toast */}
      {toastMessage && (
        <div className="p-4 bg-emerald-900 text-emerald-100 rounded-2xl shadow-xl border border-emerald-700 font-bold text-sm flex items-center justify-between">
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-white/60 hover:text-white text-xs">✕</button>
        </div>
      )}

      {/* Header Profile Card */}
      <div className="bg-gradient-to-l from-indigo-950 via-indigo-900 to-slate-900 text-white rounded-2xl p-5 shadow-lg border border-indigo-700/50 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-slate-950">
                کارتابل اعضای هیئت علمی و اساتید
              </span>
              <span className="text-xs text-indigo-200">فرم اعلام آمادگی تدریس</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              🗓️ فرم اعلام ساعات حضور، اولویت‌ها و زمان‌بندی تدریس
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/professor" className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 transition">
              بازگشت به کلاس‌های من
            </Link>
          </div>
        </div>

        {/* Selected Term & Profile Summary */}
        <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-xl border border-white/15 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="text-indigo-200 font-bold block mb-1">نیمسال تحصیلی مقصد:</label>
            <select
              value={selectedTermId}
              onChange={e => setSelectedTermId(Number(e.target.value))}
              className="w-full bg-slate-900/90 text-white border border-indigo-400/50 rounded-lg px-3 py-1.5 font-bold"
            >
              {terms.map(t => (
                <option key={t.id} value={t.id}>{t.title} {t.isCurrent ? '(نیمسال جاری)' : ''}</option>
              ))}
            </select>
          </div>

          <div>
            <span className="text-indigo-200 font-bold block mb-1">مشخصات استاد:</span>
            <div className="font-extrabold text-white">
              {professor.name} ({professor.academicRank} — {professor.contractType})
            </div>
          </div>

          <div>
            <span className="text-indigo-200 font-bold block mb-1">سقف موظفی تدریس در ترم:</span>
            <div className="font-extrabold text-amber-300">
              حداکثر {faNum(professor.maxWeeklyUnits)} واحد در هفته
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Availability Matrix */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <h3 className="font-extrabold text-slate-900 text-base">
              ماتریس اعلام ساعات حضور هفتگی برای {currentTerm?.title || 'نیمسال'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              روی هر خانه کلیک کنید تا وضعیت آن بین <b>🟩 اولویت اصلی (سبز)</b>، <b>🟨 در صورت نیاز (زرد)</b> و <b>🟥 عدم امکان حضور (قرمز)</b> تغییر کند.
            </p>
          </div>

          {/* Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={() => applyPreset('ALL_PREF')} className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 font-bold text-[11px] hover:bg-emerald-200 transition">🟢 حضور کامل</button>
            <button onClick={() => applyPreset('MORNING_ONLY')} className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 font-bold text-[11px] hover:bg-amber-200 transition">☀️ فقط صبح‌ها</button>
            <button onClick={() => applyPreset('AFTERNOON_ONLY')} className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-900 font-bold text-[11px] hover:bg-blue-200 transition">🌆 فقط بعدازظهرها</button>
            <button onClick={() => applyPreset('EVEN_DAYS')} className="px-2.5 py-1 rounded-lg bg-purple-100 text-purple-900 font-bold text-[11px] hover:bg-purple-200 transition">📅 روزهای زوج</button>
            <button onClick={() => applyPreset('CLEAR')} className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-900 font-bold text-[11px] hover:bg-rose-200 transition">🔴 مسدودسازی</button>
          </div>
        </div>

        {/* Matrix Grid */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-white text-center">
                <th className="p-3 border border-slate-800 w-28 font-extrabold">روز هفته</th>
                {DEFAULT_TIME_SLOTS.map(slot => (
                  <th key={slot.id} className="p-3 border border-slate-800 font-extrabold">
                    <div>{slot.label}</div>
                    <div className="text-[10px] text-slate-300 font-normal mt-0.5">{slot.startTime} الی {slot.endTime}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAY_NAMES.map((dayName, dayIdx) => (
                <tr key={dayIdx} className={dayIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-3 border border-slate-200 font-extrabold text-center bg-slate-100 text-slate-900">
                    {dayName}
                  </td>
                  {DEFAULT_TIME_SLOTS.map(slot => {
                    if (slot.isBreak) {
                      return (
                        <td key={slot.id} className="p-2 border border-slate-200 bg-slate-100 text-slate-400 text-center font-bold text-[10px]">
                          نماز و استراحت
                        </td>
                      );
                    }

                    const status = availability[dayIdx]?.[slot.id] || 'AVAIL';

                    return (
                      <td
                        key={slot.id}
                        onClick={() => toggleSlot(dayIdx, slot.id)}
                        className="p-2 border border-slate-200 cursor-pointer select-none transition hover:opacity-90"
                      >
                        <div className={`p-3 rounded-xl text-center font-extrabold text-xs transition border flex flex-col items-center justify-center gap-0.5 shadow-xs ${
                          status === 'PREF'
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-emerald-200'
                            : status === 'AVAIL'
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : 'bg-rose-100 text-rose-900 border-rose-300'
                        }`}>
                          <span>{status === 'PREF' ? '🟩 اولویت اصلی' : status === 'AVAIL' ? '🟨 در صورت لزوم' : '🟥 عدم حضور'}</span>
                          <span className="text-[9px] opacity-80">
                            {status === 'PREF' ? 'الویت تدریس' : status === 'AVAIL' ? 'ساعت آزاد' : 'خارج از دانشگاه'}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Remarks & Notes */}
        <div className="space-y-2 pt-3 border-t border-slate-200">
          <label className="font-bold text-slate-700 text-xs block">
            توضیحات و درخواست‌های تکمیلی خطاب به مدیر گروه آموزشی:
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="مثال: روزهای سه‌شنبه به علت طرح پژوهشی خارج از دانشگاه هستم؛ کلاس‌های عملی بعدازظهر باشند..."
            className="w-full border border-slate-300 rounded-xl p-3 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Submit Bar */}
        <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-slate-600 font-bold">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-600"></span> اولویت اصلی</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-200 border border-amber-400"></span> قابل حضور</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-200 border border-rose-400"></span> عدم امکان حضور</span>
          </div>

          <button
            onClick={handleSubmit}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-700 to-emerald-800 hover:from-emerald-800 hover:to-emerald-900 text-white font-extrabold text-xs shadow-lg flex items-center gap-2 transition"
          >
            <span>🚀 ارسال قطعی فرم ساعات حضور به مدیر گروه آموزشی</span>
          </button>
        </div>
      </div>

    </div>
  );
}
