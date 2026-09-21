import fs from 'fs';
import readline from 'readline';

async function main() {
  const fileStream = fs.createReadStream('E:\\git\\information afagh\\studentraw data.txt');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineIndex = 0;
  const davCounts = {};
  const nezamCounts = {};
  const coursTypeCounts = {};

  for await (const line of rl) {
    lineIndex++;
    if (lineIndex <= 2) continue;
    const cols = line.split('\t');
    const dav = cols[11]?.trim() || 'EMPTY';
    const nezam = cols[33]?.trim() || 'EMPTY';
    const ct = cols[6]?.trim() || 'EMPTY';

    davCounts[dav] = (davCounts[dav] || 0) + 1;
    nezamCounts[nezam] = (nezamCounts[nezam] || 0) + 1;
    coursTypeCounts[ct] = (coursTypeCounts[ct] || 0) + 1;

    if (lineIndex > 10000) break;
  }

  console.log('Sample 10000 DAV (نحوه ورود):', davCounts);
  console.log('Sample 10000 NEZAM (نظام وظیفه):', nezamCounts);
  console.log('Sample 10000 COURSTYPE (شیوه):', coursTypeCounts);
}

main().catch(console.error);
