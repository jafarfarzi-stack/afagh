'use strict';
/**
 * ══════════════════════════════════════════════════════════════════════
 *  سامانه سخا (نظام وظیفه) — کارتابل سه‌صندوقی کارشناس — سند §۲۵۵۸–۲۷۴۰
 *
 *  الف) دست‌دادن دوطرفه (Two-Way Handshake سند §۲۶۳۶):
 *    دانشجو درخواست می‌دهد → PENDING_UNIVERSITY_APPROVAL → پرداخت علی‌الحساب
 *    (اولین فیلتر نیت واقعی) → کارشناس [تایید ثبت‌نام و اعلام قبولی به ناجا]
 *    → صدور قطعی توسط سخا (ISSUED) + تاریخ شروع/پایان معافیت
 *
 *  ب) کارتابل یکپارچه سه‌صندوقی (سند §۲۷۱۰):
 *    📥 ۱ تایید ثبت‌نام‌های جدید   📥 ۲ تمدید سنوات ارفاقی (آرای کمیسیون)
 *    📥 ۳ پیشنهادات ابطال (انصراف/اخراج → گزارش به ناجا)
 *
 *  ج) چرخهٔ تمدید با نظارت انسانی (Human-in-the-Loop سند §۲۷۰۵):
 *    رای کمیسیون ← پیش‌نویس خودکار (PENDING_EXTENSION_REVIEW) ← توقف در
 *    کارتابل کارشناس ← [تایید و ارسال به ناجا] ← EXTENSION_SENT_TO_SAKHA
 *    ← پرداخت دانشجو در سخا ← EXTENSION_GRANTED + تاریخ انقضای جدید
 *
 *  د) اطمینان (سند §۲۶۱۳): پیامک ۶ ماه قبل از انقضا؛ روز انقضا ←
 *    students.status = BLOCKED_MILITARY (قفل کامل انتخاب واحد)؛
 *    بازگشایی خودکار به‌محض دریافت تمدید از سخا.
 * ══════════════════════════════════════════════════════════════════════
 */
const { db, tx } = require('../db');
const rbac = require('./rbac');

const EXPIRY_ALERT_DAYS = 180;   // پیامک ۶ ماه قبل (سند §۲۶۱۵)
const RED_COUNTDOWN_DAYS = 30;   // شمارشگر قرمز کارتابل (سند §۲۷۳۷)

function notify(userId, eventCode, vars = {}, explicitText = null) {
  if (!userId) return;
  db.prepare(`INSERT INTO notifications (userId, eventCode, payload) VALUES (?,?,?)`)
    .run(userId, eventCode, JSON.stringify({ text: explicitText || `[${eventCode}]`, vars }));
}
const notifyOfficers = (eventCode, vars, text) => {
  for (const r of db.prepare(`
    SELECT u.id FROM user_roles ur JOIN roles r2 ON r2.id = ur.roleId JOIN users u ON u.id = ur.userId
    WHERE r2.code IN ('MILITARY_OFFICER','ADMIN')`).all()) notify(r.id, eventCode, vars, text);
};
const daysLeft = d => Math.ceil((new Date(String(d) + 'T23:59:59Z').getTime() - Date.now()) / 86400000);
const studentRow = id => db.prepare(`
  SELECT s.id, s.studentCode, s.status, u.id AS userId, u.firstName || ' ' || u.lastName AS name
  FROM students s JOIN users u ON u.id = s.userId WHERE s.id = ?`).get(id);
const hasPaidAdvance = studentId => db.prepare(`
  SELECT COUNT(*) AS c FROM student_ledger WHERE studentId = ? AND transactionType = 'CREDIT'`).get(studentId).c > 0;

