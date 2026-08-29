'use strict';
/**
 * ══════════════════════════════════════════════════════════════════════
 *  RBAC پویا + Audit Trail غیرقابل تغییر (زنجیره هش)
 * ══════════════════════════════════════════════════════════════════════
 */
const crypto = require('crypto');
const { db } = require('../db');

/** آیا کاربر دارای دسترسی مورد نظر است؟ (نقش‌ها داده‌محور) */
function hasPermission(userId, permCode) {
  return !!db.prepare(`
    SELECT 1 FROM user_roles ur
    JOIN role_permissions rp ON rp.roleId = ur.roleId
    JOIN permissions p ON p.id = rp.permissionId
    WHERE ur.userId = ? AND p.code = ? LIMIT 1`).get(userId, permCode);
}

/** نقش‌های کاربر */
function getRoles(userId) {
  return db.prepare(`
    SELECT r.code, r.title FROM user_roles ur JOIN roles r ON r.id = ur.roleId WHERE ur.userId = ?`).all(userId);
}

/** ثبت رویداد امنیتی با زنجیره هش (Immutable Audit Trail) */
function audit({ actorUserId = null, action, entityType = null, entityId = null, details = null, ipAddress = null }) {
  const prev = db.prepare(`SELECT hash FROM audit_logs ORDER BY id DESC LIMIT 1`).get();
  const prevHash = prev ? prev.hash : 'GENESIS';
  const payload = JSON.stringify({ actorUserId, action, entityType, entityId, details, prevHash, t: Date.now() });
  const hash = crypto.createHash('sha256').update(payload).digest('hex');
  db.prepare(`INSERT INTO audit_logs (actorUserId, action, entityType, entityId, details, prevHash, hash, ipAddress)
              VALUES (?,?,?,?,?,?,?,?)`)
    .run(actorUserId, action, entityType, entityId, details ? JSON.stringify(details) : null, prevHash, hash, ipAddress);
}

module.exports = { hasPermission, getRoles, audit };
