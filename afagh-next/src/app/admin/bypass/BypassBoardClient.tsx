'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { decideApproveAction, decideRejectAction, decideReturnAction } from './actions';
import {
  BYPASS_KIND_LABEL,
  BYPASS_REASON_LABEL,
  BYPASS_STATUS_LABEL,
  type BypassRequestRow,
  type BypassStatus,
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

const STATUS_STYLE: Record<string, string> = {
  PENDING_MANAGER: 'bg-indigo-100 text-indigo-900',
  ESCALATED_EXPERT: 'bg-amber-100 text-amber-900',
  APPROVED: 'bg-emerald-100 text-emerald-900',
  REJECTED: 'bg-rose-100 text-rose-900',
  AUTO_REJECTED: 'bg-rose-100 text-rose-900',
  CANCELLED: 'bg-slate-100 text-slate-700',
};

function Card({
  r,
  canAct,
  canReturn,
  busy,
  onApprove,
  onReject,
  onReturn,
}: {
  r: BypassRequestRow;
  canAct: boolean;
  canReturn: boolean;
  busy: boolean;
  onApprove: () => void;
  onReject: (code: ManualReason, text: string) => void;
  onReturn: (target: 'MANAGER' | 'EXPERT') => void;
}) {
  const [openReject, setOpenReject] = useState(false);
  const [reasonCode, setReasonCode] = useState<ManualReason>('LOW_GPA_PREV_TERM');
  const [reasonText, setReasonText] = useState('');

  const deadline = r.status === 'ESCALATED_EXPERT' ? r.expertDeadlineAt : r.managerDeadlineAt;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-black text-slate-900">
            {r.courseTitle} <span className="font-mono text-xs text-slate-500">({r.courseCode})</span>
          </p>
          <p className="text-xs text-slate-600">
            {r.studentName} · شمارهٔ دانشجویی {faNum(r.studentCode)} {r.majorName ? `· ${r.majorName}` : ''}
          </p>
          <p className="text-xs text-slate-500">
            نوع: <span className="font-bold text-slate-700">{BYPASS_KIND_LABEL[r.kind]}</span> · واحد: {faNum(r.units)}
          </p>
        </div>
        <div className="text-left text-xs space-y-1">
          <span className={`inline-block rounded-lg px-2 py-1 font-bold ${STATUS_STYLE[r.status] ?? 'bg-slate-100 text-slate-700'}`}>
            {BYPASS_STATUS_LABEL[r.status as BypassStatus] ?? r.status}
          </span>
          {canAct && <p className="text-slate-500">مهلت تصمیم: {faDateTime(deadline)}</p>}
          {!canAct && <p className="text-slate-400">ثبت: {faDateTime(r.createdAt)}</p>}
        </div>
      </div>

      {!canAct && r.reasonCode && (
        <p className="rounded-xl bg-slate-50 p-2 text-xs text-slate-700">
          دلیل: <span className="font-bold">{BYPASS_REASON_LABEL[r.reasonCode] ?? r.reasonCode}</span>
          {r.reasonText ? ` — ${r.reasonText}` : ''}
        </p>
      )}

      {canAct && (openReject ? (
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
              disabled={busy || (reasonCode === 'OTHER' && !reasonText.trim())}
              onClick={() => onReject(reasonCode, reasonText)}
              className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              ثبت رد
            </button>
            <button
              type="button"
              onClick={() => { setOpenReject(false); setReasonText(''); }}
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
            disabled={busy}
            onClick={onApprove}
            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            ✅ تأیید و ثبت درس
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setOpenReject(true)}
            className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 disabled:opacity-50"
          >
            ❌ رد درخواست
          </button>
          {canReturn && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onReturn('MANAGER')}
                className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 disabled:opacity-50"
              >
                ↩︎ بازگرداندن به مدیر گروه
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onReturn('EXPERT')}
                className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 disabled:opacity-50"
              >
                ↩︎ ارجاع دوباره به کارشناس
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export default function BypassBoardClient({
  expertRows,
  viceRows,
  isVice,
  isExpert,
}: {
  expertRows: BypassRequestRow[];
  viceRows: BypassRequestRow[];
  isVice: boolean;
  isExpert: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'INBOX' | 'VICE'>(isExpert && expertRows.length ? 'INBOX' : 'VICE');
  const [viceFilter, setViceFilter] = useState<'OPEN' | 'CLOSED'>('OPEN');

  const openVice = useMemo(
    () => viceRows.filter(r => r.status === 'PENDING_MANAGER' || r.status === 'ESCALATED_EXPERT'),
    [viceRows],
  );
  const closedVice = useMemo(
    () => viceRows.filter(r => r.status !== 'PENDING_MANAGER' && r.status !== 'ESCALATED_EXPERT'),
    [viceRows],
  );

  function run(id: number, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError('');
    setBusyId(id);
    startTransition(async () => {
      const res = await fn();
      setBusyId(null);
      if (!res.ok) {
        setError(res.error || 'عملیات ناموفق بود.');
        return;
      }
      router.refresh();
    });
  }

  const list = tab === 'INBOX' ? expertRows : (viceFilter === 'OPEN' ? openVice : closedVice);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {isExpert && (
          <button
            type="button"
            onClick={() => setTab('INBOX')}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold ${tab === 'INBOX' ? 'bg-indigo-900 text-white' : 'bg-white text-slate-700 border border-slate-300'}`}
          >
            کارتابل من ({faNum(expertRows.length)})
          </button>
        )}
        {isVice && (
          <button
            type="button"
            onClick={() => setTab('VICE')}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold ${tab === 'VICE' ? 'bg-indigo-900 text-white' : 'bg-white text-slate-700 border border-slate-300'}`}
          >
            نمای معاون آموزش ({faNum(viceRows.length)})
          </button>
        )}
      </div>

      {error && <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-800">{error}</div>}

      {tab === 'VICE' && (
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={() => setViceFilter('OPEN')}
            className={`rounded-lg px-2.5 py-1 font-bold ${viceFilter === 'OPEN' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}
          >
            در جریان ({faNum(openVice.length)})
          </button>
          <button
            type="button"
            onClick={() => setViceFilter('CLOSED')}
            className={`rounded-lg px-2.5 py-1 font-bold ${viceFilter === 'CLOSED' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}
          >
            بسته‌شده / رد خودکار ({faNum(closedVice.length)})
          </button>
        </div>
      )}

      {!list.length ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
          موردی برای نمایش نیست.
        </div>
      ) : list.map(r => {
        const open = r.status === 'PENDING_MANAGER' || r.status === 'ESCALATED_EXPERT';
        return (
          <Card
            key={r.id}
            r={r}
            canAct={open}
            canReturn={isVice && tab === 'VICE' && open}
            busy={pending && busyId === r.id}
            onApprove={() => run(r.id, () => decideApproveAction(r.id))}
            onReject={(code, text) => run(r.id, () => decideRejectAction(r.id, code, text))}
            onReturn={target => run(r.id, () => decideReturnAction(r.id, target))}
          />
        );
      })}
    </div>
  );
}
