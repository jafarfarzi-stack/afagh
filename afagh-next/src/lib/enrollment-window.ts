import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms } from '@/db/schema';

// ═══ پنجرهٔ زمانی انتخاب واحد ═══
// باز بودن = پرچم مدیر + بودن در بازهٔ [شروع، پایان] — هر سه شرط با هم.
export type Term = typeof academic_terms.$inferSelect;
export type WindowState = 'OPEN' | 'BEFORE' | 'AFTER' | 'CLOSED' | 'NO_TERM';
export type WindowStatus = { open: boolean; state: WindowState; label: string; start: Date | null; end: Date | null };

const faDt = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export function windowStatus(term: Term | null | undefined, now: Date = new Date()): WindowStatus {
  if (!term) return { open: false, state: 'NO_TERM', label: 'ترم جاری تعریف نشده است.', start: null, end: null };
  const start = term.enrollmentStartDate ?? null;
  const end = term.enrollmentEndDate ?? null;
  if (!term.isEnrollmentOpen)
    return { open: false, state: 'CLOSED', label: 'پنجرهٔ انتخاب واحد توسط مدیر بسته است.', start, end };
  if (start && now < new Date(start))
    return { open: false, state: 'BEFORE', label: `پنجرهٔ انتخاب واحد از ${faDt(start)} باز می‌شود.`, start, end };
  if (end && now > new Date(end))
    return { open: false, state: 'AFTER', label: `پنجرهٔ انتخاب واحد در ${faDt(end)} بسته شد.`, start, end };
  return { open: true, state: 'OPEN', label: end ? `پنجرهٔ انتخاب واحد باز است — تا ${faDt(end)}` : 'پنجرهٔ انتخاب واحد باز است.', start, end };
}

export async function currentTerm(): Promise<Term | null> {
  const [t] = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1)).limit(1);
  return t ?? null;
}
