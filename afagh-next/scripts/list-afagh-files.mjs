import fs from 'fs';
import path from 'path';

const dir = 'E:\\git\\information afagh';
const files = fs.readdirSync(dir);

console.log(`Found ${files.length} files in ${dir}:\n`);
for (const file of files) {
  const full = path.join(dir, file);
  const stat = fs.statSync(full);
  let header = '';
  try {
    const fd = fs.openSync(full, 'r');
    const buf = Buffer.alloc(Math.min(stat.size, 300));
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    header = new TextDecoder('windows-1256').decode(buf).split('\n')[0].slice(0, 100);
  } catch (e) {
    header = 'error reading header';
  }
  console.log(`${file.padEnd(35)} | ${(stat.size / 1024).toFixed(1).padStart(8)} KB | ${header}`);
}
