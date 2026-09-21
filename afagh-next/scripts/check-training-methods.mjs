import fs from 'fs';
import readline from 'readline';

async function main() {
  const fileStream = fs.createReadStream('E:\\git\\information afagh\\studentraw data.txt');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineIndex = 0;
  const tmCounts = {};
  const ctCounts = {};

  for await (const line of rl) {
    lineIndex++;
    if (lineIndex <= 2) continue;
    const cols = line.split('\t');
    const tm = cols[78]?.trim() || 'EMPTY';
    const ct = cols[6]?.trim() || 'EMPTY';
    tmCounts[tm] = (tmCounts[tm] || 0) + 1;
    ctCounts[ct] = (ctCounts[ct] || 0) + 1;
  }

  console.log('Total TraningMethodId (شیوه آموزش):', tmCounts);
  console.log('Total COURSTYPE (نوع دوره):', ctCounts);
}

main().catch(console.error);
