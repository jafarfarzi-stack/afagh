'use client';

import { useState } from 'react';
import { reviewUnfinalizeAction } from '../actions';
import { requestStepUpAction } from '@/lib/step-up-actions';

interface Props {
  requestId: number;
  currentStage: 'PENDING' | 'REVIEWED';
  canFinalApprove?: boolean;
}

export default function UnfinalizeReviewClient({ requestId, currentStage, canFinalApprove }: Props) {
  const [note, setNote] = useState('');
  const [extendTo, setExtendTo] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [needStepUp, setNeedStepUp] = useState(false);
  const [password, setPassword] = useState('');
  const [pendingRetry, setPendingRetry] = useState<null | { decision: 'REVIEWED' | 'APPROVED' | 'REJECTED' }>(null);
  const [done, setDone] = useState<string | null>(null);

  const run = async (decision: 'REVIEWED' | 'APPROVED' | 'REJECTED') => {
    setBusy(decision);
    try {
      const res = await reviewUnfinalizeAction(requestId, decision, note.trim() || null, extendTo.trim() || null);
      if (!res.ok && (res.error ?? '').startsWith('STEPUP_REQUIRED')) {
        setNeedStepUp(true);
        setPendingRetry({ decision });
        alert('برای ادامه، رمز عبور خود را تأیید کنید (تأیید دومرحله‌ای).');
        return;
      }
      if (!res.ok) {
        alert(res.error || 'عملیات ناموفق بود.');
        return;
      }
      setDone(res.message || 'انجام شد.');
    } finally {
      setBusy(null);
    }
  };

  const confirmStepUp = async () => {
    if (!password) {
      alert('رمز عبور را وارد کنید.');
      return;
    }
    setBusy('STEPUP');
    try {
      const s = await requestStepUpAction('grades:edit', password);
      if (!s.ok) {
        alert(s.error || 'تأیید رمز ناموفق بود.');
        return;
      }
      setNeedStepUp(false);
      setPassword('');
      if (pendingRetry) {
        const d = pendingRetry.decision;
        setPendingRetry(null);
        await run(d);
      }
    } finally {
      setBusy(null);
    }
  };

  if (done) return <span className="text-[11px] font-black text-emerald-700">{done}</span>;

  return (
    <div className="space-y-2 min-w-[220px]">
      <input
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="توضیح بررسی (اختیاری)"
        className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-[11px]"
      />
      {(currentStage === 'REVIEWED' || canFinalApprove) && (
        <input
          type="date"
          value={extendTo}
          onChange={e => setExtendTo(e.target.value)}
          title="تمدید مهلت اختصاصی ثبت نمره (اختیاری، نمایشی)"
          className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-[11px]"
        />
      )}
      {needStepUp && (
        <div className="flex gap-1">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="رمز عبور برای تأیید دومرحله‌ای"
            className="flex-1 bg-white border-2 border-amber-400 rounded px-2 py-1 text-[11px]"
          />
          <button
            onClick={confirmStepUp}
            disabled={busy === 'STEPUP'}
            className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 text-[11px] font-black rounded disabled:opacity-50"
          >
            تأیید رمز
          </button>
        </div>
      )}
      <div className="flex gap-1">
        {currentStage === 'PENDING' ? (
          <>
            <button
              onClick={() => run('REVIEWED')}
              disabled={!!busy}
              className="flex-1 px-2 py-1 bg-indigo-700 hover:bg-indigo-800 text-white text-[11px] font-bold rounded disabled:opacity-50"
            >
              {busy === 'REVIEWED' ? '…' : 'تأیید مرحلهٔ اول'}
            </button>
            <button
              onClick={() => run('REJECTED')}
              disabled={!!busy}
              className="flex-1 px-2 py-1 bg-white border border-rose-300 text-rose-700 text-[11px] font-bold rounded disabled:opacity-50"
            >
              {busy === 'REJECTED' ? '…' : 'رد'}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => run('APPROVED')}
              disabled={!!busy}
              className="flex-1 px-2 py-1 bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold rounded disabled:opacity-50"
            >
              {busy === 'APPROVED' ? '…' : 'تأیید نهایی (معاون آموزشی)'}
            </button>
            <button
              onClick={() => run('REJECTED')}
              disabled={!!busy}
              className="flex-1 px-2 py-1 bg-white border border-rose-300 text-rose-700 text-[11px] font-bold rounded disabled:opacity-50"
            >
              {busy === 'REJECTED' ? '…' : 'رد'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
