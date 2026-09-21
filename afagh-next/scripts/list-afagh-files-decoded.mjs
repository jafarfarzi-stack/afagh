import fs from 'fs';
import path from 'path';

const dir = 'E:\\git\\backup\\information-afagh';
const files = fs.readdirSync(dir);
const decoder = new TextDecoder('windows-1256');

for (const f of files) {
  const full = path.join(dir, f);
  try {
    const stat = fs.statSync(full);
    const fd = fs.openSync(full, 'r');
    const buf = Buffer.alloc(300);
    const bytes = fs.readSync(fd, buf, 0, 300, 0);
    fs.closeSync(fd);
    const firstLine = decoder.decode(buf.subarray(0, bytes)).split(/\r?\n/)[0];
    console.log(f.padEnd(35), `${stat.size}`.padStart(10), ' | ', firstLine.slice(0, 80));
  } catch (e) {
    console.log(f, 'ERR:', e.message);
  }
}
