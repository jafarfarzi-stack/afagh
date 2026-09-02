import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { student_requests, workflow_events } from '@/db/schema';
import { getNumber, getSetting } from '@/lib/settings';
import { createLogger } from '@/lib/logger';

// ══════════════════════════════════════════════════════════════════════
//  گذرگاه رویداد موتور گردش کار (Workflow Event Bus)
//
//  چرا؟ تا پیش از این منطق تجاریِ هر فرایند (مثلاً «ثبت درس تطبیق‌داده‌شده در
//  کارنامه» برای COURSE_TRANSFER) مستقیم داخل تابع عمومی advanceWorkflowStep
//  هاردکد شده بود. نتیجه: موتور BPM هم وضعیت جابه‌جا می‌کرد هم درس ثبت می‌کرد
//  و هر فرایند جدید یعنی ویرایش قلب موتور.
//
//  حالا موتور BPM فقط دو کار می‌کند:
//    ۱) جابه‌جایی وضعیت‌ها (داخل یک تراکنش اتمی)
//    ۲) شلیک رویداد در لحظهٔ تصمیم (ثبت PENDING داخل همان تراکنش)
//  و ماژول صاحبِ اثر (Enrollment Engine، آموزش، مالی…) هندلر خودش را ثبت می‌کند.
//
//  دو نکتهٔ عملیاتی:
//    • رویداد *داخل* تراکنش گردش کار درج می‌شود → اگر تراکنش rollback شود،
//      رویدادی هم باقی نمی‌ماند (بدون رویداد شبح).
//    • پردازش هندلرها *پس از* commit انجام می‌شود → خطای ماژول آموزشی هرگز
//      پروندهٔ تأییدشده را برنمی‌گرداند؛ نتیجه در جدول workflow_events
//      می‌نشیند و با retryPendingWorkflowEvents قابل اجرای دوباره است.
// ══════════════════════════════════════════════════════════════════════

const log = createLogger({ mod: 'workflow.events' });

export type WorkflowEventCode =
  | 'WORKFLOW_FINAL_APPROVED'
  | 'WORKFLOW_REJECTED'
  | 'WORKFLOW_RETURNED'
  | 'WORKFLOW_STEP_MOVED'
  | 'WORKFLOW_ESCALATED';

export interface WorkflowEvent {
  /** شناسهٔ سطر ثبت‌شده در workflow_events */
  id: number;
  requestId: number;
  trackingCode: string;
  studentId: number;
  processCode: string;
  eventCode: WorkflowEventCode;
  /** محتوای فرم درخواست (پارس‌شده) */
  formData: Record<string, any>;
  stepTitle?: string | null;
  actorRole?: string | null;
  note?: string | null;
  certificateNumber?: string | null;
  firedAt: Date;
}

export type WorkflowEventHandler = {
  /** نام یکتای هندلر — در جدول workflow_events ذخیره می‌شود */
  name: string;
  /** کد فرایندی که این هندلر به آن گوش می‌دهد (مثلاً COURSE_TRANSFER) */
  processCode: string;
  /** کد رویدادهایی که این هندلر را بیدار می‌کند */
  events: WorkflowEventCode[];
  /** اجرای اثر تجاری؛ هر خطا به‌عنوان FAILED ثبت می‌شود */
  run: (ev: WorkflowEvent) => Promise<void>;
};

/** هر مجری کوئری — اتصال معمولی یا تراکنش (همان نوع workflow-engine) */
export type DbLike = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

const registry: WorkflowEventHandler[] = [];

/** ثبت هندلر توسط ماژول صاحب اثر (آموزش، مالی، پژوهش…) */
export function registerWorkflowHandler(handler: WorkflowEventHandler) {
  const at = registry.findIndex(h => h.name === handler.name && h.processCode === handler.processCode);
  if (at >= 0) registry[at] = handler;
  else registry.push(handler);
}

export function listWorkflowHandlers(): { name: string; processCode: string; events: WorkflowEventCode[] }[] {
  return registry.map(h => ({ name: h.name, processCode: h.processCode, events: h.events }));
}

function parsePayload(raw: string | null): { formData: Record<string, any> } {
  if (!raw) return { formData: {} };
  try {
    const v = JSON.parse(raw);
    const fd = v && typeof v === 'object' && v.formData && typeof v.formData === 'object' ? v.formData : v;
    return { formData: (fd ?? {}) as Record<string, any> };
  } catch {
    return { formData: {} };
  }
}

/**
 * شلیک رویداد — *داخل* تراکنش گردش کار صدا زده می‌شود.
 * برای هر هندلرِ منطبق یک سطر PENDING می‌سازد (اگر هندلری نباشد چیزی ثبت
 * نمی‌شود تا جدول پر از نویز نگردد).
 */
export async function fireWorkflowEvent(
  dbx: DbLike,
  input: {
    requestId: number;
    processCode: string;
    eventCode: WorkflowEventCode;
    formDataRaw?: string | null;
  },
): Promise<number[]> {
  if (!input.processCode) return [];
  const handlers = registry.filter(
    h => h.processCode === input.processCode && h.events.includes(input.eventCode),
  );
  if (!handlers.length) return [];

  const payload = JSON.stringify({ eventCode: input.eventCode, formData: parsePayload(input.formDataRaw ?? null).formData });
  const ids: number[] = [];
  for (const h of handlers) {
    const [row] = await dbx
      .insert(workflow_events)
      .values({
        requestId: input.requestId,
        processCode: input.processCode,
        eventCode: input.eventCode,
        handler: h.name,
        payload,
        status: 'PENDING',
        attempts: 0,
      })
      .returning({ id: workflow_events.id });
    if (row?.id) ids.push(row.id);
  }
  return ids;
}

