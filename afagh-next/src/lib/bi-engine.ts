import 'server-only';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms, analytics_snapshots, departments, evaluation_periods, staff, users,
} from '@/db/schema';
import { getNumber, getSetting } from '@/lib/settings';
import { createLogger } from '@/lib/logger';

// ══════════════════════════════════════════════════════════════════════
//  موتور هوش تجاری ارزشیابی (BI Engine) — PostgreSQL/Drizzle
//
//  سه اصلاح ساختاری نسبت به نسخهٔ SQLite:
//
//  ۱) حذف N+1 — پیش‌تر `managementOverview` به ازای هر استاد `getTrend` را
//     صدا می‌زد (که خودش به ازای هر دوره یک کوئری داشت) و یک کوئری هم برای
//     شمارش پاسخ‌دهنده‌ها می‌زد؛ `facilitiesReport` هم همین کار را برای هر
//     کلاس تکرار می‌کرد. حالا نمرهٔ وزنیِ «همهٔ اساتید × همهٔ دوره‌ها» با یک
//     CTE و GROUP BY گرفته می‌شود و شاخص‌های «همهٔ کلاس‌ها × همهٔ محورها» با
//     یک GROUP BY دیگر. تعداد کوئری‌ها ثابت است و با تعداد استاد/کلاس رشد
//     نمی‌کند.
//
//  ۲) تحلیل متن در پایگاه داده — ابر کلمات به‌جای خواندن همهٔ نظرات و اجرای
//     Regex در Node، با `regexp_split_to_table` داخل خود PostgreSQL ساخته
//     می‌شود (set-based، بدون بلاک‌شدن event loop) و نتیجه در
//     `analytics_snapshots` کش می‌شود. job زمان‌بندی‌شده
//     `/api/cron/bi-refresh` کش را در ساعات کم‌ترافیک تازه می‌کند.
//
//  ۳) Drizzle به‌جای SQL خام — همهٔ کوئری‌ها با query builder یا `sql`
//     پارامتری‌شده نوشته شده‌اند؛ واژه‌های توقف به‌صورت آرایهٔ پارامتر
//     (`<> all($1)`) به PostgreSQL داده می‌شوند، نه با چسباندن رشته.
//
//  گمنامی مطلق: هیچ کوئری‌ای به دانشجو یا پاسخ‌دهنده ارجاع نمی‌دهد؛ خروجی
//  فقط تعداد و میانگین است.
// ══════════════════════════════════════════════════════════════════════

const log = createLogger({ mod: 'bi' });

export type TrendPoint = { period: string; term: string; termId: number | null; score: number };
export type RadarAxis = { label: string; mine: number | null; dept: number | null; responses: number };
export type WordItem = { w: string; c: number };

export type ManagementRow = {
  staffId: number; name: string; rank: string | null; department: string | null;
  score: number; prevScore: number | null; delta: number | null;
  respondents: number; offerings: number; flagged: boolean; trend: TrendPoint[];
};

export type ManagementOverview = {
  term: string; period: string | null; threshold: number;
  flaggedCount: number; avgScore: number | null; totalRespondents: number;
  list: ManagementRow[];
  cachedAt: string | null; cacheAgeSeconds: number | null;
};

export type FacilityAxis = { label: string; score: number; responses: number };
export type FacilityRow = {
  roomId: number; room: string; building: string | null; type: string | null;
  axes: FacilityAxis[]; worstAxis: string; worstScore: number;
  needsRepair: boolean; courses: string[]; responses: number;
};

export type FacilitiesReport = {
  term: string; period: string | null; repairThreshold: number;
  needsRepairCount: number; rooms: FacilityRow[];
  cachedAt: string | null; cacheAgeSeconds: number | null;
};

const round2 = (n: number | null | undefined) => (n == null || !Number.isFinite(Number(n)) ? null : Math.round(Number(n) * 100) / 100);

