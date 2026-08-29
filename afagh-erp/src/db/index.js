'use strict';
/**
 * اتصال پایگاه داده + راه‌اندازی اسکیما
 * فاز صفر: SQLite (بدون سرور خارجی) — مهاجرت آسان به PostgreSQL در فاز بعد
 *
 * نکته ۱: `db` یک Proxy است که همیشه به فایل فعلی دیتابیس اشاره می‌کند؛ اگر فایل
 *          از بیرون جایگزین شود (مثلاً `npm run reset` هنگام فعال‌بودن سرور)، اتصال
 *          به‌طور خودکار به فایل جدید بازمی‌گردد (بررسی: حداکثر هر ۵۰۰ms).
 * نکته ۲: تأیید رمز عبور به‌صورت async است (threadpool لایب‌یو) تا ۲۰۰۰ ورود
 *          همزمان، event-loop را بلاک نکند.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const util = require('util');
const Database = require('better-sqlite3');

const DB_PATH = process.env.AFAGH_DB || path.join(__dirname, '..', '..', 'data', 'afagh.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

function openDb() {
  const d = new Database(DB_PATH);
  d.pragma('journal_mode = WAL');
  d.pragma('foreign_keys = ON');
  d.pragma('busy_timeout = 5000');     // نویسنده‌های همزمان بدون خطای SQLITE_BUSY
  d.pragma('synchronous = NORMAL');    // با WAL امن و سریع‌تر از FULL
  d.pragma('cache_size = -32000');     // 32MB صفحه‌کش
  d.pragma('temp_store = MEMORY');
  return d;
}

let _real = openDb();
let _inode = fs.statSync(DB_PATH).ino;
let _lastCheck = 0;

function reopenIfReplaced(force = false) {
  const now = Date.now();
  if (!force && now - _lastCheck < 500) return false; // throttle
  _lastCheck = now;
  try {
    const st = fs.statSync(DB_PATH);
    if (st.ino !== _inode) {
      const old = _real;
      _real = openDb();
      _inode = st.ino;
      try { old.close(); } catch { /* نادیده */ }
      return true;
    }
  } catch { /* فایل موقتاً در حال بازنویسی است */ }
  return false;
}

/** مرجع پایدار برای همهٔ ماژول‌ها — همیشه به فایل زندهٔ دیتابیس شفاف می‌رسد */
const db = new Proxy({}, {
  get(_t, prop) {
    reopenIfReplaced();
    const v = _real[prop];
    return typeof v === 'function' ? v.bind(_real) : v;
  }
});

/** اجرای اسکیمای کامل (idempotent) */
function initSchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  _real.exec(sql);
}

/** اجرای درون یک تراکنش */
function tx(fn) {
  reopenIfReplaced();
  return _real.transaction(fn)();
}

/** هش رمز عبور (scrypt — بدون وابستگی خارجی) | هزینه از محیط: AFAGH_SCRYPT_N (پیش‌فرض 16384) */
const SCRYPT_N = Number(process.env.AFAGH_SCRYPT_N || 16384);
const scryptOpts = { N: SCRYPT_N, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 32, scryptOpts).toString('hex');
  return `${salt}:${hash}`;
}
const scryptAsync = util.promisify(crypto.scrypt);

/** تأیید همزمان (sync) — فقط برای اسکریپت‌های آفلاین مثل seed */
function verifyPassword(password, stored) {
  try {
    const [salt, hash] = String(stored).split(':');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), crypto.scryptSync(password, salt, 32, scryptOpts));
  } catch { return false; }
}

/** تأیید ناهمزمان — مسیر اصلی سرور؛ event-loop را بلاک نمی‌کند */
async function verifyPasswordAsync(password, stored) {
  try {
    const [salt, hash] = String(stored).split(':');
    const buf = await scryptAsync(password, salt, 32, scryptOpts);
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), buf);
  } catch { return false; }
}

module.exports = { db, initSchema, tx, hashPassword, verifyPassword, verifyPasswordAsync, DB_PATH, reopenIfReplaced };
