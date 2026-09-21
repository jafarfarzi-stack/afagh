import fs from 'fs';
import readline from 'readline';
async function main() {
  const rl = readline.createInterface({ input: fs.createReadStream('E:\\git\\information afagh\\studentraw data.txt'), crlfDelay: Infinity });
  let l=0; let h=null;
  const cross = new Map();
  for await (const line of rl) {
    l++; if(l===1) continue;
    const c=line.split('\t');
    if(l===2){ h=c; console.log('MAGHTA idx',c.indexOf('MAGHTA'),'RegKind idx',c.indexOf('RegulationKind'),'Startdate idx',c.indexOf('Startdate'),'STNO idx',c.indexOf('STNO')); continue; }
    const maghta=(c[7]||'').trim()||'?';
    const rk=(c[88]||'').trim()||'?';
    const k=maghta+'|'+rk;
    cross.set(k,(cross.get(k)||0)+1);
  }
  console.log('cross MAGHTA|RegKind:', Object.fromEntries([...cross.entries()].sort()));
}
main().catch(console.error);
