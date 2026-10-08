import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const requireCjs = createRequire(import.meta.url);
const serverOnlyId = requireCjs.resolve('server-only');
(requireCjs as any).cache[serverOnlyId] = {
  id: serverOnlyId, filename: serverOnlyId, loaded: true, exports: {}, children: [], paths: [],
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GEN_SRC = readFileSync(path.join(HERE, '..', 'src/lib/class-session-generator.ts'), 'utf8');
const ACT_SRC = readFileSync(path.join(HERE, '..', 'src/app/professor/attendance/actions.ts'), 'utf8');

function sqlText(q: unknown): string {
  try {
    if (typeof q === 'string') return q;
    const chunks = (q as any)?.queryChunks;
    if (Array.isArray(chunks)) {
      return chunks.map((c: any) => {
        if (typeof c === 'string') return c;
        if (c && typeof c.value === 'string') return c.value;
        if (c && Array.isArray(c.value)) return c.value.join('');
        if (c && Array.isArray(c.value?.value)) return c.value.value.join('');
        return '?';
      }).join('');
    }
    return JSON.stringify(q) ?? '';
  } catch {
    return '';
  }
}

async function main(): Promise<void> {
  const S: any = await import('@/db/schema');
  const G: any = await import('@/lib/class-session-generator');

  type World = {
    sched: any[];
    profs: any[];
    rooms: any[];
    existing: any[];
    term: any;
  };

  const schedRow = (offeringId: number, over: any = {}) => ({
    offeringId,
    dayOfWeek: 1,
    startTime: '08:00',
    endTime: '09:30',
    roomId: null,
    recurrence: 'ALL',
    courseCode: 'C' + offeringId,
    groupNumber: 1,
    capacity: 40,
    enrolled: 10,
    professorId: null,
    ...over,
  });

  const baseWorld = (): World => ({
    sched: [schedRow(101), schedRow(102, { dayOfWeek: 3, startTime: '10:00', endTime: '11:30' })],
    profs: [],
    rooms: [],
    existing: [],
    term: { id: 7, startDate: new Date(2025, 8, 22) },
  });

  const tname = (t: any): string => {
    if (t === S.class_sessions) return 'class_sessions';
    if (t === S.audit_logs) return 'audit_logs';
    return 'other';
  };

  class FakeSel {
    t: any = null;
    constructor(private w: World) {}
    from(t: any) { this.t = t; return this; }
    where(_c: any) { return this; }
    orderBy(..._a: any[]) { return this; }
    limit(n?: number) {
      const rows = this.rows();
      return Promise.resolve(n == null ? rows : rows.slice(0, n));
    }
    then(res: any, rej: any) { return Promise.resolve(this.rows()).then(res, rej); }
    private rows(): any[] {
      if (this.t === S.academic_terms) return [this.w.term];
      if (this.t === S.class_sessions) return this.w.existing;
      if (this.t === S.audit_logs) return [];
      throw new Error('fake-tx: unexpected select');
    }
  }

  const makeTx = (w: World, log: any) => {
    const tx: any = {
      select: (_f?: any) => new FakeSel(w),
      execute: async (q: any): Promise<any> => {
        const text = sqlText(q);
        log.execs.push(text);
        if (/show transaction_isolation/.test(text)) return { rows: [{ transaction_isolation: 'read committed' }] };
        if (/from schedules/.test(text)) return { rows: w.sched };
        if (/offering_professors/.test(text)) return { rows: w.profs };
        if (/from classrooms/.test(text)) return { rows: w.rooms };
        return {};
      },
      insert: (table: any) => ({
        values: (v: any) => {
          const rows = Array.isArray(v) ? v : [v];
          log.inserts.push({ table: tname(table), rows });
          return Promise.resolve([]);
        },
      }),
    };
    return tx;
  };

  const run = async (w: World, offeringId: number, px: any = {}) => {
    const log = { execs: [] as string[], inserts: [] as any[] };
    const exec = { transaction: async (cb: (tx: any) => Promise<any>): Promise<any> => cb(makeTx(w, log)) };
    const result = await G.generateClassSessionsForOffering(1, 7, offeringId, px, exec);
    return { result, log };
  };

  console.log('1) scoped run inserts only the target offering, never touches the other');
  {
    const w = baseWorld();
    const { result, log } = await run(w, 101, { sessionsCount: 4 });
    assert.equal(result.ok, true);
    assert.equal(result.offerings, 1);
    assert.equal(result.generated, 4);
    assert.equal(result.skipped, 0);
    assert.deepEqual(Object.keys(result.sessionsPerOffering), ['101']);
    const sessionInserts = log.inserts.filter((r: any) => r.table === 'class_sessions');
    assert.equal(sessionInserts.length, 1);
    assert.equal(sessionInserts[0].rows.length, 4);
    assert.ok(sessionInserts[0].rows.every((r: any) => r.offeringId === 101));
    assert.deepEqual(sessionInserts[0].rows.map((r: any) => r.sessionNo), [1, 2, 3, 4]);
    assert.ok(sessionInserts[0].rows.every((r: any) => r.isMakeUpSession === 0 && r.status === 'SCHEDULED'));
    assert.ok(log.execs.some(s => s.includes('pg_advisory_xact_lock')));
    assert.equal(typeof result.termStart, 'string');
    console.log('  ok');
  }

  console.log('2) skip-existing is per-offering: offering B keeps its sessions, only gaps are filled');
  {
    const w = baseWorld();
    w.existing = [
      { offeringId: 102, sessionNo: 1 },
      { offeringId: 102, sessionNo: 2 },
      { offeringId: 102, sessionNo: 5 },
      { offeringId: 101, sessionNo: 9 },
    ];
    const { result, log } = await run(w, 102, { sessionsCount: 4 });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, 2);
    assert.equal(result.generated, 2);
    const rows = log.inserts.filter((r: any) => r.table === 'class_sessions').flatMap((r: any) => r.rows);
    assert.deepEqual(rows.map((r: any) => r.sessionNo), [3, 4]);
    assert.ok(rows.every((r: any) => r.offeringId === 102));
    console.log('  ok');
  }

  console.log('3) rerun is idempotent: second scoped run generates zero');
  {
    const w = baseWorld();
    const first = await run(w, 101, { sessionsCount: 4 });
    assert.equal(first.result.generated, 4);
    w.existing = first.log.inserts
      .filter((r: any) => r.table === 'class_sessions')
      .flatMap((r: any) => r.rows)
      .map((r: any) => ({ offeringId: r.offeringId, sessionNo: r.sessionNo }));
    const second = await run(w, 101, { sessionsCount: 4 });
    assert.equal(second.result.generated, 0);
    assert.equal(second.result.skipped, 4);
    assert.ok(!second.log.inserts.some((r: any) => r.table === 'class_sessions'));
    console.log('  ok');
  }

  console.log('4) hard-conflict gate still throws with the same message when enabled');
  {
    const w = baseWorld();
    w.sched = [
      schedRow(101, { professorId: 50 }),
      schedRow(102, { professorId: 50 }),
    ];
    await assert.rejects(
      run(w, 101, { sessionsCount: 4 }),
      (e: any) => {
        assert.ok(String(e.message).includes('تداخل سخت دارد'), 'gate message changed: ' + e.message);
        return true;
      },
    );
    const open = await run(w, 101, { sessionsCount: 4, failOnHardConflict: false });
    assert.equal(open.result.ok, true);
    assert.equal(open.result.generated, 4);
    console.log('  ok');
  }

  console.log('5) term-wide dry-run contract on the real core still reports conflicts for scoping');
  {
    const w = baseWorld();
    w.sched = [
      schedRow(101, { professorId: 50 }),
      schedRow(102, { professorId: 50 }),
    ];
    const { result } = await run(w, 101, { dryRun: true, failOnHardConflict: false });
    assert.equal(result.generated, 0);
    assert.ok(result.hardConflicts.length > 0);
    assert.ok(result.hardConflicts.some((h: any) => h.offeringIds.includes(101)));
    console.log('  ok');
  }

  console.log('6) chunked inserts preserved: 420 values go in 400 + 20');
  {
    const w = baseWorld();
    w.sched = Array.from({ length: 7 }, (_, i) => schedRow(101, { dayOfWeek: i % 7, startTime: '08:00', endTime: '09:30' }));
    const { result, log } = await run(w, 101, { sessionsCount: 60 });
    assert.equal(result.generated, 420);
    const chunks = log.inserts.filter((r: any) => r.table === 'class_sessions');
    assert.deepEqual(chunks.map((c: any) => c.rows.length), [400, 20]);
    assert.ok(chunks.flatMap((c: any) => c.rows).every((r: any) => r.offeringId === 101));
    console.log('  ok');
  }

  console.log('7) offering without a weekly schedule fails closed with a scoped message');
  {
    const w = baseWorld();
    const { result, log } = await run(w, 999, { sessionsCount: 4 });
    assert.equal(result.ok, false);
    assert.ok(String(result.error).includes('برای این درس'), 'scoped error changed: ' + result.error);
    assert.ok(!log.inserts.some((r: any) => r.table === 'class_sessions'));
    console.log('  ok');
  }

  console.log('8) missing term start still fails with the original message');
  {
    const w = baseWorld();
    w.term = { id: 7, startDate: null };
    await assert.rejects(
      run(w, 101, { sessionsCount: 4 }),
      (e: any) => {
        assert.ok(String(e.message).includes('تاریخ شروع نیمسال'), 'startDate message changed: ' + e.message);
        return true;
      },
    );
    console.log('  ok');
  }

  console.log('9) preservation gates: lock, skip, chunks, sanitization and the professor contract are intact');
  {
    assert.ok(GEN_SRC.includes("await advisoryLock(tx, 'sess_gen', termId)"), 'advisory lock changed');
    assert.ok(GEN_SRC.includes('existing.has(d.sessionNo)'), 'skip-existing changed');
    assert.ok(GEN_SRC.includes('i += 400'), 'chunked inserts changed');
    assert.ok(GEN_SRC.includes('export async function generateClassSessionsForTerm'), 'term export changed');
    assert.ok(ACT_SRC.includes('dryRun: true, failOnHardConflict: false'), 'term-wide dry-run preview changed');
    assert.ok(ACT_SRC.includes('generateClassSessionsForOffering(user.id, offering.termId, oid, { failOnHardConflict: false })'), 'scoped call missing');
    assert.ok(ACT_SRC.includes('const toSafeError'), 'error sanitizer changed');
    assert.ok(ACT_SRC.includes('خطای غیرمنتظره در تولید جلسات'), 'generic error message changed');
    assert.ok(ACT_SRC.includes('شما استاد این درس نیستید.'), 'ownership message changed');
    assert.ok(ACT_SRC.includes('already: true'), 'already contract changed');
    assert.ok(!/generateClassSessionsForTerm\(user\.id, offering\.termId, \{ failOnHardConflict/.test(ACT_SRC), 'term-wide generate still wired');
    console.log('  ok');
  }

  console.log('\nsession-scope: all green');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
