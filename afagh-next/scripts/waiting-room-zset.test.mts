/**
 * ════════════════════════════════════════════════════════════════════════
 *  آزمون اتاق انتظار مبتنی بر ZSET — گام ۲ سند طراحی (انتظار اتاق مقیاس‌پذیر)
 *
 *  کد واقعی src/lib/waitingRoom.ts را با Redis واقعی (service در CI) تست
 *  می‌کند — نه شبیه‌سازی:
 *    • enqueue: ZADD با score=timestamp + ZRANK → جایگاه O(log N)
 *    • پس از خروجِ نخستین نفر، جایگاه بقیه ۱ واحد جلو می‌آید (بدون LPOS خطی)
 *    • FIFO عادلانه: خروجی ZPOPMIN همیشه قدیمی‌ترین عضو است
 *    • کلیدها پس از تست پاک می‌شوند (ایزوله در CI)
 *
 *  اجرا:  REDIS_URL=redis://127.0.0.1:6379 npx tsx scripts/waiting-room-zset.test.mts
 * ════════════════════════════════════════════════════════════════════════
 */
import { enqueueSubmit, queuePosition, redis, K } from '../src/lib/waitingRoom';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

async function fresh(): Promise<void> {
  // کلید اختصاصی تست تا با صف واقعیِ dev تداخل نکند
  await redis.del(K.queue);
  await redis.del('afagh:wr:test:latest');
}

async function main() {
  const ping = await redis.ping();
  ok('Redis در دسترس است', ping === 'PONG', `(got ${ping})`);

  await fresh();
  console.log('\n— ۱) ورود و جایگاه (ZADD + ZRANK)');
  const a = await enqueueSubmit(90001, 80001);
  await new Promise((r) => setTimeout(r, 5));
  const b = await enqueueSubmit(90002, 80002);
  await new Promise((r) => setTimeout(r, 5));
  const c = await enqueueSubmit(90003, 80003);
  ok('اولین نفر جایگاه ۱', a.position === 1, `(got ${a.position})`);
  ok('دومین نفر جایگاه ۲', b.position === 2, `(got ${b.position})`);
  ok('سومین نفر جایگاه ۳', c.position === 3, `(got ${c.position})`);
  ok('جایگاه همان لحظه (ZRANK): آیتم سوم = ۳', (await queuePosition(c.item)) === 3);
  ok('طول صف (ZCARD) = ۳', (await redis.zcard(K.queue)) === 3);

  console.log('\n— ۲) جلو آمدن جایگاه پس از خروج اولین نفر (بدون LPOS خطی)');
  const popped = await redis.zpopmin(K.queue, 1);
  ok('ZPOPMIN قدیمیترین را خروج میدهد (FIFO)', popped?.[0] === a.item, `(got ${String(popped?.[0]).slice(0, 30)}…)`);
  ok('آیتم دوم حالا جایگاه ۱', (await queuePosition(b.item)) === 1);
  ok('آیتم سوم حالا جایگاه ۲', (await queuePosition(c.item)) === 2);

  console.log('\n— ۳) نظم زمان: تاخیر ورود = جایگاه دیرتر (عدالت)');
  await fresh();
  await enqueueSubmit(90011, 80011);
  await new Promise((r) => setTimeout(r, 10));
  const z = await enqueueSubmit(90012, 80012); // دیرتر وارد شده
  ok('دیرتر واردشده جایگاه ۲ دارد', z.position === 2, `(got ${z.position})`);

  console.log('\n— ۴) پاکسازی');
  await fresh();
  ok('صف پس از پاکسازی خالی است', (await redis.zcard(K.queue)) === 0);

  console.log(`\n⚙️ نتیجهٔ آزمون ZSET: ${pass} موفق، ${fail} ناموفق`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('❌ خطای آزمون ZSET:', e.message); process.exit(1); });
