#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════
 *  همگام‌سازی «برنامهٔ کلاسی» یک نیمسال از فایل سما (برنامه14051-8-24.txt)
 *
 *  فایل: cp1256 (ویندوز-۱۲۵۶)، جداکننده تب، ۱۳ ستون:
 *    کد_درس | نام_درس | نیمسال | گروه_درس | ساعت_شروع | ساعت_پایان |
 *    استاد | کلاس | روز | هفته | تاریخ امتحان | ساعت امتحان | تعداد_ثبت‌نامی
 *
 *  قرارداد:
 *   • منبعِ حقیقت = همین فایل. برنامهٔ کلاسیِ آن نیمسال با فایل «هم‌تراز»
 *     می‌شود: ردیف یکسان دست‌نخورده، تغییر اتاق/ساعت با UPDATE، ردیف تازه
 *     INSERT و ردیف مرده DELETE. ⇒ اجرای دوباره صفر تغییر (idempotent) و
 *     هیچ ردیف تکراری‌ای باقی نمی‌ماند.
 *   • جابه‌جاییِ درس از یک کلاس به کلاس دیگر = همان ردیف با roomId جدید
 *     (UPDATE)، نه درج ردیف تازه.
 *   • اگر نامِ کلاسی در دیتابیس نباشد و --create-rooms داده شود، ابتدا
 *     classroom ساخته می‌شود و بعد برنامه روی آن منتقل می‌شود.
 *   • امتحان: examDate شمسی به‌صورت «تاریخ شمسی در ستون date» ذخیره می‌شود
 *     (قرارداد examDateColumnValue در src/lib/shamsi.ts)، مدت ۲ ساعت.
 *   • هفتهٔ زوج/فرد در جدول schedules ستون ندارد ⇒ CLASS ذخیره و شمرده
 *     می‌شود (محدودیت مدل داده، نه باگ ورود).
 *
 *  استفاده:
 *    node scripts/import-class-schedule.mjs --file <path> --uni 1
 *    node scripts/import-class-schedule.mjs --file <path> --uni 1 \
 *         --create-rooms --apply --backup /tmp/sched-backup.jsonl
 * ══════════════════════════════════════════════════════════════════════
 */
import { readFileSync, existsSync, writeFileSync, appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// pg را با require می‌گیریم تا NODE_PATH=/app/node_modules در کانتینر کار کند
const req = createRequire(import.meta.url);
const { Pool } = req('pg');

// ── args ──
const argv = process.argv.slice(2);
const A = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    const k = argv[i].slice(2);
    A[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
  }
}
const FILE = A.file;
const UNI = Number(A.uni || 1);
const APPLY = A.apply === 'true';
const BACKUP = A.backup || '';
const CREATE_ROOMS = A['create-rooms'] === 'true';
const KEEP_EXTRAS = A['keep-extras'] === 'true';
const REPORT = A.report || '';
const dbUrl = A.db || process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db';

if (!FILE) { console.error('استفاده: --file <مسیر فایل برنامه> [--uni 1] [--apply --backup x.jsonl]'); process.exit(1); }
if (APPLY && !BACKUP) { console.error('حالت --apply نیازمند --backup <فایل.jsonl> است.'); process.exit(1); }
if (!existsSync(FILE)) { console.error(`فایل یافت نشد: ${FILE}`); process.exit(1); }

const pool = new Pool({ connectionString: dbUrl, max: 3 });
const q = async (t, p) => (await pool.query(t, p)).rows;

// ── نرمال‌سازی فارسی ──
const fa = (s) => String(s ?? '')
  .replace(/[ىي]/g, 'ی').replace(/ك/g, 'ک')
  .replace(/[\u200c\u200f\u200e]/g, ' ')
  .replace(/\s+/g, ' ').trim();
const digits = (s) => String(s ?? '')
  .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
const roomKey = (s) => fa(s).replace(/[^0-9A-Za-zآ-ی]/g, '').toLowerCase();

