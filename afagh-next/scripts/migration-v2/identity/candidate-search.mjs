/**
 * ══════════════════════════════════════════════════════════════════════
 *  Migration V2: Candidate Search
 *  — جستجوی نامزدهای هویتی مشابه در سایر مؤسسات بر اساس نام/نام خانوادگی و پدر
 *  — اصل مهم: Candidate ≠ Match (صرفاً برای بررسی کارشناسی، نه ادغام خودکار)
 * ══════════════════════════════════════════════════════════════════════
 */
import { query } from '../core/db.mjs';

/**
 * جستجوی رکوردهای نامزد برای یک منبع هویتی فاقد کد ملی قطعی
 * @param {Object} identity 
 * @param {Object} options 
 * @returns {Promise<Array>}
 */
export async function findIdentityCandidates(identity, options = {}) {
  const { limit = 20, dbUrl } = options;
  const first = identity.normalizedFirstName;
  const last = identity.normalizedLastName;
  const father = identity.normalizedFatherName;

  if (!first || !last) {
    return [];
  }

  const sql = `
    SELECT
      psi.id AS "sourceIdentityId",
      psi."personId",
      psi."universityId",
      psi."sourceStudentCode",
      psi."sourceFirstName",
      psi."sourceLastName",
      psi."sourceFatherName",
      psi."sourceBirthDate",
      psi."sourceNationalCode",
      p."canonicalNationalCode",
      p."canonicalFirstName",
      p."canonicalLastName",
      p."canonicalFatherName",
      p."canonicalBirthDate"
    FROM person_source_identities psi
    JOIN persons p ON p.id = psi."personId"
    WHERE
      psi."universityId" <> $1
      AND psi."normalizedFirstName" = $2
      AND psi."normalizedLastName" = $3
      AND (
        $4::varchar IS NULL
        OR psi."normalizedFatherName" = $4
      )
    ORDER BY
      CASE
        WHEN $4::varchar IS NOT NULL AND psi."normalizedFatherName" = $4 THEN 0
        ELSE 1
      END,
      psi.id
    LIMIT $5
  `;

  const res = await query(sql, [
    identity.universityId,
    first,
    last,
    father ?? null,
    limit,
  ], dbUrl);

  return res.rows;
}
