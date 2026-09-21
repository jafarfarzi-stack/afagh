import fs from 'fs';
import path from 'path';

function readWin1256OrUtf8(filePath) {
  const buf = fs.readFileSync(filePath);
  // try iconv-lite if available or check buffer
  try {
    const iconv = require('iconv-lite');
    return iconv.decode(buf, 'windows-1256');
  } catch {
    // simple fallback: try utf-8
    try {
      return buf.toString('utf8');
    } catch {
      return buf.toString('latin1');
    }
  }
}

console.log('--- وضع نمرات در کارنامه.txt ---');
try {
  const content1 = readWin1256OrUtf8('E:\\git\\information afagh\\وضع نمرات در کارنامه.txt');
  console.log(content1.slice(0, 3000));
} catch (e) {
  console.error(e);
}

console.log('\n--- وضع نمره.txt ---');
try {
  const content2 = readWin1256OrUtf8('E:\\git\\information afagh\\وضع نمره.txt');
  console.log(content2.slice(0, 3000));
} catch (e) {
  console.error(e);
}