/**
 * مالکیت ارزشیابی: مدرس اصلی کلاس.
 * هم `course_offerings.professorId` و هم ردیف `MAIN_LECTURER` در
 * `offering_professors` مالک‌اند (راهنما/داور مشترک، ارزشیابی کلاس دیگران را
 * نمی‌بیند). این CTE در همهٔ کوئری‌های BI مشترک است.
 */
const OWNERSHIP_CTE = sql`
  ownership as (
    select o.id as offering_id, o."professorId" as staff_id
      from course_offerings o where o."professorId" is not null
    union
    select op."offeringId", op."staffId"
      from offering_professors op where op.role = 'MAIN_LECTURER'
  )`;

async function currentTerm() {
  const [t] = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1)).limit(1);
  return t ?? null;
}

async function activePeriod(termId: number | null) {
  if (termId) {
    const [p] = await db
      .select().from(evaluation_periods)
      .where(eq(evaluation_periods.termId, termId))
      .orderBy(desc(evaluation_periods.isActive), desc(evaluation_periods.id))
      .limit(1);
    if (p) return p;
  }
  const [p] = await db
    .select().from(evaluation_periods)
    .orderBy(desc(evaluation_periods.isActive), desc(evaluation_periods.id))
    .limit(1);
  return p ?? null;
}

// ─────────────────── کش گزارش‌ها ───────────────────

type CacheHit<T> = { value: T | null; ageSeconds: number | null };

async function readCache<T>(key: string): Promise<CacheHit<T>> {
  const ttl = await getNumber('BI_CACHE_TTL_SECONDS', 300);
  const [row] = await db
    .select({ payload: analytics_snapshots.payload, computedAt: analytics_snapshots.computedAt })
    .from(analytics_snapshots)
    .where(eq(analytics_snapshots.cacheKey, key))
    .limit(1);
  if (!row) return { value: null, ageSeconds: null };
  const age = Math.max(0, Math.round((Date.now() - new Date(row.computedAt).getTime()) / 1000));
  if (ttl > 0 && age > ttl) return { value: null, ageSeconds: age };
  try {
    return { value: JSON.parse(row.payload) as T, ageSeconds: age };
  } catch {
    return { value: null, ageSeconds: age };
  }
}

async function writeCache(key: string, reportType: string, payload: unknown, rowCount: number | null, startedAt: number) {
  const ttl = await getNumber('BI_CACHE_TTL_SECONDS', 300);
  const computedAt = new Date();
  await db
    .insert(analytics_snapshots)
    .values({
      cacheKey: key,
      reportType,
      payload: JSON.stringify(payload),
      rowCount,
      durationMs: Date.now() - startedAt,
      computedAt,
      expiresAt: ttl > 0 ? new Date(computedAt.getTime() + ttl * 1000) : null,
    })
    .onConflictDoUpdate({
      target: analytics_snapshots.cacheKey,
      set: {
        payload: JSON.stringify(payload),
        rowCount,
        durationMs: Date.now() - startedAt,
        computedAt,
        expiresAt: ttl > 0 ? new Date(computedAt.getTime() + ttl * 1000) : null,
      },
    });
}

/** پاک کردن کش یک گزارش (یا همه) — پس از بسته‌شدن دورهٔ ارزشیابی */
export async function invalidateBiCache(prefix?: string) {
  if (prefix) {
    await db.delete(analytics_snapshots).where(sql`${analytics_snapshots.cacheKey} like ${prefix + '%'}`);
  } else {
    await db.delete(analytics_snapshots);
  }
}

