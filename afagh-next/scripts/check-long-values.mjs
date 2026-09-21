import fs from 'fs';
import readline from 'readline';

async function main() {
  const rl2 = readline.createInterface({
    input: fs.createReadStream('E:\\git\\information afagh\\student2.txt'),
    crlfDelay: Infinity,
  });

  let l = 0;
  for await (const line of rl2) {
    l++;
    if (l <= 2) continue;
    const c = line.split('\t');
    const stno = c[0]?.trim();
    const arch = c[19]?.trim();
    const moafNo = c[17]?.trim();

    if (stno && stno.length > 50) console.log('Long stno:', stno);
    if (arch && arch.length > 50) console.log('Long arch (len ' + arch.length + '):', arch);
    if (moafNo && moafNo.length > 50) console.log('Long moafNo (len ' + moafNo.length + '):', moafNo);
  }
  console.log('Checked student2.txt');
}

main().catch(console.error);
