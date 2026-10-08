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
const SUBMIT_SRC = readFileSync(path.join(HERE, '..', 'src/lib/enroll-engine/submit.ts'), 'utf8');

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
  const M: any = await import('@/lib/enroll-engine/submit');

  const tname = (t: any): string => {
    if (t === S.enrollments) return 'enrollments';
    if (t === S.cart_items) return 'cart_items';
    if (t === S.notifications) return 'notifications';
    return 'other';
  };

  type Store = {
    terms: any[]; students: any[]; finTerms: any[]; clearances: any[];
    cart: any[]; offs: any[]; current: any[]; sched: any[];
    rows: (t: any, joins: any[]) => any[];
  };

  const titles = ['درس ۱', 'درس ۲', 'درس ۳', 'درس ۴', 'درس ۵', 'درس ۶'];

  const baseStore = (): Store => {
    const st: Store = {
      terms: [{ id: 5, isCurrent: 1, isEnrollmentOpen: 1 }],
      students: [{ id: 9, status: 'ACTIVE', universityId: 1 }],
      finTerms: [],
      clearances: [{ studentId: 9, termId: 5, isCleared: 1 }],
      cart: [11, 12, 13, 14, 15, 16].map(id => ({ studentId: 9, offeringId: id })),
      offs: [11, 12, 13, 14, 15, 16].map((id, i) => ({
        id, courseId: 101 + i, code: 'C' + (i + 1), title: titles[i],
        units: '3', capacity: 40, enrolled: 10, waitCap: 5,
      })),
      current: [],
      sched: [],
      rows: (t: any, joins: any[]) => {
        if (t === S.academic_terms) return st.terms;
        if (t === S.students) return st.students;
        if (t === S.financial_terms) return st.finTerms;
        if (t === S.financial_clearances) return st.clearances;
        if (t === S.cart_items) return st.cart;
        if (t === S.course_offerings && joins.includes(S.courses)) return st.offs;
        if (t === S.enrollments) return st.current;
        if (t === S.schedules) return st.sched;
        throw new Error('fake-db: unexpected select');
      },
    };
    return st;
  };

  class FakeSel {
    t: any = null;
    joins: any[] = [];
    constructor(private store: Store) {}
    from(t: any) { this.t = t; return this; }
    innerJoin(t: any) { this.joins.push(t); return this; }
    where(_c: any) { return this; }
    orderBy(..._a: any[]) { return this; }
    limit(n?: number) {
      const rows = this.store.rows(this.t, this.joins);
      return Promise.resolve(n == null ? rows : rows.slice(0, n));
    }
    then(res: any, rej: any) {
      return Promise.resolve(this.store.rows(this.t, this.joins)).then(res, rej);
    }
  }

  const fakeDb = (store: Store): any => ({
    select: (_f?: any) => new FakeSel(store),
    execute: async (_q: any): Promise<any> => { throw new Error('fake-db: execute must be injected'); },
  });

  type TxBehavior = { failInsertIds?: number[]; failDelete?: boolean; failNotify?: boolean };

  const makeRls = (b: TxBehavior) => {
    const txs: any[] = [];
    let calls = 0;
    const fn = async (uid: number, cb: (tx: any) => Promise<any>): Promise<any> => {
      calls++;
      const tx: any = {
        inserts: [] as any[],
        deletes: [] as any[],
        execs: [] as string[],
        uid,
        execute: async (q: any): Promise<any> => { tx.execs.push(sqlText(q)); return {}; },
        insert: (table: any) => ({
          values: (v: any) => {
            const rec = { table: tname(table), values: v };
            const go = async (): Promise<any[]> => {
              if (rec.table === 'enrollments' && (b.failInsertIds ?? []).includes(v.offeringId)) throw new Error('boom-insert');
              if (rec.table === 'notifications' && b.failNotify) throw new Error('boom-notify');
              tx.inserts.push(rec);
              return [];
            };
            return { onConflictDoUpdate: (_c: any) => go(), then: (res: any, rej: any) => go().then(res, rej) };
          },
        }),
        delete: (table: any) => ({
          where: (_c: any) => {
            if (b.failDelete) throw new Error('boom-delete');
            tx.deletes.push({ table: tname(table) });
            return Promise.resolve([]);
          },
        }),
      };
      txs.push(tx);
      return cb(tx);
    };
    return { fn, txs, count: () => calls };
  };

  const makeCaps = (defs: Record<number, { cap: number; enr: number }>, counters: any) => {
    const m = new Map<number, { cap: number; enr: number }>(
      Object.entries(defs).map(([k, v]) => [Number(k), { cap: v.cap, enr: v.enr }]),
    );
    return {
      m,
      claim: async (ids: number[]): Promise<Set<number>> => {
        counters.claimCalls++;
        const ok = new Set<number>();
        for (const id of ids) {
          const r = m.get(id)!;
          if (r.enr < r.cap) { r.enr++; ok.add(id); }
        }
        return ok;
      },
      fresh: async (ids: number[]): Promise<Map<number, { enrolled: number; capacity: number }>> => {
        counters.freshCalls++;
        counters.freshIds = ids;
        return new Map(ids.map(id => [id, { enrolled: m.get(id)!.enr, capacity: m.get(id)!.cap }]));
      },
      compensate: async (id: number): Promise<void> => {
        counters.compCalls++;
        const r = m.get(id)!;
        r.enr = Math.max(0, r.enr - 1);
      },
    };
  };

  const stdDeps = (store: Store, caps: any, rls: any, counters: any, seatImpl: (id: number) => Promise<number>) => ({
    db: fakeDb(store),
    withUserRls: rls.fn,
    atomicSeat: async (id: number): Promise<number> => { counters.seatCalls++; return seatImpl(id); },
    releaseSeat: async (_id: number): Promise<void> => { counters.releaseCalls++; },
    nextWaitlistPosition: async (_id: number): Promise<number | null> => { counters.wlCalls++; counters.wlSeq++; return counters.wlSeq; },
    warmupCapacities: async (_f?: boolean): Promise<number> => { counters.warmupCalls++; return 6; },
    claimSeats: caps.claim,
    readFresh: caps.fresh,
    compensateSeat: caps.compensate,
    evaluateRegulations: async (_s: number, _t: number) => ({ effectiveMaxUnits: 24 }),
    buildPrereq: async (_s: number) => ({ passed: new Map(), ruleByCourse: new Map(), titles: new Map(), defaultPassing: 10 }),
    getDebtThreshold: async () => 0,
    notifyEnrollmentDone: async (a: { userId: number; registered: string[]; waitlisted: string[] }) => { counters.notified++; counters.notifiedPayload = a; },
  });

  const freshCounters = () => ({ seatCalls: 0, releaseCalls: 0, wlCalls: 0, wlSeq: 0, warmupCalls: 0, claimCalls: 0, freshCalls: 0, freshIds: [] as number[], compCalls: 0, notified: 0, notifiedPayload: null as any });
  const fullCaps = () => ({ 11: { cap: 40, enr: 10 }, 12: { cap: 40, enr: 10 }, 13: { cap: 40, enr: 10 }, 14: { cap: 40, enr: 10 }, 15: { cap: 40, enr: 10 }, 16: { cap: 40, enr: 10 } });

  console.log('1) batched claim SQL keeps the per-course capacity guard');
  {
    const { db } = await import('@/db');
    const q = M.buildClaimSeatsQuery(db, [11, 12, 13]);
    const rendered = q.toSQL();
    assert.ok(rendered.sql.includes('"enrolledCount" < "capacity"'), 'guard predicate missing: ' + rendered.sql);
    assert.ok(/returning/i.test(rendered.sql), 'RETURNING missing: ' + rendered.sql);
    assert.ok(/ in /i.test(rendered.sql), 'batched IN missing: ' + rendered.sql);
    assert.deepEqual(rendered.params, [11, 12, 13]);
    const empty = await M.claimSeatsBatch({ update: () => { throw new Error('must not query'); } }, []);
    assert.deepEqual([...empty], []);
    const freshEmpty = await M.readFreshCapacities({ select: () => { throw new Error('must not query'); } }, []);
    assert.equal(freshEmpty.size, 0);
    console.log('  ok');
  }

  console.log('2) happy path: 6 courses, one RLS transaction, one cart delete, one notification');
  {
    const store = baseStore();
    const counters = freshCounters();
    const caps = makeCaps(fullCaps(), counters);
    const rls = makeRls({});
    const deps = stdDeps(store, caps, rls, counters, async () => 1);
    const out = await M.processQueuedSubmit(1001, 9, false, deps);
    assert.equal(out.ok, true);
    assert.deepEqual(out.registered, titles);
    assert.deepEqual(out.waitlisted, []);
    assert.deepEqual(out.hardErrors, []);
    assert.equal(rls.count(), 1);
    assert.equal(counters.claimCalls, 1);
    assert.equal(counters.seatCalls, 6);
    assert.equal(counters.compCalls, 0);
    assert.equal(counters.releaseCalls, 0);
    const tx = rls.txs[0];
    assert.equal(tx.deletes.length, 1);
    assert.equal(tx.deletes[0].table, 'cart_items');
    const notifs = tx.inserts.filter((r: any) => r.table === 'notifications');
    assert.equal(notifs.length, 1);
    assert.deepEqual(JSON.parse(notifs[0].values.payload), { registered: titles, waitlisted: [] });
    const enr = tx.inserts.filter((r: any) => r.table === 'enrollments');
    assert.equal(enr.length, 6);
    assert.ok(enr.every((r: any) => r.values.status === 'REGISTERED'));
    assert.equal(tx.execs.filter((s: string) => s === 'SAVEPOINT enroll_sp').length, 6);
    assert.equal(counters.notified, 1);
    assert.deepEqual(counters.notifiedPayload, { userId: 1001, registered: titles, waitlisted: [] });
    console.log('  ok');
  }

  console.log('3) capacity guard: full offering without waitlist is rejected, redis seat released, no compensation');
  {
    const store = baseStore();
    store.offs.find((o: any) => o.id === 12).waitCap = 0;
    const counters = freshCounters();
    const caps = makeCaps({ ...fullCaps(), 12: { cap: 30, enr: 30 } }, counters);
    const rls = makeRls({});
    const deps = stdDeps(store, caps, rls, counters, async () => 1);
    const out = await M.processQueuedSubmit(1001, 9, false, deps);
    assert.equal(out.ok, false);
    assert.deepEqual(out.registered, ['درس ۱', 'درس ۳', 'درس ۴', 'درس ۵', 'درس ۶']);
    assert.deepEqual(out.hardErrors, ['ظرفیت «درس ۲» تکمیل است.']);
    assert.equal(counters.releaseCalls, 1);
    assert.equal(counters.compCalls, 0);
    const tx = rls.txs[0];
    assert.ok(!tx.inserts.some((r: any) => r.table === 'enrollments' && r.values.offeringId === 12));
    console.log('  ok');
  }

  console.log('4) waitlist path unchanged: claim-miss with waitCap goes to WAITLISTED, no compensation');
  {
    const store = baseStore();
    const counters = freshCounters();
    const caps = makeCaps({ ...fullCaps(), 13: { cap: 30, enr: 30 } }, counters);
    const rls = makeRls({});
    const deps = stdDeps(store, caps, rls, counters, async () => 1);
    const out = await M.processQueuedSubmit(1001, 9, false, deps);
    assert.equal(out.ok, true);
    assert.deepEqual(out.waitlisted, ['درس ۳']);
    assert.deepEqual(out.registered, ['درس ۱', 'درس ۲', 'درس ۴', 'درس ۵', 'درس ۶']);
    const tx = rls.txs[0];
    const row = tx.inserts.find((r: any) => r.table === 'enrollments' && r.values.offeringId === 13);
    assert.equal(row.values.status, 'WAITLISTED');
    assert.equal(row.values.waitlistPosition, 1);
    assert.equal(counters.releaseCalls, 1);
    assert.equal(counters.compCalls, 0);
    console.log('  ok');
  }

  console.log('5) direct waitlist path unchanged: seat 0 with waitCap never touches the claim');
  {
    const store = baseStore();
    const counters = freshCounters();
    const caps = makeCaps(fullCaps(), counters);
    const rls = makeRls({});
    const deps = stdDeps(store, caps, rls, counters, async (id: number) => (id === 14 ? 0 : 1));
    const out = await M.processQueuedSubmit(1001, 9, false, deps);
    assert.deepEqual(out.waitlisted, ['درس ۴']);
    assert.equal(counters.releaseCalls, 0);
    assert.equal(counters.compCalls, 0);
    console.log('  ok');
  }

  console.log('6) redis down: single batched fresh-read fallback decides seats');
  {
    const store = baseStore();
    store.offs.find((o: any) => o.id === 15).waitCap = 0;
    const counters = freshCounters();
    const caps = makeCaps({ ...fullCaps(), 15: { cap: 30, enr: 30 } }, counters);
    const rls = makeRls({});
    const deps = stdDeps(store, caps, rls, counters, async () => -2);
    const out = await M.processQueuedSubmit(1001, 9, false, deps);
    assert.equal(counters.freshCalls, 1);
    assert.deepEqual(counters.freshIds, [11, 12, 13, 14, 15, 16]);
    assert.deepEqual(out.hardErrors, ['ظرفیت «درس ۵» تکمیل است.']);
    assert.deepEqual(out.registered, ['درس ۱', 'درس ۲', 'درس ۳', 'درس ۴', 'درس ۶']);
    console.log('  ok');
  }

  console.log('7) insert failure: compensation runs exactly once, siblings survive, message template kept');
  {
    const store = baseStore();
    const counters = freshCounters();
    const caps = makeCaps(fullCaps(), counters);
    const rls = makeRls({ failInsertIds: [12] });
    const deps = stdDeps(store, caps, rls, counters, async () => 1);
    const out = await M.processQueuedSubmit(1001, 9, false, deps);
    assert.deepEqual(out.registered, ['درس ۱', 'درس ۳', 'درس ۴', 'درس ۵', 'درس ۶']);
    assert.deepEqual(out.hardErrors, ['خطا در ثبت «درس ۲»: boom-insert']);
    assert.equal(out.ok, false);
    assert.equal(counters.compCalls, 1);
    assert.equal(counters.releaseCalls, 1);
    assert.equal(caps.m.get(12)!.enr, 10);
    const tx = rls.txs[0];
    assert.equal(tx.execs.filter((s: string) => s.startsWith('ROLLBACK TO SAVEPOINT')).length, 1);
    const notifs = tx.inserts.filter((r: any) => r.table === 'notifications');
    assert.deepEqual(JSON.parse(notifs[0].values.payload).registered, ['درس ۱', 'درس ۳', 'درس ۴', 'درس ۵', 'درس ۶']);
    console.log('  ok');
  }

  console.log('8) whole-transaction failure: every claimed seat compensated exactly once, nothing registered');
  {
    const store = baseStore();
    const counters = freshCounters();
    const caps = makeCaps(fullCaps(), counters);
    const rls = makeRls({ failDelete: true });
    const deps = stdDeps(store, caps, rls, counters, async () => 1);
    const out = await M.processQueuedSubmit(1001, 9, false, deps);
    assert.deepEqual(out.registered, []);
    assert.equal(out.hardErrors.length, 6);
    assert.ok(out.hardErrors.every((m: string) => m.startsWith('خطا در ثبت «درس ') && m.endsWith('»: boom-delete')));
    assert.equal(out.ok, false);
    assert.equal(counters.compCalls, 6);
    assert.equal(counters.releaseCalls, 6);
    for (const id of [11, 12, 13, 14, 15, 16]) assert.equal(caps.m.get(id)!.enr, 10);
    console.log('  ok');
  }

  console.log('9) concurrency: 50 parallel submits on cap-3 offering register exactly 3, no overbooking');
  {
    const shared = makeCaps({ 1: { cap: 3, enr: 0 } }, { claimCalls: 0, freshCalls: 0, compCalls: 0 });
    let wlSeq = 0;
    const runOne = async (i: number): Promise<any> => {
      const st = baseStore();
      st.students = [{ id: 100 + i, status: 'ACTIVE', universityId: 1 }];
      st.clearances = [{ studentId: 100 + i, termId: 5, isCleared: 1 }];
      st.cart = [{ studentId: 100 + i, offeringId: 1 }];
      st.offs = [{ id: 1, courseId: 201, code: 'C1', title: 'ظرفیت محدود', units: '3', capacity: 3, enrolled: 0, waitCap: 0 }];
      const rls = makeRls({});
      let releases = 0;
      const deps = {
        db: fakeDb(st),
        withUserRls: rls.fn,
        atomicSeat: async () => 1,
        releaseSeat: async () => { releases++; },
        nextWaitlistPosition: async () => { wlSeq++; return wlSeq; },
        warmupCapacities: async () => 1,
        claimSeats: shared.claim,
        readFresh: shared.fresh,
        compensateSeat: async () => {},
        evaluateRegulations: async () => ({ effectiveMaxUnits: 24 }),
        buildPrereq: async () => ({ passed: new Map(), ruleByCourse: new Map(), titles: new Map(), defaultPassing: 10 }),
        getDebtThreshold: async () => 0,
        notifyEnrollmentDone: async () => {},
      };
      const out = await M.processQueuedSubmit(2000 + i, 100 + i, false, deps);
      return { out, releases };
    };
    const results = await Promise.all(Array.from({ length: 50 }, (_, i) => runOne(i)));
    const registered = results.filter(r => r.out.registered.length === 1);
    const rejected = results.filter(r => r.out.hardErrors.length === 1);
    assert.equal(registered.length, 3);
    assert.equal(rejected.length, 47);
    assert.ok(rejected.every(r => r.out.hardErrors[0] === 'ظرفیت «ظرفیت محدود» تکمیل است.'));
    assert.equal(shared.m.get(1)!.enr, 3);
    console.log('  ok');
  }

  console.log('10) user-visible message strings are byte-identical');
  {
    for (const s of [
      'پنجرهٔ انتخاب واحد بسته است.',
      'پروندهٔ دانشجویی یافت نشد.',
      'حساب شما توسط کمیسیون موارد خاص مسدود است.',
      'تسویه‌حساب مالی این ترم ثبت نشده است. برای انتخاب واحد باید بدهکاری‌تان تسویه شود.',
      'سبد خالی است.',
      'قبلاً در این ترم (در گروهی دیگر) برای شما ثبت شده است.',
      'سقف مجاز انتخاب واحد طبق آیین‌نامه آموزشی',
      'تداخل قطعی امتحان: «',
      'عدم پیش‌نیاز: «',
      '«\' + p.o.title + \'» تکمیل است.',
      '«\' + p.o.title + \'»: \'',
      'ENROLLMENT_DONE',
    ]) assert.ok(SUBMIT_SRC.includes(s), 'message missing: ' + s);
    assert.ok(!/withUserRls\(userId, tx => tx\.delete\(cart_items\)/.test(SUBMIT_SRC), 'per-course cart delete still present');
    console.log('  ok');
  }

  console.log('\nsubmit-batch: all green');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