/** وضعیت کش‌ها — برای پایش در پنل مدیر */
export async function cacheStatus() {
  const rows = await db
    .select({
      key: analytics_snapshots.cacheKey, type: analytics_snapshots.reportType,
      rows: analytics_snapshots.rowCount, ms: analytics_snapshots.durationMs,
      at: analytics_snapshots.computedAt,
    })
    .from(analytics_snapshots)
    .orderBy(analytics_snapshots.cacheKey)
    .limit(100);
  const ttl = await getNumber('BI_CACHE_TTL_SECONDS', 300);
  const now = Date.now();
  return rows.map(r => ({
    key: r.key, type: r.type, rows: r.rows, durationMs: r.ms, computedAt: r.at,
    ageSeconds: Math.max(0, Math.round((now - new Date(r.at).getTime()) / 1000)),
    fresh: ttl > 0 && now - new Date(r.at).getTime() <= ttl * 1000,
  }));
}

// ─────────────────── هستهٔ تجمیعی: نمرهٔ وزنی همهٔ اساتید در همهٔ دوره‌ها ───────────────────

type StaffPeriodScore = { staffId: number; periodId: number; periodTitle: string; termTitle: string | null; termId: number | null; startDate: string | Date | null; score: number };

/**
 * نمرهٔ وزنی ارزشیابی همهٔ اساتید در همهٔ دوره‌ها — یک کوئری.
 * این همان چیزی است که جای حلقهٔ «به ازای هر استاد → به ازای هر دوره» نشسته.
 */
async function allStaffPeriodScores(): Promise<StaffPeriodScore[]> {
  const res = await db.execute(sql`
    with ${OWNERSHIP_CTE},
    resp as (
      select r."periodId" as period_id, ow.staff_id, r."questionId" as question_id,
             avg(qo."scoreValue")::numeric as s
        from evaluation_responses r
        join ownership ow on ow.offering_id = r."offeringId"
        join question_options qo on qo.id = r."selectedOptionId"
       where r."selectedOptionId" is not null
       group by r."periodId", ow.staff_id, r."questionId"
    )
    select resp.staff_id as "staffId", resp.period_id as "periodId",
           p.title as "periodTitle", t.title as "termTitle", t.id as "termId", t."startDate" as "startDate",
           sum(resp.s * q.weight) / nullif(sum(q.weight), 0) as score
      from resp
      join evaluation_questions q on q.id = resp.question_id
      join evaluation_forms f on f.id = q."formId"
      join evaluation_periods p on p.id = resp.period_id
      left join academic_terms t on t.id = p."termId"
     where f."targetType" = 'PROFESSOR'
     group by resp.staff_id, resp.period_id, p.title, t.title, t.id, t."startDate"
     order by resp.staff_id, t."startDate" nulls first, resp.period_id
  `);
  return (res.rows ?? []) as unknown as StaffPeriodScore[];
}

/** تعداد پاسخ‌دهندگان (پرسش‌های تستی) به تفکیک استاد — یک کوئری GROUP BY */
async function respondentsByStaff(periodId: number, termId: number) {
  const res = await db.execute(sql`
    with ${OWNERSHIP_CTE}
    select ow.staff_id as "staffId", count(distinct r.id) as n
      from evaluation_responses r
      join ownership ow on ow.offering_id = r."offeringId"
      join course_offerings o on o.id = r."offeringId"
      join evaluation_questions q on q.id = r."questionId"
      join evaluation_forms f on f.id = q."formId"
     where r."periodId" = ${periodId} and o."termId" = ${termId}
       and f."targetType" = 'PROFESSOR' and q."questionType" = 'SINGLE_CHOICE'
     group by ow.staff_id
  `);
  const map = new Map<number, number>();
  for (const r of (res.rows ?? []) as { staffId: number; n: string }[]) map.set(Number(r.staffId), Number(r.n));
  return map;
}

/** تعداد کلاس‌های هر استاد در ترم — یک کوئری GROUP BY */
async function offeringsByStaff(termId: number) {
  const res = await db.execute(sql`
    with ${OWNERSHIP_CTE}
    select ow.staff_id as "staffId", count(distinct ow.offering_id) as n
      from ownership ow
      join course_offerings o on o.id = ow.offering_id
     where o."termId" = ${termId} and o."isActive" = 1
     group by ow.staff_id
  `);
  const map = new Map<number, number>();
  for (const r of (res.rows ?? []) as { staffId: number; n: string }[]) map.set(Number(r.staffId), Number(r.n));
  return map;
}

