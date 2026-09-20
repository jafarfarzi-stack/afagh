/**
 * ══════════════════════════════════════════════════════════════════════
 *  Migration V2: Course Offering Importer
 *  — واردسازی و همگام‌سازی ساخت‌یافته ارائه‌ها، اساتید و برنامه‌های کلاسی
 *  — یکپارچه‌سازی پایگاه داده: course_offerings, offering_professors, schedules, classrooms
 *  — تطبیق Idempotent و جلوگیری از داده‌های تکراری
 *  — حل مسأله ارائه‌های صوری/انتقالی (TRANSFER) و جایگزینی با ارائه‌های معتبر
 * ══════════════════════════════════════════════════════════════════════
 */

import { query, withTransaction } from '../core/db.mjs';
import * as logger from '../core/logger.mjs';
import { parseOfferingRow } from './offering-parser.mjs';
import { parseSamaScheduleSlot } from './schedule-parser.mjs';

/**
 * بارگذاری کش‌های مرجع دانشگاه (ترم‌ها، دروس، اساتید، کلاس‌ها)
 * @param {number} universityId 
 * @param {any} [client]
 */
export async function loadUniversityContext(universityId, client = null) {
  const runner = client ? (q, p) => client.query(q, p) : (q, p) => query(q, p);

  // ۱. ترم‌ها بر اساس termCode
  const termsRes = await runner(
    `SELECT id, "termCode" FROM academic_terms WHERE "universityId" = $1`,
    [universityId]
  );
  const termsByCode = new Map();
  for (const r of termsRes.rows) {
    termsByCode.set(String(r.termCode).trim(), r.id);
  }

  // ۲. دروس بر اساس code
  const coursesRes = await runner(
    `SELECT id, code FROM courses WHERE "universityId" = $1`,
    [universityId]
  );
  const coursesByCode = new Map();
  for (const r of coursesRes.rows) {
    coursesByCode.set(String(r.code).trim(), r.id);
  }

  // ۳. اساتید بر اساس staffCode
  const staffRes = await runner(
    `SELECT id, "staffCode" FROM staff WHERE "universityId" = $1`,
    [universityId]
  );
  const staffByCode = new Map();
  for (const r of staffRes.rows) {
    staffByCode.set(String(r.staffCode).trim(), r.id);
  }

  // ۴. کلاس‌ها بر اساس name
  const roomsRes = await runner(
    `SELECT id, name FROM classrooms WHERE "universityId" = $1`,
    [universityId]
  );
  const roomsByName = new Map();
  for (const r of roomsRes.rows) {
    roomsByName.set(String(r.name).trim(), r.id);
  }

  return {
    termsByCode,
    coursesByCode,
    staffByCode,
    roomsByName,
  };
}

/**
 * اطمینان از وجود کلاس درس و بازگرداندن شناسه آن
 * @param {string} roomName 
 * @param {number} universityId 
 * @param {Map<string, number>} roomsByName 
 * @param {any} client 
 * @returns {Promise<number|null>}
 */
export async function getOrCreateClassroom(roomName, universityId, roomsByName, client) {
  if (!roomName) return null;
  const name = String(roomName).trim();
  if (!name || name === '0' || name === '-1') return null;

  if (roomsByName.has(name)) {
    return roomsByName.get(name);
  }

  // درج کلاس درس جدید با ظرفیت پیش‌فرض ۵۰
  const res = await client.query(
    `INSERT INTO classrooms (name, capacity, "universityId")
     VALUES ($1, 50, $2)
     RETURNING id`,
    [name, universityId]
  );
  const newId = res.rows[0].id;
  roomsByName.set(name, newId);
  return newId;
}

/**
 * واردسازی یا همگام‌سازی یک ارائه درس
 * @param {any} parsedOffering 
 * @param {number} universityId 
 * @param {any} context 
 * @param {any} client 
 * @returns {Promise<{ action: 'CREATED'|'UPDATED'|'SKIPPED', offeringId?: number, reason?: string }>}
 */
