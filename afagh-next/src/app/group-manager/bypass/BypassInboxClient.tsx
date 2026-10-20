'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { approveBypassAction, rejectBypassAction } from './actions';
import {
  BYPASS_KIND_LABEL,
  BYPASS_REASON_LABEL,
  type BypassRequestRow,
} from '@/lib/bypass-labels';
import { faNum } from '@/lib/report-format';

type ManualReason = 'LOW_GPA_PREV_TERM' | 'GROUP_COUNCIL_DISAGREE' | 'UNRESOLVABLE_EXAM_CONFLICT' | 'OTHER';
const MANUAL_REASONS: ManualReason[] = ['LOW_GPA_PREV_TERM', 'GROUP_COUNCIL_DISAGREE', 'UNRESOLVABLE_EXAM_CONFLICT', 'OTHER'];

function faDateTime(v: string | Date | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function BypassInboxClient({ rows }: { rows: BypassRequestRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [reasonCode, setReasonCode] = useState<ManualReason>('LOW_GPA_PREV_TERM');
  const [reasonText, setReasonText] = useState('');

  const sorted = useMemo(
    () => [...rows].sort((a, b) => new Date(a.managerDeadlineAt).getTime() - new Date(b.managerDeadlineAt).getTime()),
    [rows],
  );

  function run(id: number, fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError('');
    setBusyId(id);
    startTransition(async () => {
      const res = await fn();
      setBusyId(null);
      if (!res.ok) {
        setError(res.error || 'عملیات ناموفق بود.');
        return;
      }
      after?.();
      router.refresh();
    });
  }

  if (!sorted.length) {
    return (
      <div className="rounded-2xl border border-teal-200 bg-teal-50 p-6 text-center text-sm text-teal-900">
        در حال حاضر درخواست «بدون رعایت پیش‌نیاز / تداخل امتحانی» در انتظار تصمیم شما نیست.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-800">{error}</div>
      )}
      {sorted.map(r => (
        <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1">
              <p className="text-sm font-black text-slate-900">
                {r.courseTitle} <span className="font-mono text-xs text-slate-500">({r.courseCode})</span>
              </p>
              <p className="text-xs text-slate-600">
                {r.studentName} · شمارهٔ دانشجویی {faNum(r.studentCode)} {r.majorName ? `· ${r.majorName}` : ''}
              </p>
              <p className="text-xs text-slate-500">
                نوع درخواست: <span className="font-bold text-slate-700">{BYPASS_KIND_LABEL[r.kind]}</span>
                {' · '}واحد: {faNum(r.units)}
              </p>
            </div>
            <div className="text-left text-xs space-y-1">
              <p className={`inline-block rounded-lg px-2 py-1 font-bold ${r.status === 'ESCALATED_EXPERT' ? 'bg-amber-100 text-amber-900' : 'bg-indigo-100 text-indigo-900'}`}>
                {r.status === 'ESCALATED_EXPERT' ? 'ارجاع‌شده به کارشناس آموزش (باز هم قابل تصمیم شماست)' : 'در انتظار تصمیم مدیر گروه'}
              </p>
              <p className="text-slate-500">مهلت تصمیم: {faDateTime(r.managerDeadlineAt)}</p>
              <p className="text-slate-400">ثبت: {faDateTime(r.createdAt)}</p>
            </div>
          </div>

          {rejecting === r.id ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 space-y-2">
              <label className="block text-xs font-bold text-rose-900">دلیل رد (الزامی)</label>
              <select
                value={reasonCode}
                onChange={e => setReasonCode(e.target.value as ManualReason)}
                className="w-full rounded-lg border border-rose-300 bg-white p-2 text-xs"
              >
                {MANUAL_REASONS.map(code => (
                  <option key={code} value={code}>{BYPASS_REASON_LABEL[code]}</option>
                ))}
              </select>
              <textarea
                value={reasonText}
                onChange={e => setReasonText(e.target.value)}
                rows={2}
                placeholder={reasonCode === 'OTHER' ? 'توضیح تکمیلی (الزامی)' : 'توضیح تکمیلی (اختیاری)'}
                className="w-full rounded-lg border border-rose-300 bg-white p-2 text-xs"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending || (reasonCode === 'OTHER' && !reasonText.trim())}
                  onClick={() => run(r.id, () => rejectBypassAction(r.id, reasonCode, reasonText), () => {
                    setRejecting(null);
                    setReasonText('');
                  })}
                  className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  {busyId === r.id ? 'در حال ثبت…' : 'ثبت رد'}
                </button>
                <button
                  type="button"
                  onClick={() => { setRejecting(null); setReasonText(''); setError(''); }}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700"
                >
                  انصراف
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(r.id, () => approveBypassAction(r.id))}
                className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              >
                {busyId === r.id ? 'در حال ثبت…' : '✅ تأیید و ثبت درس'}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => { setRejecting(r.id); setReasonCode('LOW_GPA_PREV_TERM'); setReasonText(''); }}
                className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 disabled:opacity-50"
              >
                ❌ رد درخواست
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