/** فهرست اساتید دارای کلاس در ترم — یک کوئری */
async function teachingStaff(termId: number) {
  const res = await db.execute(sql`
    with ${OWNERSHIP_CTE}
    select distinct s.id as "staffId",
           (u."firstName" || ' ' || u."lastName") as name,
           s."academicRank" as rank,
           d.name as department
      from ownership ow
      join staff s on s.id = ow.staff_id
      join users u on u.id = s."userId"
      left join departments d on d.id = s."departmentId"
      join course_offerings o on o.id = ow.offering_id and o."termId" = ${termId}
     order by s.id
  `);
  return (res.rows ?? []) as unknown as { staffId: number; name: string; rank: string | null; department: string | null }[];
}

// ─────────────────── الف) داشبورد مدیریتی — گلوگاه کیفی ───────────────────

export async function managementOverview(opts: { force?: boolean } = {}): Promise<ManagementOverview> {
  const term = await currentTerm();
  if (!term) {
    return { term: '—', period: null, threshold: 3.5, flaggedCount: 0, avgScore: null, totalRespondents: 0, list: [], cachedAt: null, cacheAgeSeconds: null };
  }
  const key = `bi:overview:term:${term.id}`;
  if (!opts.force) {
    const hit = await readCache<ManagementOverview>(key);
    if (hit.value) return { ...hit.value, cacheAgeSeconds: hit.ageSeconds };
  }

  const startedAt = Date.now();
  const [threshold, trendCount] = await Promise.all([
    getNumber('EVAL_FLAG_THRESHOLD', 3.5),
    getNumber('EVAL_TREND_TERMS', 3),
  ]);

  // همهٔ داده با چهار کوئری ثابت — مستقل از تعداد اساتید
  const [period, staffList, scores] = await Promise.all([
    activePeriod(term.id),
    teachingStaff(term.id),
    allStaffPeriodScores(),
  ]);
  const [respondents, offerings] = await Promise.all([
    period ? respondentsByStaff(period.id, term.id) : Promise.resolve(new Map<number, number>()),
    offeringsByStaff(term.id),
  ]);

  const byStaff = new Map<number, StaffPeriodScore[]>();
  for (const s of scores) {
    const arr = byStaff.get(s.staffId);
    if (arr) arr.push(s);
    else byStaff.set(s.staffId, [s]);
  }

  const list: ManagementRow[] = [];
  for (const st of staffList) {
    const hist = (byStaff.get(st.staffId) ?? [])
      .slice(-Math.max(1, trendCount))
      .map(s => ({ period: s.periodTitle, term: s.termTitle ?? '—', termId: s.termId, score: round2(s.score) }))
      .filter((t): t is TrendPoint => t.score != null);
    if (!hist.length) continue;
    const score = hist[hist.length - 1].score;
    const prev = hist.length > 1 ? hist[hist.length - 2].score : null;
    const resp = respondents.get(st.staffId) ?? 0;
    list.push({
      staffId: st.staffId, name: st.name, rank: st.rank, department: st.department,
      score, prevScore: prev,
      delta: prev == null ? null : Math.round((score - prev) * 100) / 100,
      respondents: resp,
      offerings: offerings.get(st.staffId) ?? 0,
      flagged: score < threshold,
      trend: hist,
    });
  }
  list.sort((a, b) => a.score - b.score);   // بدترین رکورد اول

  const scored = list.filter(x => x.score != null);
  const report: ManagementOverview = {
    term: term.title,
    period: period?.title ?? null,
    threshold,
    flaggedCount: list.filter(x => x.flagged).length,
    avgScore: scored.length ? round2(scored.reduce((a, x) => a + x.score, 0) / scored.length) : null,
    totalRespondents: list.reduce((a, x) => a + x.respondents, 0),
    list,
    cachedAt: new Date(startedAt).toISOString(),
    cacheAgeSeconds: 0,
  };

  await writeCache(key, 'MANAGEMENT_OVERVIEW', report, list.length, startedAt);
  log.info('bi_overview_computed', { termId: term.id, staff: list.length, durationMs: Date.now() - startedAt });
  return report;
}

