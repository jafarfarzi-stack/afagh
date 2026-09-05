'use client';

import React, { useMemo, useState } from 'react';
import { examProctorClockInAction, examProctorVerifyAction } from '@/lib/exam-actions';
import type { ExamCheckIn } from '@/lib/exam-engine';

export interface ProctorRosterItem {
  studentId: number;
  seatNumber: number;
  blockKey: string;
  studentName: string;
  studentCode: string;
  nationalCodeMasked: string;
  majorTitle: string;
  courseCode: string;
  courseTitle: string;
  isPresent: boolean;
  checkInMethod: string | null;
  hasTemporaryPermit: boolean;
  checkInTime: string | null;
}

export interface ProctorSessionData {
  id: number;
  hallId: number;
  hallName: string;
  buildingName: string;
  hallCapacity: number;
  examDate: string;
  startTime: string;
  endTime: string;
  clockInStatus: string;
  roster: ProctorRosterItem[];
}

const faNum = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]));

export default function ProctorExamAttendanceClient({ sessions, staffName }: { sessions: ProctorSessionData[]; staffName: string }) {
  const [activeSessionId, setActiveSessionId] = useState<number | null>(sessions[0]?.id ?? null);
  const [marked, setMarked] = useState<Record<string, { present: boolean; permit: boolean }>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const session = useMemo(() => sessions.find(s => s.id === activeSessionId) ?? sessions[0] ?? null, [sessions, activeSessionId]);

  const showMsg = (text: string, error = false) => { setMsg({ text, error }); setTimeout(() => setMsg(null), 6000); };

  if (sessions.length === 0) {
    return (
      <div className="card p-10 text-center" dir="rtl">
        <div className="text-4xl mb-2">🗓️</div>
        <p className="font-black text-slate-800">جلسهٔ امتحانی برای شما ثبت نشده است</p>
        <p className="text-xs text-slate-500 mt-2">با رسیدن نوبت مراقبت، تخصیص شما از کارتابل امتحانات به همین پنل اضافه می‌شود.</p>
      </div>
    );
  }

  const roster = session?.roster ?? [];
  const presentCount = roster.filter(r => (marked[`${session!.id}-${r.studentId}`]?.present ?? r.isPresent)).length;
  const pendingCount = roster.filter(r => !(marked[`${session!.id}-${r.studentId}`]?.present ?? r.isPresent)).length;

  const toggleMark = (studentId: number, patch: Partial<{ present: boolean; permit: boolean }>) => {
    const key = `${session!.id}-${studentId}`;
    setMarked(prev => ({ ...prev, [key]: { present: prev[key]?.present ?? false, permit: prev[key]?.permit ?? false, ...patch } }));
  };

  const handleClockIn = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const res = await examProctorClockInAction(session.id);
      showMsg(typeof res === 'object' && res !== null && 'ok' in res && res.ok ? '✅ ورود شما ثبت شد.' : 'خطا در ثبت ورود — از مدیر امتحانات پیگیری کنید.', !(typeof res === 'object' && res !== null && 'ok' in res && res.ok));
    } catch {
      showMsg('خطا در ارتباط با سرور.', true);
    } finally {
      setBusy(false);
    }
  };

  /** ثبت حضور سالن با تأیید سرور — فقط دانشجویان همان سالن و همان جلسه */
  const handleVerify = async () => {
    if (!session) return;
    const checkIns = roster
      .filter(r => r.studentId)
      .map<ExamCheckIn>(r => {
        const m = marked[`${session.id}-${r.studentId}`];
        const present = m ? m.present : r.isPresent;
        const permit = m ? m.permit : r.hasTemporaryPermit;
        return { studentId: r.studentId, isPresent: present ? 1 : 0, method: present ? 'QR_SCAN' : 'SYSTEM_EXCUSE', hasTemporaryPermit: permit ? 1 : 0 };
      });
    if (checkIns.every(c => c.isPresent === 0)) {
      showMsg('هیچ دانشجویی به‌عنوان حاضر علامت‌گذاری نشده است.', true);
      return;
    }
    setBusy(true);
    try {
      const res = await examProctorVerifyAction({ sessionId: session.id, hallId: session.hallId, checkIns });
      if (typeof res === 'object' && res !== null && 'ok' in res && res.ok) {
        showMsg('✅ حضور و غیاب سالن با موفقیت در سامانه ثبت شد.');
      } else {
        showMsg('خطا در ثبت حضور: ' + (typeof res === 'object' && res !== null && 'error' in res ? String(res.error) : 'نامشخص'), true);
      }
    } catch {
      showMsg('خطا در ارتباط با سرور.', true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div className="bg-gradient-to-l from-teal-950 via-teal-900 to-slate-900 rounded-3xl p-5 text-white shadow-lg">
        <h1 className="font-black text-lg">👁️ پنل مراقب امتحان — {staffName}</h1>
        <p className="text-xs text-teal-100 mt-1">
          {sessions.length} سالن تخصیصی · حضور و غیاب مستقیماً در سامانهٔ امتحانات ثبت می‌شود (زنجیرهٔ تحویل + ممیزی).
        </p>
      </div>

      {msg && (
        <div className={`rounded-xl p-3 text-center text-xs font-black shadow ${msg.error ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-emerald-100 text-emerald-900 border border-emerald-300'}`}>
          {msg.text}
        </div>
      )}

      {sessions.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {sessions.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSessionId(s.id)}
              className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition ${s.id === session?.id ? 'bg-teal-800 text-white shadow' : 'bg-white text-teal-900 border border-teal-200'}`}
            >
              {s.hallName} — {faNum(s.examDate)}
            </button>
          ))}
        </div>
      )}

      {session && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
            <div className="space-y-1">
              <p className="font-black text-slate-900">{session.hallName} <span className="text-slate-400 text-xs font-bold">({session.buildingName})</span></p>
              <p className="text-xs text-slate-500 font-bold">
                تاریخ امتحان: {faNum(session.examDate)} · ساعت {faNum(session.startTime)} تا {faNum(session.endTime)} · ظرفیت سالن: {faNum(session.hallCapacity)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1.5 rounded-xl text-[11px] font-black ${session.clockInStatus === 'PRESENT' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {session.clockInStatus === 'PRESENT' ? '✓ حضور ثبت شده' : '⏳ ورود ثبت نشده'}
              </span>
              <button onClick={handleClockIn} disabled={busy} className="px-3.5 py-1.5 rounded-xl bg-teal-800 hover:bg-teal-900 text-white text-[11px] font-black transition disabled:opacity-50">
                🕐 ثبت ورود مراقب
              </button>
            </div>
          </div>

          {/* خلاصهٔ زنده */}
          <div className="p-4 grid grid-cols-3 gap-3 text-center border-b border-slate-100">
            <div className="bg-emerald-50 rounded-2xl p-3 border border-emerald-200">
              <p className="text-[10px] font-bold text-emerald-700">حاضر</p>
              <p className="font-black text-emerald-900 text-xl">{faNum(presentCount)}</p>
            </div>
            <div className="bg-amber-50 rounded-2xl p-3 border border-amber-200">
              <p className="text-[10px] font-bold text-amber-700">در انتظار بررسی</p>
              <p className="font-black text-amber-900 text-xl">{faNum(pendingCount)}</p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200">
              <p className="text-[10px] font-bold text-slate-500">کل صندلی‌ها</p>
              <p className="font-black text-slate-900 text-xl">{faNum(roster.length)}</p>
            </div>
          </div>

          {/* فهرست داوطلبان نشسته در این سالن */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-900 text-white text-center text-[11px]">
                  <th className="p-2.5">صندلی</th>
                  <th className="p-2.5">دانشجو</th>
                  <th className="p-2.5">شمارهٔ دانشجویی</th>
                  <th className="p-2.5">کد ملی</th>
                  <th className="p-2.5">رشته</th>
                  <th className="p-2.5">درس</th>
                  <th className="p-2.5">حاضر</th>
                  <th className="p-2.5">مجوز تعهد</th>
                  <th className="p-2.5">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {roster.map(r => {
                  const key = `${session.id}-${r.studentId}`;
                  const present = marked[key]?.present ?? r.isPresent;
                  const permit = marked[key]?.permit ?? r.hasTemporaryPermit;
                  return (
                    <tr key={key} className={`border-b border-slate-100 ${present ? 'bg-emerald-50/40' : ''}`}>
                      <td className="p-2.5 text-center font-mono font-black text-teal-900">{faNum(r.seatNumber)}</td>
                      <td className="p-2.5 font-black text-slate-900">{r.studentName}</td>
                      <td className="p-2.5 font-mono text-slate-600" dir="ltr">{r.studentCode}</td>
                      <td className="p-2.5 font-mono text-slate-500" dir="ltr">{r.nationalCodeMasked}</td>
                      <td className="p-2.5 text-slate-600 font-bold">{r.majorTitle}</td>
                      <td className="p-2.5">
                        <span className="font-black text-indigo-950">{r.courseCode}</span>
                        <span className="block text-[10px] text-slate-500">{r.courseTitle}</span>
                      </td>
                      <td className="p-2.5 text-center">
                        <input type="checkbox" checked={present} onChange={e => toggleMark(r.studentId, { present: e.target.checked })} className="w-4 h-4 accent-emerald-600" />
                      </td>
                      <td className="p-2.5 text-center">
                        <input type="checkbox" checked={permit} onChange={e => toggleMark(r.studentId, { permit: e.target.checked })} className="w-4 h-4 accent-amber-500" />
                      </td>
                      <td className="p-2.5 text-center">
                        {present ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-black text-[10px]">
                            ✓ حاضر {r.checkInTime ? `(${faNum(r.checkInTime)})` : ''}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-black text-[10px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500 font-bold">
              ثبت نهایی، حضور را در جدول «حضور و غیاب آزمون» (exam_attendances) با امضای مراقب ثبت می‌کند — قابل استعلام در زنجیرهٔ تحویل.
            </p>
            <button onClick={handleVerify} disabled={busy} className="px-5 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-900 text-white font-black text-xs transition shadow disabled:opacity-50">
              {busy ? 'در حال ثبت…' : `📋 ثبت حضور و غیاب سالن (${faNum(presentCount)} حاضر)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
