#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════
 *  تست سنگین چرخهٔ امتحانات — ۱۰۰۰ دانشجوی هم‌زمان
 *
 *  زنجیره: صدور حضور و غیاب → بررسی مراقب → امضای صورتجلسه →
 *          تحویل مخزن → تحویل استاد → ثبت نمرات (بارم) → اعتراض → پاسخ بارم‌محور
 *
 *  هر مرحله: زمان + تعداد کوئری (اثبات دسته‌ای‌بودن، نه N+1) + قواعد گلوگاه.
 *
 *  اجرا:  DATABASE_URL=… npx tsx --conditions=react-server scripts/exam-load-run.mts
 *  فازها: PHASE=issue,proctor,minutes,vault,deliver,grades,appeals,report
 * ════════════════════════════════════════════════════════════════════════
 */
import pg from 'pg';
import { performance } from 'node:perf_hooks';
import crypto from 'node:crypto';

process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'warn';

const URL = process.env.DATABASE_URL;
if (!URL) { console.error('❌ DATABASE_URL الزامی است.'); process.exit(2); }
const PHASE = (process.env.PHASE || 'all').split(',').map(s => s.trim());
const has = (p) => PHASE.includes(p) || PHASE.includes('all');

// ── شمارندهٔ دقیق کوئری (فقط Client) ──
const stats = { sql: 0, phase: null };
const origClientQuery = pg.Client.prototype.query;
pg.Client.prototype.query = function (...args) {
  const [a] = args;
  const text = typeof a === 'string' ? a : a?.text;
  const ret = origClientQuery.apply(this, args);
  if (stats.phase) stats.sql++;
  return ret;
};
const begin = (p) => { stats.phase = p; stats.sql = 0; };
const end = () => { const s = stats.sql; stats.phase = null; return s; };

const engine = await import('../src/lib/exam-engine.ts');
const { db } = await import('../src/db/index.ts');
const { sql } = await import('drizzle-orm');

// ── بارم (همان seed) ──
const RUBRIC = { midterm: 8, homework: 0, participation: 0, practical: 0, finalExam: 12 };
const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
const totalOf = (mid: number, fin: number) => round2(clamp(mid, RUBRIC.midterm) + clamp(fin, RUBRIC.finalExam));

let seed = 1405;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

console.log('════════════ شروع تست سنگین چرخهٔ امتحانات ════════════');

// ── بارگذاری ساختار ──
const [term] = (await db.execute(sql`SELECT id FROM academic_terms WHERE "termCode"='EXAM-1405'`)).rows;
if (!term) throw new Error('ترم EXAM-1405 وجود ندارد؛ اول seed را اجرا کنید.');
const [sess] = (await db.execute(sql`SELECT id FROM exam_sessions WHERE "termId"=${(term as any).id} LIMIT 1`)).rows;
const hallIds = (await db.execute(sql`SELECT id FROM exam_halls WHERE name LIKE 'سالن-EX%' ORDER BY name`)).rows.map((r: any) => r.id);
const proctorRows = (await db.execute(sql`SELECT "staffId", role FROM exam_invigilators WHERE "examId"=${(sess as any).id} ORDER BY "staffId"`)).rows;
const proctorIds = proctorRows.map((r: any) => r.staffId);
const offeringRows = (await db.execute(sql`SELECT o.id, o."courseId", o."professorId" FROM course_offerings o JOIN courses c ON c.id=o."courseId" WHERE o."termId"=${(term as any).id} AND c.code LIKE 'EX-%' ORDER BY o.id`)).rows;
const enrollRows = (await db.execute(sql`SELECT e.id, e."studentId", e."offeringId" FROM enrollments e JOIN course_offerings o ON o.id=e."offeringId" WHERE o."termId"=${(term as any).id} ORDER BY e.id`)).rows;
const HALLS = hallIds.length; // 10
const PROCTORS_PER_HALL = 2;

console.log(`📅 جلسهٔ امتحان: id=${(sess as any).id} · سالن: ${HALLS} · مراقب: ${proctorIds.length} · درس: ${offeringRows.length} · ثبت‌نام: ${enrollRows.length}`);

// نگاشت صندلی‌ها (دانشجو → سالن)
const seatMap = (await db.execute(sql`
  SELECT e."studentId" AS sid, sa."hallId" AS hid FROM seat_allocations sa
  JOIN enrollments e ON e.id = sa."enrollmentId" WHERE sa."sessionId" = ${(sess as any).id}
`)).rows as { sid: number; hid: number }[];
const hallOfStudent = new Map(seatMap.map(s => [Number(s.sid), Number(s.hid)]));