// ─────────────────── ب) تحلیل امکانات — کلاس‌های نیازمند تعمیر ───────────────────

export async function facilitiesReport(opts: { force?: boolean } = {}): Promise<FacilitiesReport> {
  const term = await currentTerm();
  if (!term) {
    return { term: '—', period: null, repairThreshold: 3, needsRepairCount: 0, rooms: [], cachedAt: null, cacheAgeSeconds: null };
  }
  const key = `bi:facilities:term:${term.id}`;
  if (!opts.force) {
    const hit = await readCache<FacilitiesReport>(key);
    if (hit.value) return { ...hit.value, cacheAgeSeconds: hit.ageSeconds };
  }

  const startedAt = Date.now();
  const [repairThreshold, period] = await Promise.all([
    getNumber('EVAL_FACILITY_REPAIR_THRESHOLD', 3),
    activePeriod(term.id),
  ]);

  // شاخص‌های همهٔ کلاس‌ها در همهٔ محورها — یک GROUP BY (جای حلقه روی کلاس‌ها)
  const axesRes = await db.execute(sql`
    with room_offering as (
      select distinct sc."roomId" as room_id, sc."offeringId" as offering_id
        from schedules sc
        join course_offerings o on o.id = sc."offeringId"
       where sc."scheduleType" = 'CLASS' and sc."roomId" is not null and o."termId" = ${term.id}
    )
    select cr.id as "roomId", cr.name as room, cr."buildingName" as building, cr."roomType" as type,
           q."axisLabel" as label,
           avg(qo."scoreValue")::numeric as score,
           count(*)::int as n
      from evaluation_responses r
      join room_offering ro on ro.offering_id = r."offeringId"
      join classrooms cr on cr.id = ro.room_id
      join evaluation_questions q on q.id = r."questionId"
      join evaluation_forms f on f.id = q."formId"
      join question_options qo on qo.id = r."selectedOptionId"
     where f."targetType" = 'FACILITY'
       and (${period ? sql`r."periodId" = ${period.id}` : sql`true`})
       and q."axisLabel" is not null
       and r."selectedOptionId" is not null
     group by cr.id, cr.name, cr."buildingName", cr."roomType", q."axisLabel"
  `);

  // دروس هر کلاس — یک GROUP BY با string_agg (جای کوئری جدا برای هر کلاس)
  const coursesRes = await db.execute(sql`
    select sc."roomId" as "roomId", string_agg(distinct c.code, ',') as codes, count(distinct sc."offeringId")::int as offerings
      from schedules sc
      join course_offerings o on o.id = sc."offeringId"
      join courses c on c.id = o."courseId"
     where sc."scheduleType" = 'CLASS' and sc."roomId" is not null and o."termId" = ${term.id}
     group by sc."roomId"
  `);
  const coursesByRoom = new Map<number, string[]>();
  for (const r of (coursesRes.rows ?? []) as { roomId: number; codes: string | null }[]) {
    coursesByRoom.set(Number(r.roomId), (r.codes ?? '').split(',').filter(Boolean));
  }

  const rooms = new Map<number, FacilityRow>();
  for (const r of (axesRes.rows ?? []) as { roomId: number; room: string; building: string | null; type: string | null; label: string | null; score: string; n: string }[]) {
    const id = Number(r.roomId);
    let row = rooms.get(id);
    if (!row) {
      row = {
        roomId: id, room: r.room, building: r.building, type: r.type,
        axes: [], worstAxis: '—', worstScore: 0, needsRepair: false,
        courses: coursesByRoom.get(id) ?? [], responses: 0,
      };
      rooms.set(id, row);
    }
    const score = round2(Number(r.score)) ?? 0;
    row.axes.push({ label: r.label ?? '—', score, responses: Number(r.n) });
    row.responses += Number(r.n);
  }

  const out = [...rooms.values()].map(row => {
    const worst = row.axes.reduce((m, a) => (a.score < m.score ? a : m), row.axes[0]);
    return {
      ...row,
      worstAxis: worst.label,
      worstScore: worst.score,
      needsRepair: row.axes.some(a => a.score < repairThreshold),
    };
  }).sort((a, b) => a.worstScore - b.worstScore);

  const report: FacilitiesReport = {
    term: term.title,
    period: period?.title ?? null,
    repairThreshold,
    needsRepairCount: out.filter(r => r.needsRepair).length,
    rooms: out,
    cachedAt: new Date(startedAt).toISOString(),
    cacheAgeSeconds: 0,
  };

  await writeCache(key, 'FACILITIES', report, out.length, startedAt);
  log.info('bi_facilities_computed', { termId: term.id, rooms: out.length, durationMs: Date.now() - startedAt });
  return report;
}

