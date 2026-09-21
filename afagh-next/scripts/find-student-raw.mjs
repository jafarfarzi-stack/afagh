import fs from 'fs';
import readline from 'readline';

async function findStudentInRaw() {
  const fileStream = fs.createReadStream('E:\\git\\information afagh\\studentraw data.txt', 'latin1');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.includes('9922234502')) {
      const parts = line.split('\t');
      console.log('Student 9922234502 raw columns:');
      console.log('Col 0 (code):', parts[0]);
      console.log('Col 87/88/89:');
      for (let i = 80; i < Math.min(parts.length, 95); i++) {
        console.log(`Col ${i}:`, parts[i]);
      }
      break;
    }
  }
}

findStudentInRaw();
