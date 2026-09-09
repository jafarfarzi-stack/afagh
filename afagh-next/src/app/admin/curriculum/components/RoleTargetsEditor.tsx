'use client';

// ویرایشگر سهم واحد هر نقش (مقرر نسخه) — state داخلی با key ریست می‌شود
import { useState } from 'react';
import { faNum, ROLE_LABELS } from '../curriculum-core';

export default function RoleTargetsEditor({ initial, unitsByRole, totalRequired, disabled, onSave }: {
  initial: Record<string, number>;
  unitsByRole: Map<string, number>;
  totalRequired: number;
  disabled: boolean;
  onSave: (targets: Record<string, number>) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.keys(ROLE_LABELS).map(r => [r, initial[r] != null ? String(initial[r]) : ''])));
  const sum = Object.keys(ROLE_LABELS).reduce((s, r) => s + (Number(draft[r]) || 0), 0);
  const diff = totalRequired - sum;
  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        const t: Record<string, number> = {};
        for (const r of Object.keys(ROLE_LABELS)) {
          const raw = (draft[r] ?? '').trim();
          const n = Number(raw);
          if (raw !== '' && Number.isFinite(n) && n >= 0) t[r] = n;
        }
        onSave(t);
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {Object.entries(ROLE_LABELS).map(([role, label]) => {
          const have = unitsByRole.get(role) ?? 0;
          const want = Number(draft[role]) || 0;
          const filled = (draft[role] ?? '').trim() !== '';
          const short = filled && have < want;
          return (
            <label key={role} className={`rounded-xl border p-2 space-y-1 ${short ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50/50'}`}>
              <span className="block text-[11px] font-black text-slate-800 text-center">{label}</span>
              <input
                type="number" min={0} inputMode="numeric"
                value={draft[role] ?? ''}
                disabled={disabled}
                onChange={e => setDraft(d => ({ ...d, [role]: e.target.value }))}
                placeholder="—"
                className="w-full border border-slate-300 rounded-lg px-2 py-1 text-center font-black bg-white disabled:opacity-50"
              />
              <span className={`block text-[10px] font-bold text-center ${short ? 'text-amber-700' : 'text-slate-500'}`}>
                موجود {faNum(have)} واحد{short && ` (کسری ${faNum(want - have)})`}
              </span>
            </label>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-black text-slate-700">
          جمع سهم‌ها: {faNum(sum)} واحد · واحد الزامی نسخه: {faNum(totalRequired)} واحد
          {diff !== 0 && (
            <span className="text-amber-700"> · اختلاف {faNum(Math.abs(diff))} واحد ({diff > 0 ? 'کمتر از سقف' : 'بیشتر از سقف'})</span>
          )}
        </p>
        <button
          type="submit" disabled={disabled}
          className="px-3 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-[11px] disabled:opacity-50"
        >
          💾 ذخیره سهم‌ها و اعتبارسنجی مجدد
        </button>
      </div>
    </form>
  );
}
