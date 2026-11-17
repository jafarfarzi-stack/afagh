import 'server-only';

import { sql } from 'drizzle-orm';
import { db } from '@/db';

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  منبعِ یکتای شمارندهٔ صندلی (`course_offerings."enrolledCount"`)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * پیش از این، پنج مسیرِ کد این ستون را با سه تعریفِ متفاوت می‌نوشتند و
 * شمارنده از واقعیت جدا می‌شد. تعریفِ رسمی (تنها تعریفِ مجاز) این است:
 *
 *   enrolledCount = تعداد ردیف‌های enrollments با وضعیت 'REGISTERED'
 *                 + تعداد درخواست‌های bypass که صندلی‌شان هنوز رزرو است
 *                   (seatReserved = 1 و status ∈ {PENDING_MANAGER, ESCALATED_EXPERT})
 *
 * توجه: `PENDING_COUNCIL` و `WAITLISTED` صندلی اشغال نمی‌کنند (تأییدِ شورا
 * هنوز ثبتِ قطعی نیست و لیست انتظار بیرون از ظرفیت است).
 *
 * ⚠ شمارشِ مضاعفِ رزرو: وقتی یک درخواستِ bypass تأیید می‌شود، در
 * `approveBypassRequest` هم ردیفِ enrollments با status='REGISTERED' ساخته
 * می‌شود و هم همان درخواست `seatReserved=0` و status='APPROVED' می‌گیرد؛
 * قیدِ `seatReserved = 1` در تعریف باعث می‌شود همان صندلی فقط یک‌بار شمرده
 * شود. (درخواستِ رد/لغو/منقضی هم seatReserved=0 دارد و در شمارش نمی‌آید.)
 *
 * این فایل هیچ‌جا ردیف enrollment را حذف نمی‌کند؛ «پاک‌سازی» همیشه
 * soft-drop با status='DROPPED' است تا نمره/حضور/اعتراض به آن ارجاع‌دار
 * باقی بماند.
 */

/** عبارتِ شمارشِ صندلی برای هر ارائه — روی الیاسِ `o` (course_offerings) */
const seatCountSql = sql`(
  (SELECT count(*) FROM enrollments e
    WHERE e."offeringId" = o.id AND e.status = 'REGISTERED')
  + (SELECT count(*) FROM enroll_bypass_requests b
    WHERE b."offeringId" = o.id AND b."seatReserved" = 1
      AND b.status IN ('PENDING_MANAGER', 'ESCALATED_EXPERT'))
)::int`;

/** وضعیت‌هایی که «ثبت‌نامِ فعال» محسوب می‌شوند (برای کشفِ ردیف‌های تکراری) */
const ACTIVE_ENROLLMENT_STATUSES = sql`('REGISTERED', 'WAITLISTED', 'PENDING_COUNCIL')`;

/** دلیلی که هنگام soft-drop ردیفِ تکراری در ستون enrollOverrideReason نوشته می‌شود */
export const DUPLICATE_CLEANUP_REASON = 'پاک‌سازی رکورد تکراری (سیستم)';

const execOf = (exec?: any) => exec ?? db;

