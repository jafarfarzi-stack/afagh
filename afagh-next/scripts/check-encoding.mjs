import fs from 'fs';

const buf = fs.readFileSync('E:\\git\\information afagh\\tatbigh dars.txt');

// Let's check first 500 bytes as utf8, windows-1256, etc.
console.log('UTF-8 snippet:');
console.log(buf.slice(0, 500).toString('utf8'));

// If iconv-lite is available or if we can decode windows-1256
try {
  const iconv = await import('iconv-lite');
  console.log('\nWindows-1256 snippet:');
  console.log(iconv.default.decode(buf.slice(0, 500), 'windows-1256'));
} catch (e) {
  console.log('iconv-lite error:', e.message);
}
