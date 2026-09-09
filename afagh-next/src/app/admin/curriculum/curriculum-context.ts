'use client';

// ════════════════════════════════════════════════════════════════════════
//  ظرف context ماژول برنامهٔ درسی — جدا از Provider نگه داشته می‌شود تا
//  کامپوننت‌ها (و تست‌های رندر) بدون کشیدن Server Actionها به گراف import،
//  فقط همین فایل را وارد کنند.
// ════════════════════════════════════════════════════════════════════════
import { createContext, useContext } from 'react';
import type { CurriculumValue } from './CurriculumProvider';

export const CurriculumCtx = createContext<CurriculumValue | null>(null);

/** مصرف تب‌ها/مودال‌ها: هر فایل فقط نام‌هایی را می‌گیرد که لازم دارد */
export function useCurriculum(): CurriculumValue {
  const ctx = useContext(CurriculumCtx);
  if (!ctx) throw new Error('useCurriculum باید داخل <CurriculumProvider> صدا زده شود.');
  return ctx;
}
