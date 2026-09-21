import fs from 'fs';
import readline from 'readline';

async function main() {
  const fileStream = fs.createReadStream('E:\\git\\information afagh\\student2.txt');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineIndex = 0;
  const acceptCounts = {};

  for await (const line of rl) {
    lineIndex++;
    if (lineIndex <= 2) continue;
    const cols = line.split('\t');
    const at = cols[14]?.trim() || 'EMPTY';
    acceptCounts[at] = (acceptCounts[at] || 0) + 1;
  }

  console.log('Total AcceptType counts from student2.txt:', acceptCounts);
}

main().catch(console.error);
