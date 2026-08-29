'use strict';
/**
 * ══════════════════════════════════════════════════════════════════════
 *  ماژول بایگانی الکترونیک + ثبت‌نام غیرحضوری + e-KYC — سند §۲۴۱۵–۲۵۵۶
 *
 *  الف) Zero-Touch Onboarding (§۲۴۲۷):
 *    ① تزریق قبولی‌های سنجش ← حساب موقت (رمز = کد ملی) + پیامک خوش‌آمد
 *    ② ویزارد دانشجو: اطلاعات فردی + آپلود مدارک + پرداخت علی‌الحساب
 *    ③ اصالت‌سنجی هوشمند: شاهکار (موبایل↔کدملی) + ثبت احوال (پرکردن
 *       خودکار Read-only) + لایونس/تطبیق چهره — ≥۹۰٪ تایید خودکار،
 *       ۷۰–۹۰٪ بررسی چشمی کارشناس، <۷۰٪ رد خودکار (§۲۵۱۷)
 *    ④ کارشناس بایگانی فقط مغایرت‌ها را می‌بیند ← یک کلیک ← صدور
 *       شماره دانشجویی از فرمول‌ساز (§۵۰۴) + پروندهٔ قطعی ACTIVE
 *
 *  ب) زونکن دیجیتال (§۲۴۴۵): فایل‌ها در Object Storage (دمو: data/uploads)
 *     — فقط URL + متادیتا در DB؛ پوشه‌های هویتی/تحصیلی/اداری-مالی/انضباطی-پزشکی
 *
 *  ج) امنیت اسناد (§۲۴۷۸): واترمارک نیمه‌شفاف (کارشناس|تاریخ|IP) هنگام
 *     مشاهده/دانلود + RBAC پوشه‌ای (کارشناس مالی فقط پوشهٔ «اداری/مالی»)
 * ══════════════════════════════════════════════════════════════════════
 */
const fs = require('fs');
const path = require('path');
const { db, tx, hashPassword } = require('../db');
const rbac = require('./rbac');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'data', 'uploads');
const KYC_AUTO = 90, KYC_MANUAL = 70;   // آستانه‌های سند §۲۵۱۷

function notify(userId, eventCode, vars = {}, explicitText = null) {
  if (!userId) return;
  db.prepare(`INSERT INTO notifications (userId, eventCode, payload) VALUES (?,?,?)`)
    .run(userId, eventCode, JSON.stringify({ text: explicitText || `[${eventCode}]`, vars }));
}
const stagingByUser = userId => db.prepare(`SELECT * FROM admissions_staging WHERE userId = ?`).get(userId);
const typeByCode = code => db.prepare(`SELECT t.*, c.title AS catTitle, c.accessRoles FROM document_types t JOIN document_categories c ON c.id = t.categoryId WHERE t.code = ?`).get(code);
const rolesOf = userId => rbac.getRoles(userId).map(r => r.code);