// ─────────────────── ج) ابر کلمات — تحلیل متن در پایگاه داده ───────────────────

async function stopwordsList(): Promise<string[]> {
  const raw = await getSetting('BI_STOPWORDS');
  return raw.split(',').map(w => w.trim()).filter(Boolean);
}

// نکته: قالب sql درایزر، آرایهٔ JS را به چند placeholder جدا باز می‌کند
// (یعنی `(\u00241,\u00242,\u00243)::text[]` = خطای «cannot cast type record to text[]»).
// پس فهرست واژه‌های توقف به‌صورت یک رشتهٔ واحد با جداکنندهٔ U+0001 به عنوان
// پارامتر بایند شده فرستاده می‌شود و داخل SQL با string_to_array باز می‌شود:
// هم یک پارامتر است (بدون تزریق) و هم نوعش text[] می‌شود.

/**
 * ابر کلمات نظرات تشریحی یک استاد.
 *
 * همهٔ کار در PostgreSQL انجام می‌شود: نرمال‌سازی ی/ک با `translate`،
 * جداسازی واژه‌ها با `regexp_split_to_table`، حذف واژه‌های توقف با
 * `<> all($stopwords)` و شمارش با `GROUP BY`. هیچ متنی به Node نمی‌آید، پس
 * هزاران نظر هم event loop را بلاک نمی‌کند. نتیجه کش می‌شود.
 */