export async function importSingleOffering(parsedOffering, universityId, context, client) {
  const { termsByCode, coursesByCode, staffByCode, roomsByName } = context;

  const termId = termsByCode.get(parsedOffering.canonicalTermCode) || termsByCode.get(parsedOffering.termCode);
  if (!termId) {
    return { action: 'SKIPPED', reason: `ترم یافت نشد: ${parsedOffering.canonicalTermCode || parsedOffering.termCode}` };
  }

  const courseId = coursesByCode.get(parsedOffering.courseCode);
  if (!courseId) {
    return { action: 'SKIPPED', reason: `درس یافت نشد: ${parsedOffering.courseCode}` };
  }

  let professorId = null;
  if (parsedOffering.professorCode) {
    professorId = staffByCode.get(parsedOffering.professorCode) || null;
  }

  // بررسی وجود قبلی ارائه
  const existingRes = await client.query(
    `SELECT id, "professorId", capacity, "offeringType"
     FROM course_offerings
     WHERE "universityId" = $1 AND "termId" = $2 AND "courseId" = $3 AND "groupNumber" = $4
     LIMIT 1`,
    [universityId, termId, courseId, parsedOffering.groupNumber]
  );

  let offeringId = null;
  let action = 'CREATED';

  if (existingRes.rows.length > 0) {
    const existing = existingRes.rows[0];
    offeringId = existing.id;
    action = 'UPDATED';

    // به‌روزرسانی فیلدهای کلیدی در صورت بهبود داده‌ها
    const updates = [];
    const vals = [];
    let pIdx = 1;

    if (!existing.professorId && professorId) {
      updates.push(`"professorId" = $${pIdx++}`);
      vals.push(professorId);
    }
    if (existing.offeringType === 'TRANSFER' && parsedOffering.offeringType !== 'TRANSFER') {
      updates.push(`"offeringType" = $${pIdx++}`);
      vals.push(parsedOffering.offeringType);
    }
    if (parsedOffering.capacity && parsedOffering.capacity !== existing.capacity && existing.capacity === 999) {
      updates.push(`capacity = $${pIdx++}`);
      vals.push(parsedOffering.capacity);
    }

    if (updates.length > 0) {
      vals.push(offeringId);
      await client.query(
        `UPDATE course_offerings SET ${updates.join(', ')} WHERE id = $${pIdx}`,
        vals
      );
    }
  } else {
    // درج ارائه درس جدید
    const insRes = await client.query(
      `INSERT INTO course_offerings
       ("termId", "courseId", "professorId", "groupNumber", capacity, "genderRestriction", "offeringType", "isActive", "universityId")
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8)
       RETURNING id`,
      [
        termId,
        courseId,
        professorId,
        parsedOffering.groupNumber,
        parsedOffering.capacity,
        parsedOffering.genderRestriction,
        parsedOffering.offeringType,
        universityId,
      ]
    );
    offeringId = insRes.rows[0].id;
  }

  // ثبت استاد در جدول offering_professors
  if (professorId) {
    await client.query(
      `INSERT INTO offering_professors ("offeringId", "staffId", role, "sharePercentage", "universityId")
       VALUES ($1, $2, 'MAIN_LECTURER', '100.00', $3)
       ON CONFLICT DO NOTHING`,
      [offeringId, professorId, universityId]
    );
  }

  // ثبت جلسات کلاسی در schedules
  if (parsedOffering.schedules && parsedOffering.schedules.length > 0) {
    // پاک‌سازی جلسات کلاسی پیشین این ارائه
    await client.query(
      `DELETE FROM schedules WHERE "offeringId" = $1 AND "scheduleType" IN ('CLASS', 'EVEN', 'ODD')`,
      [offeringId]
    );

    for (const slot of parsedOffering.schedules) {
      let roomId = null;
      const roomHint = slot.roomHint || slot.roomCode || parsedOffering.classroomName;
      if (roomHint) {
        roomId = await getOrCreateClassroom(roomHint, universityId, roomsByName, client);
      }

      await client.query(
        `INSERT INTO schedules ("offeringId", "scheduleType", "dayOfWeek", "startTime", "endTime", "roomId", "universityId")
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          offeringId,
          slot.scheduleType || 'CLASS',
          slot.dayOfWeek,
          slot.startTime,
          slot.endTime,
          roomId,
          universityId,
        ]
      );
    }
  }

  return { action, offeringId };
}

/**
 * واردسازی دسته‌ای ارائه‌ها
 * @param {Array<any>} rawRows 
 * @param {number} universityId 
 * @param {{ dryRun?: boolean }} [options] 
 */
export async function importOfferingsBatch(rawRows, universityId, options = {}) {
  const { dryRun = false } = options;

  logger.info(`شروع پردازش دسته‌ای ${rawRows.length} ردیف ارائه درس برای دانشگاه ${universityId}`);

  const stats = {
    total: rawRows.length,
    validParsed: 0,
    parseErrors: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    warnings: [],
    reasons: {},
  };

  const parsedList = [];
  for (let i = 0; i < rawRows.length; i++) {
    const res = parseOfferingRow(rawRows[i]);
    if (res.ok) {
      stats.validParsed++;
      parsedList.push(res.row);
      if (res.warnings.length > 0) {
        stats.warnings.push(...res.warnings);
      }
    } else {
      stats.parseErrors++;
      stats.warnings.push(`ردیف ${i + 1}: ${res.error}`);
    }
  }

  if (dryRun) {
    logger.info('اجرا در حالت آزمایشی (dry-run) — دیتابیس تغییری نکرد.', stats);
    return stats;
  }

  await withTransaction(async (client) => {
    const context = await loadUniversityContext(universityId, client);

    for (const item of parsedList) {
      const outcome = await importSingleOffering(item, universityId, context, client);
      if (outcome.action === 'CREATED') stats.created++;
      else if (outcome.action === 'UPDATED') stats.updated++;
      else {
        stats.skipped++;
        const r = outcome.reason || 'نامشخص';
        stats.reasons[r] = (stats.reasons[r] || 0) + 1;
      }
    }
  });

  logger.info('اتمام موفق واردسازی ارائه‌ها.', stats);
  return stats;
}
