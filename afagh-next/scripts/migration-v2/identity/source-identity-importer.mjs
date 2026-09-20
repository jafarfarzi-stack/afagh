/**
 * ══════════════════════════════════════════════════════════════════════
 *  Migration V2: Source Identity Importer
 *  — واردسازی دسته‌ای اطلاعات هویتی خام مبدأ به person_source_identities
 *  — بدون حدس شخص جدید (فقط ثبت داده‌های خام نرمال‌شده منبع)
 * ══════════════════════════════════════════════════════════════════════
 */
import { buildSourceIdentity } from './source-identity.mjs';
import { withTransaction, getPool } from '../core/db.mjs';
import { migrationEvent } from '../core/logger.mjs';

function assertUniversityId(universityId) {
  if (!Number.isInteger(Number(universityId))) {
    throw new Error(`Invalid universityId: ${universityId}`);
  }
}

export async function upsertSourceIdentity(input, customDbUrl) {
  assertUniversityId(input.universityId);
  const identity = buildSourceIdentity(input);

  return withTransaction(async (client) => {
    const result = await client.query(
      `
      INSERT INTO person_source_identities (
        "universityId",
        "studentId",
        "sourceStudentCode",
        "sourceNationalCode",
        "sourceFirstName",
        "sourceLastName",
        "sourceFatherName",
        "sourceBirthDate",
        "normalizedFirstName",
        "normalizedLastName",
        "normalizedFatherName",
        "identityStatus"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT ("universityId", "sourceStudentCode")
      DO UPDATE SET
        "studentId" = COALESCE(EXCLUDED."studentId", person_source_identities."studentId"),
        "sourceNationalCode" = COALESCE(EXCLUDED."sourceNationalCode", person_source_identities."sourceNationalCode"),
        "sourceFirstName" = EXCLUDED."sourceFirstName",
        "sourceLastName" = EXCLUDED."sourceLastName",
        "sourceFatherName" = EXCLUDED."sourceFatherName",
        "sourceBirthDate" = EXCLUDED."sourceBirthDate",
        "normalizedFirstName" = EXCLUDED."normalizedFirstName",
        "normalizedLastName" = EXCLUDED."normalizedLastName",
        "normalizedFatherName" = EXCLUDED."normalizedFatherName",
        "updatedAt" = now()
      RETURNING *
      `,
      [
        identity.universityId,
        identity.studentId,
        identity.sourceStudentCode,
        identity.sourceNationalCode,
        identity.sourceFirstName,
        identity.sourceLastName,
        identity.sourceFatherName,
        identity.sourceBirthDate,
        identity.normalizedFirstName,
        identity.normalizedLastName,
        identity.normalizedFatherName,
        identity.identityStatus,
      ]
    );

    const row = result.rows[0];
    migrationEvent('SOURCE_IDENTITY_UPSERTED', {
      identityId: row.id,
      universityId: row.universityId,
      sourceStudentCode: row.sourceStudentCode,
    });
    return row;
  }, customDbUrl);
}

export async function importSourceIdentities(identities, options = {}) {
  const { batchSize = 500, dryRun = false, dbUrl } = options;

  if (!Array.isArray(identities)) {
    throw new TypeError('identities must be an array');
  }

  let processed = 0;
  let inserted = 0;

  for (let start = 0; start < identities.length; start += batchSize) {
    const batch = identities.slice(start, start + batchSize);
    if (dryRun) {
      processed += batch.length;
      continue;
    }

    await withTransaction(async (client) => {
      for (const input of batch) {
        const identity = buildSourceIdentity(input);
        const result = await client.query(
          `
          INSERT INTO person_source_identities (
            "universityId",
            "studentId",
            "sourceStudentCode",
            "sourceNationalCode",
            "sourceFirstName",
            "sourceLastName",
            "sourceFatherName",
            "sourceBirthDate",
            "normalizedFirstName",
            "normalizedLastName",
            "normalizedFatherName",
            "identityStatus"
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT ("universityId", "sourceStudentCode")
          DO UPDATE SET
            "studentId" = COALESCE(EXCLUDED."studentId", person_source_identities."studentId"),
            "sourceNationalCode" = COALESCE(EXCLUDED."sourceNationalCode", person_source_identities."sourceNationalCode"),
            "sourceFirstName" = EXCLUDED."sourceFirstName",
            "sourceLastName" = EXCLUDED."sourceLastName",
            "sourceFatherName" = EXCLUDED."sourceFatherName",
            "sourceBirthDate" = EXCLUDED."sourceBirthDate",
            "normalizedFirstName" = EXCLUDED."normalizedFirstName",
            "normalizedLastName" = EXCLUDED."normalizedLastName",
            "normalizedFatherName" = EXCLUDED."normalizedFatherName",
            "updatedAt" = now()
          RETURNING (xmax = 0) AS inserted
          `,
          [
            identity.universityId,
            identity.studentId,
            identity.sourceStudentCode,
            identity.sourceNationalCode,
            identity.sourceFirstName,
            identity.sourceLastName,
            identity.sourceFatherName,
            identity.sourceBirthDate,
            identity.normalizedFirstName,
            identity.normalizedLastName,
            identity.normalizedFatherName,
            identity.identityStatus,
          ]
        );

        if (result.rows[0]?.inserted) {
          inserted++;
        }
        processed++;
      }
    }, dbUrl);
  }

  return {
    processed,
    inserted,
    updated: processed - inserted,
  };
}
