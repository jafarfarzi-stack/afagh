import fs from 'fs';
import readline from 'readline';

const filePath = 'E:\\git\\information afagh\\studentraw data.txt';

async function main() {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let lineIndex = 0;
  let headers = [];

  for await (const line of rl) {
    lineIndex++;
    if (lineIndex === 2) {
      // line 2 is the actual header row: STNO, OLDSTNO, etc.
      headers = line.split('\t').map(c => c.trim());
      console.log('Found headers row:');
      headers.forEach((h, idx) => console.log(`  ${idx}: ${h}`));
    }
    if (lineIndex > 2) {
      const cols = line.split('\t').map(c => c.trim());
      const stno = cols[0];
      if (stno === '9992243001' || lineIndex < 6) {
        console.log(`\nRow for student ${stno}:`);
        console.log(`  STNO: ${cols[0]}`);
        console.log(`  NAME: ${cols[2]}`);
        console.log(`  STATUS: ${cols[4]}`);
        console.log(`  COURSTYPE (شیوه): ${cols[6]}`);
        console.log(`  MAGHTA: ${cols[7]}`);
        console.log(`  RESHTE: ${cols[8]}`);
        console.log(`  DANESHKADEH (دانشکده): ${cols[9]}`);
        console.log(`  DAV (نحوه ورود): ${cols[11]}`);
        console.log(`  NEZAM (نظام وظیفه): ${cols[33]}`);
        if (stno === '9992243001') break;
      }
    }
  }
}

main().catch(console.error);