export async function wordCloud(staffId: number, opts: { force?: boolean } = {}): Promise<{ words: WordItem[]; comments: number; cachedAt: string | null }> {
  const key = `bi:wordcloud:staff:${staffId}`;
  if (!opts.force) {
    const hit = await readCache<{ words: WordItem[]; comments: number }>(key);
    if (hit.value) return { ...hit.value, cachedAt: new Date(Date.now() - (hit.ageSeconds ?? 0) * 1000).toISOString() };
  }

  const startedAt = Date.now();
  const [limit, minLen] = await Promise.all([
    getNumber('BI_WORDCLOUD_LIMIT', 18),
    getNumber('BI_WORDCLOUD_MIN_LEN', 3),
  ]);
  const stops = await stopwordsList();

  const res = await db.execute(sql`
    with ${OWNERSHIP_CTE},
    comments as (
      select r.id as response_id, r."textAnswer" as body
        from evaluation_responses r
        join ownership ow on ow.offering_id = r."offeringId"
        join evaluation_questions q on q.id = r."questionId"
        join evaluation_forms f on f.id = q."formId"
       where ow.staff_id = ${staffId}
         and f."targetType" = 'PROFESSOR'
         and q."questionType" = 'TEXT'
         and coalesce(r."textAnswer", '') <> ''
    ),
    tokens as (
      select response_id,
             btrim(translate(w, 'يك', 'یک'), E'\u200C') as word
        from comments,
             lateral regexp_split_to_table(body, E'[^\\u0600-\\u06FF\\u200C]+') as w
    )
    select word, count(*)::int as c, count(distinct response_id)::int as comments
      from tokens
     where length(word) >= ${minLen}
       and word <> all(string_to_array(${stops.join('\u0001')}, E'\u0001'))
     group by word
     order by count(*) desc, word
     limit ${limit}
  `);

  const rows = (res.rows ?? []) as unknown as { word: string; c: number; comments: number }[];
  const words: WordItem[] = rows.map(r => ({ w: r.word, c: Number(r.c) }));

  const cntRes = await db.execute(sql`
    with ${OWNERSHIP_CTE}
    select count(*)::int as n
      from evaluation_responses r
      join ownership ow on ow.offering_id = r."offeringId"
      join evaluation_questions q on q.id = r."questionId"
      join evaluation_forms f on f.id = q."formId"
     where ow.staff_id = ${staffId} and f."targetType" = 'PROFESSOR'
       and q."questionType" = 'TEXT' and coalesce(r."textAnswer", '') <> ''
  `);
  const comments = Number((((cntRes.rows ?? []) as { n: number | string }[])[0]?.n) ?? 0);

  const payload = { words, comments };
  await writeCache(key, 'WORDCLOUD', payload, words.length, startedAt);
  log.info('bi_wordcloud_computed', { staffId, words: words.length, durationMs: Date.now() - startedAt });
  return { ...payload, cachedAt: new Date(startedAt).toISOString() };
}

// ─────────────────── د) پنل اختصاصی استاد (رادار + روند + ابر کلمات) ───────────────────

export type ProfessorPanel = {
  staffId: number; name: string; rank: string | null; department: string | null;
  term: string; period: string | null;
  axes: RadarAxis[]; trend: TrendPoint[]; words: WordItem[];
  score: number | null; deptAvg: number | null;
  respondents: number; threshold: number; flagged: boolean;
};

export async function professorPanel(staffId: number): Promise<ProfessorPanel> {
  const term = await currentTerm();
  if (!term) throw new Error('ترم جاری مشخص نیست.');

  const [me] = await db
    .select({
      id: staff.id, name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
      rank: staff.academicRank, departmentId: staff.departmentId, department: departments.name,
    })
    .from(staff)
    .innerJoin(users, eq(users.id, staff.userId))
    .leftJoin(departments, eq(departments.id, staff.departmentId))
    .where(eq(staff.id, staffId))
    .limit(1);
  if (!me) throw new Error('استاد یافت نشد.');

  const [period, threshold, scores, words] = await Promise.all([
    activePeriod(term.id),
    getNumber('EVAL_FLAG_THRESHOLD', 3.5),
    allStaffPeriodScores(),
    wordCloud(staffId),
  ]);
  const respondents = period ? await respondentsByStaff(period.id, term.id) : new Map<number, number>();

  // محورهای رادار: میانگین وزنی «من» و «گروه آموزشی» در یک کوئری GROUP BY
  const axesRes = await db.execute(sql`
    with ${OWNERSHIP_CTE}
    select q."axisLabel" as label,
           count(*) filter (where ow.staff_id = ${staffId})::int as mine_n,
           avg(qo."scoreValue") filter (where ow.staff_id = ${staffId})::numeric as mine,
           avg(qo."scoreValue") filter (where o."professorId" in (select s2.id from staff s2 where s2."departmentId" = ${me.departmentId}))::numeric as dept
      from evaluation_responses r
      join course_offerings o on o.id = r."offeringId"
      join ownership ow on ow.offering_id = r."offeringId"
      join evaluation_questions q on q.id = r."questionId"
      join evaluation_forms f on f.id = q."formId"
      join question_options qo on qo.id = r."selectedOptionId"
     where o."termId" = ${term.id}
       and (${period ? sql`r."periodId" = ${period.id}` : sql`true`})
       and f."targetType" = 'PROFESSOR'
       and q."questionType" = 'SINGLE_CHOICE'
       and q."axisLabel" is not null
       and r."selectedOptionId" is not null
     group by q."axisLabel"
     order by q."axisLabel"
  `);

  const axes: RadarAxis[] = ((axesRes.rows ?? []) as unknown as { label: string | null; mine_n: string; mine: string | null; dept: string | null }[])
    .filter(r => r.label)
    .map(r => ({
      label: r.label as string,
      mine: round2(r.mine == null ? null : Number(r.mine)),
      dept: round2(r.dept == null ? null : Number(r.dept)),
      responses: Number(r.mine_n ?? 0),
    }));

  const trendCount = await getNumber('EVAL_TREND_TERMS', 3);
  const trend: TrendPoint[] = scores.filter(s => s.staffId === staffId)
    .slice(-Math.max(1, trendCount))
    .map(s => ({ period: s.periodTitle, term: s.termTitle ?? '—', termId: s.termId, score: round2(s.score) }))
    .filter((t): t is TrendPoint => t.score != null);

  const score = trend.length ? trend[trend.length - 1].score : null;
  const deptValues = axes.map(a => a.dept).filter((v): v is number => v != null);

  return {
    staffId,
    name: me.name,
    rank: me.rank,
    department: me.department,
    term: term.title,
    period: period?.title ?? null,
    axes,
    trend,
    words: words.words,
    score,
    deptAvg: deptValues.length ? round2(deptValues.reduce((a, b) => a + b, 0) / deptValues.length) : null,
    respondents: respondents.get(staffId) ?? 0,
    threshold,
    flagged: score != null ? score < threshold : false,
  };
}