// ⚠️ قرارداد ستون schedules.examDate در این اپ «تاریخ شمسیِ ذخیره‌شده در ستون date»
// است (مثل 1405-10-28)، نه میلادی — همان کاری که examDateColumnValue() در
// src/lib/shamsi.ts می‌کند. پس اینجا تبدیل نمی‌کنیم؛ فقط اعتبارسنجی و صفرچسبانی.
function jalLiteral(s) {
  const m = digits(s).match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (!m) return null;
  const jy = +m[1], jm = +m[2], jd = +m[3];
  if (jy < 1300 || jy > 1500 || jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
  return `${jy}-${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}`;
}

// ── ساعت: '1300' → '13:00' | '940' → '09:40' | '0' → null ──
function hhmm(v) {
  let s = digits(v).replace(/[^0-9]/g, '');
  if (!s || s.length <= 2) return null;
  s = s.padStart(4, '0');
  const h = +s.slice(0, 2), m = +s.slice(2, 4);
  if (h > 23 || m > 59 || (h === 0 && m === 0)) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function addHours(t, h) {
  const [hh, mm] = t.split(':').map(Number);
  const tot = hh * 60 + mm + h * 60;
  return `${String(Math.floor(tot / 60) % 24).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
}
function examHHMM(v) {
  const s = digits(v).trim();
  const m = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m) {
    const h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  }
  return hhmm(s);
}

// ⚠️ نام روز در فایل هم با فاصله می‌آید («سه شنبه») و هم با نیم‌فاصله («سه‌شنبه»)
// ⇒ کلید و مقدار هر دو یکسان نرمال می‌شوند (حذف فاصله/نیم‌فاصله)، وگرنه هیچ روزی
// تطبیق نمی‌خورد و همهٔ ردیف‌ها «بدون روز» ثبت می‌شوند.
const DAY_NAMES = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
const dayNorm = (s) => fa(s).replace(/[\s\u200c\u200f\u200e]/g, '');
const DAY_IDX = new Map(DAY_NAMES.map((n, i) => [dayNorm(n), i]));
const dayOf = (s) => DAY_IDX.get(dayNorm(s)) ?? null;

// ── خواندن فایل ──
function readText(p) {
  const buf = readFileSync(p);
  const t = buf.toString('utf8');
  if (!t.includes('\uFFFD')) return t;
  return new TextDecoder('windows-1256').decode(buf);
}
const HEADER_MAP = {
  'کد_درس': 'code', 'نام_درس': 'name', 'نیمسال': 'term', 'گروه_درس': 'group',
  'ساعت_شروع': 'start', 'ساعت_پایان': 'end', 'استاد': 'prof', 'کلاس': 'room',
  'روز': 'day', 'هفته': 'week', 'تاریخ امتحان': 'exdate', 'ساعت امتحان': 'extime',
  'تعداد_ثبت_نامی': 'enrolled',
};
function parseFile(p) {
  const lines = readText(p).split(/\r?\n/).filter((l) => l.replace(/[\t\s]/g, '') !== '');
  if (!lines.length) throw new Error('فایل خالی است');
  const head = lines[0].split('\t').map(fa);
  const idx = {};
  head.forEach((h, i) => { const k = HEADER_MAP[h]; if (k) idx[k] = i; });
  if (idx.code == null || idx.term == null) throw new Error(`هدر فایل شناسایی نشد: ${head.join(' | ')}`);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split('\t');
    if (c.length < 4) continue;
    const g = (k) => (idx[k] == null ? '' : String(c[idx[k]] ?? '').trim());
    rows.push({
      code: digits(g('code')).trim(),
      name: fa(g('name')),
      term: digits(g('term')).trim(),
      group: digits(g('group')).trim() || '1',
      start: g('start'), end: g('end'),
      prof: fa(g('prof')), room: fa(g('room')),
      day: fa(g('day')), week: fa(g('week')),
      exdate: g('exdate'), extime: g('extime'),
      enrolled: Number(digits(g('enrolled')) || 0),
    });
  }
  return rows;
}

async function main() {
  const F = parseFile(FILE);
  const terms = [...new Set(F.map((r) => r.term))];
  console.log(`فایل: ${FILE}`);
  console.log(`ردیف داده: ${F.length} | نیمسال: ${terms.join(',')}`);
  if (terms.length !== 1) { console.error(`فایل باید یک نیمسال باشد؛ ${terms.length} نیمسال یافت شد.`); process.exit(1); }
  const termCode = terms[0];

  const term = (await q(`SELECT id, "termCode", title FROM academic_terms WHERE "termCode" = $1 AND "universityId" = $2`, [termCode, UNI]))[0];
  if (!term) { console.error(`نیمسال ${termCode} برای دانشگاه ${UNI} در دیتابیس نیست.`); process.exit(1); }
  console.log(`نیمسال: ${term.termCode} (id=${term.id}) — ${term.title}`);

  // ── ارائه‌ها ──
  const offs = await q(
    `SELECT o.id, c.code, o."groupNumber" AS grp, o."universityId" AS uni
       FROM course_offerings o JOIN courses c ON c.id = o."courseId"
      WHERE o."termId" = $1`, [term.id]);
  const exact = new Map();
  const byCode = new Map();
  for (const o of offs) {
    const code = String(o.code).trim();
    exact.set(`${code}|${o.grp}`, o);
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(o);
  }
  const fileGroupsByCode = new Map();
  for (const r of F) {
    if (!fileGroupsByCode.has(r.code)) fileGroupsByCode.set(r.code, new Set());
    fileGroupsByCode.get(r.code).add(r.group);
  }
  console.log(`ارائه‌های نیمسال: ${offs.length}`);

  const st = { exact: 0, byCode: 0, unmatched: 0 };
  const byCodeList = [];
  const unmatched = [];
  for (const r of F) {
    const o = exact.get(`${r.code}|${r.group}`);
    if (o) { r.oid = o.id; r.uni = o.uni; st.exact++; continue; }
    const cands = byCode.get(r.code) || [];
    const fgroups = fileGroupsByCode.get(r.code) || new Set();
    if (cands.length === 1 && fgroups.size === 1) {
      r.oid = cands[0].id; r.uni = cands[0].uni; st.byCode++;
      byCodeList.push({ code: r.code, name: r.name, fileGroup: r.group, dbGroup: cands[0].grp });
      continue;
    }
    st.unmatched++;
    unmatched.push({
      code: r.code, name: r.name, group: r.group, day: r.day,
      time: `${r.start}-${r.end}`, prof: r.prof,
      dbGroups: cands.map((c) => c.grp).sort((a, b) => a - b),
    });
  }
  console.log(`تطبیق: دقیق ${st.exact} | با کد (گروه متفاوت) ${st.byCode} | بدون ارائه ${st.unmatched}`);

  // ── کلاس‌های ناموجود ──
  const rooms = await q(`SELECT id, name FROM classrooms WHERE "universityId" = $1 OR "universityId" IS NULL`, [UNI]);
  const roomByName = new Map();
  for (const r of rooms) {
    const k = roomKey(r.name);
    if (!roomByName.has(k)) roomByName.set(k, []);
    roomByName.get(k).push(r);
  }
  const roomId = new Map();
  const newRooms = [];
  let ph = 0;
  for (const r of F) {
    if (roomId.has(r.room)) continue;
    if (!r.room || r.room === 'نامشخص') { roomId.set(r.room, null); continue; }
    const cand = roomByName.get(roomKey(r.room));
    if (cand && cand.length) { roomId.set(r.room, cand[0].id); continue; }
    const maxEnr = Math.max(0, ...F.filter((x) => x.room === r.room).map((x) => x.enrolled));
    newRooms.push({ name: r.room, capacity: Math.max(30, maxEnr) });
    roomId.set(r.room, --ph); // placeholder منفی تا ساخت
  }
  console.log(`اتاق‌های فایل: ${new Set(F.map((r) => r.room)).size} | ناموجود: ${newRooms.length}${newRooms.length ? ' → ' + newRooms.map((r) => `${r.name} (ظرفیت ${r.capacity})`).join(' · ') : ''}`);

  // ── ردیف‌های مطلوب ──
  const want = { CLASS: [], EXAM: [] };
  const issues = { noTime: 0, noDay: 0, parity: 0, badExamDate: 0, noExam: 0 };
  for (const r of F) {
    if (r.oid == null) continue;
    if (!r.day || r.day === 'نامشخص') issues.noDay++;
    if (/زوج|فرد/.test(r.week)) issues.parity++;
    const s = hhmm(r.start), e = hhmm(r.end);
    if (!s || !e) {
      issues.noTime++;
      want.CLASS.push({ oid: r.oid, dow: null, st: '00:00', et: '00:00', rid: null, src: r });
      continue;
    }
    want.CLASS.push({ oid: r.oid, dow: dayOf(r.day), st: s, et: e, rid: roomId.get(r.room) ?? null, roomName: r.room, src: r });

    const iso = jalLiteral(r.exdate);
    if (!r.exdate && !r.extime) { issues.noExam++; continue; }
    const t = examHHMM(r.extime);
    if (!iso || !t) { issues.badExamDate++; continue; }
    want.EXAM.push({ oid: r.oid, exdate: iso, st: t, et: addHours(t, 2), rid: null, src: r });
  }
  const dedupe = (list, keyf) => {
    const seen = new Set(); const out = []; let dropped = 0;
    for (const x of list) { const k = keyf(x); if (seen.has(k)) { dropped++; continue; } seen.add(k); out.push(x); }
    return { out, dropped };
  };
  const c1 = dedupe(want.CLASS, (x) => `${x.oid}|${x.dow}|${x.st}|${x.et}|${x.rid}`);
  const e1 = dedupe(want.EXAM, (x) => `${x.oid}|${x.exdate}|${x.st}`);
  console.log(`مطلوب: CLASS ${c1.out.length} (تکراری داخل فایل ${c1.dropped}) | EXAM ${e1.out.length} (تکراری ${e1.dropped})`);
  console.log(`نکته: بدون ساعت ${issues.noTime} | بدون روز ${issues.noDay} | هفته زوج/فرد ${issues.parity} | تاریخ امتحان نامعتبر ${issues.badExamDate}`);

  // ── وضعیت فعلی ──
  const cur = await q(
    `SELECT s.id, s."offeringId" AS oid, s."scheduleType" AS type, s."dayOfWeek" AS dow,
            to_char(s."startTime",'HH24:MI') AS st, to_char(s."endTime",'HH24:MI') AS et,
            s."roomId" AS rid, to_char(s."examDate",'YYYY-MM-DD') AS exdate
       FROM schedules s JOIN course_offerings o ON o.id = s."offeringId"
      WHERE o."termId" = $1`, [term.id]);
  const curBy = { CLASS: new Map(), EXAM: new Map() };
  for (const s of cur) {
    const k = s.type === 'EXAM' ? 'EXAM' : 'CLASS';
    if (!curBy[k].has(s.oid)) curBy[k].set(s.oid, []);
    curBy[k].get(s.oid).push(s);
  }
  console.log(`فعلی: ${cur.length} ردیف (${[...curBy.CLASS.values()].flat().length} CLASS / ${[...curBy.EXAM.values()].flat().length} EXAM)`);

  // ── ساخت اتاق‌ها پیش از محاسبهٔ تغییرات ──
  const client = await pool.connect();
  const madeRooms = [];
  try {
    await client.query('BEGIN');
    if (CREATE_ROOMS) {
      for (const r of newRooms) {
        const ins = await client.query(
          `INSERT INTO classrooms (name, capacity, "roomType", "universityId", "isActive")
           VALUES ($1,$2,'CLASSROOM',$3,1) RETURNING id`, [r.name, r.capacity, UNI]);
        const id = ins.rows[0].id;
        madeRooms.push({ ...r, id });
        roomId.set(r.name, id);
        if (APPLY) appendFileSync(BACKUP, JSON.stringify({ entity: 'classroom', inserted: { id, ...r } }) + '\n');
      }
      // جای‌گذاری id واقعی در ردیف‌های مطلوب
      for (const x of want.CLASS) {
        if (x.rid != null && x.rid < 0 && x.roomName) x.rid = roomId.get(x.roomName) ?? null;
      }
    }

    // ── برنامهٔ تغییرات ──
    const plan = { insert: [], update: [], delete: [] };
    const normDay = (d) => (d == null || d < 0 ? null : d);
    const eqDay = (a, b) => normDay(a) === normDay(b);
    const wantByOid = { CLASS: new Map(), EXAM: new Map() };
    for (const x of c1.out) {
      if (!wantByOid.CLASS.has(x.oid)) wantByOid.CLASS.set(x.oid, []);
      wantByOid.CLASS.get(x.oid).push(x);
    }
    for (const x of e1.out) {
      if (!wantByOid.EXAM.has(x.oid)) wantByOid.EXAM.set(x.oid, []);
      wantByOid.EXAM.get(x.oid).push(x);
    }

    const moves = [];
    function reconcile(kind, desired, existing) {
      const rest = existing.slice();
      const take = (pred) => {
        for (let i = 0; i < rest.length; i++) if (pred(rest[i])) { const r = rest[i]; rest.splice(i, 1); return r; }
        return null;
      };
      const l1 = [];
      for (const d of desired) {
        const m = take((e) => eqDay(e.dow, d.dow) && e.st === d.st && e.et === d.et);
        if (!m) { l1.push(d); continue; }
        const roomChanged = (m.rid ?? null) !== (d.rid ?? null);
        const dayNeg = m.dow != null && m.dow < 0;
        if (roomChanged || dayNeg) {
          plan.update.push({
            id: m.id, oid: d.oid, kind, full: d,
            field: roomChanged ? 'roomId' : 'dayNull', roomFrom: m.rid, roomTo: d.rid,
          });
          if (roomChanged) moves.push({ code: d.src.code, group: d.src.group, name: d.src.name, day: d.src.day, time: `${d.st}-${d.et}`, from: m.rid, to: d.rid, toName: d.roomName || null });
        }
      }
      const l2 = [];
      for (const d of l1) {
        const m = take((e) => eqDay(e.dow, d.dow) && e.st === d.st);
        if (!m) { l2.push(d); continue; }
        plan.update.push({ id: m.id, oid: d.oid, kind, full: d, field: 'time', before: `${m.st}-${m.et}` });
      }
      const l3 = [];
      for (const d of l2) {
        const m = take((e) => eqDay(e.dow, d.dow));
        if (!m) { l3.push(d); continue; }
        plan.update.push({ id: m.id, oid: d.oid, kind, full: d, field: 'time', before: `${m.st}-${m.et}` });
      }
      for (const d of l3) plan.insert.push({ kind, ...d });
      for (const e of rest) plan.delete.push({ kind, row: e });
    }

    // امتحان: کلید = تاریخِ امتحان (+ ساعت شروع)
    function reconcileExam(desired, existing) {
      const rest = existing.slice();
      const take = (pred) => {
        for (let i = 0; i < rest.length; i++) if (pred(rest[i])) { const r = rest[i]; rest.splice(i, 1); return r; }
        return null;
      };
      const l1 = [];
      for (const d of desired) {
        const m = take((e) => e.exdate === d.exdate && e.st === d.st && e.et === d.et);
        if (!m) { l1.push(d); continue; }
        if ((m.rid ?? null) !== (d.rid ?? null)) {
          plan.update.push({ id: m.id, oid: d.oid, kind: 'EXAM', full: d, field: 'roomId' });
        }
      }
      const l2 = [];
      for (const d of l1) {
        const m = take((e) => e.exdate === d.exdate && e.st === d.st);
        if (!m) { l2.push(d); continue; }
        plan.update.push({ id: m.id, oid: d.oid, kind: 'EXAM', full: d, field: 'examTime', before: `${m.st}-${m.et}` });
      }
      for (const d of l2) plan.insert.push({ kind: 'EXAM', ...d });
      for (const e of rest) plan.delete.push({ kind: 'EXAM', row: e });
    }

    const allOids = new Set([...wantByOid.CLASS.keys(), ...wantByOid.EXAM.keys(), ...curBy.CLASS.keys(), ...curBy.EXAM.keys()]);
    for (const oid of allOids) {
      reconcile('CLASS', wantByOid.CLASS.get(oid) || [], curBy.CLASS.get(oid) || []);
      // ⚠️ امتحان با «تاریخ» شناسایی می‌شود نه روز هفته؛ اگر تاریخ عوض شده باشد
      // ردیف قدیمی حذف و ردیف تازه درج می‌شود (وگرنه تاریخِ کهنه باقی می‌ماند).
      reconcileExam(wantByOid.EXAM.get(oid) || [], curBy.EXAM.get(oid) || []);
    }
    if (KEEP_EXTRAS) {
      const before = plan.delete.length;
      plan.delete = plan.delete.filter((d) => wantByOid[d.kind].has(d.row.oid));
      console.log(`--keep-extras: ${before - plan.delete.length} ردیفِ ارائه‌های غایب از فایل حفظ شد.`);
    }

    const delExtra = plan.delete.filter((d) => !wantByOid[d.kind].has(d.row.oid));
    const delDup = plan.delete.filter((d) => wantByOid[d.kind].has(d.row.oid));
    console.log(`\n── برنامهٔ تغییرات ──
  اتاق ساخته‌شده: ${madeRooms.length}
  درج:          ${plan.insert.length}
  به‌روزرسانی:   ${plan.update.length}  (جابه‌جایی اتاق: ${plan.update.filter((u) => u.field === 'roomId').length})
  حذف:          ${plan.delete.length}  (مازاد/تکراری همان ارائه: ${delDup.length} | ارائه‌های خارج از برنامه: ${delExtra.length})`);

    const offById = new Map(offs.map((o) => [o.id, o]));
    const delExtraClass = plan.delete.filter((d) => d.kind === 'CLASS' && !wantByOid.CLASS.has(d.row.oid));
    const delExtraExam = plan.delete.filter((d) => d.kind === 'EXAM' && !wantByOid.EXAM.has(d.row.oid));
    // ارائه‌ای که «کلِ» برنامه‌اش می‌رود = نه کلاس دارد نه امتحان در فایل
    const goneOids = [...new Set([...delExtraClass, ...delExtraExam].map((d) => d.row.oid))]
      .filter((oid) => !wantByOid.CLASS.has(oid) && !wantByOid.EXAM.has(oid));
    const orphanOffers = goneOids
      .map((oid) => ({
        oid, code: offById.get(oid)?.code, grp: offById.get(oid)?.grp,
        cls: delExtraClass.filter((d) => d.row.oid === oid).length,
        exm: delExtraExam.filter((d) => d.row.oid === oid).length,
      }))
      .sort((a, b) => String(a.code).localeCompare(String(b.code)));
    const examOnly = [...new Set(delExtraExam.map((d) => d.row.oid))].filter((oid) => wantByOid.CLASS.has(oid));
    console.log(`  حذف امتحانِ ارائه‌هایی که در فایل امتحان ندارند: ${delExtraExam.length} ردیف (${examOnly.length} ارائه)`);
    if (orphanOffers.length) {
      console.log(`  ارائه‌هایی که کل برنامه‌شان حذف می‌شود (${orphanOffers.length}):`);
      for (const o of orphanOffers.slice(0, 40)) console.log(`    ${o.code} g${o.grp} → کلاس ${o.cls} / امتحان ${o.exm}`);
    }
    if (moves.length) {
      console.log(`  جابه‌جایی اتاق (${moves.length}) نمونه:`);
      for (const m of moves.slice(0, 12)) console.log(`    ${m.code} g${m.group} ${m.day} ${m.time}: ${m.from ?? '—'} → ${m.toName || m.to}`);
    }

    if (REPORT) {
      writeFileSync(REPORT, JSON.stringify({
        file: FILE, term: termCode, termId: term.id, uni: UNI, applied: APPLY,
        rows: F.length, match: st, byCode: byCodeList, unmatched,
        newRooms: madeRooms, moves, orphanOffers,
        plan: {
          insert: plan.insert.length, update: plan.update.length, delete: plan.delete.length,
          delDup: delDup.length, delExtraClass: delExtraClass.length, delExtraExam: delExtraExam.length,
        },
        issues,
      }, null, 2));
      console.log(`گزارش نوشته شد: ${REPORT}`);
    }

    if (!APPLY) {
      console.log('\n[DRY] تغییری نوشته نشد (تراکنش ROLLBACK).');
      await client.query('ROLLBACK');
      return;
    }

    // ── بکاپ ──
    for (const d of plan.delete) appendFileSync(BACKUP, JSON.stringify({ entity: 'schedule', deleted: d.row }) + '\n');
    for (const u of plan.update) appendFileSync(BACKUP, JSON.stringify({ entity: 'schedule', before: cur.find((c) => c.id === u.id), after: { dayOfWeek: u.full.dow, startTime: u.full.st, endTime: u.full.et, roomId: u.full.rid } }) + '\n');

    let deleted = 0, updated = 0, inserted = 0;
    for (const d of plan.delete) { await client.query('DELETE FROM schedules WHERE id = $1', [d.row.id]); deleted++; }
    for (const u of plan.update) {
      if (u.kind === 'EXAM') {
        await client.query(
          `UPDATE schedules SET "examDate"=$2, "startTime"=$3, "endTime"=$4, "roomId"=$5 WHERE id=$1`,
          [u.id, u.full.exdate, u.full.st, u.full.et, u.full.rid]);
      } else if (u.field === 'roomId') {
        await client.query('UPDATE schedules SET "roomId" = $2 WHERE id = $1', [u.id, u.full.rid]);
      } else if (u.field === 'dayNull') {
        await client.query('UPDATE schedules SET "dayOfWeek" = NULL WHERE id = $1', [u.id]);
      } else {
        await client.query(
          `UPDATE schedules SET "dayOfWeek"=$2, "startTime"=$3, "endTime"=$4, "roomId"=$5 WHERE id=$1`,
          [u.id, u.full.dow, u.full.st, u.full.et, u.full.rid]);
      }
      updated++;
    }
    for (const x of plan.insert) {
      const ins = x.kind === 'CLASS'
        ? await client.query(
          `INSERT INTO schedules ("offeringId","scheduleType","dayOfWeek","startTime","endTime","roomId","universityId")
           VALUES ($1,'CLASS',$2,$3,$4,$5,$6) RETURNING id`, [x.oid, x.dow, x.st, x.et, x.rid, x.src.uni ?? UNI])
        : await client.query(
          `INSERT INTO schedules ("offeringId","scheduleType","examDate","startTime","endTime","roomId","universityId")
           VALUES ($1,'EXAM',$2,$3,$4,$5,$6) RETURNING id`, [x.oid, x.exdate, x.st, x.et, x.rid, x.src.uni ?? UNI]);
      appendFileSync(BACKUP, JSON.stringify({ entity: 'schedule', insertedId: ins.rows[0].id }) + '\n');
      inserted++;
    }
    await client.query('COMMIT');
    console.log(`\n✓ اعمال شد: اتاق ${madeRooms.length} | درج ${inserted} | به‌روزرسانی ${updated} | حذف ${deleted}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ROLLBACK:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
