#!/usr/bin/env node
'use strict';
/**
 * تست بار سامانه — بارگذاری انتخاب واحد همزمان
 *   node scripts/stress.js seed 2000        ← ساخت ۲۰۰۰ دانشجوی تست (idempotent)
 *   node scripts/stress.js run 2000 250     ← N کاربر با همزمانی C
 * فازها: ورود → مشاهده لیست دروس → ثبت سبد ۷ واحدی
 */
const path = require('path');
const BASE = process.env.AFAGH_URL || `http://localhost:${process.env.PORT || 3000}`;
const mode = process.argv[2] || 'run';
const N = Number(process.argv[3] || 2000);
const C = Number(process.argv[4] || 250);
const NC_PREFIX = '91'; // کد ملی آزمون: 9100000001 …

if (mode === 'seed') {
  const { db, tx, hashPassword } = require(path.join(__dirname, '..', 'src', 'db'));
  const BS = db.prepare(`SELECT id FROM degree_level_configs WHERE code='BS'`).get().id;
  const major = db.prepare(`SELECT id FROM majors WHERE majorCode='412'`).get().id;
  const reg = db.prepare(`SELECT id FROM educational_regulations WHERE degreeLevelId=? AND effectiveFromYear=1403`).get(BS).id;
  const roleId = db.prepare(`SELECT id FROM roles WHERE code='STUDENT'`).get().id;
  const term = db.prepare(`SELECT * FROM academic_terms WHERE isCurrent=1`).get();
  const formula = db.prepare(`SELECT * FROM student_id_formulas WHERE degreeLevelId=? AND entryYear=1403`).get(BS);
  const startSeq = formula.currentSequence;
  // همه رمز یکسانند → یک هش مشترک (هزینه تأیید یکسان، ساخت seed سریع)
  const sharedHash = hashPassword('123456');
  let made = 0;
  const t0 = Date.now();
  tx(() => {
    // پاکسازی اجرای قبلی (idempotent)
    const old = db.prepare(`SELECT id FROM users WHERE nationalCode >= '9100000000' AND nationalCode < '9200000000'`).all().map(r => r.id);
    if (old.length) {
      db.prepare(`DELETE FROM financial_clearances WHERE studentId IN (SELECT id FROM students WHERE userId IN (${old.join(',')}))`).run();
      db.prepare(`DELETE FROM students WHERE userId IN (${old.join(',')})`).run();
      db.prepare(`DELETE FROM user_roles WHERE userId IN (${old.join(',')})`).run();
      db.prepare(`DELETE FROM sessions WHERE userId IN (${old.join(',')})`).run();
      db.prepare(`DELETE FROM users WHERE id IN (${old.join(',')})`).run();
      db.prepare(`DELETE FROM enrollments WHERE studentId NOT IN (SELECT id FROM students)`).run();
      db.prepare(`DELETE FROM student_ledger WHERE studentId NOT IN (SELECT id FROM students)`).run();
      console.log(`🧹 ${old.length} کاربر تست قبلی حذف شد`);
    }
    const iu = db.prepare(`INSERT INTO users (nationalCode, firstName, lastName, mobile, passwordHash, isActive) VALUES (?,?,?,?,?,1)`);
    const ir = db.prepare(`INSERT INTO user_roles (userId, roleId) VALUES (?,?)`);
    const is = db.prepare(`INSERT INTO students (userId, studentCode, majorId, degreeLevelId, regulationId, entryYear, quotaType, currentTermNo) VALUES (?,?,?,?,?,?,'NORMAL',2)`);
    const ifc = db.prepare(`INSERT INTO financial_clearances (studentId, termId, isCleared, clearedAt) VALUES (?,?,1, CURRENT_TIMESTAMP)`);
    const sid = db.prepare(`SELECT id FROM students WHERE userId=?`);
    for (let i = 1; i <= N; i++) {
      const nc = NC_PREFIX + String(i).padStart(8, '0');
      const r = iu.run(nc, `بار`, `آزمایشی ${i}`, `09910${String(i).padStart(7, '0')}`, sharedHash);
      ir.run(r.lastInsertRowid, roleId);
      const code = formula.formula
        .replace('{Year:2}', '03').replace('{DegreeCode:1}', '1').replace('{DegreeCode:2}', '1')
        .replace('{MajorCode:3}', '412').replace('{Seq:3}', String(startSeq + i).padStart(3, '0'));
      is.run(r.lastInsertRowid, code, major, BS, reg, 1403);
      ifc.run(sid.get(r.lastInsertRowid).id, term.id);
      made++;
    }
    db.prepare(`UPDATE student_id_formulas SET currentSequence=? WHERE id=?`).run(startSeq + N, formula.id);
    console.log(`✅ ${made} دانشجوی تست ساخته شد (${((Date.now() - t0) / 1000).toFixed(1)}s) — ترم: ${term.title}`);
  });
  // ظرفیت دروس عمومی دمو را باز کن تا همه ثبت‌نام موفق باشند
  db.prepare(`UPDATE course_offerings SET capacity = capacity + ? WHERE termId=? AND isActive=1`)
    .run(N + 100, term.id);
  console.log('✅ ظرفیت ارائه‌های ترم جاری برای تست افزایش یافت');
  process.exit(0);
}

