import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../../src/db/schema';
import { observePoolErrors } from '../../src/db/pool-errors';
import { writeAuditEntry } from '../../src/lib/audit-writer';
import { verifyAuditChain } from '../../src/lib/audit-core';

async function main() {
  if (process.env.HEAVY_TEST_ACK !== 'isolated-local-only' || !process.env.AUDIT_TEST_DATABASE_URL) throw new Error('Explicit isolated test DB required');
  const worker = process.argv.includes('--worker');
  const namespace = worker ? process.env.HEAVY_AUDIT_SCHEMA! : `heavy_audit_${randomBytes(6).toString('hex')}`;
  assert.match(namespace, /^heavy_audit_[a-f0-9]+$/);
  const pool = new Pool({ connectionString: process.env.AUDIT_TEST_DATABASE_URL, max: 12, options: `-c search_path=${namespace}` });
  observePoolErrors(pool);
  const db = drizzle(pool, { schema });
  if (worker) {
    try {
      let index = 0;
      await Promise.all(Array.from({length:12}, async () => {
        while (index<1000) {
          const i=index++;
          await db.transaction(async tx => {
            await tx.execute(sql`insert into business_changes default values`);
            await writeAuditEntry(tx, { action:'MULTIPROCESS', entityType:'test', details:JSON.stringify({pid:process.pid,i}) });
            if(i%10===0) await writeAuditEntry(tx, { action:'SECOND', entityType:'test' });
          });
        }
      }));
    } finally { await pool.end(); }
    return;
  }
  const admin = new Pool({connectionString:process.env.AUDIT_TEST_DATABASE_URL});
  try {
    await admin.query(`CREATE SCHEMA "${namespace}"`);
    await pool.query(`CREATE TABLE audit_logs (id serial PRIMARY KEY,"actorUserId" integer,action varchar(100) NOT NULL,"entityType" varchar(50),"entityId" integer,details text,"prevHash" varchar(64),hash varchar(64) NOT NULL,"ipAddress" varchar(50),"createdAt" timestamp DEFAULT now()); CREATE TABLE business_changes(id serial PRIMARY KEY)`);
    const start=performance.now();
    await Promise.all(Array.from({length:4}, (_,i) => new Promise<void>((resolve,reject) => {
      const child=spawn(process.execPath,['--import','tsx',process.argv[1],'--worker'],{env:{...process.env,HEAVY_AUDIT_SCHEMA:namespace,TZ:i%2?'Asia/Tehran':'America/New_York'},stdio:['ignore','ignore','pipe']});
      let error=''; child.stderr.on('data',d=>error+=d); child.on('error',reject); child.on('exit',code=>code===0?resolve():reject(new Error(`worker failed ${code}: ${error}`)));
    })));
    const rows=await db.select().from(schema.audit_logs).orderBy(schema.audit_logs.id);
    const report=verifyAuditChain(rows.map(r=>({...r,createdAt:r.createdAt!})));
    assert.equal(report.ok,true,JSON.stringify(report.errors)); assert.equal(report.verified,4400);
    assert.equal(Number((await pool.query('select count(*) from business_changes')).rows[0].count),4000);
    console.log(JSON.stringify({transactions:4000,auditRecords:4400,processes:4,connections:48,durationMs:Math.round(performance.now()-start),chain:report.ok}));
    // Kill a real backend while it owns the audit advisory lock. Its work must
    // roll back and the waiting writer must recover without a permanently held lock.
    let signal!: (pid:number)=>void;
    const ready=new Promise<number>(resolve=>signal=resolve);
    const dying=db.transaction(async tx=>{
      const pid=Number((await tx.execute(sql`select pg_backend_pid() as pid`)).rows[0].pid);
      await tx.execute(sql`insert into business_changes default values`);
      await writeAuditEntry(tx,{action:'KILLED_TRANSACTION',entityType:'test'});
      signal(pid);
      await tx.execute(sql`select pg_sleep(30)`);
    });
    const rejected=assert.rejects(dying);
    const pid=await ready;
    await admin.query('select pg_terminate_backend($1)',[pid]);
    await rejected;
    await db.transaction(tx=>writeAuditEntry(tx,{action:'AFTER_KILL',entityType:'test'}));
    const final=await db.select().from(schema.audit_logs).orderBy(schema.audit_logs.id);
    assert.equal(final.length,4401); assert.ok(final.every(r=>r.action!=='KILLED_TRANSACTION'));
    assert.equal(Number((await pool.query('select count(*) from business_changes')).rows[0].count),4000);
    assert.equal(verifyAuditChain(final.map(r=>({...r,createdAt:r.createdAt!}))).ok,true);
    console.log('PASS: forced backend termination rolled back audit/business rows and released shared lock');
  } finally {
    await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`); await admin.end();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