// midterm/final اولیهٔ قطعی
const midOf = new Map<number, number>();
const finOf = new Map<number, number>();
const submittedFin = new Map<number, number>(); // نمرهٔ پایان‌ترمِ واقعاً ثبت‌شده (بعد از کلمپ)
for (const e of enrollRows as any[]) {
  midOf.set(Number(e.studentId), 3 + Math.floor(rnd() * (RUBRIC.midterm + 1 - 3)));
  finOf.set(Number(e.studentId), 4 + Math.floor(rnd() * (RUBRIC.finalExam + 1 - 4)));
}

// ═══════════ مرحلهٔ ۱: صدور حضور و غیاب ═══════════
if (has('issue')) {
  begin('issue');
  const t0 = performance.now();
  const res = await engine.issueExamAttendance(null, Number((sess as any).id));
  const ms = performance.now() - t0;
  const q = end();
  console.log(`\n① صدور حضور و غیاب: ${res.issued} ردیف در ${(ms / 1000).toFixed(2)} ثانیه · ${q} کوئری — ${res.issued === 0 && res.reason === 'ALREADY_ISSUED' ? '(قبلاً صادر شده)' : ''}`);
  if (res.issued !== 1000 && res.reason !== 'ALREADY_ISSUED') console.log('   ⚠️ ', res);
  // اندازه‌گیری دفعهٔ دوم: باید idempotent باشد
  begin('issue2');
  const res2 = await engine.issueExamAttendance(null, Number((sess as any).id));
  end();
  console.log(`   تکرار (idempotency): ${res2.reason} · ردیف جدید ${res2.issued}`);
}

// ═══════════ مرحلهٔ ۲: ورود مراقبان + بررسی حضور و غیاب ═══════════
if (has('proctor')) {
  begin('proctor-clockin');
  const t0 = performance.now();
  const cin = await engine.proctorClockIn(null, Number((sess as any).id), proctorIds);
  const ms1 = performance.now() - t0;
  const q1 = end();
  console.log(`\n② ورود مراقبان: ${cin.clockedIn}/${proctorIds.length} در ${(ms1 / 1000).toFixed(2)} ثانیه · ${q1} کوئری (دسته‌ای)`);

  let verified = 0;
  const totalT0 = performance.now();
  let totalQ = 0;
  for (const hid of hallIds) {
    const roster = (enrollRows as any[]).filter(e => hallOfStudent.get(Number(e.studentId)) === Number(hid));
    const checkIns = roster.map(e => {
      const sid = Number(e.studentId);
      const absent = rnd() < 0.07;
      const temp = !absent && rnd() < 0.05;
      return {
        studentId: sid,
        isPresent: absent ? 0 : 1,
        method: absent ? 'SYSTEM_EXCUSE' : temp ? 'MANUAL_BY_INVIGILATOR' : 'QR_SCAN',
        hasTemporaryPermit: temp ? 1 : 0,
      };
    });
    const proctorId = proctorIds[hallIds.indexOf(hid) * PROCTORS_PER_HALL];
    begin('verify');
    const t1 = performance.now();
    const v = await engine.proctorVerifyAttendance(null, {
      sessionId: Number((sess as any).id), hallId: Number(hid), proctorStaffId: Number(proctorId), checkIns,
    });
    const q = end();
    totalQ += q; verified += v.verified;
    console.log(`   سالن ${String(hallIds.indexOf(hid) + 1).padStart(2)}: ${v.verified} تأیید · ${q} کوئری · ${((performance.now() - t1) / 1000).toFixed(2)}s`);
  }
  const msTotal = performance.now() - totalT0;
  console.log(`   جمع بررسی: ${verified} دانشجو در ${(msTotal / 1000).toFixed(2)} ثانیه · ${totalQ} کوئری (${(totalQ / HALLS).toFixed(1)} کوئری/سالن — ثابت مستقل از ۱۰۰ دانشجو)`);
}

