'use strict';
/**
 * ══════════════════════════════════════════════════════════════════════
 *  ماژول ۱۰ (بخش الف) — حضور و غیاب طول ترم + قرارداد الکترونیکی
 *  (سند §۱۸۰۶–۲۰۴۰: تایید غیرمستقیم، حصار شبکه، گیت اثر انگشت، Chain Matching)
 *
 *  روش‌های اثبات حضور استاد (verificationMethod):
 *    • ROLL_CALL          — ثبت حضور و غیاب دانشجویان در بازه زمانی کلاس (رویدادمحور)
 *    • GATE_FINGERPRINT   — پانچ گیت ورودی در پنجره [شروع−۶۰دقیقه، شروع+۱۵دقیقه]
 *    • CHAIN_CONTINUITY   — کلاس پشت‌سرهم: برگزاری موفق کلاس قبلی (وقفه ≤ ۳۰ دقیقه)
 *    • MANUAL_ADMIN       — تایید دستی آموزش (مدارک فراموشی)
 *
 *  ضدتقلب:
 *    • حصار شبکه (IP Whitelisting) — فقط شبکه داخلی دانشگاه (system_settings)
 *    • پرچم مشکوک: ثبت غیاب‌نبودن بعد از اتمام کلاس (بازه مهلت +۵ دقیقه)
 *    • گلوگاه قرارداد: بدون امضای الکترونیکی قرارداد ترم، لیست باز نمی‌شود
 * ══════════════════════════════════════════════════════════════════════
 */
const crypto = require('crypto');
const { db, tx } = require('../db');
const rbac = require('./rbac');

const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const OTP_TTL_MIN = 2, OTP_MAX = 3;
const CHAIN_BUFFER_MIN = 30;      // پنجره تنفس بین دو کلاس پشت‌سرهم
const GATE_PRE_MIN = 60;          // پانچ گیت حداکثر ۶۰ دقیقه قبل از شروع
const GATE_POST_MIN = 15;
const ROLLCALL_PRE_MIN = 10;      // باز маниفест لیست: ۱۰ دقیقه قبل از شروع
const ROLLCALL_GRACE_MIN = 5;     // مهلت ثبت پس از پایان (+۵ → پرچم مشکوک)

const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const nowHM = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function notify(userId, eventCode, vars = {}, explicitText = null) {
  if (!userId) return;
  const tpl = db.prepare(`SELECT * FROM notification_templates WHERE eventCode = ? AND isActive = 1`).get(eventCode);
  let text = explicitText || `[${eventCode}]`;
  if (tpl) text = tpl.templateText.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `«${k}»`);
  db.prepare(`INSERT INTO notifications (userId, eventCode, payload) VALUES (?,?,?)`).run(userId, eventCode, JSON.stringify({ text, vars }));
}

/* ═══════════ حصار شبکه دانشگاه ═══════════ */
function isCampusIp(ip) {
  if (!ip) return false;
  try {
    const cfg = JSON.parse(db.prepare(`SELECT value FROM system_settings WHERE key='CAMPUS_IP_RANGES'`).get()?.value || '{"ranges":[]}');
    const clean = String(ip).replace(/^::ffff:/, '');
    return cfg.ranges.some(r => clean.startsWith(r));
  } catch { return false; }
}

/* ═══════════ تولید ۱۶ جلسه ترم (ابتدای ترم) ═══════════ */
function generateTermSessions(actorUserId) {
  return tx(() => {
    const term = db.prepare(`SELECT * FROM academic_terms WHERE isCurrent=1`).get();
    const offs = db.prepare(`
      SELECT o.id FROM course_offerings o WHERE o.termId=? AND o.isActive=1`).all(term.id);
    let created = 0;
    for (const o of offs) {
      const has = db.prepare(`SELECT COUNT(*) c FROM class_sessions WHERE offeringId=?`).get(o.id).c;
      if (has) continue;
      const cls = db.prepare(`SELECT dayOfWeek, startTime, endTime FROM schedules WHERE offeringId=? AND scheduleType='CLASS'`).all(o.id);
      if (!cls.length) continue;
      const sc = cls[0];
      const d = new Date(term.startDate + 'T00:00:00');
      let made = 0;
      for (let wk = 0; wk < 22 && made < 16; wk++) {
        if (d.getDay() === Number(sc.dayOfWeek)) {
          db.prepare(`INSERT INTO class_sessions (offeringId, sessionDate, startTime, endTime, sessionNo) VALUES (?,?,?,?,?)`)
            .run(o.id, todayStrFromDate(d), sc.startTime, sc.endTime, made + 1);
          made++; created++;
        }
        d.setDate(d.getDate() + 1);
      }
    }
    rbac.audit({ actorUserId, action: 'TERM_SESSIONS_GENERATED', entityType: 'term', entityId: term.id, details: { created } });
    return { ok: true, created };
  });
}
const todayStrFromDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* ═══════════ گلوگاه قرارداد ═══════════ */
function hasSignedContract(staffId) {
  const term = db.prepare(`SELECT id FROM academic_terms WHERE isCurrent=1`).get();
  return !!db.prepare(`SELECT 1 FROM electronic_documents WHERE staffId=? AND termId=? AND docType='CONTRACT' AND signatureStatus='SIGNED'`).get(staffId, term.id);
}

