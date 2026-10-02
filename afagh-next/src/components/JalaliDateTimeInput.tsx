'use client';

import { useMemo, useState } from 'react';
import { toJalali, toGregorian } from '@/lib/calendar';

/**
 * ورودی تاریخ/ساعت شمسی — مقدار داخلی همیشه میلادی ISO (`YYYY-MM-DDTHH:mm`)
 * نگه داشته می‌شود (همان چیزی که سرور انتظار دارد) اما آنچه کاربر می‌بیند و
 * وارد می‌کند شمسی است. مرورگر برای input[type=datetime-local] همیشه تقویم
 * میلادی نشان می‌دهد، بنابراین برای تقویم شمسی از input[type=text] استفاده
 * می‌کنیم و تبدیل را خودمان انجام می‌دهیم.
 */
export default function JalaliDateTimeInput({
  value,
  onChange,
  withTime = true,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  withTime?: boolean;
  placeholder?: string;
  className?: string;
}) {
  // متن در حال ویرایش کاربر (اجازه می‌دهد کاربر ناقص تایپ کند)
  const [text, setText] = useState<string | null>(null);

  const shown = useMemo(() => {
    if (text !== null) return text;
    if (!value) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
    if (!m) return '';
    const [, gy, gm, gd, hh, mm] = m;
    const j = toJalali(Number(gy), Number(gm), Number(gd));
    const jy = String(j.jy).padStart(4, '0');
    const jm = String(j.jm).padStart(2, '0');
    const jd = String(j.jd).padStart(2, '0');
    return withTime ? `${jy}/${jm}/${jd} ${hh ?? '00'}:${mm ?? '00'}` : `${jy}/${jm}/${jd}`;
  }, [text, value, withTime]);

  const commit = (raw: string) => {
    const v = raw.trim();
    if (!v) {
      setText('');
      onChange('');
      return;
    }
    const m = withTime
      ? /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})(?:[\sT]+(\d{1,2}):(\d{2}))?$/.exec(v)
      : /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/.exec(v);
    if (!m) return; // ورودی نامعتبر: صبر می‌کنیم تا کامل شود
    const jy = Number(m[1]);
    const jm = Number(m[2]);
    const jd = Number(m[3]);
    if (jm < 1 || jm > 12 || jd < 1 || jd > 31) return;
    const g = toGregorian(jy, jm, jd);
    if (!g) return;
    const hh = m[4] !== undefined ? String(Math.min(23, Number(m[4]))).padStart(2, '0') : '00';
    const mmv = m[5] !== undefined ? m[5] : '00';
    const iso = `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}T${hh}:${mmv}`;
    setText(null);
    onChange(iso);
  };

  return (
    <div className={'relative ' + (className ?? '')}>
      <input
        type="text"
        dir="ltr"
        inputMode="numeric"
        placeholder={placeholder ?? (withTime ? '1404/01/15 08:30' : '1404/01/15')}
        value={shown}
        onChange={e => setText(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
        }}
        className="w-full rounded-lg border border-slate-300 bg-white p-1.5 text-center font-mono text-xs"
      />
      <input
        type="date"
        aria-hidden
        tabIndex={-1}
        value={value ? value.slice(0, 10) : ''}
        onChange={e => {
          if (!e.target.value) {
            onChange('');
            return;
          }
          const time = value.includes('T') ? value.slice(11, 16) : '00:00';
          onChange(`${e.target.value}T${time}`);
        }}
        className="absolute left-1 top-1/2 h-6 w-6 -translate-y-1/2 cursor-pointer opacity-0"
        title="انتخاب از تقویم"
      />
    </div>
  );
}