/* ─── کارتابل سه‌صندوقی + شمارشگر قرمز ─── */
function getDashboard() {
  const base = `SELECT m.*, s.studentCode, s.status AS studentStatus, u.firstName || ' ' || u.lastName AS name, u.id AS userId
    FROM military_service_records m JOIN students s ON s.id = m.studentId JOIN users u ON u.id = s.userId`;
  const feed = r => ({
    recordId: r.id, studentId: r.studentId, studentCode: r.studentCode, name: r.name,
    status: r.status, sakhaStatus: r.sakhaStatus, pendingExtraSemesters: r.pendingExtraSemesters,
    exemptionStartDate: r.exemptionStartDate, exemptionExpiry: r.exemptionExpiry,
    sakhaTrackingCode: r.sakhaTrackingCode, studentStatus: r.studentStatus,
    daysLeft: r.exemptionExpiry != null ? daysLeft(r.exemptionExpiry) : null,
    paid: r.status === 'PENDING_UNIVERSITY_APPROVAL' ? hasPaidAdvance(r.studentId) : undefined,
  });

  // 📥 صندوق ۱: ثبت‌نام‌های جدید در انتظار تایید دانشگاه (سند §۲۷۱۱)
  const inboxNew = db.prepare(`${base} WHERE m.status = 'PENDING_UNIVERSITY_APPROVAL' ORDER BY m.id`).all().map(feed);
  // 📥 صندوق ۲: آرای کمیسیون — منتظر ارسال تمدید به ناجا + ارسال‌شده‌های در انتظار پرداخت (سند §۲۷۱۲)
  const inboxExtension = db.prepare(`${base} WHERE m.sakhaStatus IN ('PENDING_EXTENSION_REVIEW','EXTENSION_SENT_TO_SAKHA') ORDER BY m.id`).all().map(feed);
  // 📥 صندوق ۳: پیشنهاد ابطال — انصراف/اخراج با معافیت هنوز فعال (سند §۲۶۵۵ و §۲۷۱۳)
  const inboxRevocation = db.prepare(`${base} WHERE m.status = 'EDUCATIONAL_EXEMPTION' AND s.status IN ('WITHDRAWN','EXPELLED') ORDER BY m.id`).all().map(feed);
  // 🔴 شمارشگر قرمز: انقضای نزدیک بدون تمدید در جریان + قفل‌شده‌ها (سند §۲۷۳۷)
  const expiring = db.prepare(`${base} WHERE m.status = 'EDUCATIONAL_EXEMPTION' AND m.exemptionExpiry IS NOT NULL
     AND (m.sakhaStatus IS NULL OR m.sakhaStatus = 'EXTENSION_GRANTED')
     AND m.exemptionExpiry <= date('now', '+${RED_COUNTDOWN_DAYS} days') ORDER BY m.exemptionExpiry`).all().map(feed);

  return { inboxNew, inboxExtension, inboxRevocation, expiring };
}

/* ─── 📥 ۱: تایید ثبت‌نام و اعلام قبولی به ناجا (سند §۲۶۴۵) ─── */
function approveInitial(recordId, actorUserId) {
  return tx(() => {
    const m = db.prepare(`SELECT * FROM military_service_records WHERE id = ?`).get(recordId);
    if (!m || m.status !== 'PENDING_UNIVERSITY_APPROVAL') throw new Error('پروندهٔ در انتظار تایید یافت نشد.');
    const stu = studentRow(m.studentId);
    if (!hasPaidAdvance(m.studentId))
      throw new Error('گلوگاه مالی: دانشجو شهریهٔ علی‌الحساب را پرداخت نکرده است — واریز، اولین فیلتر نیت واقعی برای درس خواندن است (سند §۲۶۴۳).');
    // شبیه‌سازی فراخوانی وب‌سرویس سخا: «این دانشجو ثبت‌نام خود را قطعی کرده است» ← صدور + تاریخ‌ها
    const track = 'SKH-' + String(100000 + (m.studentId * 7919) % 900000);
    const start = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + 5 * 365 * 86400000).toISOString().slice(0, 10); // مثال سند: ~۵ سال کارشناسی
    db.prepare(`UPDATE military_service_records SET status='EDUCATIONAL_EXEMPTION', sakhaTrackingCode=?, exemptionStartDate=?, exemptionExpiry=?, lastSyncAt=CURRENT_TIMESTAMP WHERE id=?`)
      .run(track, start, end, recordId);
    notify(stu.userId, 'MILITARY_ISSUED', { code: track, end },
      `معافیت تحصیلی شما توسط سامانه سخا صادر شد (کد رهگیری ${track}) — اعتبار تا ${end}. ثبت‌نام دانشگاه شما قطعی شد.`);
    notifyOfficers('MILITARY_ISSUED', { student: stu.name }, `ثبت‌نام ${stu.name} به ناجا اعلام و معافیت صادر شد (کد ${track}).`);
    rbac.audit({ actorUserId, action: 'MILITARY_INITIAL_APPROVED', entityType: 'military_record', entityId: recordId, details: { student: stu.studentCode, track } });
    return { ok: true, trackingCode: track, exemptionEndDate: end };
  });
}

