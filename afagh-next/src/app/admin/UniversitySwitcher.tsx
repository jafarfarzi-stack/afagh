'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { setUniversityCookie } from './university-actions';

export default function UniversitySwitcher({
  universities, currentCode, buttonClass,
}: {
  universities: { code: string; title: string; kind: string }[];
  currentCode: string;
  buttonClass?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!universities || universities.length < 2) return null;
  return (
    <select
      value={currentCode}
      disabled={busy}
      onChange={async e => {
        setBusy(true);
        try {
          await setUniversityCookie(e.target.value);
        } finally {
          setBusy(false);
          router.refresh();
        }
      }}
      className={`${buttonClass ?? 'bg-indigo-700 hover:bg-indigo-600 border-indigo-500'} text-white border rounded-lg px-2 py-1.5 text-xs font-bold cursor-pointer disabled:opacity-60`}
      title="دانشگاه فعال — همهٔ لیست‌ها (دانشجو، دروس، اساتید) بر اساس این انتخاب فیلتر می‌شود"
    >
      {universities.map(u => (
        <option key={u.code} value={u.code}>
          {u.title}{u.kind === 'DISSOLVED' ? ' (منحله)' : ''}
        </option>
      ))}
    </select>
  );
}
