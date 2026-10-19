/**
 * Load-test harness — Test 2: 100 concurrent exam sessions × 10,000 students,
 * exercising the FULL Chain-of-Custody per session:
 *   ① issueExamAttendance   (issue attendance sheets from seat allocations)
 *   ② proctorVerifyAttendance (QR_SCAN check-in of all present students)
 *   ③ signHallMinutes        (chain-hashed minutes signature)
 *   ④ vaultReceiveHall       (physical handover -> vault)   [stage 4]
 *   ⑤ finalizeVaultHandover  (marks course offering fully collected)
 *   ⑥ deliverToInstructor    (deliver papers -> instructor)  [stage 5]
 *
 * 100 session-chains run concurrently (each chain's 6 steps are sequential).
 * The engine uses advisory-xact locks keyed per session/hall, so different
 * sessions don't contend. DB pool (module db, max 20) bounds real concurrency.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import * as schema from '@/db/schema';
import * as exam from '@/lib/exam-engine';
import fs from 'fs';

const SESSIONS = 100, SPERS = 100;
const S = 1_100_000, STF = 1_200_000;
const OFF_X = 1_400_020, EXS = 1_600_000, HALL = 1_700_000;
const INVIG_STAFF = STF + 0, VAULT_STAFF = STF + 1, INST_STAFF = STF + 2;
const INVIG_USER = 1_010_000, VAULT_USER = 1_010_001;
const C = Number(process.env.EXAM_CONCURRENCY ?? 30);

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8, statement_timeout: 120_000 });
const db = drizzle(pool, { schema });

function pct(a: number[], p: number): number {
  a.sort((x, y) => x - y);
  if (!a.length) return 0;
  const i = Math.min(a.length - 1, Math.max(0, Math.floor((p / 100) * a.length)));
  return Math.round(a[i] * 100) / 100;
}

async function runSession(s: number) {
  const sessionId = EXS + s, hallId = HALL + s, offeringId = OFF_X + s;
  const checkIns = Array.from({ length: SPERS }, (_, k) => ({ studentId: S + s * SPERS + k, isPresent: 1, method: 'QR_SCAN' as const }));
  const r: any = { session: s, steps: {} };
  const t0 = performance.now();
  try {
    await exam.issueExamAttendance(INVIG_USER, sessionId);
    const verify: any = await exam.proctorVerifyAttendance(INVIG_USER, { sessionId, hallId, proctorStaffId: INVIG_STAFF, checkIns });
    r.steps.present = verify.presentCount; r.steps.absent = verify.absentCount;
    await exam.signHallMinutes(INVIG_USER, { sessionId, hallId, supervisorStaffId: INVIG_STAFF });
    const vrec: any = await exam.vaultReceiveHall(VAULT_USER, { sessionId, hallId, vaultManagerId: VAULT_STAFF });
    r.steps.receivedSheets = vrec.receivedSheets;
    const finz: any = await exam.finalizeVaultHandover(VAULT_USER, sessionId, VAULT_STAFF);
    r.steps.finalized = Array.isArray(finz) ? finz.length : (finz ? 1 : 0);
    const deliv: any = await exam.deliverToInstructor(VAULT_USER, { offeringId, instructorId: INST_STAFF, vaultManagerId: VAULT_STAFF });
    r.steps.delivered = deliv?.id ?? deliv;
    r.ok = true;
  } catch (e: any) {
    r.ok = false; r.error = String(e?.message ?? e).slice(0, 220);
  }
  r.ms = Math.round(performance.now() - t0);
  return r;
}

async function main() {
  console.error(`[lt2] sessions=${SESSIONS}, concurrency=${C}`);
  const results: any[] = []; const idx = { v: 0 };
  async function worker() {
    while (true) { const s = idx.v++; if (s >= SESSIONS) return; results.push(await runSession(s)); }
  }
  const t0 = Date.now();
  await Promise.all(Array.from({ length: C }, worker));
  const wall = Date.now() - t0;
  const ms = results.map(r => r.ms);
  const ok = results.filter(r => r.ok).length;
  const failures = results.filter(r => !r.ok).map(r => ({ session: r.session, error: r.error }));
  const att = (await db.execute(sql`SELECT count(*)::int c FROM exam_attendances`) as any).rows[0].c;
  const present = (await db.execute(sql`SELECT count(*)::int c FROM exam_attendances WHERE "isPresent"=1`) as any).rows[0].c;
  const signed = (await db.execute(sql`SELECT count(*)::int c FROM exam_minutes WHERE "isSignedAndFinalized"=1`) as any).rows[0].c;
  const dupAtt = (await db.execute(sql`SELECT count(*)::int c FROM (SELECT "examId","studentId",count(*) n FROM exam_attendances GROUP BY 1,2 HAVING count(*)>1) x`) as any).rows[0].c;
  const delivered = (await db.execute(sql`SELECT count(*)::int c FROM instructor_deliveries`) as any).rows[0].c;
  const result = {
    tool: 'lt2-exam', sessions: SESSIONS, students: SESSIONS * SPERS, concurrency: C,
    wallMs: wall, throughputSessionsPerSec: Math.round((SESSIONS / (wall / 1000)) * 100) / 100,
    ok, fail: SESSIONS - ok,
    chainLatencyMs: { p50: pct(ms, 50), p90: pct(ms, 90), p95: pct(ms, 95), p99: pct(ms, 99), max: pct(ms, 100) },
    persist: { attendances: Number(att), present: Number(present), signedMinutes: Number(signed), duplicateAttendances: Number(dupAtt), instructorDeliveries: Number(delivered) },
    failures, generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync('/root/lt2-result.json', JSON.stringify(result, null, 2));
  console.log('SUMMARY_JSON=' + JSON.stringify(result));
  await pool.end();
}
main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
