import fs from 'fs';
import readline from 'readline';
async function main() {
  const rl = readline.createInterface({ input: fs.createReadStream('E:\\git\\information afagh\\studentraw data.txt'), crlfDelay: Infinity });
  let l = 0;
  for await (const line of rl) {
    l++; if (l<=2) continue;
    const c = line.split('\t');
    if (c[0]?.trim() === '9992243001') {
      console.log('STNO:', c[0]);
      console.log('col6 COURSTYPE:', c[6]);
      console.log('col33 NEZAM:', c[33]);
      console.log('col52 moafiat:', c[52]);
      console.log('col78 training?:', c[78]);
      console.log('total cols:', c.length);
      // try to find gender-ish cols: print all non-empty with index
      c.forEach((v,i)=>{ if(v?.trim() && v.trim()!=='0') console.log(i, JSON.stringify(v.trim().slice(0,60))); });
      break;
    }
  }
}
main().catch(console.error);
