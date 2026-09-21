import fs from 'fs';
import readline from 'readline';

async function main() {
  const fileStream = fs.createReadStream('E:\\git\\information afagh\\studentraw data.txt');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineIndex = 0;
  for await (const line of rl) {
    lineIndex++;
    if (lineIndex <= 2) {
      console.log(`Line ${lineIndex}:`, line.split('\t'));
    } else {
      break;
    }
  }
}

main().catch(console.error);
