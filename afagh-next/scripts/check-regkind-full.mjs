import fs from 'fs';
import readline from 'readline';
async function main() {
  const rl = readline.createInterface({ input: fs.createReadStream('E:\\git\\information afagh\\students1.txt'), crlfDelay: Infinity });
  let l = 0; const counts = new Map();
  for await (const line of rl) {
    l++; if (l<=2) continue;
    const cols = line.split('\t');
    const v = (cols[88]||'').trim();
    counts.set(v,(counts.get(v)||0)+1);
  }
  console.log('total lines:', l);
  console.log('dist:', Object.fromEntries([...counts.entries()].sort((a,b)=>b[1]-a[1])));
  // sample a 93 and 94 row
  const rl2 = readline.createInterface({ input: fs.createReadStream('E:\\git\\information afagh\\students1.txt'), crlfDelay: Infinity });
  let l2=0, s93=0, s94=0;
  for await (const line of rl2) {
    l2++; if(l2<=2) continue;
    const cols=line.split('\t');
    if(cols[88]?.trim()==='93' && s93<3){ console.log('S93 STNO',cols[0],'MAGHTA',cols[7],'REGKIND raw:',JSON.stringify(cols[88]),'neighbors:',JSON.stringify(cols.slice(86,92))); s93++; }
    if(cols[88]?.trim()==='94' && s94<3){ console.log('S94 STNO',cols[0],'MAGHTA',cols[7],'REGKIND raw:',JSON.stringify(cols[88]),'neighbors:',JSON.stringify(cols.slice(86,92))); s94++; }
    if(s93>=3&&s94>=3) break;
  }
}
main().catch(console.error);