/** تازه‌سازی همهٔ کش‌های BI — توسط job زمان‌بندی‌شده صدا زده می‌شود */
export async function refreshAllBiCaches(termId?: number) {
  const term = termId ? (await db.select().from(academic_terms).where(eq(academic_terms.id, termId)).limit(1))[0] : await currentTerm();
  if (!term) return { ok: false as const, error: 'ترم جاری مشخص نیست.' };

  const startedAt = Date.now();
  const overview = await managementOverview({ force: true });
  const facilities = await facilitiesReport({ force: true });
  const staffList = await teachingStaff(term.id);
  let clouds = 0;
  for (const st of staffList) {
    await wordCloud(st.staffId, { force: true });
    clouds++;
  }
  const durationMs = Date.now() - startedAt;
  log.info('bi_refresh_done', { termId: term.id, staff: overview.list.length, rooms: facilities.rooms.length, clouds, durationMs });
  return { ok: true as const, termId: term.id, staff: overview.list.length, rooms: facilities.rooms.length, wordClouds: clouds, durationMs };
}

/** خلاصهٔ سراسری برای کارت‌های داشبورد مدیر */
export async function biSummary() {
  const [overview, facilities] = await Promise.all([managementOverview(), facilitiesReport()]);
  return {
    term: overview.term,
    period: overview.period,
    flaggedCount: overview.flaggedCount,
    avgScore: overview.avgScore,
    totalRespondents: overview.totalRespondents,
    staffCount: overview.list.length,
    roomsCount: facilities.rooms.length,
    needsRepairCount: facilities.needsRepairCount,
    worstStaff: overview.list[0] ?? null,
    worstRoom: facilities.rooms[0] ?? null,
    cachedAt: overview.cachedAt,
  };
}

/** ایندکس‌های لازم برای کوئری‌های تجمیعی — در pg-hardening.sql هم آمده */
export const BI_INDEX_HINTS = [
  'idx_eval_resp_period_offering on evaluation_responses ("periodId", "offeringId")',
  'idx_eval_resp_question on evaluation_responses ("questionId")',
  'idx_schedules_room_type on schedules ("roomId", "scheduleType")',
];