/* ═══════════ پنل استاد: کلاس‌ها و جلسات ═══════════ */
function getMyClassSessions(staffId) {
  const term = db.prepare(`SELECT * FROM academic_terms WHERE isCurrent=1`).get();
  const rows = db.prepare(`
    SELECT cs.id, cs.sessionDate, cs.startTime, cs.endTime, cs.status, cs.sessionNo, cs.isMakeUpSession,
           c.title, c.code, o.id AS offeringId,
           (SELECT COUNT(*) FROM student_class_attendance sa JOIN enrollments e ON e.id=sa.enrollmentId
            WHERE sa.sessionId=cs.id AND sa.status='ABSENT') AS absentCount,
           (SELECT COUNT(*) FROM enrollments e WHERE e.offeringId=o.id AND e.status='REGISTERED') AS studentCount,
           (SELECT pca.verificationMethod FROM professor_class_attendance pca WHERE pca.sessionId=cs.id LIMIT 1) AS verifyMethod,
           (SELECT pca.status FROM professor_class_attendance pca WHERE pca.sessionId=cs.id LIMIT 1) AS attStatus
    FROM class_sessions cs
    JOIN course_offerings o ON o.id = cs.offeringId
    JOIN courses c ON c.id = o.courseId
    WHERE o.termId = ? AND (o.professorId = ? OR EXISTS (SELECT 1 FROM offering_professors op WHERE op.offeringId=o.id AND op.staffId=?))
    ORDER BY cs.sessionDate DESC, cs.startTime DESC`).all(term.id, staffId, staffId);
  const t = todayStr(), nm = nowHM();
  for (const r of rows) r.isLive = r.sessionDate === t && r.status === 'SCHEDULED' && nm >= toMin(r.startTime) - ROLLCALL_PRE_MIN && nm <= toMin(r.endTime) + ROLLCALL_GRACE_MIN;
  return { sessions: rows, contractSigned: hasSignedContract(staffId) };
}

/* ═══════════ باز کردن لیست حضور و غیاب (با کنترل‌ها) ═══════════ */
function openRollCall(staffId, sessionId, { ip, ua, simulateExternal = false }) {
  const cs = db.prepare(`
    SELECT cs.*, c.title, o.professorId FROM class_sessions cs
    JOIN course_offerings o ON o.id=cs.offeringId JOIN courses c ON c.id=o.courseId WHERE cs.id=?`).get(sessionId);
  if (!cs) throw new Error('جلسه یافت نشد.');
  const owns = cs.professorId === staffId || db.prepare(`SELECT 1 FROM offering_professors WHERE offeringId=? AND staffId=?`).get(cs.offeringId, staffId);
  if (!owns) throw new Error('این کلاس به شما تعلق ندارد.');

  // گلوگاه اول سند: بدون امضای قرارداد، لیست باز نمی‌شود
  if (!hasSignedContract(staffId))
    throw new Error('گلوگاه قرارداد: تا پیش از امضای الکترونیکی قرارداد تدریس این ترم، دسترسی به لیست حضور و غیاب مسدود است (بخش «قراردادها»).');

  // حصار شبکه
  if (simulateExternal || !isCampusIp(ip))
    throw new Error('ثبت حضور و غیاب تنها از طریق اتصال به شبکه داخلی دانشگاه امکان‌پذیر است. (حصار شبکه/IP)');

  // بازه زمانی کلاس
  if (cs.sessionDate !== todayStr()) throw new Error(`این جلسه مربوط به تاریخ ${cs.sessionDate} است؛ لیست فقط در روز و ساعت کلاس باز می‌شود.`);
  const nm = nowHM(), st = toMin(cs.startTime), et = toMin(cs.endTime);
  if (nm < st - ROLLCALL_PRE_MIN) throw new Error(`بازه زمانی کلاس هنوز آغاز نشده (شروع: ${cs.startTime}).`);
  if (nm > et + ROLLCALL_GRACE_MIN) throw new Error('بازه زمانی ثبت این جلسه پایان یافته است.');
  const inGrace = nm > et; // ثبت پس از اتمام → پرچم مشکوک

  const students = db.prepare(`
    SELECT e.id AS enrollmentId, s.studentCode, (u.firstName || ' ' || u.lastName) AS name,
           (SELECT COUNT(*) FROM student_class_attendance sa WHERE sa.enrollmentId=e.id AND sa.status='ABSENT') AS totalAbsents
    FROM enrollments e JOIN students s ON s.id=e.studentId JOIN users u ON u.id=s.userId
    WHERE e.offeringId=? AND e.status='REGISTERED' ORDER BY s.studentCode`).all(cs.offeringId);

  return { session: { id: cs.id, title: cs.title, date: cs.sessionDate, start: cs.startTime, end: cs.endTime, inGrace }, students };
}

