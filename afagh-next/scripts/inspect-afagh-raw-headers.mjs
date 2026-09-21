import fs from 'fs';
import path from 'path';

const dir = 'E:\\git\\information afagh';
const files = ['studentraw data.txt', 'students1.txt', 'student2.txt'];

for (const f of files) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) continue;
  const fd = fs.openSync(p, 'r');
  const buf = Buffer.alloc(4096);
  fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  const str = new TextDecoder('windows-1256').decode(buf);
  const lines = str.split('\n');
  console.log(`\n=================== ${f} ===================`);
  console.log('Line 0 cols count:', lines[0].split('\t').length);
  console.log('Columns:');
  const cols = lines[0].split('\t').map((c, i) => `${i}: ${c.trim()}`);
  console.log(cols.join(', '));
  if (lines[1]) {
    console.log('\nSample Row 1:');
    const row1 = lines[1].split('\t').map((c, i) => `${cols[i] || i}=>${c.trim()}`);
    console.log(row1.slice(0, 35).join(', '));
  }
}
