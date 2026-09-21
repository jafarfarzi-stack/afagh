import fs from 'fs';
import readline from 'readline';

async function main() {
  const filePath = 'E:\\git\\information afagh\\DOROS.txt';
  if (!fs.existsSync(filePath)) {
    console.log('File not found:', filePath);
    return;
  }

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineCount = 0;
  let header = '';
  const searchCodes = new Set(['43124', '43126', '99013', '43110', '43136', '43141', '99010', '99012', '43132', '43133', '43138', '43139', '43140']);
  const matched = [];

  for await (const line of rl) {
    lineCount++;
    if (lineCount === 1) {
      header = line;
      console.log('Header of DOROS.txt:\n', header);
      continue;
    }
    const cols = line.split('\t');
    const code = cols[0]?.trim();
    if (searchCodes.has(code)) {
      matched.push(line);
    }
  }

  console.log(`Total lines in DOROS.txt: ${lineCount}`);
  console.log(`Found ${matched.length} matches for search codes:`);
  for (const m of matched) {
    console.log(m);
  }
}

main().catch(console.error);
