import fs from 'fs';
import readline from 'readline';
async function main() {
  for (const f of ['E:\\git\\information afagh\\studentraw data.txt','E:\\git\\information afagh\\student2.txt']) {
    const rl = readline.createInterface({ input: fs.createReadStream(f), crlfDelay: Infinity });
    let l=0; const counts=new Map(); let header=null;
    for await (const line of rl) {
      l++; if(l===1) continue;
      const cols=line.split('\t');
      if(l===2){ header=cols; const i88=cols[88]; console.log(f,'col88 header:',JSON.stringify(i88)); continue; }
      const v=(cols[88]||'').trim();
      counts.set(v,(counts.get(v)||0)+1);
    }
    console.log(f,'total',l,'dist:',Object.fromEntries([...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,25)));
  }
}
main().catch(console.error);
