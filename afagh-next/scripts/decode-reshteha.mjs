import fs from 'fs';

const decoder = new TextDecoder('windows-1256');
const content = decoder.decode(fs.readFileSync('E:\\git\\information afagh\\رشته ها.txt'));

const lines = content.split(/\r?\n/).filter(x => x.trim());
console.log('Total lines in رشته ها.txt:', lines.length);
console.log('Header:', lines[0]);
console.log('Sample rows:');
lines.slice(1, 10).forEach((l, i) => console.log(`${i}: ${l}`));
