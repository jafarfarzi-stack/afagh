'use client';

import { useState } from 'react';
import { confirmLinkAction, mintLinkTokenAction } from '@/lib/messenger-link-actions';

const CHANNELS = [
  { key: 'SOROUSH', label: 'سروش‌پلاس', bot: '@afaghbot', ready: true },
  { key: 'BALE', label: 'بله', bot: '', ready: true },
  { key: 'EITAA', label: 'ایتا', bot: '', ready: true },
  { key: 'TELEGRAM', label: 'تلگرام', bot: '', ready: false },
  { key: 'IGAP', label: 'آی‌گپ', bot: '', ready: false },
] as const;

export default function MessengerConnectClient() {
  const [channel, setChannel] = useState<string>('SOROUSH');
  const [code, setCode] = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const mint = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await mintLinkTokenAction(channel);
      if (!res.ok) {
        setMsg({ kind: 'err', text: res.error });
        return;
      }
      setCode(res.code);
      setMsg({ kind: 'ok', text: `کد اتصال صادر شد (۱۰ دقیقه اعتبار). در پیام‌رسان این را بفرستید: /start ${res.code}` });
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!confirmInput.trim()) {
      setMsg({ kind: 'err', text: 'کد را وارد کنید.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await confirmLinkAction(confirmInput.trim());
      if (!res.ok) {
        setMsg({ kind: 'err', text: res.error });
        return;
      }
      setMsg({ kind: 'ok', text: '✅ اتصال تأیید شد — از این پس اعلان‌ها را در پیام‌رسان می‌گیرید.' });
      setCode('');
      setConfirmInput('');
    } finally {
      setBusy(false);
    }
  };

  const ch = CHANNELS.find(c => c.key === channel);

  return (
    <div className="card space-y-3">
      <label className="block text-xs font-bold text-slate-600">پیام‌رسان
        <select value={channel} onChange={e => { setChannel(e.target.value); setCode(''); setMsg(null); }} className="mt-1 w-full rounded border px-2 py-2 text-sm">
          {CHANNELS.map(c => (
            <option key={c.key} value={c.key}>{c.label}{c.ready ? '' : ' (به‌زودی)'}</option>
          ))}
        </select>
      </label>

      <button onClick={mint} disabled={busy} className="w-full rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-black text-white hover:bg-indigo-800 disabled:opacity-40">
        {busy ? '⏳…' : '🎫 صدور کد اتصال یک‌بارمصرف'}
      </button>

      {code && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-center">
          <div className="text-[11px] text-emerald-700 font-bold">در سروش به {ch?.bot || 'بات'} این پیام را بفرستید:</div>
          <div className="mt-1 font-mono text-lg font-black text-emerald-900" dir="ltr">/start {code}</div>
        </div>
      )}

      <div className="border-t border-slate-100 pt-3">
        <label className="block text-xs font-bold text-slate-600">پس از ارسال در بات، همین کد را اینجا تأیید کنید
          <input value={confirmInput} onChange={e => setConfirmInput(e.target.value)} placeholder="کد ۸ رقمی" dir="ltr" className="mt-1 w-full rounded border px-2 py-2 text-sm font-mono" />
        </label>
        <button onClick={confirm} disabled={busy} className="mt-2 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-40">
          {busy ? '⏳…' : '✓ تأیید نهایی اتصال'}
        </button>
      </div>

      {msg && (
        <div className={`rounded-xl border p-3 text-xs font-bold ${msg.kind === 'ok' ? 'border-emerald-300 bg-emerald-50/70 text-emerald-800' : 'border-red-300 bg-red-50/70 text-red-800'}`}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
