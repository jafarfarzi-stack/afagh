#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════
 *  لایهٔ مشترک بارگذاری «دستهای» مهاجرت آموزشی UEMS → آفاق
 *
 *  چرا این فایل جدا است: migrate-legacy-education.mjs در بالای ماژول رمز
 *  دیتابیس را میخواند و Pool میسازد؛ تستها نمیتوانستند آن را import کنند.
 *  تمام SQLهای دستهای و توابع خالص اینجا هستند تا هم اسکریپت و هم
 *  tests/education-batch-contract.test.ts دقیقاً یک متن SQL را اجرا کنند.
 *
 *  اصل: بهجای N کوئری ردیفبهردیف (≈۲٫۵ میلیون round-trip، ۶٬۹۰۱ ثانیه)،
 *  هر قطعهٔ CHUNK ردیف یک statement با unnest(آرایهها) میفرستد.
 *  ══════════════════════════════════════════════════════════════════════
 */

import { existsSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

export const CHUNK_DEFAULT = 2000;

/**
 * خواندن جریانی TSV (فایل ۲۱۷MB / ۲ میلیون ردیف) ⇒ حافظه ثابت میماند.
 * BOM، CRLF و خطهای خالی را تحمل میکند و سرستون را یکبار برمیگرداند.
 */
export async function* readTsvStream(dir, name) {
  let p = join(dir, name);
  if (!existsSync(p)) p = join(dir, name + '.tsv');
  if (!existsSync(p)) return;
  const rl = createInterface({
    input: createReadStream(p, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  let header = null;
  let first = true;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const parts = (first ? line.replace(/^\uFEFF/, '') : line).split('\t');
    first = false;
    if (header === null) { header = parts; continue; }
    yield { header, row: parts };
  }
}

/** ساخت INSERT دستهای. ستونها همیشه quote میشوند (camelCase در PG حساس است). */
const mkInsert = (table, columns, casts, suffix = '') => ({
  table,
  columns,
  casts,
  sql: `INSERT INTO ${table} (${columns.map(c => `"${c}"`).join(',')})
SELECT * FROM unnest(${casts.map((c, i) => `$${i + 1}::${c}`).join(', ')})${suffix ? '\n' + suffix : ''}`,
});

export const BULK = {
  courses: mkInsert('courses',
    ['universityId', 'code', 'title', 'units', 'practicalUnits', 'courseType', 'departmentId'],
    ['int[]', 'varchar[]', 'varchar[]', 'numeric[]', 'numeric[]', 'varchar[]', 'int[]'],
    'ON CONFLICT DO NOTHING'),

  offerings: mkInsert('course_offerings',
    ['universityId', 'termId', 'courseId', 'groupNumber', 'isActive', 'capacity'],
    ['int[]', 'int[]', 'int[]', 'int[]', 'int[]', 'int[]'],
    'ON CONFLICT DO NOTHING'),

  /** schedules هیچ ایندکس یکتایی ندارد ⇒ ON CONFLICT DO NOTHING بیاثر است.
   *  ایدمپاتنسی این جدول در سمت JS با existingSchedules (Set) تأمین میشود. */
  schedules: mkInsert('schedules',
    ['universityId', 'offeringId', 'scheduleType', 'dayOfWeek', 'startTime', 'endTime'],
    ['int[]', 'int[]', 'varchar[]', 'int[]', 'time[]', 'time[]']),

  enrollments: mkInsert('enrollments',
    ['universityId', 'studentId', 'offeringId', 'status', 'gradeValue', 'gradeStatus', 'enrolledByUserId'],
    ['int[]', 'int[]', 'int[]', 'varchar[]', 'numeric[]', 'varchar[]', 'int[]'],
    'ON CONFLICT DO NOTHING'),

  legacyGrades: mkInsert('legacy_grades',
    ['sourceCode', 'studentCode', 'termCode', 'courseCode', 'gradeValue', 'gradeRaw', 'universityId', 'compareStatus'],
    ['varchar[]', 'varchar[]', 'varchar[]', 'varchar[]', 'numeric[]', 'varchar[]', 'int[]', 'varchar[]'],
    'ON CONFLICT DO NOTHING'),
};

/** pg ستون time را «HH:MM:SS» برمیگرداند، منبع LT55 «HH:MM» میدهد. */
export const normClock = (v) => (v == null || v === '' ? '' : String(v).slice(0, 5));

/**
 * کلید ایدمپاتنسی schedules. فقط ردیفهایی که این مهاجرت میسازد (CLASS،
 * universityId صریح) با این کلید سنجیده میشوند؛ dayOfWeek میتواند NULL باشد.
 */
export const scheduleKey = (uni, offeringId, dayOfWeek, startTime, endTime) =>
  `${uni ?? ''}|${offeringId}|CLASS|${dayOfWeek ?? ''}|${normClock(startTime)}|${normClock(endTime)}`;

export const OFFERING_KEY = (termId, courseId, groupNumber) => `${termId}|${courseId}|${groupNumber}`;

/** کلیدهای یکتای enrollments / legacy_grades (همان کلید ایندکسهای DB). */
export const enrollmentKey = (studentId, offeringId) => `${studentId}|${offeringId}`;
export const historyKey = (sourceCode, studentCode, termCode, courseCode) =>
  `${sourceCode}|${studentCode}|${termCode}|${courseCode}`;

/**
 * بار کردن یکبارهٔ کلیدهای موجود. array_agg یک آرایهٔ متنی برمیگرداند نه
 * ۱٫۱ میلیون شیء ردیف ⇒ حافظه و ترافیک بهشدت کمتر است.
 * ردیفهایی که جزئی از کلیدشان NULL است کنار گذاشته میشوند: ایندکس یکتای PG
 * NULLها را متمایز میداند، پس تصمیم دربارهٔ آنها باید به ON CONFLICT سپرده شود.
 */
export const EXISTING_KEYS_SQL = {
  enrollments: `SELECT coalesce(array_agg("studentId"::text || '|' || "offeringId"::text), '{}'::text[]) AS keys
FROM enrollments`,
  legacyGrades: `SELECT coalesce(array_agg("sourceCode" || '|' || "studentCode" || '|' || "termCode" || '|' || "courseCode"), '{}'::text[]) AS keys
FROM legacy_grades
WHERE "sourceCode" IS NOT NULL AND "studentCode" IS NOT NULL
  AND "termCode" IS NOT NULL AND "courseCode" IS NOT NULL`,
};

/**
 * ردیفهای تکراری ساختهشده توسط اجراهای قبلی (فقط CLASS، فقط دانشگاه هدف،
 * فقط ردیفهای بدون اتاق/تاریخ امتحان = دقیقاً همان چیزی که مهاجرت مینویسد).
 * ایندکس یکتایی وجود ندارد، پس حذف با row_number و نگهداشتن کمترین id.
 */
const DUP_CTE = `WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY "universityId", "offeringId", "scheduleType", "dayOfWeek", "startTime", "endTime"
    ORDER BY id
  ) AS rn
  FROM schedules
  WHERE "scheduleType" = 'CLASS' AND "universityId" = $1
    AND "roomId" IS NULL AND "examDate" IS NULL
)`;

/** بکاپ کامل ردیفهای محکوم به حذف (قبل از DELETE، داخل همان تراکنش). */
export const DEDUPE_SELECT_SQL = `${DUP_CTE}
SELECT s.* FROM schedules s JOIN ranked d ON d.id = s.id WHERE d.rn > 1 ORDER BY s.id`;

export const DEDUPE_DELETE_SQL = `${DUP_CTE}
DELETE FROM schedules s USING ranked d WHERE s.id = d.id AND d.rn > 1`;

/**
 * نویسندهٔ دستهای: تاپلها را انباشته و در قطعههای chunk با یک statement مینویسد.
 * pool فقط باید متد query(text, params) داشته باشد ⇒ pg و PGlite هردو.
 */
export class BulkWriter {
  constructor(pool, spec, { chunk = CHUNK_DEFAULT, label = '', enabled = true, onFlush = null } = {}) {
    if (!spec || !Array.isArray(spec.casts)) throw new Error('BulkWriter: spec نامعتبر است');
    this.pool = pool;
    this.spec = spec;
    this.chunk = Math.max(1, Number(chunk) || CHUNK_DEFAULT);
    this.label = label || spec.table;
    this.enabled = enabled;
    this.onFlush = onFlush;
    this.buf = [];
    this.rows = 0;
    this.statements = 0;
    this.affected = 0;
  }

  async push(tuple) {
    if (!this.enabled) return;
    if (!Array.isArray(tuple) || tuple.length !== this.spec.casts.length) {
      throw new Error(`BulkWriter(${this.label}): تاپل ${tuple?.length} ستونی بهجای ${this.spec.casts.length}`);
    }
    this.buf.push(tuple);
    this.rows++;
    if (this.buf.length >= this.chunk) await this.flush();
  }

  async flush() {
    if (!this.buf.length) return 0;
    const part = this.buf;
    this.buf = [];
    const params = this.spec.casts.map((_, c) => part.map(row => row[c]));
    const res = await this.pool.query(this.spec.sql, params);
    // node-postgres → rowCount؛ PGlite → affectedRows (هر دو در تست/لایو پوشش داده میشوند)
    const n = Number(res?.rowCount ?? res?.affectedRows ?? 0);
    this.affected += n;
    this.statements++;
    if (this.onFlush) this.onFlush(this);
    return n;
  }

  summary() {
    return {
      table: this.spec.table, label: this.label, rows: this.rows,
      statements: this.statements, affected: this.affected, enabled: this.enabled,
    };
  }
}
