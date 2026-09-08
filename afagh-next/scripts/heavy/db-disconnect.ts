import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
async function main(){
 if(process.env.HEAVY_TEST_ACK!=='isolated-local-only')throw new Error('Isolated only');
 const pool=new Pool({connectionString:process.env.DATABASE_URL,application_name:'heavy-fault-control'});
 const f=JSON.parse(await readFile(process.env.HEAVY_FIXTURE_FILE || '/home/user/.cache/heavy-fixtures.json','utf8'));
 const read=()=>fetch(`${f.base}/api/archive/${f.docId}`,{headers:{cookie:`token=${f.owner.token}`},signal:AbortSignal.timeout(15000)});
 try{
  const before=await read();assert.equal(before.status,200);await before.arrayBuffer();
  const clients=(await pool.query(`SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND application_name='' AND backend_type='client backend'`)).rows;
  assert.ok(clients.length>0);
  for(const c of clients)await pool.query('SELECT pg_terminate_backend($1)',[c.pid]);
  const statuses=await Promise.all(Array.from({length:24},async()=>{const r=await read();await r.arrayBuffer();return r.status;}));
  assert.ok(statuses.every(s=>s===200));
  console.log(JSON.stringify({terminatedDatabaseClients:clients.length,nextProcessSurvived:true,recoveryRequests:24,allStatus200:true}));
 }finally{await pool.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
