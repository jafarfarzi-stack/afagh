'use client';

// ═════════ با کشویی «تنبل» از OOM کل سامانه جلوگیری می‌شود (توضیح پایین) ═════════
import { useState } from 'react';
import type { ProfessorOption } from '../types';

/**
 * کشویی انتخاب استاد — «تنبل».
 *
 * ⚠️ چرا لازم شد: در جدول تقاضا برای *هر ردیف* تا چهار کشویی با *همهٔ*
 * استادان دانشگاه رندر می‌شد. با ۱۵۰۰ استاد و ۳۳۰۰ ردیف یعنی میلیون‌ها
 * عنصر <option> در یک صفحه؛ رندر سمت سرور حافظهٔ Node را تمام می‌کرد و
 * **کل سامانه** با «heap out of memory» می‌مرد (نه فقط این صفحه).
 *
 * راه‌حل: تا وقتی کاربر کشویی را باز نکرده، فقط گزینهٔ *انتخاب‌شده* رندر
 * می‌شود. با اولین mousedown/focus (که پیش از باز شدن لیست رخ می‌دهد)
 * فهرست کامل جای آن را می‌گیرد. رفتار برای کاربر عیناً همان است.
 */

export function ProfessorSelect({
  professors, value, onChange, className, label,
}: {
  professors: ProfessorOption[];
  value: number;
  onChange: (id: number) => void;
  className?: string;
  label?: (p: ProfessorOption) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const text = label ?? ((p: ProfessorOption) => `${p.name} (${p.academicRank})`);
  const selected = professors.find(p => p.id === value);
  const list = expanded ? professors : (selected ? [selected] : professors.slice(0, 1));
  const open = () => { if (!expanded) setExpanded(true); };
  return (
    <select
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      onMouseDown={open}
      onFocus={open}
      onTouchStart={open}
      onKeyDown={open}
      className={className}
    >
      {list.map(p => (
        <option key={p.id} value={p.id}>{text(p)}</option>
      ))}
    </select>
  );
}
