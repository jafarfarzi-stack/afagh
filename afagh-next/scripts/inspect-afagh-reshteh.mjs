import fs from 'fs';

const buf = fs.readFileSync('E:\\git\\information afagh\\رشته ها.txt');
const text = new TextDecoder('windows-1256').decode(buf);
const lines = text.split('\n');

console.log('Total lines in رشته ها.txt:', lines.length);
console.log('Headers:', lines[0]);
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  const cols = line.split('\t');
  if (cols[0] === '43' || cols[0] === '548' || cols[0] === '503' || cols[0] === '536' || i < 15) {
    console.log(`Code ${cols[0]}: ${cols[1]} | Degree: ${cols[2]} | Faculty: ${cols[3]} | Group: ${cols[4]}`);
  }
}