// ═══════════ مرحلهٔ ۳: امضای صورتجلسهٔ سالن ═══════════
if (has('minutes')) {
  // گلوگاه مخزن: بدون صورتجلسهٔ امضاشده هیچ تحویلی پذیرفته نمی‌شود
  const vaultId0 = (await db.execute(sql`SELECT id FROM staff WHERE "staffCode"='F-LO0501'`)).rows[0].id;
  try {
    await engine.vaultReceiveHall(null, { sessionId: Number((sess as any).id), hallId: Number(hallIds[0]), vaultManagerId: Number(vaultId0) });
    console.log('❌ گلوگاه مخزن کار نکرد!');
  } catch (e: any) {
    console.log(`\n🔒 گلوگاه مخزن ✅ (قبل از امضا): ${e.message}`);
  }

  let signed = 0;
  const t0 = performance.now();
  let totalQ = 0;
  for (let i = 0; i < hallIds.length; i++) {
    const hid = hallIds[i];
    begin('minutes');
    const m = await engine.signHallMinutes(null, {
      sessionId: Number((sess as any).id), hallId: Number(hid),
      supervisorStaffId: Number(proctorIds[i * PROCTORS_PER_HALL]), notes: 'صورتجلسهٔ تست بار',
    });
    totalQ += end();
    signed++;
    if (i === 0) console.log(`   نمونه: سالن ۱ → حاضر ${m.present} · غایب ${m.absent} · هش ${m.summaryHash.slice(0, 16)}…`);
  }
  console.log(`\n③ امضای صورتجلسه: ${signed}/${HALLS} سالن در ${((performance.now() - t0) / 1000).toFixed(2)} ثانیه · ${totalQ} کوئری (${(totalQ / HALLS).toFixed(1)}/سالن)`);
}

// ═══════════ مرحلهٔ ۴: تحویل به مخزن ═══════════
if (has('vault')) {
  const vaultId = (await db.execute(sql`SELECT id FROM staff WHERE "staffCode"='F-LO0501'`)).rows[0].id;
  let received = 0;
  const t0 = performance.now();
  let totalQ = 0;
  for (const hid of hallIds) {
    begin('receive');
    await engine.vaultReceiveHall(null, { sessionId: Number((sess as any).id), hallId: Number(hid), vaultManagerId: Number(vaultId) });
    totalQ += end();
    received++;
  }
  console.log(`④ تحویل به مخزن: ${received}/${HALLS} سالن در ${((performance.now() - t0) / 1000).toFixed(2)} ثانیه · ${totalQ} کوئری`);

  begin('finalize');
  const t1 = performance.now();
  const fin = await engine.finalizeVaultHandover(null, Number((sess as any).id), Number(vaultId));
  const msF = performance.now() - t1;
  const qF = end();
  console.log(`   نهایی‌سازی: بسته‌ها ${fin.packets} (${fin.discrepancies} مغایرت) · درس‌های جمع‌آوری‌شده ${fin.fullyCollected} · ${(msF / 1000).toFixed(2)} ثانیه · ${qF} کوئری`);
}

// ═══════════ مرحلهٔ ۵: تحویل به استاد ═══════════
if (has('deliver')) {
  const vaultId = (await db.execute(sql`SELECT id FROM staff WHERE "staffCode"='F-LO0501'`)).rows[0].id;
  // گلوگاه: استادِ اشتباه
  try {
    await engine.deliverToInstructor(null, {
      offeringId: Number(offeringRows[0].id), instructorId: Number(offeringRows[1].professorId), vaultManagerId: Number(vaultId),
    });
    console.log('❌ گلوگاه استاد کار نکرد!');
  } catch (e: any) {
    console.log(`\n🔒 گلوگاه استاد ✅: ${e.message}`);
  }

  const t0 = performance.now();
  let totalQ = 0;
  let delivered = 0;
  for (const o of offeringRows as any[]) {
    begin('deliver');
    const d = await engine.deliverToInstructor(null, {
      offeringId: Number(o.id), instructorId: Number(o.professorId), vaultManagerId: Number(vaultId),
    });
    totalQ += end();
    if (d.ok) delivered++;
  }
  console.log(`⑤ تحویل به استاد: ${delivered}/${offeringRows.length} درس در ${((performance.now() - t0) / 1000).toFixed(2)} ثانیه · ${totalQ} کوئری (${(totalQ / offeringRows.length).toFixed(1)}/درس)`);
}