/* ─── پیش‌نویس خودکار رای کمیسیون (سند §۲۷۰۵ — BPM → کارتابل، نه ارسال مستقیم) ─── */
function onCommissionRuling(studentId, semesters = 1) {
  return tx(() => {
    const m = db.prepare(`SELECT * FROM military_service_records WHERE studentId = ?`).get(studentId);
    if (!m || m.status !== 'EDUCATIONAL_EXEMPTION') throw new Error('رکورد معافیت تحصیلی فعال یافت نشد (فقط مشمولان).');
    if (m.sakhaStatus === 'EXTENSION_SENT_TO_SAKHA') throw new Error('درخواست تمدید این دانشجو قبلاً به ناجا ارسال شده است.');
    const stu = studentRow(studentId);
    db.prepare(`UPDATE military_service_records SET sakhaStatus='PENDING_EXTENSION_REVIEW', pendingExtraSemesters=? WHERE id=?`).run(semesters, m.id);
    notifyOfficers('MILITARY_EXTENSION_DRAFT', { student: stu.name, semesters },
      `رای کمیسیون موارد خاص: ${semesters} نیمسال سنوات ارفاقی برای ${stu.name} — پیش‌نویس «تمدید معافیت» در صندوق ۲ کارتابل شما منتظر تایید و ارسال به ناجاست.`);
    notify(stu.userId, 'MILITARY_EXTENSION_DRAFT', { semesters }, `کمیسیون موارد خاص به ${semesters} نیمسال سنوات ارفاقی شما رای داد؛ درخواست تمدید پس از تایید کارشناس نظام وظیفه به سامانه سخا ارسال می‌شود.`);
    return { ok: true, recordId: m.id, semesters };
  });
}

/* ─── 📥 ۲: [تایید و ارسال درخواست تمدید به ناجا] (سند §۲۷۰۹) ─── */
function sendExtension(recordId, actorUserId) {
  return tx(() => {
    const m = db.prepare(`SELECT * FROM military_service_records WHERE id = ?`).get(recordId);
    if (!m || m.sakhaStatus !== 'PENDING_EXTENSION_REVIEW') throw new Error('پروندهٔ منتظر ارسال تمدید یافت نشد.');
    const stu = studentRow(m.studentId);
    const track = 'SKH-EXT-' + String(100000 + (recordId * 104729) % 900000);
    db.prepare(`UPDATE military_service_records SET sakhaStatus='EXTENSION_SENT_TO_SAKHA', sakhaTrackingCode=?, lastSyncAt=CURRENT_TIMESTAMP WHERE id=?`).run(track, recordId);
    notify(stu.userId, 'MILITARY_EXT_SENT', { code: track },
      `درخواست تمدید سنوات ارفاقی شما به سامانه سخا ارسال شد (کد رهگیری ${track}). برای پرداخت هزینهٔ تمدید سنوات به سامانه سخا مراجعه کنید.`);
    rbac.audit({ actorUserId, action: 'MILITARY_EXT_SENT', entityType: 'military_record', entityId: recordId, details: { student: stu.studentCode, track } });
    return { ok: true, trackingCode: track };
  });
}

/* ─── webhook نتیجهٔ سخا: پرداخت دانشجو / رد (سند §۲۷۱۰ گام ۵) ─── */
function sakhaCallback({ token, studentCode, trackingCode, event, newExpiryDate }) {
  return tx(() => {
    const svc = db.prepare(`SELECT * FROM integrations_config WHERE serviceName='SAKHA_API' AND isActive=1`).get();
    if (!svc || !token || token !== JSON.parse(svc.authCredentials || '{}').token) throw new Error('توکن سامانه سخا نامعتبر است.');
    const m = trackingCode
      ? db.prepare(`SELECT * FROM military_service_records WHERE sakhaTrackingCode = ?`).get(trackingCode)
      : db.prepare(`SELECT m.* FROM military_service_records m JOIN students s ON s.id = m.studentId WHERE s.studentCode = ?`).get(studentCode);
    if (!m) throw new Error('پروندهٔ سخا یافت نشد.');
    const stu = studentRow(m.studentId);
    if (event === 'PAID') {
      const extra = Number(m.pendingExtraSemesters || 1);
      const end = newExpiryDate || new Date(Date.now() + extra * 6 * 30 * 86400000).toISOString().slice(0, 10);
      db.prepare(`UPDATE military_service_records SET sakhaStatus='EXTENSION_GRANTED', exemptionExpiry=?, lastSyncAt=CURRENT_TIMESTAMP WHERE id=?`).run(end, m.id);
      // بازگشایی خودکار قفل انتخاب واحد (سند §۲۶۱۹)
      if (stu.status === 'BLOCKED_MILITARY') {
        db.prepare(`UPDATE students SET status='ACTIVE' WHERE id=?`).run(m.studentId);
        notify(stu.userId, 'MILITARY_UNBLOCKED', { end }, `تمدید سنوات ارفاقی از سامانه سخا دریافت شد؛ معافیت شما تا ${end} تمدید و قفل انتخاب واحد بازگشایی شد.`);
      } else {
        notify(stu.userId, 'MILITARY_EXT_GRANTED', { end }, `پرداخت شما در سامانه سخا تایید شد؛ معافیت تحصیلی شما تا ${end} تمدید شد.`);
      }
      rbac.audit({ actorUserId: null, action: 'MILITARY_EXT_GRANTED', entityType: 'military_record', entityId: m.id, details: { student: stu.studentCode, end } });
      return { ok: true, student: stu.name, newExpiry: end };
    }
    if (event === 'REJECTED') {
      db.prepare(`UPDATE military_service_records SET sakhaStatus='PENDING_EXTENSION_REVIEW', lastSyncAt=CURRENT_TIMESTAMP WHERE id=?`).run(m.id);
      notify(stu.userId, 'MILITARY_EXT_REJECTED', {}, `درخواست تمدید سنوات شما در سامانه سخا رد شد؛ برای پیگیری به پلیس +۱۰ مراجعه کنید.`);
      return { ok: true, student: stu.name, result: 'REJECTED' };
    }
    throw new Error('رویداد نامعتبر (PAID یا REJECTED).');
  });
}