/* ═══════════ ① تزریق داده‌های سنجش (§۲۴۲۷ گام ۱) ═══════════ */
function importSanjeshBatch(list, actorUserId) {
  return tx(() => {
    let created = 0, skipped = 0;
    for (const a of list) {
      const nc = String(a.nationalCode || '').trim();
      if (!/^\d{10}$/.test(nc)) throw new Error(`کد ملی نامعتبر: ${nc || '—'}`);
      if (db.prepare(`SELECT 1 FROM users WHERE nationalCode = ?`).get(nc)) { skipped++; continue; }
      const major = a.majorCode
        ? db.prepare(`SELECT id FROM majors WHERE majorCode = ?`).get(String(a.majorCode)) || db.prepare(`SELECT id FROM majors LIMIT 1`).get()
        : db.prepare(`SELECT id FROM majors LIMIT 1`).get();
      const level = db.prepare(`SELECT id FROM degree_level_configs WHERE code = ?`).get(String(a.degreeCode || '1')) || db.prepare(`SELECT id FROM degree_level_configs LIMIT 1`).get();
      // حساب موقت — رمز عبور = کد ملی (سند §۲۴۲۷)
      const uid = db.prepare(`INSERT INTO users (nationalCode, firstName, lastName, mobile, passwordHash) VALUES (?,?,?,?,?)`)
        .run(nc, a.firstName, a.lastName, a.mobile || null, hashPassword(nc)).lastInsertRowid;
      db.prepare(`INSERT INTO user_roles (userId, roleId) SELECT ?, id FROM roles WHERE code='APPLICANT'`).run(uid);
      db.prepare(`INSERT INTO admissions_staging (nationalCode, userId, fullName, mobile, mappedMajorId, entryYear, degreeLevelId, status, onboardingStatus, rawSanjeshData)
        VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(nc, uid, `${a.firstName} ${a.lastName}`, a.mobile || null, major.id, Number(a.entryYear) || 1405, level.id, 'imported', 'IMPORTED',
          JSON.stringify({ source: 'SANJESH_EXCEL', rank: a.rank || null, majorRaw: a.majorRaw || '' }));
      notify(uid, 'ONBOARDING_WELCOME', { name: a.firstName },
        `${a.firstName} عزیز، به دانشگاه آفاق خوش آمدید! حساب موقت شما ساخته شد (نام کاربری: کد ملی — رمز ورود: کد ملی). برای ثبت‌نام غیرحضوری و دریافت شماره دانشجویی وارد پورتال شوید.`);
      created++;
    }
    rbac.audit({ actorUserId, action: 'SANJESH_IMPORTED', entityType: 'admissions', details: { created, skipped } });
    return { created, skipped };
  });
}

/* ═══════════ ② پورتال متقاضی (ویزارد) ═══════════ */
function getMyOnboarding(userId) {
  const st = stagingByUser(userId);
  if (!st) throw new Error('پروندهٔ ثبت‌نام یافت نشد.');
  const required = db.prepare(`SELECT t.code, t.title FROM document_types t WHERE t.targetAudience IN ('STUDENT','BOTH') AND t.isRequired = 1`).all();
  const docs = db.prepare(`
    SELECT d.id, d.fileName, d.mimeType, d.verificationStatus, d.rejectionReason, t.title AS typeTitle, t.code AS typeCode
    FROM student_documents d LEFT JOIN document_types t ON t.id = d.typeId WHERE d.personUserId = ? ORDER BY d.id`).all(userId);
  const kyc = db.prepare(`SELECT * FROM kyc_verifications WHERE userId = ? ORDER BY id DESC LIMIT 1`).get(userId) || null;
  const u = db.prepare(`SELECT nationalCode, firstName, lastName FROM users WHERE id = ?`).get(userId);
  const checklist = required.map(r => ({ ...r, uploaded: docs.some(d => d.typeCode === r.code), verified: docs.some(d => d.typeCode === r.code && d.verificationStatus === 'VERIFIED') }));
  return {
    applicant: u, staging: { status: st.onboardingStatus, paid: !!st.paidAdvance, paidAmount: st.paidAmount, major: db.prepare(`SELECT name FROM majors WHERE id=?`).get(st.mappedMajorId)?.title },
    checklist, docs, kyc: kyc && { score: Number(kyc.faceMatchScore), ai: kyc.aiVerificationStatus, expert: kyc.expertDecision, challenge: kyc.livenessChallenge, shahkar: kyc.shahkarStatus, civil: kyc.civilRegistryStatus },
    flow: ['IMPORTED', 'DOSSIER_SUBMITTED', 'KYC_RUN', 'READY', 'APPROVED'].indexOf(st.onboardingStatus)
  };
}

function submitProfile(userId, profile) {
  const st = stagingByUser(userId);
  if (!st) throw new Error('پرونده یافت نشد.');
  if (['READY', 'APPROVED'].includes(st.onboardingStatus)) throw new Error('پرونده در مرحلهٔ نهایی است.');
  return tx(() => {
    db.prepare(`UPDATE admissions_staging SET profileJson = ?, onboardingStatus = 'DOSSIER_SUBMITTED' WHERE id = ?`)
      .run(JSON.stringify(profile || {}), st.id);
    return { ok: true };
  });
}

/** آپلود مدرک — فایل در Object Storage (دمو: data/uploads)، فقط متادیتا در DB (§۲۴۴۵) */
function uploadDocument(userId, { typeCode, fileName, mime, dataBase64 }) {
  const st = stagingByUser(userId);
  if (!st) throw new Error('پرونده یافت نشد.');
  const t = typeByCode(typeCode);
  if (!t) throw new Error('نوع مدرک نامعتبر است.');
  if (db.prepare(`SELECT 1 FROM student_documents WHERE personUserId=? AND typeId=?`).get(userId, t.id))
    throw new Error('این مدرک قبلاً بارگذاری شده است.');
  const buf = Buffer.from(String(dataBase64 || ''), 'base64');
  if (!buf.length) throw new Error('فایل خالی است.');
  if (buf.length > 3 * 1024 * 1024) throw new Error('حجم فایل بیش از ۳ مگابایت است.');
  const ext = /\.(jpg|jpeg|png|pdf|svg)$/i.test(fileName || '') ? (fileName.match(/\.(jpg|jpeg|png|pdf|svg)$/i) || [''])[0] : '.svg';
  const stored = `onboard/staging-${st.id}-${t.code}${ext}`;
  fs.mkdirSync(path.join(UPLOAD_ROOT, 'onboard'), { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_ROOT, stored), buf);
  db.prepare(`INSERT INTO student_documents (personUserId, categoryId, typeId, fileName, fileUrl, mimeType, verificationStatus) VALUES (?,?,?,?,?,?,?)`)
    .run(userId, t.categoryId, t.id, fileName || stored.split('/').pop(), stored, mime || 'application/octet-stream', 'PENDING');
  db.prepare(`UPDATE admissions_staging SET onboardingStatus = 'DOSSIER_SUBMITTED' WHERE id = ? AND onboardingStatus = 'IMPORTED'`).run(st.id);
  return { ok: true };
}

/** پرداخت آنلاین علی‌الحساب (متصل به ماژول مالی) — شرط صدور شماره دانشجویی (§۳۲۰۷) */
function payAdvanceGateway(userId, actorUserId) {
  const st = stagingByUser(userId);
  if (!st) throw new Error('پرونده یافت نشد.');
  if (st.paidAdvance) throw new Error('پرداخت قبلاً ثبت شده است.');
  const rule = db.prepare(`SELECT * FROM term_financial_rules WHERE termId = (SELECT id FROM academic_terms WHERE isCurrent=1) AND degreeLevelId = ?`).get(st.degreeLevelId);
  const amount = rule ? rule.advancePaymentRequired : 9500000;
  db.prepare(`UPDATE admissions_staging SET paidAdvance = 1, paidAmount = ? WHERE id = ?`).run(amount, st.id);
  notify(userId, 'ONBOARDING_PAID', { amount }, `پرداخت علی‌الحساب ${amount.toLocaleString('fa-IR')} ریالی شما تایید شد. این پرداخت، شرط صدور خودکار شماره دانشجویی است.`);
  rbac.audit({ actorUserId: actorUserId || userId, action: 'ONBOARDING_PAID', entityType: 'admissions', entityId: st.id, details: { amount } });
  return { ok: true, amount };
}

/* ═══════════ ③ اصالت‌سنجی هوشمند e-KYC (§۲۴۹۰–۲۵۱۷) ═══════════ */
function runKyc(userId, { simulate = 'ok', ip, ua } = {}) {
  const st = stagingByUser(userId);
  if (!st) throw new Error('پرونده یافت نشد.');
  if (!st.paidAdvance) throw new Error('ابتدا شهریهٔ علی‌الحساب را پرداخت کنید (گلوگاه مالی e-KYC).');
  const u = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  return tx(() => {
    // ۱) شاهکار: تطابق موبایل و کد ملی (شبیه‌سازی VERIFIED)
    const shahkar = 'VERIFIED';
    // ۲) ثبت احوال: دریافت اطلاعات هویتی و پرکردن خودکار Read-only (§۲۴۹۷)
    const civil = { firstName: u.firstName, lastName: u.lastName, fatherName: JSON.parse(st.profileJson || '{}').fatherName || '—', alive: true, source: 'CIVIL_REGISTRY_API' };
    // ۳) چالش ویدئویی تصادفی + تطبیق چهره (§۲۵۰۸)
    const chals = ['سر خود را به سمت راست بچرخانید', 'اعداد ۴-۹-۲ را با صدای بلند بخوانید', 'چشم‌های خود را پلک بزنید', 'لبخند بزنید'];
    const challenge = chals[Math.floor(Math.random() * chals.length)];
    const score = simulate === 'bad' ? 58 + Math.random() * 10 : simulate === 'mid' ? 73 + Math.random() * 15 : 91 + Math.random() * 7;
    const score2 = Math.round(score * 100) / 100;
    const ai = score2 >= KYC_AUTO ? 'AUTO_APPROVED' : score2 >= KYC_MANUAL ? 'MANUAL_REVIEW' : 'REJECTED';
    db.prepare(`INSERT INTO kyc_verifications (userId, civilRegistryStatus, shahkarStatus, fetchedCivilData, livenessVideoUrl, livenessChallenge, faceMatchScore, aiVerificationStatus, ipAddress, deviceInfo, completedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
      .run(userId, 'VERIFIED', shahkar, JSON.stringify(civil), `onboard/liveness-${st.id}.svg`, challenge, score2, ai, ip || '—', ua || '—');
    db.prepare(`UPDATE admissions_staging SET onboardingStatus = 'KYC_RUN' WHERE id = ?`).run(st.id);
    const msg = ai === 'REJECTED'
      ? `تطبیق چهره ناموفق بود (${score2}٪ — کمتر از ۷۰٪). لطفاً در محیط روشن و با چهرهٔ خودتان مجدداً تلاش کنید.`
      : ai === 'MANUAL_REVIEW'
        ? `شباهت چهره ${score2}٪ (بازهٔ ۷۰–۹۰٪) — پرونده برای بررسی چشمی کارشناس بایگانی ارجاع شد.`
        : `احراز هویت شما به‌صورت خودکار تایید شد (شباهت ${score2}٪ ≥ ۹۰٪).`;
    notify(userId, 'KYC_RESULT', { score: score2 }, msg);
    rbac.audit({ actorUserId: userId, action: 'KYC_RUN', entityType: 'admissions', entityId: st.id, details: { score: score2, ai } });
    return { ok: true, score: score2, ai, challenge, shahkar, civil, message: msg };
  });
}

/* ═══════════ کارتابل کارشناس بایگانی ═══════════ */
function getInbox() {
  const rows = db.prepare(`
    SELECT s.id, s.nationalCode, s.fullName, s.mobile, s.onboardingStatus, s.paidAdvance, s.paidAmount, s.entryYear, s.decisionNote,
           s.studentId, u.id AS userId,
           (SELECT name FROM majors WHERE id = s.mappedMajorId) AS majorTitle,
           (SELECT COUNT(*) FROM student_documents d WHERE d.personUserId = u.id AND d.verificationStatus = 'PENDING') AS pendingDocs,
           (SELECT COUNT(*) FROM student_documents d WHERE d.personUserId = u.id AND d.verificationStatus = 'VERIFIED') AS verifiedDocs,
           (SELECT COUNT(*) FROM student_documents d JOIN document_types t ON t.id = d.typeId
             WHERE d.personUserId = u.id AND t.isRequired = 1 AND d.verificationStatus = 'VERIFIED') AS requiredVerified,
           (SELECT COUNT(*) FROM document_types WHERE targetAudience IN ('STUDENT','BOTH') AND isRequired = 1) AS requiredTotal,
           (SELECT k.faceMatchScore FROM kyc_verifications k WHERE k.userId = u.id ORDER BY k.id DESC LIMIT 1) AS kycScore,
           (SELECT k.aiVerificationStatus FROM kyc_verifications k WHERE k.userId = u.id ORDER BY k.id DESC LIMIT 1) AS kycAi,
           (SELECT k.expertDecision FROM kyc_verifications k WHERE k.userId = u.id ORDER BY k.id DESC LIMIT 1) AS kycExpert
    FROM admissions_staging s JOIN users u ON u.id = s.userId
    WHERE s.onboardingStatus NOT IN ('APPROVED') ORDER BY s.id`).all()
    .map(r => ({
      ...r, kycScore: r.kycScore == null ? null : Number(r.kycScore),
      ready: ['KYC_RUN', 'READY'].includes(r.onboardingStatus) && r.paidAdvance && r.requiredVerified === r.requiredTotal
        && ((r.kycAi === 'AUTO_APPROVED') || (r.kycAi === 'MANUAL_REVIEW' && r.kycExpert === 'APPROVED'))
    }));
  const docs = db.prepare(`
    SELECT d.id, d.fileName, d.verificationStatus, d.rejectionReason, t.title AS typeTitle, u.firstName || ' ' || u.lastName AS owner, s.nationalCode
    FROM student_documents d
    JOIN document_types t ON t.id = d.typeId
    JOIN users u ON u.id = d.personUserId
    JOIN admissions_staging s ON s.userId = u.id
    WHERE d.verificationStatus = 'PENDING' ORDER BY d.id`).all();
  const kycManual = db.prepare(`
    SELECT k.id, k.faceMatchScore, k.aiVerificationStatus, k.expertDecision, k.livenessChallenge, k.civilRegistryStatus, k.shahkarStatus,
           u.firstName || ' ' || u.lastName AS owner, s.nationalCode
    FROM kyc_verifications k JOIN users u ON u.id = k.userId JOIN admissions_staging s ON s.userId = k.userId
    WHERE k.aiVerificationStatus = 'MANUAL_REVIEW' ORDER BY k.id DESC`).all()
    .map(r => ({ ...r, faceMatchScore: Number(r.faceMatchScore) }));
  return { rows, docs, kycManual, stats: { total: rows.length, ready: rows.filter(r => r.ready).length, kycManual: kycManual.filter(k => k.expertDecision == null).length, pendingDocs: docs.length } };
}

function reviewDocument(docId, decision, note, actorUserId) {
  return tx(() => {
    const d = db.prepare(`SELECT d.*, c.accessRoles FROM student_documents d JOIN document_categories c ON c.id = d.categoryId WHERE d.id = ?`).get(docId);
    if (!d) throw new Error('مدرک یافت نشد.');
    if (d.verificationStatus !== 'PENDING') throw new Error('این مدرک قبلاً بررسی شده است.');
    if (decision !== 'VERIFIED' && decision !== 'REJECTED') throw new Error('تصمیم نامعتبر.');
    db.prepare(`UPDATE student_documents SET verificationStatus = ?, verifiedBy = ?, rejectionReason = ? WHERE id = ?`)
      .run(decision, actorUserId, decision === 'REJECTED' ? (note || 'مدرک مغایر/ناخواناست') : null, docId);
    notify(d.personUserId, decision === 'VERIFIED' ? 'DOC_VERIFIED' : 'DOC_REJECTED', { title: d.fileName },
      decision === 'VERIFIED' ? `مدرک «${d.fileName}» تایید شد.` : `مدرک «${d.fileName}» رد شد: ${note || 'مدرک مغایر/ناخواناست'} — لطفاً مجدداً بارگذاری کنید.`);
    rbac.audit({ actorUserId, action: 'ARCHIVE_DOC_' + decision, entityType: 'student_document', entityId: docId, details: { note } });
    return { ok: true };
  });
}

function reviewKyc(kycId, approve, actorUserId) {
  return tx(() => {
    const k = db.prepare(`SELECT k.*, s.id AS stagingId FROM kyc_verifications k JOIN admissions_staging s ON s.userId = k.userId WHERE k.id = ?`).get(kycId);
    if (!k) throw new Error('رکورد KYC یافت نشد.');
    if (k.aiVerificationStatus !== 'MANUAL_REVIEW') throw new Error('این پرونده در بازهٔ بررسی چشمی نیست (۷۰–۹۰٪).');
    if (k.expertDecision) throw new Error('قبلاً تعیین تکلیف شده است.');
    db.prepare(`UPDATE kyc_verifications SET expertDecision = ?, reviewedBy = ? WHERE id = ?`).run(approve ? 'APPROVED' : 'REJECTED', actorUserId, kycId);
    notify(k.userId, approve ? 'KYC_EXPERT_OK' : 'KYC_EXPERT_REJECT', {},
      approve ? 'تطبیق چهرهٔ شما توسط کارشناس بایگانی تایید شد.' : 'پس از بررسی چشمی، احراز هویت شما رد شد؛ لطفاً ویدیوی جدید ضبط کنید.');
    rbac.audit({ actorUserId, action: approve ? 'KYC_EXPERT_APPROVED' : 'KYC_EXPERT_REJECTED', entityType: 'kyc', entityId: kycId });
    return { ok: true };
  });
}

/* ═══════════ ④ گلوگاه نهایی: صدور شماره دانشجویی (§۲۴۳۴) ═══════════ */
function reviewDossier(stagingId, approve, note, actorUserId) {
  return tx(() => {
    const st = db.prepare(`SELECT s.*, u.firstName, u.lastName FROM admissions_staging s JOIN users u ON u.id = s.userId WHERE s.id = ?`).get(stagingId);
    if (!st) throw new Error('پرونده یافت نشد.');
    if (st.onboardingStatus === 'APPROVED') throw new Error('این پرونده قبلاً قطعی شده است.');
    if (!approve) {
      db.prepare(`UPDATE admissions_staging SET onboardingStatus = 'REJECTED', decisionNote = ? WHERE id = ?`).run(note || '—', stagingId);
      notify(st.userId, 'ONBOARDING_REJECTED', {}, `پروندهٔ ثبت‌نام شما رد شد: ${note || 'مدارک ناقص/مغایر'}. جهت اصلاح مجدداً تلاش کنید.`);
      rbac.audit({ actorUserId, action: 'DOSSIER_REJECTED', entityType: 'admissions', entityId: stagingId, details: { note } });
      return { ok: true, result: 'REJECTED' };
    }
    // گلوگاه‌های سخت: مدارک اجباری VERIFIED + KYC معتبر + پرداخت
    const reqTotal = db.prepare(`SELECT COUNT(*) AS c FROM document_types WHERE targetAudience IN ('STUDENT','BOTH') AND isRequired = 1`).get().c;
    const reqOk = db.prepare(`SELECT COUNT(*) AS c FROM student_documents d JOIN document_types t ON t.id = d.typeId
      WHERE d.personUserId = ? AND t.isRequired = 1 AND d.verificationStatus = 'VERIFIED'`).get(st.userId).c;
    if (reqOk < reqTotal) throw new Error(`گلوگاه مدارک: ${reqOk} از ${reqTotal} مدرک اجباری تایید‌شده است.`);
    if (!st.paidAdvance) throw new Error('گلوگاه مالی: شهریهٔ علی‌الحساب پرداخت نشده است.');
    const kyc = db.prepare(`SELECT * FROM kyc_verifications WHERE userId = ? ORDER BY id DESC LIMIT 1`).get(st.userId);
    if (!kyc || !['AUTO_APPROVED', 'MANUAL_REVIEW'].includes(kyc.aiVerificationStatus)) throw new Error('گلوگاه KYC: احراز هویت معتبر نیست.');
    if (kyc.aiVerificationStatus === 'MANUAL_REVIEW' && kyc.expertDecision !== 'APPROVED') throw new Error('گلوگاه KYC: بررسی چشمی کارشناس تایید نشده است.');

    // صدور شماره دانشجویی از موتور فرمول‌ساز (§۵۰۴): {Year:2}{Degree:1}{Major:3}{Seq:3}
    const f = db.prepare(`SELECT * FROM student_id_formulas WHERE degreeLevelId = ? AND entryYear <= ? ORDER BY entryYear DESC LIMIT 1`).get(st.degreeLevelId, st.entryYear || 1405);
    if (!f) throw new Error('فرمول شماره دانشجویی برای این مقطع/ورودی تعریف نشده است.');
    const seq = f.currentSequence + 1;
    db.prepare(`UPDATE student_id_formulas SET currentSequence = ? WHERE id = ?`).run(seq, f.id);
    const major = db.prepare(`SELECT * FROM majors WHERE id = ?`).get(st.mappedMajorId);
    const dl = db.prepare(`SELECT * FROM degree_level_configs WHERE id = ?`).get(st.degreeLevelId);
    const code = f.formula
      .replace('{Year:2}', String((st.entryYear || 1405) % 100))
      .replace('{DegreeCode:1}', dl.code).replace('{DegreeCode:2}', dl.code)
      .replace('{MajorCode:3}', String(major.majorCode).padStart(3, '0'))
      .replace('{Seq:3}', String(seq).padStart(3, '0'));
    const reg = db.prepare(`SELECT id FROM educational_regulations WHERE degreeLevelId = ? AND effectiveFromYear <= ? AND (effectiveToYear IS NULL OR effectiveToYear >= ?) ORDER BY effectiveFromYear DESC LIMIT 1`)
      .get(st.degreeLevelId, st.entryYear || 1405, st.entryYear || 1405);
    // تبدیل پروندهٔ موقت به قطعی (ACTIVE)
    db.prepare(`INSERT INTO students (userId, studentCode, majorId, degreeLevelId, regulationId, entryYear, entryTerm, status, quotaType, currentTermNo) VALUES (?,?,?,?,?,?,1,'ACTIVE',?,1)`)
      .run(st.userId, code, st.mappedMajorId, st.degreeLevelId, reg.id, st.entryYear || 1405, st.quotaType || 'NORMAL');
    const studentId = db.prepare(`SELECT last_insert_rowid() AS id`).get().id;
    db.prepare(`INSERT INTO user_roles (userId, roleId) SELECT ?, id FROM roles WHERE code='STUDENT'`).run(st.userId);
    db.prepare(`DELETE FROM user_roles WHERE userId = ? AND roleId = (SELECT id FROM roles WHERE code='APPLICANT')`).run(st.userId);
    // انتقال پرداخت به دفتر کل دانشجو + تسویهٔ اولیه
    const term = db.prepare(`SELECT id FROM academic_terms WHERE isCurrent = 1`).get();
    const rule = db.prepare(`SELECT * FROM term_financial_rules WHERE termId = ? AND degreeLevelId = ?`).get(term.id, st.degreeLevelId);
    db.prepare(`INSERT INTO student_ledger (studentId, termId, transactionType, amount, description) VALUES (?,?, 'CREDIT', ?, 'پرداخت علی‌الحساب ثبت‌نام غیرحضوری (درگاه بانکی)')`).run(studentId, term.id, st.paidAmount);
    if (rule) {
      db.prepare(`INSERT INTO student_ledger (studentId, termId, transactionType, amount, description) VALUES (?,?, 'DEBIT', ?, 'شهریهٔ ثابت ترم اول')`).run(studentId, term.id, rule.fixedTuition);
      db.prepare(`INSERT INTO financial_clearances (studentId, termId, isCleared, clearedAt) VALUES (?,?,1,CURRENT_TIMESTAMP)`).run(studentId, term.id);
    }
    db.prepare(`UPDATE admissions_staging SET onboardingStatus = 'APPROVED', studentId = ?, status = 'resolved' WHERE id = ?`).run(studentId, stagingId);
    notify(st.userId, 'STUDENT_CODE_ISSUED', { code }, `تبریک! ثبت‌نام شما قطعی شد. شماره دانشجویی شما: ${code} — از این پس با همان کد ملی وارد پورتال دانشجو شوید.`);
    rbac.audit({ actorUserId, action: 'DOSSIER_APPROVED', entityType: 'admissions', entityId: stagingId, details: { code, studentId } });
    return { ok: true, result: 'APPROVED', studentCode: code, studentId };
  });
}

/* ═══════════ ب) زونکن دیجیتال + واترمارک (§۲۴۴۵ و §۲۴۷۸) ═══════════ */
function getDossier(queryUserId, requesterId) {
  const u = db.prepare(`SELECT u.id, u.nationalCode, u.firstName, u.lastName FROM users u WHERE u.id = ?`).get(queryUserId);
  if (!u) throw new Error('کاربر یافت نشد.');
  const stu = db.prepare(`SELECT s.studentCode, s.status, (SELECT name FROM majors WHERE id = s.majorId) AS major FROM students s WHERE s.userId = ?`).get(queryUserId);
  const staffRow = db.prepare(`SELECT st.staffCode, st.staffType FROM staff st WHERE st.userId = ?`).get(queryUserId);
  const myRoles = rolesOf(requesterId);
  const cats = db.prepare(`SELECT * FROM document_categories ORDER BY id`).all().filter(c => {
    const allowed = JSON.parse(c.accessRoles || '[]');
    return myRoles.includes('ADMIN') || allowed.some(r => myRoles.includes(r));
  });
  const folders = cats.map(c => {
    const docs = db.prepare(`
      SELECT d.id, d.fileName, d.mimeType, d.verificationStatus, d.uploadedAt, t.title AS typeTitle
      FROM student_documents d LEFT JOIN document_types t ON t.id = d.typeId
      WHERE d.personUserId = ? AND d.categoryId = ? ORDER BY d.id`).all(queryUserId, c.id);
    return { id: c.id, title: c.title, scope: c.scope, docs };
  }).filter(f => f.docs.length || true);
  // اسناد الکترونیکی امضاشدهٔ استاد (قرارداد/ابلاغیه) در پوشهٔ اداری/مالی
  const eDocs = db.prepare(`SELECT id, title, docType, signatureStatus, createdAt FROM electronic_documents WHERE staffId = (SELECT id FROM staff WHERE userId = ?) ORDER BY id`).all(queryUserId);
  return { user: u, student: stu || null, staff: staffRow || null, folders, eDocs };
}

/** گیت+لاگ واترمارک: هر مشاهده/دانلود = «کارشناس | تاریخ | IP» (§۲۴۷۸) */
function accessDocument(docId, requesterId, ip) {
  const d = db.prepare(`SELECT d.*, c.accessRoles, c.title AS catTitle, u.firstName || ' ' || u.lastName AS owner FROM student_documents d JOIN document_categories c ON c.id = d.categoryId JOIN users u ON u.id = d.personUserId WHERE d.id = ?`).get(docId);
  if (!d) throw new Error('مدرک یافت نشد.');
  const myRoles = rolesOf(requesterId);
  const allowed = JSON.parse(d.accessRoles || '[]');
  if (!myRoles.includes('ADMIN') && !allowed.some(r => myRoles.includes(r)) && d.personUserId !== requesterId)
    throw new Error(`دسترسی پوشه‌ای: شما مجاز به مشاهدهٔ پوشهٔ «${d.catTitle}» نیستید.`);
  const req = db.prepare(`SELECT firstName, lastName FROM users WHERE id = ?`).get(requesterId);
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const watermark = `${req.firstName} ${req.lastName} | ${now} | ${ip || '—'}`;
  rbac.audit({ actorUserId: requesterId, action: 'ARCHIVE_DOC_VIEWED', entityType: 'student_document', entityId: docId, details: { watermark, owner: d.owner } });
  const abs = path.join(UPLOAD_ROOT, d.fileUrl);
  if (!fs.existsSync(abs)) throw new Error('فایل در Object Storage یافت نشد.');
  return { absPath: abs, mime: d.mimeType, watermark, fileName: d.fileName };
}

module.exports = { importSanjeshBatch, getMyOnboarding, submitProfile, uploadDocument, payAdvanceGateway, runKyc,
  getInbox, reviewDocument, reviewKyc, reviewDossier, getDossier, accessDocument, KYC_AUTO, KYC_MANUAL };