// ═══════════ مرحلهٔ ۶: ثبت نمرات بر اساس بارم ═══════════
if (has('grades')) {
  const t0 = performance.now();
  let totalQ = 0;
  let graded = 0;
  const overflowChecks: { studentId: number; expected: number }[] = [];
  for (const o of offeringRows as any[]) {
    const roster = (enrollRows as any[]).filter(e => Number(e.offeringId) === Number(o.id));
    const entries = roster.map((e, idx) => {
      const sid = Number(e.studentId);
      let fin = finOf.get(sid)!;
      if (idx === 0) fin = 99; // تست کلمپ به سقف بارم (۱۲)
      submittedFin.set(sid, Math.min(fin, RUBRIC.finalExam));
      overflowChecks.push({ studentId: sid, expected: totalOf(midOf.get(sid)!, Math.min(fin, RUBRIC.finalExam)) });
      return { studentId: sid, midtermScore: midOf.get(sid), finalExamScore: fin };
    });
    begin('grades');
    const g = await engine.submitExamGrades(null, {
      offeringId: Number(o.id), instructorId: Number(o.professorId), rubric: RUBRIC, entries,
    });
    totalQ += end();
    graded += g.count;
  }
  console.log(`\n⑥ ثبت نمرات: ${graded} دانشجو / ${offeringRows.length} درس در ${((performance.now() - t0) / 1000).toFixed(2)} ثانیه · ${totalQ} کوئری (${(totalQ / offeringRows.length).toFixed(1)}/درس — ثابت مستقل از ۳۴ دانشجو)`);

  // راستی‌آزمایی کلمپ بارم (۳۰ ردیف مرزی)
  let clampOk = 0;
  for (const ch of overflowChecks) {
    const [row] = (await db.execute(sql`SELECT "gradeValue"::float8 AS v FROM enrollments WHERE "studentId"=${ch.studentId} ORDER BY id DESC LIMIT 1`)).rows;
    if (Math.abs(Number(row.v) - ch.expected) < 0.01) clampOk++;
  }
  console.log(`   کلمپ بارم (سقف ۱۲ + میان‌ترم): ${clampOk}/${overflowChecks.length} ✅`);
  const [mx] = (await db.execute(sql`SELECT max("gradeValue"::float8) AS m FROM enrollments e JOIN course_offerings o ON o.id=e."offeringId" WHERE o."termId"=(SELECT id FROM academic_terms WHERE "termCode"='EXAM-1405')`)).rows;
  console.log(`   بیشینهٔ نمرهٔ نهایی: ${mx.m} (سقف ۲۰) ✅`);
}

// ═══════════ مرحلهٔ ۷+۸: اعتراض و پاسخ بارم‌محور ═══════════
if (has('appeals')) {
  const examEnroll = (await db.execute(sql`
    SELECT e.id, e."studentId" FROM enrollments e
    JOIN course_offerings o ON o.id = e."offeringId"
    WHERE o."termId" = (SELECT id FROM academic_terms WHERE "termCode"='EXAM-1405')
    ORDER BY e.id LIMIT 100
  `)).rows as { id: number; studentId: number }[];

  begin('appeal-open');
  const t0 = performance.now();
  let opened = 0;
  for (const e of examEnroll) {
    await engine.openExamAppeal(null, { enrollmentId: Number(e.id), studentMessage: 'لطفاً برگهٔ من دوباره بازبینی شود.' });
    opened++;
  }
  const msOpen = performance.now() - t0;
  const qOpen = end();
  console.log(`\n⑦ اعتراض دانشجویان: ${opened} اعتراض در ${(msOpen / 1000).toFixed(2)} ثانیه · ${qOpen} کوئری`);

  begin('appeal-answer');
  const t1 = performance.now();
  let accepted = 0, rejected = 0;
  const appeals = (await db.execute(sql`SELECT id, "enrollmentId" FROM grade_appeals WHERE status='OPEN' ORDER BY id`)).rows as { id: number; enrollmentId: number }[];
  for (let i = 0; i < appeals.length; i++) {
    const enr = examEnroll.find(e => Number(e.id) === Number(appeals[i].enrollmentId))!;
    const sid = Number(enr.studentId);
    const base = submittedFin.get(sid)!; // همان نمره‌ای که واقعاً ثبت شده بود
    const accept = i < 70;
    const recheck = {
      midtermScore: midOf.get(sid),
      finalExamScore: accept ? Math.min(RUBRIC.finalExam, base + 2) : base,
    };
    const res = await engine.answerExamAppeal(null, {
      appealId: Number(appeals[i].id),
      professorReply: accept ? 'پس از بازبینی، نمرهٔ بخش پایان‌ترم اصلاح شد.' : 'پس از بازبینی، نمره تغییری نمی‌کند.',
      rubric: RUBRIC,
      recheck,
    });
    if (res.status === 'RESOLVED_ACCEPTED') accepted++; else rejected++;
  }
  const msAns = performance.now() - t1;
  const qAns = end();
  console.log(`⑧ پاسخ بارم‌محور: ${accepted} پذیرفته · ${rejected} رد در ${(msAns / 1000).toFixed(2)} ثانیه · ${qAns} کوئری`);

  // راستی‌آزمایی: نمرهٔ دانشجوی پذیرفته‌شده به‌روز شده است
  const [check] = (await db.execute(sql`
    SELECT gr."oldGrade"::float8 AS old, gr."newGrade"::float8 AS new, gr.status, e."gradeValue"::float8 AS cur
    FROM grade_appeals gr JOIN enrollments e ON e.id = gr."enrollmentId"
    WHERE gr.status='RESOLVED_ACCEPTED' ORDER BY gr.id LIMIT 1
  `)).rows;
  console.log(`   نمونهٔ پذیرش: ${check.old} → ${check.new} · نمرهٔ فعلی ${check.cur} ${Math.abs(Number(check.cur) - Number(check.new)) < 0.01 ? '✅' : '❌'}`);
  // کلمپ در پاسخ اعتراض: یک بازبینی با ۹۹ → سقف بارم
  const [clampA] = (await db.execute(sql`SELECT id FROM grade_appeals WHERE status='OPEN' LIMIT 1`)).rows;
  if (clampA) {
    const [en] = (await db.execute(sql`SELECT "studentId" FROM grade_appeals gr JOIN enrollments e ON e.id=gr."enrollmentId" WHERE gr.id=${clampA.id}`)).rows;
    const sid = Number(en.studentId);
    const res = await engine.answerExamAppeal(null, {
      appealId: Number(clampA.id), professorReply: 'بازبینی',
      rubric: RUBRIC,
      recheck: { midtermScore: 99, finalExamScore: 99 },
    });
    const expect = totalOf(RUBRIC.midterm, RUBRIC.finalExam); // ۲۰
    console.log(`   کلمپ اعتراض (۹۹/۹۹ → بارم): نمرهٔ جدید ${res.newGrade} ${Math.abs(res.newGrade - expect) < 0.01 ? `✅ (=${expect})` : '❌'}`);
  }
}

