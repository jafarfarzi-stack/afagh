import fs from 'fs';
import readline from 'readline';

async function checkStudent(stno) {
  console.log(`Checking student ${stno}...`);

  // check studentraw data.txt
  const rl1 = readline.createInterface({
    input: fs.createReadStream('E:\\git\\information afagh\\studentraw data.txt'),
    crlfDelay: Infinity
  });

  let h1 = [];
  let row1 = null;
  let idx = 0;
  for await (const line of rl1) {
    idx++;
    if (idx === 2) h1 = line.split('\t').map(x => x.trim());
    if (idx > 2) {
      const parts = line.split('\t');
      if (parts[0]?.trim() === stno) {
        row1 = parts;
        break;
      }
    }
  }

  if (row1) {
    console.log('\n--- studentraw data.txt ---');
    h1.forEach((h, i) => {
      const v = row1[i]?.trim();
      if (v) console.log(`${i}: ${h} = ${v}`);
    });
  }

  // check student2.txt
  const rl2 = readline.createInterface({
    input: fs.createReadStream('E:\\git\\information afagh\\student2.txt'),
    crlfDelay: Infinity
  });

  let h2 = [];
  let row2 = null;
  idx = 0;
  for await (const line of rl2) {
    idx++;
    if (idx === 2) h2 = line.split('\t').map(x => x.trim());
    if (idx > 2) {
      const parts = line.split('\t');
      if (parts[0]?.trim() === stno) {
        row2 = parts;
        break;
      }
    }
  }

  if (row2) {
    console.log('\n--- student2.txt ---');
    h2.forEach((h, i) => {
      const v = row2[i]?.trim();
      if (v) console.log(`${i}: ${h} = ${v}`);
    });
  }
}

checkStudent('9992243001').catch(console.error);
