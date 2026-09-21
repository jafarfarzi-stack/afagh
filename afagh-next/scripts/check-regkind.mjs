import fs from 'fs';
import readline from 'readline';
async function dist(file, colName) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let header = null; let idx = -1;
  const counts = new Map();
  let l = 0;
  for await (const line of rl) {
    l++; if (l===1) continue; // first blank line?
    const cols = line.split('\t');
    if (l===2) { header = cols; idx = cols.findIndex(c=>c.trim()===colName); console.log(file, 'header len', cols.length, 'idx', idx); if(idx<0) { console.log(cols.slice(80,100)); return; } continue; }
    if (idx>=0) {
      const v = (cols[idx]||'').trim();
      counts.set(v, (counts.get(v)||0)+1);
    }
    if (l>50000) break;
  }
  console.log(file, colName, 'dist (first 50k):', Object.fromEntries([...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20)));
}
async function main() {
  await dist('E:\\git\\information afagh\\students1.txt', 'RegulationKind');
  await dist('E:\\git\\information afagh\\studentraw data.txt', 'RegulationKind');
}
main().catch(console.error);
