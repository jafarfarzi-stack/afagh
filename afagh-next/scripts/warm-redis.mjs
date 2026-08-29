// گرم‌کردن ظرفیت‌ها شب قبل از انتخاب واحد — سند §۱۰۰۶
// cron: 0 2 * * *  node scripts/warm-redis.mjs
import pg from 'pg';
import { Redis } from 'ioredis';

const PG_URL = process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db';
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const c = new pg.Client({ connectionString: PG_URL });
await c.connect();
const { rows: offs } = await c.query(`
  SELECT o.id, o.capacity, o."enrolledCount", COALESCE(o."waitlistCapacity", 0) AS wl
  FROM course_offerings o JOIN academic_terms t ON t.id = o."termId" WHERE t."isCurrent" = 1`);
const r = new Redis(REDIS_URL);
await r.del('afagh:caps');
for (const o of offs) await r.hset('afagh:caps', String(o.id), `${o.capacity},${o.enrolledCount},${o.wl}`);
console.log(`✓ ${offs.length} کلاس به Redis منتقل شد (afagh:caps)`);
r.disconnect(); await c.end();
