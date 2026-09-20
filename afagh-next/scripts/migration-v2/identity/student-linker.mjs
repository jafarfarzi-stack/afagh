/**
 * ══════════════════════════════════════════════════════════════════════
 *  Migration V2: Student Linker
 *  — اتصال رکوردهای دانشجویی موجود به لایه اشخاص مستقل
 *  — به‌روزرسانی students.personId و users.personId
 * ══════════════════════════════════════════════════════════════════════
 */
import { linkSourceIdentity } from './person-linker.mjs';

/**
 * پیوند یک دانشجو به لایه شخص
 * @param {import('pg').PoolClient | import('pg').Pool} db 
 * @param {number} studentId 
 * @returns {Promise<Object>}
 */
export async function linkStudentToPerson(db, studentId) {
  const studentRes = await db.query(
    `SELECT s.id, s."studentCode", s."universityId", s."userId", s."personId",
            u."nationalCode", u."firstName", u."lastName", u."fatherName", u."birthDate"
     FROM students s
     JOIN users u ON s."userId" = u.id
     WHERE s.id = $1`,
    [studentId]
  );

  const row = studentRes.rows[0];
  if (!row) {
    throw new Error(`Student with id ${studentId} not found`);
  }

  const identityRes = await linkSourceIdentity(db, {
    universityId: row.universityId,
    sourceStudentCode: row.studentCode,
    sourceNationalCode: row.nationalCode,
    sourceFirstName: row.firstName,
    sourceLastName: row.lastName,
    sourceFatherName: row.fatherName,
    sourceBirthDate: row.birthDate,
    studentId: row.id,
  });

  const { personId } = identityRes;

  if (personId) {
    await db.query(
      `UPDATE students SET "personId" = $1 WHERE id = $2`,
      [personId, row.id]
    );

    await db.query(
      `UPDATE users SET "personId" = $1 WHERE id = $2`,
      [personId, row.userId]
    );
  }

  return {
    studentId: row.id,
    userId: row.userId,
    personId,
    identityStatus: identityRes.identityStatus,
    matchMethod: identityRes.matchMethod,
    confidence: identityRes.confidence,
    reviewId: identityRes.reviewId,
  };
}

/**
 * پردازش دسته‌ای پیوند دانشجویان
 * @param {import('pg').PoolClient | import('pg').Pool} db 
 * @param {Object} options 
 * @returns {Promise<Object>}
 */
export async function linkAllStudents(db, options = {}) {
  const {
    universityId = null,
    batchSize = 200,
    limit = 0,
    onProgress = null,
  } = options;

  let whereClauses = ['s."personId" IS NULL'];
  let params = [];
  if (universityId) {
    params.push(universityId);
    whereClauses.push(`s."universityId" = $${params.length}`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const limitSql = limit > 0 ? `LIMIT ${limit}` : '';

  const idQuery = `
    SELECT s.id 
    FROM students s 
    ${whereSql} 
    ORDER BY s.id ASC 
    ${limitSql}
  `;
  const targetIdsRes = await db.query(idQuery, params);
  const targetIds = targetIdsRes.rows.map(r => r.id);

  const stats = {
    total: targetIds.length,
    linked: 0,
    reviewRequired: 0,
    newPersonPending: 0,
    errors: 0,
  };

  for (let i = 0; i < targetIds.length; i += batchSize) {
    const chunk = targetIds.slice(i, i + batchSize);
    for (const studentId of chunk) {
      try {
        const result = await linkStudentToPerson(db, studentId);
        if (result.identityStatus === 'LINKED') stats.linked++;
        else if (result.identityStatus === 'REVIEW_REQUIRED') stats.reviewRequired++;
        else stats.newPersonPending++;
      } catch (err) {
        stats.errors++;
        console.error(`Error linking student ${studentId}:`, err.message);
      }
    }
    if (typeof onProgress === 'function') {
      onProgress(Math.min(i + batchSize, targetIds.length), targetIds.length, stats);
    }
  }

  return stats;
}
