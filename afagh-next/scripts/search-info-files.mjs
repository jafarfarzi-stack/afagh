import fs from 'fs';
import path from 'path';

const dir = 'E:\\git\\information afagh';
const files = fs.readdirSync(dir);
for (const f of files) {
  try {
    const full = path.join(dir, f);
    const buf = fs.readFileSync(full);
    // check first 500 bytes as latin1 / utf8
    const txt = buf.toString('latin1');
    if (txt.includes('جبراني') || txt.includes('وضع نمره') || txt.includes('931') || txt.includes('مارک') || txt.includes('markStat')) {
      console.log('Match:', f, 'size:', buf.length);
    }
  } catch (e) {}
}
