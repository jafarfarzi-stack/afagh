import assert from 'node:assert/strict';
if(process.env.HEAVY_TEST_ACK!=='isolated-local-only')throw new Error('Isolated only');
const start=performance.now();
const results=await Promise.all(Array.from({length:30},async(_,i)=>{
 const r=await fetch(`http://127.0.0.1:58081/verify/REDISDOWN${i}`,{headers:{'x-forwarded-for':`198.51.100.${i}`},signal:AbortSignal.timeout(30000)});
 assert.equal(r.status,200);return (await r.text()).includes('تعداد استعلام‌ها بیش از حد مجاز شد');
}));
assert.equal(results.filter(Boolean).length,15);
console.log(JSON.stringify({redis:'stopped',requests:30,limited:15,spoofedHeaderDidNotBypass:true,durationMs:Math.round(performance.now()-start)}));
