'use client';

import { useRouter } from 'next/navigation';

/**
 * انتخابگر دانشگاه صفحهٔ ورود — به‌جای چیپس‌های بلند (که فضای بالای صفحه را
 * پر می‌کردند) یک dropdown فشرده؛ با تغییر، `/login?u=CODE` را باز می‌کند.
 */
export default function UniversitySwitcher({
  universities, currentCode,
}: {
  universities: { code: string; title: string }[];
  currentCode: string;
}) {
  const router = useRouter();
  if (universities.length <= 1) return null;
  return (
    <select
      aria-label="انتخاب دانشگاه"
      value={currentCode}
      onChange={e => {
        const v = e.target.value;
        if (v && v !== currentCode) router.push(`/login?u=${v}`);
      }}
      className="cursor-pointer rounded-xl border border-white/25 bg-white/10 px-3 py-1.5 text-[12px] font-bold text-emerald-50 backdrop-blur hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-emerald-300/60"
    >
      {universities.map(u => (
        <option key={u.code} value={u.code} className="text-slate-900">
          {u.title}
        </option>
      ))}
    </select>
  );
}