/** ثبت نهایی: دانشجویان + حضور خودکار استاد (رویدادمحور) */
function submitRollCall(staffId, sessionId, attendance, { ip, ua, simulateExternal = false }, actorUserId) {
  return tx(() => {
    const rc = openRollCall(staffId, sessionId, { ip, ua, simulateExternal }); // همه گلوگاه‌ها دوباره
    const flag = rc.session.inGrace ? 'FLAGGED_SUSPICIOUS' : 'VALID';
    const ins = db.prepare(`INSERT OR REPLACE INTO student_class_attendance (sessionId, enrollmentId, status) VALUES (?,?,?)`);
    for (const a of attendance) if (['PRESENT', 'ABSENT', 'LATE'].includes(a.status)) ins.run(sessionId, a.enrollmentId, a.status);
    db.prepare(`UPDATE class_sessions SET status='HELD' WHERE id=?`).run(sessionId);
    db.prepare(`INSERT INTO professor_class_attendance (sessionId, staffId, verificationMethod, recordedIpAddress, deviceUserAgent, status)
                VALUES (?,?,'ROLL_CALL',?,?,?)`).run(sessionId, staffId, ip || '', ua || '', flag);
    rbac.audit({ actorUserId, action: 'ROLLCALL_SUBMITTED', entityType: 'session', entityId: sessionId, details: { flag, count: attendance.length } });
    return { ok: true, flag, message: flag === 'FLAGGED_SUSPICIOUS' ? 'ثبت شد (با پرچم مشکوک: خارج از ساعت کلاس)' : 'ثبت شد — جلسه برگزارشده و حضور شما گواهی گردید' };
  });
}

/* ═══════════ میان‌افزار گیت اثر انگشت ═══════════ */
function ingestPunch({ token, staffCode, punchTime, deviceLocation }) {
  const svc = db.prepare(`SELECT * FROM integrations_config WHERE serviceName='FINGERPRINT_GATE' AND isActive=1`).get();
  if (!svc || !token || token !== JSON.parse(svc.authCredentials || '{}').token) throw new Error('توکن دستگاه نامعتبر است.');
  const staff = db.prepare(`SELECT st.id, u.id AS userId, u.firstName, u.lastName FROM staff st JOIN users u ON u.id=st.userId WHERE st.staffCode=?`).get(staffCode);
  if (!staff) throw new Error('پرسنل یافت نشد.');
  const t = punchTime || new Date().toISOString().replace('T', ' ').slice(0, 19);
  db.prepare(`INSERT INTO physical_access_logs (staffId, punchTime, deviceLocation) VALUES (?,?,?)`).run(staff.id, t, deviceLocation || 'گیت ورودی اصلی');
  return { ok: true, staff: `${staff.firstName} ${staff.lastName}`, punchTime: t };
}

