import fs from 'fs';
import readline from 'readline';

async function checkBrokenLines(filePath) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  let l = 0;
  let validStno = 0;
  let invalidStno = 0;

  for await (const line of rl) {
    l++;
    if (l <= 2) continue;
    const c = line.split('\t');
    const stno = c[0]?.trim();
    if (/^\d{5,20}$/.test(stno)) {
      validStno++;
    } else {
      invalidStno++;
    }
  }
  console.log(`${filePath} -> Valid: ${validStno}, Invalid/broken lines: ${invalidStno}`);
}

async function main() {
  await checkBrokenLines('E:\\git\\information afagh\\studentraw data.txt');
  await checkBrokenLines('E:\\git\\information afagh\\student2.txt');
}

main().catch(console.error);
