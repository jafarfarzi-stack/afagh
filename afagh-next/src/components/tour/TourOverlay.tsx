'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { TourStep } from './tour-steps';

/**
 * لایهٔ نمایشِ تور — یک «حلقهٔ تاریک» روی دکمهٔ واقعی + یک حبابِ توضیح.
 *
 * اصول پیاده‌سازی:
 *  • ریشه `pointer-events-none` است تا کلیک‌های بیرونِ حباب به خودِ صفحه برسند؛
 *    فقط حباب `pointer-events-auto` است. (تور «مودال» نیست؛ aria-modal=false)
 *  • حلقه با `box-shadow: 0 0 0 9999px` ساخته می‌شود: بدون بک‌دراپ‌فیلتر و
 *    بدون لایهٔ اضافه، دقیقاً مثل الگوی تورهای SaaS.
 *  • هیچ انیمیشنی جز opacity/transform ندارد و در چاپ دیده نمی‌شود.
 *  • موقعیت با `scroll` (capture)، `resize` و `ResizeObserver` دوباره اندازه
 *    گرفته و داخل viewport clamp می‌شود.
 *  • موبایل (<640px) یا لنگرِ نامرئی ⇒ شیت پایین، بالای نوار ناوبری ۷۶px.
 */

const GAP = 10;
const MARGIN = 12;
const BUBBLE_MAX = 340;
const MOBILE_BREAKPOINT = 640;
const BOTTOM_NAV = 76;

type Rect = { top: number; left: number; width: number; height: number };
type Pos = { top: number; left: number };

const faNum = (n: number) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

function isVisible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
}