/* ═══════════ موتور تطبیق هوشمند (زنجیره + گیت + بازبینی) ═══════════ */
function runCorrelation() {
  const actions = [];
  const t = todayStr();
  // جلسات گذشته/امروزیِ تمام‌شده که هنوز SCHEDULED هستند و حضور استاد ثبت نشده
  const pending = db.prepare(`
    SELECT cs.id, cs.offeringId, cs.sessionDate, cs.startTime, cs.endTime, o.professorId,
           c.title
    FROM class_sessions cs
    JOIN course_offerings o ON o.id=cs.offeringId JOIN courses c ON c.id=o.courseId
    WHERE cs.status='SCHEDULED' AND NOT EXISTS (SELECT 1 FROM professor_class_attendance pca WHERE pca.sessionId=cs.id)
      AND (cs.sessionDate < ? OR (cs.sessionDate = ? AND ? > cs.endTime))`)
    .all(t, t, String(Math.floor(nowHM() / 60)).padStart(2, '0') + ':' + String(nowHM() % 60).padStart(2, '0'));

  for (const cs of pending) {
    const staffId = cs.professorId;
    if (!staffId) { actions.push({ sessionId: cs.id, applied: 'NO_PROFESSOR' }); continue; }
    const startMin = toMin(cs.startTime);
    // ۱) Chain Matching: کلاس قبلی همین روزِ همین استاد برگزار شده و فاصله ≤ ۳۰ دقیقه
    const prev = db.prepare(`
      SELECT cs2.id, cs2.endTime FROM class_sessions cs2
      JOIN course_offerings o2 ON o2.id=cs2.offeringId
      JOIN professor_class_attendance pca ON pca.sessionId=cs2.id AND pca.status='VALID'
      WHERE o2.professorId=? AND cs2.sessionDate=? AND cs2.id != ?`).all(staffId, cs.sessionDate, cs.id)
      .find(x => startMin - toMin(x.endTime) >= 0 && startMin - toMin(x.endTime) <= CHAIN_BUFFER_MIN);
    if (prev) {
      tx(() => {
        db.prepare(`UPDATE class_sessions SET status='HELD' WHERE id=?`).run(cs.id);
        db.prepare(`INSERT INTO professor_class_attendance (sessionId, staffId, verificationMethod, status) VALUES (?,?,'CHAIN_CONTINUITY','VALID')`).run(cs.id, staffId);
      });
      actions.push({ sessionId: cs.id, applied: 'CHAIN_CONTINUITY', course: cs.title }); continue;
    }
    // ۲) پانچ گیت در پنجره زمانی
    const punch = db.prepare(`
      SELECT id FROM physical_access_logs
      WHERE staffId=? AND punchTime BETWEEN datetime(?, ?) AND datetime(?, ?) LIMIT 1`).get(
      staffId, `${cs.sessionDate} ${cs.startTime}`, `-${GATE_PRE_MIN} minutes`, `${cs.sessionDate} ${cs.startTime}`, `+${GATE_POST_MIN} minutes`);
    if (punch) {
      tx(() => {
        db.prepare(`UPDATE class_sessions SET status='HELD' WHERE id=?`).run(cs.id);
        db.prepare(`INSERT INTO professor_class_attendance (sessionId, staffId, verificationMethod, status) VALUES (?,?,'GATE_FINGERPRINT','VALID')`).run(cs.id, staffId);
      });
      actions.push({ sessionId: cs.id, applied: 'GATE_FINGERPRINT', course: cs.title }); continue;
    }
    // ۳) نیازمند بازبینی آموزش (مدارک فراموشی)
    actions.push({ sessionId: cs.id, applied: 'NEEDS_REVIEW', course: cs.title });
  }
  return actions;
}

/* ═══════════ کارتابل بازبینی آموزش + اقدام ═══════════ */
function getReviewQueue() {
  const t = todayStr();
  return db.prepare(`
    SELECT cs.id, cs.sessionDate, cs.startTime, cs.endTime, c.title, c.code,
           (u.firstName || ' ' || u.lastName) AS professor
    FROM class_sessions cs
    JOIN course_offerings o ON o.id=cs.offeringId JOIN courses c ON c.id=o.courseId
    LEFT JOIN staff st ON st.id=o.professorId LEFT JOIN users u ON u.id=st.userId
    WHERE cs.status='SCHEDULED' AND NOT EXISTS (SELECT 1 FROM professor_class_attendance pca WHERE pca.sessionId=cs.id)
      AND (cs.sessionDate < ? OR (cs.sessionDate=? AND cs.endTime < time('now','localtime')))
    ORDER BY cs.sessionDate`).all(t, t);
}

