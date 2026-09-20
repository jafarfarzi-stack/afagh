/**
 * ══════════════════════════════════════════════════════════════════════
 *  Migration V2: Person Linker
 *  — موتور پیوند هویت مستقل چنددانشگاهی
 *  — مدیریت اشخاص (persons) و نگاشت منابع (person_source_identities)
 *  — ایزوله‌سازی موارد مشکوک در identity_resolution_reviews
 * ══════════════════════════════════════════════════════════════════════
 */
import {
  isValidIranianNationalCode,
  normalizePersianText,
  evaluateCandidateMatch,
} from './candidate-matcher.mjs';

/**
 * ایجاد یا پیوند رکورد هویتی منبع به جدول اشخاص مستقل
 * @param {import('pg').PoolClient | import('pg').Pool} db 
 * @param {Object} input 
 * @returns {Promise<Object>}
 */
export async function linkSourceIdentity(db, input) {
  const {
    universityId,
    sourceStudentCode,
    sourceNationalCode,
    sourceFirstName,
    sourceLastName,
    sourceFatherName,
    sourceBirthDate = null,
    studentId = null,
  } = input;

  if (!universityId || !sourceStudentCode) {
    throw new Error('universityId and sourceStudentCode are mandatory for linkSourceIdentity');
  }

  const normFirst = normalizePersianText(sourceFirstName);
  const normLast = normalizePersianText(sourceLastName);
  const normFather = normalizePersianText(sourceFatherName);
  const rawNat = (sourceNationalCode || '').trim();
  const hasValidNat = isValidIranianNationalCode(rawNat);

  // ۱. بررسی سابقه در person_source_identities
  const existingPsiRes = await db.query(
    `SELECT * FROM person_source_identities 
     WHERE "universityId" = $1 AND "sourceStudentCode" = $2`,
    [universityId, sourceStudentCode]
  );
  let psiRecord = existingPsiRes.rows[0];

  if (psiRecord && psiRecord.personId && psiRecord.identityStatus === 'LINKED') {
    // در صورت وجود studentId و خالی بودن در رکورد موجود، آپدیت می‌کنیم
    if (studentId && !psiRecord.studentId) {
      await db.query(
        `UPDATE person_source_identities SET "studentId" = $1 WHERE id = $2`,
        [studentId, psiRecord.id]
      );
      psiRecord.studentId = studentId;
    }
    return {
      personId: psiRecord.personId,
      sourceIdentityId: psiRecord.id,
      identityStatus: psiRecord.identityStatus,
      matchMethod: psiRecord.matchMethod,
      confidence: Number(psiRecord.matchConfidence),
    };
  }

  let targetPersonId = null;
  let identityStatus = 'UNRESOLVED';
  let matchMethod = 'NONE';
  let matchConfidence = 0.0;
  let reviewReason = null;
  let candidatePersonId = null;

  if (hasValidNat) {
    // ۲. جستجو در جدول persons بر اساس کد ملی یکتا
    const personRes = await db.query(
      `SELECT * FROM persons WHERE "canonicalNationalCode" = $1`,
      [rawNat]
    );
    const existingPerson = personRes.rows[0];

    if (existingPerson) {
      const match = evaluateCandidateMatch(
        {
          sourceNationalCode: rawNat,
          sourceFirstName,
          sourceLastName,
          sourceFatherName,
        },
        existingPerson
      );

      if (match.canAutoMerge) {
        targetPersonId = existingPerson.id;
        identityStatus = 'LINKED';
        matchMethod = match.matchMethod;
        matchConfidence = match.confidence;
      } else {
        // تعارض در نام با کد ملی یکسان -> نیازمند بررسی دستی
        identityStatus = 'REVIEW_REQUIRED';
        matchMethod = match.matchMethod;
        matchConfidence = match.confidence;
        reviewReason = match.reason;
        candidatePersonId = existingPerson.id;

        // ایجاد شخص جدید مستقل و بدون ادغام خودکار تا بررسی ناظر انجام شود
        const newPersonRes = await db.query(
          `INSERT INTO persons 
            ("canonicalFirstName", "canonicalLastName", "canonicalFatherName", "canonicalNationalCode", "canonicalBirthDate")
           VALUES ($1, $2, $3, NULL, $4)
           RETURNING id`,
          [sourceFirstName, sourceLastName, sourceFatherName, sourceBirthDate]
        );
        targetPersonId = newPersonRes.rows[0].id;
      }
    } else {
      // شخص با این کد ملی وجود ندارد -> ثبت شخص کانونی جدید
      const newPersonRes = await db.query(
        `INSERT INTO persons 
          ("canonicalFirstName", "canonicalLastName", "canonicalFatherName", "canonicalNationalCode", "canonicalBirthDate")
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [sourceFirstName, sourceLastName, sourceFatherName, rawNat, sourceBirthDate]
      );
      targetPersonId = newPersonRes.rows[0].id;
      identityStatus = 'LINKED';
      matchMethod = 'NEW_CANONICAL_PERSON';
      matchConfidence = 1.0;
    }
  } else {
    // ۳. کد ملی نامعتبر یا خالی -> کد ملی نباید وارد canonicalNationalCode شود
    // جستجوی نامزدها بر اساس تشابه نام و نام خانوادگی
    const fuzzyCandidates = await db.query(
      `SELECT * FROM persons 
       WHERE "canonicalFirstName" ILIKE $1 AND "canonicalLastName" ILIKE $2
       LIMIT 5`,
      [`%${normFirst}%`, `%${normLast}%`]
    );

    let bestCandidate = null;
    let bestMatch = null;
    for (const cand of fuzzyCandidates.rows) {
      const match = evaluateCandidateMatch(
        { sourceNationalCode: rawNat, sourceFirstName, sourceLastName, sourceFatherName },
        cand
      );
      if (match.resolution === 'REVIEW_REQUIRED' && (!bestMatch || match.confidence > bestMatch.confidence)) {
        bestCandidate = cand;
        bestMatch = match;
      }
    }

    // ایجاد یک شخص جدید با کد ملی خالی
    const newPersonRes = await db.query(
      `INSERT INTO persons 
        ("canonicalFirstName", "canonicalLastName", "canonicalFatherName", "canonicalNationalCode", "canonicalBirthDate")
       VALUES ($1, $2, $3, NULL, $4)
       RETURNING id`,
      [sourceFirstName, sourceLastName, sourceFatherName, sourceBirthDate]
    );
    targetPersonId = newPersonRes.rows[0].id;

    if (bestCandidate && bestMatch) {
      identityStatus = 'REVIEW_REQUIRED';
      matchMethod = bestMatch.matchMethod;
      matchConfidence = bestMatch.confidence;
      reviewReason = bestMatch.reason;
      candidatePersonId = bestCandidate.id;
    } else {
      identityStatus = 'NEW_PERSON_PENDING';
      matchMethod = 'INVALID_OR_MISSING_NATIONAL_CODE';
      matchConfidence = 0.5;
    }
  }

  // ۴. درج یا به‌روزرسانی person_source_identities
  let psiId = psiRecord?.id;
  if (psiRecord) {
    const updateRes = await db.query(
      `UPDATE person_source_identities SET
        "personId" = $1,
        "studentId" = COALESCE($2, "studentId"),
        "sourceNationalCode" = $3,
        "sourceFirstName" = $4,
        "sourceLastName" = $5,
        "sourceFatherName" = $6,
        "sourceBirthDate" = $7,
        "normalizedFirstName" = $8,
        "normalizedLastName" = $9,
        "normalizedFatherName" = $10,
        "identityStatus" = $11,
        "matchMethod" = $12,
        "matchConfidence" = $13,
        "updatedAt" = now()
       WHERE id = $14
       RETURNING id`,
      [
        targetPersonId,
        studentId,
        rawNat || null,
        sourceFirstName,
        sourceLastName,
        sourceFatherName,
        sourceBirthDate,
        normFirst,
        normLast,
        normFather,
        identityStatus,
        matchMethod,
        matchConfidence,
        psiRecord.id,
      ]
    );
    psiId = updateRes.rows[0]?.id;
  } else {
    const insertRes = await db.query(
      `INSERT INTO person_source_identities (
        "personId", "universityId", "studentId", "sourceStudentCode",
        "sourceNationalCode", "sourceFirstName", "sourceLastName", "sourceFatherName",
        "sourceBirthDate", "normalizedFirstName", "normalizedLastName", "normalizedFatherName",
        "identityStatus", "matchMethod", "matchConfidence"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id`,
      [
        targetPersonId,
        universityId,
        studentId,
        sourceStudentCode,
        rawNat || null,
        sourceFirstName,
        sourceLastName,
        sourceFatherName,
        sourceBirthDate,
        normFirst,
        normLast,
        normFather,
        identityStatus,
        matchMethod,
        matchConfidence,
      ]
    );
    psiId = insertRes.rows[0]?.id;
  }

  // ۵. ثبت بازبینی در صورت نیاز
  let reviewId = null;
  if (identityStatus === 'REVIEW_REQUIRED' && candidatePersonId) {
    const revRes = await db.query(
      `INSERT INTO identity_resolution_reviews (
        "sourceIdentityId", "candidatePersonId", "resolution", "matchMethod",
        "confidence", "sourceNationalCode", "sourceStudentCode", "sourceUniversityId",
        "reason", "reviewStatus"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING')
      RETURNING id`,
      [
        psiId,
        candidatePersonId,
        'REVIEW_REQUIRED',
        matchMethod,
        matchConfidence,
        rawNat || null,
        sourceStudentCode,
        universityId,
        reviewReason,
      ]
    );
    reviewId = revRes.rows[0]?.id;
  }

  return {
    personId: targetPersonId,
    sourceIdentityId: psiId,
    identityStatus,
    matchMethod,
    confidence: matchConfidence,
    reviewId,
  };
}