/* ─── 📥 ۳: تایید ابطال و گزارش به ناجا (سند §۲۶۵۵) ─── */
function confirmRevocation(recordId, actorUserId) {
  return tx(() => {
    const m = db.prepare(`SELECT m.*, s.status AS stuStatus FROM military_service_records m JOIN students s ON s.id = m.studentId WHERE m.id = ?`).get(recordId);
    if (!m || m.status !== 'EDUCATIONAL_EXEMPTION') throw new Error('پروندهٔ معافیت فعال یافت نشد.');
    if (!['WITHDRAWN', 'EXPELLED'].includes(m.stuStatus)) throw new Error('وضعیت دانشجو مستوجب ابطال نیست (انصراف/اخراج).');
    const stu = studentRow(m.studentId);
    db.prepare(`UPDATE military_service_records SET status='REVOKED_DROPOUT', sakhaStatus=NULL, lastSyncAt=CURRENT_TIMESTAMP WHERE id=?`).run(recordId);
    notify(stu.userId, 'MILITARY_REVOKED', {}, `به‌موجب ${m.stuStatus === 'EXPELLED' ? 'اخراج' : 'انصراف'}، گزارش ابطال معافیت تحصیلی شما برای سازمان نظام وظیفه (ناجا) ارسال شد.`);
    rbac.audit({ actorUserId, action: 'MILITARY_REVOKED', entityType: 'military_record', entityId: recordId, details: { student: stu.studentCode, cause: m.stuStatus } });
    return { ok: true, reported: true };
  });
}

/* ─── زمان‌بند: پیامک ۶ ماه قبل + قفل روز انقضا (سند §۲۶۱۳) ─── */
function runExpirySweeper() {
  const actions = [];
  const rows = db.prepare(`
    SELECT m.id, m.exemptionExpiry, s.studentCode, u.id AS userId, u.firstName || ' ' || u.lastName AS name
    FROM military_service_records m JOIN students s ON s.id = m.studentId JOIN users u ON u.id = s.userId
    WHERE m.status = 'EDUCATIONAL_EXEMPTION' AND m.exemptionExpiry IS NOT NULL`).all();
  for (const r of rows) {
    const dl = daysLeft(r.exemptionExpiry);
    if (dl <= 0) {
      // روز انقضا: قفل کامل انتخاب واحد (سند §۲۶۱۷)
      const stu = db.prepare(`SELECT id, status FROM students WHERE studentCode=?`).get(r.studentCode);
      if (stu && stu.status === 'ACTIVE') {
        db.prepare(`UPDATE students SET status='BLOCKED_MILITARY' WHERE id=?`).run(stu.id);
        notify(r.userId, 'MILITARY_BLOCKED', {}, 'معافیت تحصیلی شما منقضی شد؛ ثبت‌نام و انتخاب واحد شما تا دریافت تمدید از سامانه سخا قفل است.');
        actions.push({ recordId: r.id, applied: 'BLOCKED_MILITARY' });
      }
      continue;
    }
    if (dl <= EXPIRY_ALERT_DAYS) {
      const dedupe = db.prepare(`SELECT 1 FROM notifications WHERE eventCode='MILITARY_EXPIRY_SOON' AND payload LIKE ? AND createdAt > datetime('now','-60 days')`).get(`%"${r.studentCode}"%`);
      if (dedupe) continue;
      notify(r.userId, 'MILITARY_EXPIRY_SOON', { student: r.studentCode, days: dl },
        `دانشجوی گرامی، معافیت تحصیلی شما ${dl} روز دیگر به پایان می‌رسد. جهت تمدید سنوات ارفاقی به پلیس +۱۰ یا سامانه سخا مراجعه کنید.`);
      actions.push({ recordId: r.id, applied: 'MILITARY_EXPIRY_SOON', days: dl });
    }
  }
  return actions;
}

module.exports = { getDashboard, approveInitial, onCommissionRuling, sendExtension, sakhaCallback, confirmRevocation, runExpirySweeper, RED_COUNTDOWN_DAYS };
