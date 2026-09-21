import fs from 'fs';

const dir = 'E:\\git\\information afagh';
const files = ['students1.txt', 'student2.txt', 'studentraw data.txt'];
const targets = ['4001156750', '4042123456', '4031253061'];

for (const f of files) {
  const buf = fs.readFileSync(`${dir}\\${f}`, 'latin1');
  console.log(`--- ${f} (${(buf.length / 1048576).toFixed(1)} MB) ---`);
  for (const t of targets) {
    console.log(`  ${t}: ${buf.includes(t) ? 'FOUND' : 'not found'}`);
  }
}
// also get header of student2.txt to confirm same schema
const h = fs.readFileSync(`${dir}\\student2.txt`, 'latin1').split('\n')[0];
console.log('student2 header:', h.slice(0, 120));
const h1 = fs.readFileSync(`${dir}\\students1.txt`, 'latin1').split('\n')[0];
console.log('students1 header:', h1.slice(0, 120));
