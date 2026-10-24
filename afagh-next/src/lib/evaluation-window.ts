// ════════════════════════════════════════════════════════════════════════════
// پنجرهٔ باز/بستهٔ ارزشیابی اساتید و کلاس‌ها
// ────────────────────────────────────────────────────────────────────────────
// ارزشیابی فقط داخل دورهٔ فعالِ تعیین‌شده توسط مدیریت (evaluation_periods)
// پذیرفته می‌شود. بدون دورهٔ فعال یا خارج از بازهٔ تاریخ → valutator بسته است
// (fail-closed): دانشجو پیام صریح می‌بیند و ثبت ارزشیابی رد می‌شود.
//
// دوره می‌تواند برای یک ترم spécifique باشد (termId) یا سراسریِ دانشگاه
// (termId=NULL). دانشگاهِ تطبیق با universityId دوره انجام می‌شود؛ NULL یعنی
// برای همه (سازگاری با دادهٔ قدیمی — رابط مدیریت همیشه دانشگاه را می‌گذارد).
// ════════════════════════════════════════════════════════════════════════════

import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import { evaluation_periods } from '@/db/schema';

export type EvaluationWindowReason = 'OPEN' | 'NO_PERIOD' | 'BEFORE_START' | 'AFTER_END';

export interface EvaluationWindowStatus {
  /** دورهٔ فعالِ مطابق (اگر پیدا شد) — حتی وقتی باز هم نیست */
  periodId: number | null;
  title: string | null;
  startDate: Date | null;
  endDate: Date | null;
  /** آیا همین حالا می‌توان ارزشیابی ثبت کرد؟ */
  open: boolean;
  reason: EvaluationWindowReason;
  /** پیام فارسی آمادهٔ نمایش به دانشجو */
  message: string;
}

const fmt = (d: Date | null): string => {
  if (!d) return '—';
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString();
  }
};

/**
 * وضعیت پنجرهٔ ارزشیابی برای یک ارائهٔ درس (term + university).
 *
 * @param universityId دانشگاهِ ارائه (NULL = بدون مرز)
 * @param termId        ترمِ ارائه (NULL = هر ترم)
 */
export async function getEvaluationWindow(
  universityId: number | null | undefined,
  termId?: number | null,
): Promise<EvaluationWindowStatus> {
  const now = new Date();

  // دوره‌های فعالِ مرتبط: ترمِ دوره = ترمِ ارائه یا NULL (سراسری)؛
  // دانشگاهِ دوره = دانشگاهِ ارائه یا NULL.
  const termCond = termId == null
    ? undefined
    : or(eq(evaluation_periods.termId, termId), isNull(evaluation_periods.termId));
  const uniCond = universityId == null
    ? undefined
    : or(eq(evaluation_periods.universityId, universityId), isNull(evaluation_periods.universityId));

  const rows = await db
    .select({
      id: evaluation_periods.id,
      title: evaluation_periods.title,
      startDate: evaluation_periods.startDate,
      endDate: evaluation_periods.endDate,
    })
    .from(evaluation_periods)
    .where(and(
      eq(evaluation_periods.isActive, 1),
      ...(termCond ? [termCond] : []),
      ...(uniCond ? [uniCond] : []),
    ))
    .orderBy(desc(evaluation_periods.id))
    .limit(5);

  if (rows.length === 0) {
    return {
      periodId: null, title: null, startDate: null, endDate: null,
      open: false, reason: 'NO_PERIOD',
      message: 'پنجرهٔ ارزشیابی برای این ترم تعیین نشده است — ارزشیابی در حال حاضر بسته است.',
    };
  }

  // اگر چند دورهٔ فعال باشد، اولویّت با دوره‌ای است که همین حالا باز است.
  const inside = rows.find(r => r.startDate != null && r.endDate != null && now >= r.startDate && now <= r.endDate);
  const pick = inside ?? rows[0];

  if (inside) {
    return {
      periodId: pick.id, title: pick.title, startDate: pick.startDate, endDate: pick.endDate,
      open: true, reason: 'OPEN',
      message: `پنجرهٔ ارزشیابی باز است (${fmt(pick.startDate)} تا ${fmt(pick.endDate)}).`,
    };
  }

  const reason: EvaluationWindowReason =
    pick.endDate != null && now > pick.endDate ? 'AFTER_END' : 'BEFORE_START';
  const when = reason === 'AFTER_END'
    ? `پنجرهٔ ارزشیابی در ${fmt(pick.endDate)} بسته شده است.`
    : `پنجرهٔ ارزشیابی از ${fmt(pick.startDate)} باز می‌شود.`;
  return {
    periodId: pick.id, title: pick.title, startDate: pick.startDate, endDate: pick.endDate,
    open: false, reason,
    message: `${when} تا آن زمان ثبت ارزشیابی ممکن نیست.`,
  };
}
