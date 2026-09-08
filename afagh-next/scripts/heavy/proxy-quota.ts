import assert from 'node:assert/strict';
import Redis from 'ioredis';
async function main(){
  if(process.env.HEAVY_TEST_ACK!=='isolated-local-only')throw new Error('Isolated local only');
  const redis=new Redis(process.env.REDIS_URL!);
  try{
    // Target only known test keys, never flush a database.
    await redis.del('rl:verify-legacy:127.0.0.1','rl:verify-legacy:unknown');
    for(const [base,expected] of [['http://127.0.0.1:58081','127.0.0.1'],['http://127.0.0.1:58080','unknown']]){
      const results=await Promise.all(Array.from({length:100},async(_,i)=>{
        const res=await fetch(base+`/verify/HEAVY${i}`,{headers:{'x-forwarded-for':`192.0.2.${i}`,'x-real-ip':`192.0.2.${i}`,'x-afagh-client-ip':`192.0.2.${i}`,'x-afagh-proxy-token':'forged'},signal:AbortSignal.timeout(30000)});
        const text=await res.text();assert.equal(res.status,200);return text.includes('تعداد استعلام‌ها بیش از حد مجاز شد');
      }));
      const limited=results.filter(Boolean).length;assert.equal(limited,85);
      assert.equal(await redis.get(`rl:verify-legacy:${expected}`),'100');
      console.log(JSON.stringify({base,requests:100,spoofedIPs:100,limited,limiterIdentity:expected}));
    }
  }finally{redis.disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