function reviewSession({ sessionId, decision, note }, actorUserId) {
  return tx(() => {
    const cs = db.prepare(`SELECT cs.*, o.professorId, c.title FROM class_sessions cs
      JOIN course_offerings o ON o.id=cs.offeringId JOIN courses c ON c.id=o.courseId WHERE cs.id=?`).get(sessionId);
    if (!cs) throw new Error('جلسه یافت نشد.');
    if (decision === 'HELD') {
      db.prepare(`UPDATE class_sessions SET status='HELD' WHERE id=?`).run(sessionId);
      db.prepare(`INSERT INTO professor_class_attendance (sessionId, staffId, verificationMethod, status) VALUES (?,?,'MANUAL_ADMIN','VALID')`).run(sessionId, cs.professorId);
    } else if (decision === 'ABSENT') {
      db.prepare(`UPDATE class_sessions SET status='ABSENT' WHERE id=?`).run(sessionId);
      const uid = db.prepare(`SELECT userId FROM staff WHERE id=?`).get(cs.professorId)?.userId;
      notify(uid, 'PROFESSOR_SESSION_ABSENT', { course: cs.title, date: cs.sessionDate,
        professor: db.prepare(`SELECT firstName FROM users WHERE id=(SELECT userId FROM staff WHERE id=?)`).get(cs.professorId)?.firstName || '' });
    } else throw new Error('تصمیم نامعتبر (HELD/ABSENT).');
    rbac.audit({ actorUserId, action: `ATT_REVIEW_${decision}`, entityType: 'session', entityId: sessionId, details: { note } });
    return { ok: true };
  });
}

/** کلاس جبرانی برای جلسه غیبت‌خورده */
function createMakeUpSession({ sessionId, sessionDate, startTime, endTime }, actorUserId) {
  return tx(() => {
    const cs = db.prepare(`SELECT * FROM class_sessions WHERE id=?`).get(sessionId);
    if (!cs) throw new Error('جلسه یافت نشد.');
    if (cs.status !== 'ABSENT') throw new Error('کلاس جبرانی فقط برای جلسه غیبت‌خورده قابل تعریف است.');
    const dup = db.prepare(`SELECT 1 FROM class_sessions WHERE replacedSessionId=? AND status != 'CANCELED'`).get(sessionId);
    if (dup) throw new Error('برای این جلسه قبلاً کلاس جبرانی تعریف شده است.');
    db.prepare(`INSERT INTO class_sessions (offeringId, sessionDate, startTime, endTime, status, isMakeUpSession, replacedSessionId, sessionNo)
                VALUES (?,?,?,?,'SCHEDULED',1,?,?)`).run(cs.offeringId, sessionDate, startTime, endTime, sessionId, cs.sessionNo);
    rbac.audit({ actorUserId, action: 'MAKEUP_CREATED', entityType: 'session', entityId: sessionId, details: { sessionDate, startTime } });
    return { ok: true };
  });
}

/* ═══════════ گزارش مدیریت (کسورات آینده حق‌التدریس) ═══════════ */
function getAttendanceReport() {
  const term = db.prepare(`SELECT * FROM academic_terms WHERE isCurrent=1`).get();
  const rows = db.prepare(`
    SELECT o.id, c.code, c.title, (u.firstName || ' ' || u.lastName) AS professor,
           COUNT(cs.id) AS totalSessions,
           SUM(CASE WHEN cs.status='HELD' AND cs.isMakeUpSession=0 THEN 1 ELSE 0 END) AS held,
           SUM(CASE WHEN cs.status='HELD' AND cs.isMakeUpSession=1 THEN 1 ELSE 0 END) AS makeupHeld,
           SUM(CASE WHEN cs.status='ABSENT' THEN 1 ELSE 0 END) AS absents,
           SUM(CASE WHEN cs.status='SCHEDULED' AND cs.isMakeUpSession=0 THEN 1 ELSE 0 END) AS upcoming,
           (SELECT COUNT(*) FROM professor_class_attendance pca JOIN class_sessions cs2 ON cs2.id=pca.sessionId
            WHERE cs2.offeringId=o.id AND pca.status='FLAGGED_SUSPICIOUS') AS suspicious,
           (SELECT GROUP_CONCAT(pca.verificationMethod, '، ') FROM professor_class_attendance pca
            JOIN class_sessions cs2 ON cs2.id=pca.sessionId WHERE cs2.offeringId=o.id) AS methods
    FROM course_offerings o
    JOIN courses c ON c.id=o.courseId
    LEFT JOIN staff st ON st.id=o.professorId LEFT JOIN users u ON u.id=st.userId
    LEFT JOIN class_sessions cs ON cs.offeringId=o.id
    WHERE o.termId=? GROUP BY o.id ORDER BY c.code`).all(term.id);
  for (const r of rows) r.netAbsences = Math.max(0, (r.absents || 0) - (r.makeupHeld || 0));
  const punches = db.prepare(`
    SELECT pal.punchTime, pal.deviceLocation, (u.firstName || ' ' || u.lastName) AS staff
    FROM physical_access_logs pal JOIN staff st ON st.id=pal.staffId JOIN users u ON u.id=st.userId
    ORDER BY pal.id DESC LIMIT 8`).all();
  return { report: rows, punches };
}