/** اولین عنصرِ دیده‌شدنی از `anchor`، وگرنه از `fallback`؛ در آخرین تلاش، اولین عنصرِ موجود. */
function findAnchor(step: TourStep): HTMLElement | null {
  const selectors = [step.anchor, step.fallback].filter((s): s is string => !!s);
  for (const selector of selectors) {
    let found: Element[] = [];
    try {
      found = Array.from(document.querySelectorAll(selector));
    } catch {
      continue; // سلکتور نامعتبر نباید کل تور را بشکند
    }
    const hit = found.find(el => el instanceof HTMLElement && isVisible(el));
    if (hit) return hit as HTMLElement;
  }
  for (const selector of selectors) {
    try {
      const el = document.querySelector(selector);
      if (el instanceof HTMLElement) return el;
    } catch {
      /* رد شو */
    }
  }
  return null;
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

export default function TourOverlay({
  step,
  index,
  total,
  onNext,
  onPrev,
  onSkip,
}: {
  step: TourStep;
  index: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [sheet, setSheet] = useState(false);
  const [bubbleH, setBubbleH] = useState(0);
  const [pos, setPos] = useState<Pos | null>(null);

  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const focusedStepRef = useRef<string | null>(null);

  const uid = useId();
  const titleId = `${uid}-title`;
  const bodyId = `${uid}-body`;
  const actionId = `${uid}-action`;

  /* پورتال فقط پس از mount — تا هیچ رندری در سرور/هیدریشن اضافه نشود. */
  useEffect(() => {
    setMounted(true);
  }, []);

  const measure = useCallback(() => {
    const el = findAnchor(step);
    const mobile = window.innerWidth < MOBILE_BREAKPOINT;
    if (!el || mobile || !isVisible(el)) {
      setRect(null);
      setSheet(true);
      return;
    }
    const r = el.getBoundingClientRect();
    const next: Rect = { top: r.top, left: r.left, width: r.width, height: r.height };
    setSheet(false);
    setRect(prev => (sameRect(prev, next) ? prev : next));
  }, [step]);

  /* لنگرِ بیرون از دید را یک‌بار (بدون انیمیشن) وسط صفحه بیاور، بعد اندازه بگیر. */
  useLayoutEffect(() => {
    setPos(null); // جای مرحلهٔ قبل یک لحظه دیده نشود
    const el = findAnchor(step);
    if (el && !isVisible(el)) {
      try {
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      } catch {
        /* مرورگرهای قدیمی */
      }
    }
    measure();
  }, [measure, step]);

  /* بازاندازه‌گیری روی اسکرول/تغییر اندازه/تغییر چیدمان لنگر. */
  useEffect(() => {
    const onScroll = () => measure();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);

    let ro: ResizeObserver | null = null;
    const el = findAnchor(step);
    if (typeof ResizeObserver !== 'undefined' && el) {
      ro = new ResizeObserver(onScroll);
      ro.observe(el);
      if (document.body) ro.observe(document.body);
    }

    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      ro?.disconnect();
    };
  }, [measure, step]);

  /* ارتفاع حباب برای محاسبهٔ بالا/پایینِ لنگر. */
  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const read = () => setBubbleH(el.offsetHeight);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [step.id, sheet]);

  /* جای حباب + clamp به viewport. */
  useLayoutEffect(() => {
    if (sheet || !rect) {
      setPos(null);
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bw = Math.min(BUBBLE_MAX, vw - 2 * MARGIN);
    const bh = Math.min(bubbleH || 180, vh - 2 * MARGIN);
    // در بازهٔ تبلت (۶۴۰–۷۶۷) نوار پایین هنوز هست؛ حباب رویش نیفتد.
    const bottomInset = vw < 768 ? BOTTOM_NAV : 0;

    const spaceBelow = vh - bottomInset - (rect.top + rect.height);
    const spaceAbove = rect.top;
    const placement: 'top' | 'bottom' =
      step.placement === 'top'
        ? 'top'
        : step.placement === 'bottom'
          ? 'bottom'
          : spaceBelow >= bh + GAP + MARGIN || spaceBelow >= spaceAbove
            ? 'bottom'
            : 'top';

    const rawTop = placement === 'bottom' ? rect.top + rect.height + GAP : rect.top - bh - GAP;
    const top = Math.min(Math.max(rawTop, MARGIN), Math.max(MARGIN, vh - bh - MARGIN - bottomInset));
    const left = Math.min(Math.max(rect.left + rect.width / 2 - bw / 2, MARGIN), Math.max(MARGIN, vw - bw - MARGIN));
    setPos(prev => (prev && Math.abs(prev.top - top) < 0.5 && Math.abs(prev.left - left) < 0.5 ? prev : { top, left }));
  }, [bubbleH, rect, sheet, step.placement]);

  /* فوکوس: دکمهٔ اصلی در باز شدن/هر مرحله، و بازگرداندن فوکوس هنگام بستن. */
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    restoreRef.current = previous;
    return () => {
      const el = restoreRef.current;
      if (el?.isConnected) el.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    // تا جای حباب مشخص نشده (`visibility:hidden`) فوکوس گرفتن ممکن نیست.
    if (!sheet && !pos) return;
    // فقط یک بار برای هر مرحله؛ اسکرول/تغییر موقعیت نباید فوکوس را بدزدد.
    if (focusedStepRef.current === step.id) return;
    focusedStepRef.current = step.id;
    primaryRef.current?.focus({ preventScroll: true });
  }, [pos, sheet, step.id]);

  /* کلیدها: Esc=رد کردن، Enter/ArrowLeft=بعدی، ArrowRight=قبلی، Tab چرخش در حباب. */
  useEffect(() => {
    const trapTab = (e: KeyboardEvent) => {
      const root = bubbleRef.current;
      if (!root) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      ).filter(el => !el.hasAttribute('disabled') && el.getClientRects().length > 0);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (!root.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onSkip();
        return;
      }
      if (e.key === 'Tab') {
        trapTab(e);
        return;
      }
      const target = e.target as HTMLElement | null;
      // اگر کاربر واقعاً مشغول تایپ در صفحه است، کلیدهای ناوبری تور دخالت نکنند.
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'Enter') {
        // اگر فوکوس روی خودِ دکمه‌هاست، کلیکِ بومی همان کار را می‌کند (نه دو بار).
        if (target?.closest('button, a')) return;
        e.preventDefault();
        onNext();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onNext();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        onPrev();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNext, onPrev, onSkip]);

  if (!mounted || typeof document === 'undefined') return null;

  const isLast = index >= total - 1;

  const bubbleStyle: CSSProperties = sheet
    ? {
        position: 'fixed',
        left: MARGIN,
        right: MARGIN,
        bottom: `calc(${BOTTOM_NAV}px + env(safe-area-inset-bottom, 0px))`,
        maxWidth: 460,
        marginInline: 'auto',
        maxHeight: '58vh',
        overflowY: 'auto',
        zIndex: 72,
      }
    : {
        position: 'fixed',
        top: pos?.top ?? MARGIN,
        left: pos?.left ?? MARGIN,
        width: `min(${BUBBLE_MAX}px, calc(100vw - ${2 * MARGIN}px))`,
        maxHeight: `calc(100vh - ${2 * MARGIN}px)`,
        overflowY: 'auto',
        visibility: pos ? 'visible' : 'hidden',
        zIndex: 72,
      };

  return createPortal(
    <div dir="rtl" className="print:hidden" style={{ position: 'fixed', inset: 0, zIndex: 70, pointerEvents: 'none' }}>
      {!sheet && rect ? (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            borderRadius: 14,
            boxShadow: '0 0 0 9999px rgba(15,23,42,.45)',
            opacity: 1,
            pointerEvents: 'none',
            zIndex: 71,
          }}
        />
      ) : (
        <div aria-hidden style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', pointerEvents: 'none', zIndex: 71 }} />
      )}

      <div
        ref={bubbleRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={`${bodyId} ${actionId}`}
        aria-live="polite"
        dir="rtl"
        className="pointer-events-auto rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl print:hidden"
        style={bubbleStyle}
      >
        <div className="flex items-start justify-between gap-2">
          <p id={titleId} className="text-sm font-extrabold leading-6">
            {step.title}
          </p>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-3xs font-bold text-slate-500">
            {faNum(index + 1)} از {faNum(total)}
          </span>
        </div>

        <p id={bodyId} className="mt-1.5 text-xs leading-6 text-slate-600">
          {step.body}
        </p>
        <p id={actionId} className="mt-1 text-xs font-bold leading-6 text-indigo-700">{step.action}</p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="rounded-lg px-2 py-1.5 text-2xs font-bold text-slate-500 transition-colors hover:bg-slate-100"
          >
            رد کردن
          </button>

          <div className="flex items-center gap-1.5">
            {index > 0 && (
              <button
                type="button"
                onClick={onPrev}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-2xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
              >
                قبلی
              </button>
            )}
            <button
              ref={primaryRef}
              type="button"
              onClick={onNext}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-2xs font-black text-white transition-colors hover:bg-indigo-500"
            >
              {isLast ? 'پایان تور' : 'بعدی'}
            </button>
          </div>
        </div>

        <p className="mt-1.5 text-3xs text-slate-400">
          <span className="hidden sm:inline">Enter بعدی · ← بعدی · → قبلی · Esc بستن</span>
          <span className="sm:hidden">برای بستن «رد کردن» را بزنید</span>
        </p>
      </div>
    </div>,
    document.body,
  );
}
