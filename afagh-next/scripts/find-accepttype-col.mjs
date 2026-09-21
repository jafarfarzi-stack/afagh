import fs from 'fs';
import readline from 'readline';

async function checkCols(filePath, name) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineIndex = 0;
  let headers = [];
  const colStats = {};

  for await (const line of rl) {
    lineIndex++;
    if (lineIndex === 1) continue;
    if (lineIndex === 2) {
      headers = line.split('\t').map(x => x.trim());
      continue;
    }
    const cols = line.split('\t');
    for (let i = 0; i < cols.length; i++) {
      const val = cols[i]?.trim();
      if (!val) continue;
      // check if val is in [1, 5, 6, 14, 15, 17]
      if (['1', '5', '6', '14', '15', '17'].includes(val)) {
        colStats[i] = (colStats[i] || 0) + 1;
      }
    }
    if (lineIndex > 1000) break;
  }

  console.log(`\n=== ${name} Columns having entry values [1,5,6,14,15,17] (sample 1000) ===`);
  for (const [col, count] of Object.entries(colStats)) {
    console.log(`Col ${col} (${headers[col]}): ${count} matches`);
  }
}

async function main() {
  await checkCols('E:\\git\\information afagh\\studentraw data.txt', 'studentraw data.txt');
  await checkCols('E:\\git\\information afagh\\students1.txt', 'students1.txt');
}

main().catch(console.error);