/* ═══════════ قرارداد الکترونیکی (تولید + امضای OTP) ═══════════ */
function generateContracts(actorUserId) {
  return tx(() => {
    const term = db.prepare(`SELECT * FROM academic_terms WHERE isCurrent=1`).get();
    const staffs = db.prepare(`
      SELECT DISTINCT o.professorId AS id, u.firstName, u.lastName FROM course_offerings o
      JOIN staff st ON st.id=o.professorId JOIN users u ON u.id=st.userId WHERE o.termId=?`).all(term.id);
    let created = 0;
    for (const s of staffs) {
      if (!s.id) continue;
      const exists = db.prepare(`SELECT 1 FROM electronic_documents WHERE staffId=? AND termId=? AND docType='CONTRACT'`).get(s.id, term.id);
      if (exists) continue;
      const courses = db.prepare(`SELECT GROUP_CONCAT(c.title, '، ') g FROM course_offerings o JOIN courses c ON c.id=o.courseId WHERE o.termId=? AND o.professorId=?`).get(term.id, s.id).g || '—';
      const tpl = db.prepare(`SELECT templateText FROM document_templates WHERE code='CONTRACT'`).get().templateText;
      const snap = tpl.replace('{term}', term.title).replace('{firstName}', s.firstName).replace('{lastName}', s.lastName).replace('{courses}', courses);
      db.prepare(`INSERT INTO electronic_documents (staffId, termId, docType, title, documentSnapshot, documentHash) VALUES (?,?,?,?,?,?)`)
        .run(s.id, term.id, 'CONTRACT', `قرارداد تدریس — ${term.title}`, snap, sha(snap));
      const uid = db.prepare(`SELECT userId FROM staff WHERE id=?`).get(s.id).userId;
      notify(uid, 'DOC_ISSUED', { title: 'قرارداد تدریس' }, `استاد گرامی، قرارداد تدریس ${term.title} در کارتابل شما قرار گرفت. جهت امضای الکترونیکی مراجعه فرمایید. تا پیش از امضا، دسترسی به لیست حضور و غیاب مسدود است.`);
      created++;
    }
    rbac.audit({ actorUserId, action: 'CONTRACTS_GENERATED', entityType: 'term', entityId: term.id, details: { created } });
    return { ok: true, created };
  });
}

function getMyDocuments(staffId) {
  const term = db.prepare(`SELECT id, title FROM academic_terms WHERE isCurrent=1`).get();
  return db.prepare(`
    SELECT d.id, d.docType, d.title, d.documentSnapshot, d.documentHash, d.signatureStatus, d.createdAt,
           (SELECT signedAt FROM document_signatures ds WHERE ds.documentId=d.id LIMIT 1) AS signedAt
    FROM electronic_documents d WHERE d.staffId=? AND d.termId=? ORDER BY d.id`).all(staffId, term.id);
}

