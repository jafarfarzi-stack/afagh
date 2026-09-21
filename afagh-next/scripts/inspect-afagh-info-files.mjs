import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';

const dir = 'C:\\Users\\Afagh\\Downloads\\backup\\information-afagh';
const files = fs.readdirSync(dir);

for (const f of files) {
  // Try to inspect buffer if possible, or read first line of each file
  const fullPath = path.join(dir, f);
  try {
    const buf = fs.readFileSync(fullPath);
    // decode first line
    const slice = buf.slice(0, 300);
    const text1256 = iconv.decode(slice, 'windows-1256').split('\n')[0];
    const textUtf8 = slice.toString('utf8').split('\n')[0];
    console.log(`FILE: ${f} -> First line (1256): ${text1256.slice(0, 80)}`);
  } catch (e) {
    console.log(`FILE: ${f} -> Error: ${e.message}`);
  }
}
