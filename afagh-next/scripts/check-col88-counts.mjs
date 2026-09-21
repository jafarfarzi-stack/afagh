import fs from 'fs';
import readline from 'readline';

async function main() {
  const fileStream = fs.createReadStream('E:\\git\\information afagh\\studentraw data.txt', 'latin1');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const counts = {};
  let total = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const reg = (parts[88] || '').trim();
    counts[reg] = (counts[reg] || 0) + 1;
    total++;
  }
  console.log('Total lines:', total);
  console.table(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}

main();