function requestDocOtp(staffId, documentId) {
  return tx(() => {
    const doc = db.prepare(`SELECT * FROM electronic_documents WHERE id=? AND staffId=?`).get(documentId, staffId);
    if (!doc) throw new Error('سند یافت نشد.');
    if (doc.signatureStatus === 'SIGNED') throw new Error('این سند قبلاً امضا شده است.');
    const lock = db.prepare(`SELECT lockedAt FROM doc_sign_otps WHERE staffId=? AND documentId=? AND lockedAt IS NOT NULL AND lockedAt > datetime('now','-10 minutes')`).get(staffId, documentId);
    if (lock) throw new Error('به دلیل تلاش‌های ناموفق، امضا موقتاً قفل است (۱۰ دقیقه).');
    const code = String(crypto.randomInt(10000, 99999));
    db.prepare(`INSERT INTO doc_sign_otps (staffId, documentId, otpHash, expiresAt) VALUES (?,?,?, datetime('now','+2 minutes'))`).run(staffId, documentId, sha(code));
    const uid = db.prepare(`SELECT userId FROM staff WHERE id=?`).get(staffId).userId;
    notify(uid, 'DOC_OTP_SENT', {}, `استاد گرامی، کد تایید امضای الکترونیکی «${doc.title}»: ${code} — اعتبار ۲ دقیقه.`);
    return { ok: true, expiresInMinutes: OTP_TTL_MIN };
  });
}

function signDocument(staffId, documentId, code, { ip, ua }, actorUserId) {
  return tx(() => {
    const doc = db.prepare(`SELECT * FROM electronic_documents WHERE id=? AND staffId=?`).get(documentId, staffId);
    if (!doc) throw new Error('سند یافت نشد.');
    if (doc.signatureStatus === 'SIGNED') throw new Error('قبلاً امضا شده است.');
    const otp = db.prepare(`SELECT * FROM doc_sign_otps WHERE staffId=? AND documentId=? ORDER BY id DESC LIMIT 1`).get(staffId, documentId);
    if (!otp) throw new Error('ابتدا درخواست کد تایید بدهید.');
    if (otp.isUsed) throw new Error('کد قبلاً استفاده شده؛ کد جدید بگیرید.');
    if (otp.expiresAt < new Date().toISOString().replace('T', ' ').slice(0, 19)) throw new Error('کد منقضی شده؛ کد جدید بگیرید.');
    if (sha(String(code).trim()) !== otp.otpHash) {
      const at = otp.attempts + 1;
      db.prepare(`UPDATE doc_sign_otps SET attempts=?, lockedAt=CASE WHEN ?>=? THEN CURRENT_TIMESTAMP ELSE lockedAt END WHERE id=?`).run(at, at, OTP_MAX, otp.id);
      if (at >= OTP_MAX) {
        for (const a of db.prepare(`SELECT u.id FROM user_roles ur JOIN roles r ON r.id=ur.roleId JOIN users u ON u.id=ur.userId WHERE r.code='ADMIN'`).all())
          notify(a.id, 'DOC_OTP_SECURITY_ALERT', { title: doc.title });
        throw new Error('۳ تلاش ناموفق! امضا قفل و هشدار امنیتی ارسال شد.');
      }
      throw new Error(`کد نادرست است (${at} از ${OTP_MAX}).`);
    }
    db.prepare(`UPDATE doc_sign_otps SET isUsed=1 WHERE id=?`).run(otp.id);
    // مهر دیجیتال: زمان + IP + UA + کد — و Non-repudiation کامل
    db.prepare(`INSERT INTO document_signatures (documentId, staffId, signedAt, ipAddress, userAgent, otpUsed) VALUES (?,?,CURRENT_TIMESTAMP,?,?,?)`)
      .run(documentId, staffId, ip || '', ua || '', '•'.repeat(5));
    if (sha(doc.documentSnapshot) !== doc.documentHash) {
      db.prepare(`UPDATE electronic_documents SET signatureStatus='REJECTED' WHERE id=?`).run(documentId);
      throw new Error('اخطار امنیتی: سند دستکاری شده است؛ امضا رد شد.');
    }
    db.prepare(`UPDATE electronic_documents SET signatureStatus='SIGNED' WHERE id=?`).run(documentId);
    rbac.audit({ actorUserId, action: 'DOC_SIGNED', entityType: 'document', entityId: documentId, details: { ip } });
    return { ok: true, hash: doc.documentHash.slice(0, 16) + '…' };
  });
}

module.exports = {
  isCampusIp, generateTermSessions, hasSignedContract, getMyClassSessions, openRollCall, submitRollCall,
  ingestPunch, runCorrelation, getReviewQueue, reviewSession, createMakeUpSession, getAttendanceReport,
  generateContracts, getMyDocuments, requestDocOtp, signDocument
};