/* ─────────── بارگذاری ─────────── */
let done = 0, errs = 0;

/** حالت data: ورود آرام (کش توکن) سپس آذرخش ۲۰۰۰تایی همزمان روی لیست دروس + ثبت سبد */
async function dataMode(N, C) {
  const { db } = require(path.join(__dirname, '..', 'src', 'db'));
  const term = db.prepare(`SELECT * FROM academic_terms WHERE isCurrent=1`).get();
  const offs = db.prepare(`
    SELECT o.id FROM course_offerings o JOIN courses c ON c.id=o.courseId
    WHERE o.termId=? AND o.groupNumber=1 AND c.code IN ('1112107','1112108','1112106')`).all(term.id).map(r => r.id);
  // پاکسازی ثبت‌نام‌های قبلی کاربران تست تا مسیر ثبت واقعی اندازه‌گیری شود
  db.prepare(`DELETE FROM enrollments WHERE studentId IN (SELECT s.id FROM students s JOIN users u ON u.id=s.userId WHERE u.nationalCode >= '9100000000' AND u.nationalCode < '9200000000')`).run();
  db.prepare(`DELETE FROM student_ledger WHERE studentId IN (SELECT s.id FROM students s JOIN users u ON u.id=s.userId WHERE u.nationalCode >= '9100000000' AND u.nationalCode < '9200000000')`).run();

  console.log(`⚡ حالت آذرخش: ورود آرام → سپس ${N} کاربر همزمان روی مسیر داده (C=${C})`);
  // فاز آماده‌سازی: ورود با همزمانی 100
  const tokens = [];
  let li = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: 100 }, async () => {
    while (true) {
      const i = ++li; if (i > N) break;
      const nc = NC_PREFIX + String(i).padStart(8, '0');
      const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nationalCode: nc, password: '123456' }) });
      const d = await r.json(); tokens[i] = d.token;
    }
  }));
  console.log(`   ورود پس‌زمینه: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  // آذرخش
  const st = { offerings: [], enroll: [] };
  let ok = 0, hard = 0, fail = 0;
  const t1 = Date.now();
  await Promise.all(Array.from({ length: N }, (_, k) => k + 1).slice(0, N).map(async i => {
    try {
      let t = Date.now();
      const or = await fetch(`${BASE}/api/offerings`, { headers: { Authorization: `Bearer ${tokens[i]}` } });
      await or.json(); st.offerings.push(Date.now() - t);
      t = Date.now();
      const er = await fetch(`${BASE}/api/enroll/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[i]}` }, body: JSON.stringify({ offeringIds: offs }) });
      const ed = await er.json(); st.enroll.push(Date.now() - t);
      if (ed.enrolled?.length === 3) ok++; else if (ed.hardErrors?.length) hard++; else fail++;
    } catch { fail++; }
  }));
  const wall = (Date.now() - t1) / 1000;
  const pct = (a, p) => a.length ? a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))] : 0;
  const line = (n, a) => console.log(`   ${n}: میانگین ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(0)}ms | p50 ${pct(a, .5)}ms | p95 ${pct(a, .95)}ms | p99 ${pct(a, .99)}ms | max ${Math.max(...a)}ms`);
  console.log('\n─────────────── نتیجه آذرخش ───────────────');
  console.log(`   ${N} درخواست همزمان در ${wall.toFixed(1)}s | توان ${Math.round(N / wall)}/ثانیه`);
  line('لیست دروس ', st.offerings);
  line('ثبت سبد   ', st.enroll);
  console.log(`   ✓ موفق ${ok} | خطای سخت ${hard} | خطا ${fail}`);
  console.log('────────────────────────────────────────────');
  process.exit(0);
}
const stats = { login: [], offerings: [], enroll: [] };
const outcomes = { ok: 0, hard: 0, soft: 0, fail: 0 };

async function main() {
  if (mode === 'data') return dataMode(N, C);
  const { db } = require(path.join(__dirname, '..', 'src', 'db'));
  // شناسه ارائه‌ها: زبان(3) + تربیت(2) + اندیشه(2) = ۷ واحد بدون پیش‌نیاز
  const term = db.prepare(`SELECT * FROM academic_terms WHERE isCurrent=1`).get();
  const offs = db.prepare(`
    SELECT o.id FROM course_offerings o JOIN courses c ON c.id=o.courseId
    WHERE o.termId=? AND o.groupNumber=1 AND c.code IN ('1112107','1112108','1112106')`).all(term.id).map(r => r.id);
  if (offs.length !== 3) throw new Error('ارائه‌های تست پیدا نشد: ' + offs.length);

  console.log(`⚡ تست بار: ${N} کاربر، همزمانی ${C} → ${BASE}`);
  console.log('   فاز ۱: ورود | فاز ۲: لیست دروس | فاز ۳: ثبت سبد ۷ واحدی\n');

  let idx = 0;
  async function worker() {
    while (true) {
      const i = ++idx;
      if (i > N) break;
      const nc = NC_PREFIX + String(i).padStart(8, '0');
      try {
        // فاز ۱ — ورود
        let t = Date.now();
        const lr = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nationalCode: nc, password: '123456' }) });
        const ld = await lr.json();
        stats.login.push(Date.now() - t);
        if (!lr.ok) { errs++; outcomes.fail++; continue; }
        const tok = ld.token;

        // فاز ۲ — لیست دروس (سنگین‌ترین خواندن)
        t = Date.now();
        const or = await fetch(`${BASE}/api/offerings`, { headers: { Authorization: `Bearer ${tok}` } });
        await or.json();
        stats.offerings.push(Date.now() - t);
        if (!or.ok) { errs++; outcomes.fail++; continue; }

        // فاز ۳ — ثبت سبد
        t = Date.now();
        const er = await fetch(`${BASE}/api/enroll/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }, body: JSON.stringify({ offeringIds: offs }) });
        const ed = await er.json();
        stats.enroll.push(Date.now() - t);
        if (ed.enrolled?.length === 3) outcomes.ok++;
        else if (ed.hardErrors?.length) outcomes.hard++;
        else if (ed.softErrors?.length || ed.pendingCouncil?.length) outcomes.soft++;
        else { outcomes.fail++; errs++; }
      } catch (e) {
        errs++; outcomes.fail++;
      }
      done++;
      if (done % 400 === 0) console.log(`   … ${done}/${N}`);
    }
  }
  const t0 = Date.now();
  await Promise.all(Array.from({ length: C }, worker));
  const wall = (Date.now() - t0) / 1000;

  const pct = (arr, p) => arr.length ? arr.sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(p * arr.length))] : 0;
  const line = (name, arr) => {
    if (!arr.length) return console.log(`   ${name}: —`);
    const sum = arr.reduce((a, b) => a + b, 0);
    console.log(`   ${name}: میانگین ${(sum / arr.length).toFixed(0)}ms | p50 ${pct(arr, .5)}ms | p95 ${pct(arr, .95)}ms | p99 ${pct(arr, .99)}ms | max ${Math.max(...arr)}ms`);
  };
  console.log('\n─────────────── نتیجه ───────────────');
  console.log(`   کاربران: ${N} | همزمانی: ${C} | زمان کل: ${wall.toFixed(1)}s | توان کل: ${(N / wall).toFixed(1)} کاربر/ثانیه`);
  line('ورود      ', stats.login);
  line('لیست دروس ', stats.offerings);
  line('ثبت سبد   ', stats.enroll);
  console.log(`   نتیجه ثبت: ✓ موفق ${outcomes.ok} | خطای سخت ${outcomes.hard} | نرم/شورا ${outcomes.soft} | خطای شبکه ${outcomes.fail}`);
  console.log('─────────────────────────────────────');
  process.exit(0);
}
main().catch(e => { console.error('⛔', e); process.exit(1); });
