import fs from 'fs';
import readline from 'readline';
async function main() {
  const rl = readline.createInterface({ input: fs.createReadStream('E:\\git\\information afagh\\studentraw data.txt'), crlfDelay: Infinity });
  let l=0;
  const cross = new Map();
  for await (const line of rl) {
    l++; if(l<=2) continue;
    const c=line.split('\t');
    const rk=(c[88]||'').trim()||'?';
    if(!['914','915','912'].includes(rk)) continue;
    const start=(c[37]||'').trim();
    const maghta=(c[7]||'').trim();
    const stno=(c[0]||'').trim();
    console.log(stno,'maghta',maghta,'rk',rk,'start',start);
    if(l>100000) break;
  }
}
main().catch(console.error);
