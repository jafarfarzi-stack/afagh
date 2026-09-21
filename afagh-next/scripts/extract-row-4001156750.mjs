import fs from 'fs';

const buf = fs.readFileSync('E:\\git\\information afagh\\students1.txt', 'latin1');
const lines = buf.split('\n');
console.log('total lines:', lines.length);
// header is line 0 (empty-ish?), find header with STNO
for (let i = 0; i < 5; i++) console.log(`line${i}:`, JSON.stringify(lines[i].slice(0, 80)));
const hit = lines.filter(l => l.includes('4001156750'));
console.log('matching lines:', hit.length);
for (const l of hit.slice(0, 3)) {
  const cols = l.split('\t');
  console.log('ncols:', cols.length);
  console.log('col0 STNO:', JSON.stringify(cols[0]));
  console.log('col1 OLDSTNO:', JSON.stringify(cols[1]));
  console.log('col2 NAME:', JSON.stringify(cols[2]));
  console.log('col3 SEX:', JSON.stringify(cols[3]));
  console.log('col4 status:', JSON.stringify(cols[4]));
}