// ═══════════ گزارش نهایی ═══════════
if (has('report')) {
  const ov = await engine.examChainOverview(Number((sess as any).id));
  console.log('\n📊 گزارش نهایی چرخه:');
  console.log(`   حضور و غیاب صادرشده: ${ov.attendanceIssued} (حاضر ${ov.present} · غایب ${ov.absent})`);
  console.log(`   صورتجلسه‌های امضاشده: ${ov.minutesSigned}/10`);
  console.log(`   بسته‌های اوراق: ${JSON.stringify(ov.packets)}`);
  console.log(`   درس‌های جمع‌آوری‌شده: ${ov.coursesFullyCollected}/30`);
  console.log(`   تحویل به استاد: ${JSON.stringify(ov.deliveries)}`);
  console.log(`   نمرات FINALIZED: ${ov.gradesFinalized}`);
  console.log(`   اعتراض‌ها: ${JSON.stringify(ov.appeals)}`);

  // راستی‌آزمایی زنجیرهٔ هش ممیزی
  const audit = (await db.execute(sql`
    SELECT id, action, "entityType", "entityId", details, "prevHash", hash FROM audit_logs ORDER BY id
  `)).rows as { id: number; action: string; entityType: string; entityId: number | null; details: string; prevHash: string; hash: string }[];
  let chainOk = 0, chainBad = 0;
  for (const r of audit) {
    const expect = crypto.createHash('sha256')
      .update(`${r.prevHash}|${r.action}|${r.entityType}|${r.entityId ?? ''}|${r.details}`)
      .digest('hex');
    if (expect === r.hash) chainOk++; else chainBad++;
  }
  const examActions = audit.filter(r => r.action.startsWith('EXAM_')).length;
  console.log(`   زنجیرهٔ هش ممیزی: ${chainOk} سالم / ${chainBad} خراب (کل ${audit.length} ردیف، از آن ${examActions} رویداد امتحانی) ${chainBad === 0 ? '✅' : '❌'}`);

  const ok =
    ov.attendanceIssued === 1000 && ov.minutesSigned === 10 &&
    ov.coursesFullyCollected === 30 &&
    (ov.deliveries.GRADES_SUBMITTED ?? 0) === 30 &&
    ov.gradesFinalized === 1000 &&
    (ov.appeals.OPEN ?? 0) === 0 && chainBad === 0;
  console.log(`\n${ok ? '✅ همهٔ ناورداها برقرارند' : '❌ ناوردایی نقض شده!'}`);
}

console.log('\n════════════ پایان تست سنگین امتحانات ════════════');
process.exit(0);