function positiveIds(ids: number[]): number[] {
  return [...new Set((ids ?? []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  const n = Math.max(1, Math.floor(size));
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

// ═══════════════════════════════ شمارش ═══════════════════════════════

/**
 * بازشماریِ یک ارائه و نوشتنِ مقدارِ درست روی همان ردیف.
 * `exec` می‌تواند تراکنش باشد تا در همان tx اجرا شود.
 * مقدارِ نهاییِ ذخیره‌شده را برمی‌گرداند (۰ اگر ارائه پیدا نشود).
 */
export async function recountOffering(offeringId: number, exec?: any): Promise<number> {
  const id = Number(offeringId);
  if (!Number.isInteger(id) || id <= 0) return 0;
  const res = await execOf(exec).execute(sql`
    UPDATE "course_offerings" AS o
       SET "enrolledCount" = ${seatCountSql}
     WHERE o.id = ${id}
    RETURNING o."enrolledCount" AS "n"
  `);
  const row = (res?.rows ?? [])[0] as { n: number | string } | undefined;
  return Number(row?.n ?? 0);
}

/**
 * بازشماریِ مجموعه‌ای (یک `UPDATE … FROM (subquery)` برای هر دسته).
 * ردیف‌هایی که مقدارشان از قبل درست است لمس نمی‌شوند (`IS DISTINCT FROM`)
 * تا قفل/بازنویسیِ بی‌مورد رخ ندهد.
 */
export async function recountOfferings(offeringIds: number[], exec?: any): Promise<void> {
  const ids = positiveIds(offeringIds);
  if (!ids.length) return;
  const e = execOf(exec);
  for (const part of chunk(ids, 500)) {
    const list = sql.join(part.map(id => sql`${id}`), sql`, `);
    await e.execute(sql`
      UPDATE "course_offerings" AS o
         SET "enrolledCount" = sub."n"
        FROM (
          SELECT x.id AS id, (
            (SELECT count(*) FROM enrollments e2
              WHERE e2."offeringId" = x.id AND e2.status = 'REGISTERED')
            + (SELECT count(*) FROM enroll_bypass_requests b
              WHERE b."offeringId" = x.id AND b."seatReserved" = 1
                AND b.status IN ('PENDING_MANAGER', 'ESCALATED_EXPERT'))
          )::int AS "n"
          FROM "course_offerings" x
          WHERE x.id IN (${list})
        ) AS sub
       WHERE o.id = sub.id
         AND o."enrolledCount" IS DISTINCT FROM sub."n"
    `);
  }
}

/**
 * بازشماریِ همهٔ ارائه‌های یک ترم در یک دانشگاه.
 * تعداد ردیف‌های واقعاً بازنویسی‌شده را برمی‌گرداند.
 */
export async function recountTermOfferings(termId: number, universityId: number): Promise<number> {
  const t = Number(termId);
  const u = Number(universityId);
  if (!Number.isInteger(t) || t <= 0 || !Number.isInteger(u) || u <= 0) return 0;
  const res = await db.execute(sql`
    UPDATE "course_offerings" AS o
       SET "enrolledCount" = ${seatCountSql}
     WHERE o."termId" = ${t}
       AND o."universityId" = ${u}
       AND o."enrolledCount" IS DISTINCT FROM ${seatCountSql}
    RETURNING o.id AS id
  `);
  return (res?.rows ?? []).length;
}

// ═══════════════════════════ تشخیصِ ناهمگامی ═══════════════════════════

export type OfferingDrift = { offeringId: number; stored: number; computed: number };

export type OfferingDriftRow = OfferingDrift & {
  courseCode: string | null;
  courseTitle: string | null;
  groupNumber: number | null;
  termId: number;
  termCode: string | null;
  capacity: number | null;
};

/** خلاصهٔ ناهمگامیِ شمارنده در سطح دانشگاه (همهٔ ارائه‌ها، نه فقط نمونه‌ها) */
export async function countDrift(universityId: number): Promise<{
  offerings: number;
  totalDrift: number;
  samples: OfferingDrift[];
}> {
  const u = Number(universityId);
  if (!Number.isInteger(u) || u <= 0) return { offerings: 0, totalDrift: 0, samples: [] };

  const agg = await db.execute(sql`
    SELECT count(*)::int AS "offerings",
           COALESCE(sum(abs(o."enrolledCount" - ${seatCountSql})), 0)::int AS "drift"
      FROM "course_offerings" AS o
     WHERE o."universityId" = ${u}
       AND o."enrolledCount" IS DISTINCT FROM ${seatCountSql}
  `);
  const a = ((agg?.rows ?? [])[0] ?? {}) as { offerings?: number | string; drift?: number | string };

  const sampleRows = await db.execute(sql`
    SELECT o.id AS "offeringId",
           o."enrolledCount"::int AS "stored",
           ${seatCountSql} AS "computed"
      FROM "course_offerings" AS o
     WHERE o."universityId" = ${u}
       AND o."enrolledCount" IS DISTINCT FROM ${seatCountSql}
     ORDER BY abs(o."enrolledCount" - ${seatCountSql}) DESC, o.id
     LIMIT 100
  `);

  return {
    offerings: Number(a.offerings ?? 0),
    totalDrift: Number(a.drift ?? 0),
    samples: ((sampleRows?.rows ?? []) as any[]).map(r => ({
      offeringId: Number(r.offeringId),
      stored: Number(r.stored ?? 0),
      computed: Number(r.computed ?? 0),
    })),
  };
}

/** فهرستِ بدترین ناهمگامی‌ها برای جدولِ صفحه (نام درس/ترم هم می‌آید) */
export async function loadOfferingDrift(universityId: number, limit = 100): Promise<OfferingDriftRow[]> {
  const u = Number(universityId);
  if (!Number.isInteger(u) || u <= 0) return [];
  const res = await db.execute(sql`
    SELECT o.id AS "offeringId",
           o."enrolledCount"::int AS "stored",
           ${seatCountSql} AS "computed",
           o."groupNumber" AS "groupNumber",
           o."termId" AS "termId",
           o.capacity AS "capacity",
           t."termCode" AS "termCode",
           c.code AS "courseCode",
           c.title AS "courseTitle"
      FROM "course_offerings" AS o
      JOIN courses c ON c.id = o."courseId"
      JOIN academic_terms t ON t.id = o."termId"
     WHERE o."universityId" = ${u}
       AND o."enrolledCount" IS DISTINCT FROM ${seatCountSql}
     ORDER BY abs(o."enrolledCount" - ${seatCountSql}) DESC, o.id
     LIMIT ${Math.max(1, Math.min(500, Math.floor(limit)))}
  `);
  return ((res?.rows ?? []) as any[]).map(r => ({
    offeringId: Number(r.offeringId),
    stored: Number(r.stored ?? 0),
    computed: Number(r.computed ?? 0),
    courseCode: r.courseCode ?? null,
    courseTitle: r.courseTitle ?? null,
    groupNumber: r.groupNumber == null ? null : Number(r.groupNumber),
    termId: Number(r.termId),
    termCode: r.termCode ?? null,
    capacity: r.capacity == null ? null : Number(r.capacity),
  }));
}

/**
 * اصلاحِ همهٔ ناهمگامی‌های یک دانشگاه — شناسه‌ها را می‌گیرد و دسته‌دسته
 * بازشماری می‌کند. تعداد ارائه‌های بازنویسی‌شده را برمی‌گرداند.
 */
export async function recountDriftedOfferings(universityId: number, batchSize = 200): Promise<number> {
  const u = Number(universityId);
  if (!Number.isInteger(u) || u <= 0) return 0;
  const res = await db.execute(sql`
    SELECT o.id AS id
      FROM "course_offerings" AS o
     WHERE o."universityId" = ${u}
       AND o."enrolledCount" IS DISTINCT FROM ${seatCountSql}
     ORDER BY o.id
  `);
  const ids = ((res?.rows ?? []) as Array<{ id: number | string }>)
    .map(r => Number(r.id))
    .filter(n => Number.isInteger(n) && n > 0);
  for (const part of chunk(ids, Math.max(1, Math.floor(batchSize)))) {
    await recountOfferings(part);
  }
  return ids.length;
}

// ═══════════════════ گروه‌های تکراری (student, term, course) ═══════════════════

export type DuplicateRowView = {
  enrollmentId: number;
  offeringId: number;
  groupNumber: number | null;
  status: string;
  gradeValue: number | null;
  registeredAt: string | null;
  /** آیا این ردیف بر اساس قاعدهٔ نگه‌داشتن، باقی می‌ماند؟ */
  keep: boolean;
};

export type DuplicateGroupView = {
  key: string;
  studentId: number;
  studentCode: string | null;
  studentName: string;
  termId: number;
  termCode: string;
  courseId: number;
  courseCode: string;
  courseTitle: string;
  rows: DuplicateRowView[];
  /** توضیحِ فارسیِ قاعده‌ای که ردیفِ نگه‌داشته‌شده را انتخاب کرد */
  keepReason: string;
};

export type RawDuplicateRow = {
  enrollmentId: number | string;
  studentId: number | string;
  studentCode: string | null;
  firstName: string | null;
  lastName: string | null;
  termId: number | string;
  termCode: string | null;
  courseId: number | string;
  courseCode: string | null;
  courseTitle: string | null;
  offeringId: number | string;
  groupNumber: number | string | null;
  status: string;
  gradeValue: string | number | null;
  registeredAt: Date | string | null;
};

/** همهٔ ردیف‌های فعالِ گروه‌های تکراری (بدون سقف — برای ساختنِ پلنِ کامل) */
async function loadDuplicateRows(universityId: number, exec?: any): Promise<RawDuplicateRow[]> {
  const u = Number(universityId);
  if (!Number.isInteger(u) || u <= 0) return [];
  const res = await execOf(exec).execute(sql`
    WITH dup AS (
      SELECT e."studentId" AS "studentId",
             o."termId" AS "termId",
             o."courseId" AS "courseId"
        FROM enrollments e
        JOIN course_offerings o ON o.id = e."offeringId"
       WHERE e.status IN ${ACTIVE_ENROLLMENT_STATUSES}
         AND o."universityId" = ${u}
       GROUP BY e."studentId", o."termId", o."courseId"
      HAVING count(*) > 1
    )
    SELECT e.id AS "enrollmentId",
           e."studentId" AS "studentId",
           s."studentCode" AS "studentCode",
           u2."firstName" AS "firstName",
           u2."lastName" AS "lastName",
           o."termId" AS "termId",
           t."termCode" AS "termCode",
           o."courseId" AS "courseId",
           c.code AS "courseCode",
           c.title AS "courseTitle",
           o.id AS "offeringId",
           o."groupNumber" AS "groupNumber",
           e.status AS status,
           e."gradeValue" AS "gradeValue",
           e."registeredAt" AS "registeredAt"
      FROM dup d
      JOIN enrollments e ON e."studentId" = d."studentId"
      JOIN course_offerings o
        ON o.id = e."offeringId"
       AND o."termId" = d."termId"
       AND o."courseId" = d."courseId"
      JOIN students s ON s.id = e."studentId"
      JOIN users u2 ON u2.id = s."userId"
      JOIN academic_terms t ON t.id = o."termId"
      JOIN courses c ON c.id = o."courseId"
     WHERE e.status IN ${ACTIVE_ENROLLMENT_STATUSES}
       AND o."universityId" = ${u}
     ORDER BY e."studentId", o."termId", o."courseId", e.id
  `);
  return (res?.rows ?? []) as RawDuplicateRow[];
}

function numericGrade(v: string | number | null): number | null {
  if (v == null) return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function timeOf(v: Date | string | null): number {
  if (!v) return Number.MAX_SAFE_INTEGER; // بدون تاریخ = آخرِ صف
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

const byOldest = (a: RawDuplicateRow, b: RawDuplicateRow) =>
  timeOf(a.registeredAt) - timeOf(b.registeredAt) ||
  Number(a.enrollmentId) - Number(b.enrollmentId);

/**
 * قاعدهٔ نگه‌داشتنِ ردیف، به همین ترتیب:
 *  ۱) ردیفی که `gradeValue` دارد — بالاترین نمره برنده است،
 *  ۲) وگرنه قدیمی‌ترین ردیفِ `REGISTERED` (registeredAt سپس id)،
 *  ۳) وگرنه قدیمی‌ترین ردیف.
 */
export function pickKeepRow(rows: RawDuplicateRow[]): { keep: RawDuplicateRow; reason: string } {
  const graded = rows.filter(r => numericGrade(r.gradeValue) != null);
  if (graded.length) {
    const keep = [...graded].sort((a, b) => {
      const d = (numericGrade(b.gradeValue) ?? 0) - (numericGrade(a.gradeValue) ?? 0);
      return d !== 0 ? d : byOldest(a, b);
    })[0];
    return { keep, reason: 'ردیفِ دارای نمره (بالاترین نمره)' };
  }
  const registered = rows.filter(r => r.status === 'REGISTERED');
  if (registered.length) {
    return { keep: [...registered].sort(byOldest)[0], reason: 'قدیمی‌ترین ردیفِ REGISTERED' };
  }
  return { keep: [...rows].sort(byOldest)[0], reason: 'قدیمی‌ترین ردیف' };
}

function buildGroups(rows: RawDuplicateRow[]): Array<{
  key: string;
  raw: RawDuplicateRow[];
  keep: RawDuplicateRow;
  reason: string;
}> {
  const map = new Map<string, RawDuplicateRow[]>();
  for (const r of rows) {
    const key = `${r.studentId}:${r.termId}:${r.courseId}`;
    const list = map.get(key);
    if (list) list.push(r);
    else map.set(key, [r]);
  }
  return [...map.entries()]
    .filter(([, list]) => list.length > 1)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([key, list]) => ({ key, raw: list, ...pickKeepRow(list) }));
}

function toView(g: { key: string; raw: RawDuplicateRow[]; keep: RawDuplicateRow; reason: string }): DuplicateGroupView {
  const first = g.raw[0];
  return {
    key: g.key,
    studentId: Number(first.studentId),
    studentCode: first.studentCode ?? null,
    studentName: `${first.firstName ?? ''} ${first.lastName ?? ''}`.trim() || (first.studentCode ?? '—'),
    termId: Number(first.termId),
    termCode: first.termCode ?? '—',
    courseId: Number(first.courseId),
    courseCode: first.courseCode ?? '—',
    courseTitle: first.courseTitle ?? '—',
    keepReason: g.reason,
    rows: g.raw.map(r => ({
      enrollmentId: Number(r.enrollmentId),
      offeringId: Number(r.offeringId),
      groupNumber: r.groupNumber == null ? null : Number(r.groupNumber),
      status: r.status,
      gradeValue: numericGrade(r.gradeValue),
      registeredAt: r.registeredAt == null
        ? null
        : r.registeredAt instanceof Date ? r.registeredAt.toISOString() : String(r.registeredAt),
      keep: Number(r.enrollmentId) === Number(g.keep.enrollmentId),
    })),
  };
}

/** خلاصهٔ آماریِ گروه‌های تکراری — همهٔ اعداد از SQL */
export async function duplicateSummary(universityId: number): Promise<{ groups: number; extraRows: number }> {
  const u = Number(universityId);
  if (!Number.isInteger(u) || u <= 0) return { groups: 0, extraRows: 0 };
  const res = await db.execute(sql`
    SELECT count(*)::int AS "groups",
           COALESCE(sum(t.n - 1), 0)::int AS "extraRows"
      FROM (
        SELECT e."studentId", o."termId", o."courseId", count(*)::int AS n
          FROM enrollments e
          JOIN course_offerings o ON o.id = e."offeringId"
         WHERE e.status IN ${ACTIVE_ENROLLMENT_STATUSES}
           AND o."universityId" = ${u}
         GROUP BY e."studentId", o."termId", o."courseId"
        HAVING count(*) > 1
      ) t
  `);
  const r = ((res?.rows ?? [])[0] ?? {}) as { groups?: number | string; extraRows?: number | string };
  return { groups: Number(r.groups ?? 0), extraRows: Number(r.extraRows ?? 0) };
}

/** نمایشِ گروه‌های تکراری برای جدولِ صفحه (پیش‌فرض ۱۰۰ گروه) */
export async function loadDuplicateGroups(universityId: number, maxGroups = 100): Promise<DuplicateGroupView[]> {
  const rows = await loadDuplicateRows(universityId);
  return buildGroups(rows).slice(0, Math.max(1, Math.floor(maxGroups))).map(toView);
}

// ═════════════════════ پلن و اجرای پاک‌سازیِ تکراری‌ها ═════════════════════

export type DuplicateCleanupPlan = {
  /** تعداد گروه‌های تکراری */
  groups: number;
  /** تعداد ردیف‌هایی که soft-drop می‌شوند */
  rowsToDrop: number;
  /** شناسهٔ ردیف‌های باقی‌مانده (نگه‌داشته‌شده) */
  keptEnrollmentIds: number[];
  /** شناسهٔ ردیف‌هایی که DROPPED می‌شوند */
  dropEnrollmentIds: number[];
  /** ارائه‌هایی که شمارنده‌شان باید بازشماری شود */
  affectedOfferingIds: number[];
  /** نمونهٔ گروه‌ها (برای پیش‌نمایش) */
  sample: DuplicateGroupView[];
};

/** ساختِ پلنِ کامل — بدونِ هیچ نوشتنی */
export async function planDuplicateCleanup(
  universityId: number,
  sampleLimit = 50,
  exec?: any,
): Promise<DuplicateCleanupPlan> {
  const rows = await loadDuplicateRows(universityId, exec);
  const groups = buildGroups(rows);
  const keptEnrollmentIds: number[] = [];
  const dropEnrollmentIds: number[] = [];
  const affected = new Set<number>();
  for (const g of groups) {
    const keepId = Number(g.keep.enrollmentId);
    keptEnrollmentIds.push(keepId);
    for (const r of g.raw) {
      affected.add(Number(r.offeringId));
      if (Number(r.enrollmentId) !== keepId) dropEnrollmentIds.push(Number(r.enrollmentId));
    }
  }
  return {
    groups: groups.length,
    rowsToDrop: dropEnrollmentIds.length,
    keptEnrollmentIds,
    dropEnrollmentIds,
    affectedOfferingIds: [...affected],
    sample: groups.slice(0, Math.max(1, Math.min(500, Math.floor(sampleLimit)))).map(toView),
  };
}

export type DuplicateCleanupResult = {
  groups: number;
  rowsDropped: number;
  offeringsRecounted: number;
};

/**
 * اجرای پلن در **یک تراکنش**، دسته‌دسته (پیش‌فرض ۲۰۰ ردیف در هر UPDATE).
 * هیچ ردیفی حذف نمی‌شود؛ فقط status → 'DROPPED' و دلیل در
 * enrollOverrideReason ثبت می‌شود. در پایان شمارندهٔ ارائه‌های متأثر
 * بازشماری می‌شود تا با تعداد واقعیِ REGISTERED بخواند.
 */
export async function applyDuplicateCleanup(
  universityId: number,
  batchSize = 200,
): Promise<DuplicateCleanupResult> {
  const u = Number(universityId);
  if (!Number.isInteger(u) || u <= 0) return { groups: 0, rowsDropped: 0, offeringsRecounted: 0 };

  return db.transaction(async (tx: any) => {
    // قفلِ مشاوره‌ای: دو اجرای هم‌زمان نباید یک ردیف را دوباره/با پلنِ کهنه لمس کنند.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('enrollment-duplicate-cleanup'))`);

    const plan = await planDuplicateCleanup(u, 1, tx);
    if (!plan.dropEnrollmentIds.length) {
      return { groups: plan.groups, rowsDropped: 0, offeringsRecounted: 0 };
    }

    let dropped = 0;
    const touchedOfferings = new Set<number>(plan.affectedOfferingIds);

    for (const part of chunk(plan.dropEnrollmentIds, batchSize)) {
      const list = sql.join(part.map(id => sql`${id}`), sql`, `);
      const res = await tx.execute(sql`
        UPDATE enrollments
           SET status = 'DROPPED',
               "enrollOverrideReason" = ${DUPLICATE_CLEANUP_REASON}
         WHERE id IN (${list})
           AND status IN ${ACTIVE_ENROLLMENT_STATUSES}
        RETURNING "offeringId" AS "offeringId"
      `);
      for (const r of (res?.rows ?? []) as Array<{ offeringId: number | string }>) {
        touchedOfferings.add(Number(r.offeringId));
      }
      dropped += (res?.rows ?? []).length;
    }

    const offeringIds = [...touchedOfferings].filter(n => Number.isInteger(n) && n > 0);
    await recountOfferings(offeringIds, tx);

    return { groups: plan.groups, rowsDropped: dropped, offeringsRecounted: offeringIds.length };
  });
}
