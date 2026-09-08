import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
async function main(){
 if(process.env.HEAVY_TEST_ACK!=='isolated-local-only')throw new Error('Isolated only');
 const f=JSON.parse(await readFile(process.env.HEAVY_FIXTURE_FILE || '/home/user/.cache/heavy-fixtures.json','utf8'));
 const body=Buffer.alloc(10*1024*1024,65);body.write('%PDF-1.4\n');const digest=createHash('sha256').update(body).digest('hex');
 let next=0;const start=performance.now();
 await Promise.all(Array.from({length:4},async()=>{while(next<12){next++;
   const form=new FormData();form.set('studentUserId',String(f.owner.id));form.set('categoryId',String(f.category));form.set('file',new Blob([body],{type:'application/pdf'}),'large.pdf');
   const upload=await fetch(f.base+'/api/admin/archive/upload',{method:'POST',headers:{cookie:`token=${f.owner.token}`},body:form,signal:AbortSignal.timeout(30000)});assert.equal(upload.status,200);const doc=await upload.json();
   const read=await fetch(f.base+'/api/archive/'+doc.docId,{headers:{cookie:`token=${f.owner.token}`},signal:AbortSignal.timeout(30000)});assert.equal(read.status,200);
   const bytes=Buffer.from(await read.arrayBuffer());assert.equal(bytes.length,body.length);assert.equal(createHash('sha256').update(bytes).digest('hex'),digest);
 }}));console.log(JSON.stringify({files:12,eachBytes:body.length,totalUploadedMiB:120,totalDownloadedMiB:120,concurrency:4,durationMs:Math.round(performance.now()-start),byteIntegrity:true}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