/**
 * پردازش رویدادهای PENDING یک درخواست — پس از commit.
 * خطای هر هندلر فقط ثبت می‌شود و به فراخوان پرتاب نمی‌شود.
 */
export async function dispatchWorkflowEvent(
  requestId: number,
  meta: {
    processCode: string;
    eventCode: WorkflowEventCode;
    stepTitle?: string | null;
    actorRole?: string | null;
    note?: string | null;
    certificateNumber?: string | null;
    firedAt: Date;
  },
): Promise<{ processed: number; failed: number; skipped: number }> {
  const [req] = await db
    .select({
      id: student_requests.id,
      trackingCode: student_requests.trackingCode,
      studentId: student_requests.studentId,
      certificateNumber: student_requests.certificateNumber,
    })
    .from(student_requests)
    .where(eq(student_requests.id, requestId))
    .limit(1);

  const pending = await db
    .select()
    .from(workflow_events)
    .where(sql`${workflow_events.requestId} = ${requestId} and ${workflow_events.status} = 'PENDING'`);

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of pending) {
    const handler = registry.find(h => h.name === row.handler && h.processCode === row.processCode);
    const ev: WorkflowEvent = {
      id: row.id,
      requestId: row.requestId,
      trackingCode: req?.trackingCode ?? `#${row.requestId}`,
      studentId: req?.studentId ?? 0,
      processCode: row.processCode,
      eventCode: row.eventCode as WorkflowEventCode,
      formData: parsePayload(row.payload).formData,
      stepTitle: meta.stepTitle ?? null,
      actorRole: meta.actorRole ?? null,
      note: meta.note ?? null,
      certificateNumber: meta.certificateNumber ?? req?.certificateNumber ?? null,
      firedAt: row.firedAt ?? meta.firedAt,
    };

    if (!handler) {
      await db
        .update(workflow_events)
        .set({ status: 'SKIPPED', error: 'هندلری برای این رویداد ثبت نشده است.', attempts: sql`${workflow_events.attempts} + 1`, processedAt: new Date() })
        .where(eq(workflow_events.id, row.id));
      skipped++;
      continue;
    }

    try {
      await handler.run(ev);
      await db
        .update(workflow_events)
        .set({ status: 'PROCESSED', error: null, attempts: sql`${workflow_events.attempts} + 1`, processedAt: new Date() })
        .where(eq(workflow_events.id, row.id));
      processed++;
    } catch (err) {
      const msg = (err as Error)?.message || 'خطای ناشناخته';
      log.error('workflow_event_handler_failed', { handler: handler.name, requestId, err: msg });
      await db
        .update(workflow_events)
        .set({ status: 'FAILED', error: msg, attempts: sql`${workflow_events.attempts} + 1`, processedAt: new Date() })
        .where(eq(workflow_events.id, row.id));
      failed++;
    }
  }

  // وب‌هوک اختیاری — خلاصهٔ رویداد به سامانهٔ بیرونی POST می‌شود (بدون اثر بر گردش کار)
  try {
    const url = (await getSetting('WORKFLOW_WEBHOOK_URL')).trim();
    if (url && pending.length) {
      const timeoutSec = await getNumber('API_TIMEOUT_SECONDS', 10);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), Math.max(1, timeoutSec) * 1000);
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            eventCode: meta.eventCode,
            processCode: meta.processCode,
            trackingCode: req?.trackingCode ?? null,
            requestId,
            studentId: req?.studentId ?? null,
            certificateNumber: meta.certificateNumber ?? req?.certificateNumber ?? null,
            firedAt: meta.firedAt.toISOString(),
          }),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    }
  } catch (err) {
    log.warn('workflow_webhook_failed', { err: (err as Error).message });
  }

  return { processed, failed, skipped };
}

/** اجرای دوبارهٔ رویدادهای ناموفق — از پنل مدیر یا cron */
export async function retryPendingWorkflowEvents(limit = 50): Promise<{ retried: number; ok: number; failed: number }> {
  const rows = await db
    .select()
    .from(workflow_events)
    .where(sql`${workflow_events.status} in ('FAILED', 'SKIPPED')`)
    .orderBy(workflow_events.id)
    .limit(Math.max(1, Math.min(500, limit)));

  let ok = 0;
  let failed = 0;
  const seen = new Set<number>();
  for (const row of rows) {
    if (seen.has(row.requestId)) continue;
    seen.add(row.requestId);
    // وضعیت رویداد را به PENDING برمی‌گردانیم تا dispatch دوباره برداردش
    await db.update(workflow_events).set({ status: 'PENDING', error: null }).where(eq(workflow_events.id, row.id));
    const r = await dispatchWorkflowEvent(row.requestId, {
      processCode: row.processCode,
      eventCode: row.eventCode as WorkflowEventCode,
      firedAt: new Date(),
    });
    ok += r.processed;
    failed += r.failed;
  }
  return { retried: rows.length, ok, failed };
}

/** رویدادهای یک پرونده — برای نمایش در کارتابل مدیر */
export async function eventsForRequest(requestId: number) {
  return db.select().from(workflow_events).where(eq(workflow_events.requestId, requestId)).orderBy(workflow_events.id);
}
