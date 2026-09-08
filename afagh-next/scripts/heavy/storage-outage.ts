import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
async function main(){
  if(process.env.HEAVY_TEST_ACK!=='isolated-local-only')throw new Error('Isolated local test only');
  const f=JSON.parse(await readFile(process.env.HEAVY_FIXTURE_FILE||'/home/user/.cache/heavy-fixtures.json','utf8'));
  const down=process.argv.includes('--down');
  const pool=new Pool({connectionString:process.env.DATABASE_URL});
  try{
    const before=Number((await pool.query('select count(*) from student_documents where "personUserId"=$1',[f.owner.id])).rows[0].count);
    const statuses=await Promise.all(Array.from({length:24},async()=>{
      const res=await fetch(`${f.base}/api/archive/${f.docId}`,{headers:{cookie:`token=${f.owner.token}`},signal:AbortSignal.timeout(20000)});
      const text=await res.text();assert.equal(res.status,down?503:200);if(down){assert.ok(!text.includes('<svg'));assert.equal(res.headers.get('cache-control'),'no-store');}return res.status;
    }));
    const form=new FormData();form.set('studentUserId',String(f.owner.id));form.set('categoryId',String(f.category));form.set('file',new Blob(['%PDF outage-test'],{type:'application/pdf'}),'test.pdf');
    const res=await fetch(f.base+'/api/admin/archive/upload',{method:'POST',headers:{cookie:`token=${f.owner.token}`},body:form,signal:AbortSignal.timeout(20000)});
    assert.equal(res.status,down?503:200);
    const after=Number((await pool.query('select count(*) from student_documents where "personUserId"=$1',[f.owner.id])).rows[0].count);
    assert.equal(after,before+(down?0:1));
    console.log(JSON.stringify({phase:down?'storage-down':'storage-recovered',reads:statuses.length,readStatus:statuses[0],uploadStatus:res.status,documentDelta:after-before}));
  }finally{await pool.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
