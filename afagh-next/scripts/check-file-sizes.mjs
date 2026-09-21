import fs from 'fs';

function countLines(p) {
  try {
    const stat = fs.statSync(p);
    return `${(stat.size / (1024 * 1024)).toFixed(2)} MB`;
  } catch (e) {
    return 'NOT FOUND';
  }
}

const dir = 'E:\\git\\information afagh';
const files = [
  'students1.txt',
  'student2.txt',
  'studentraw data.txt',
  'جدول نمرات و انتخاب واحد.txt'
];

for (const f of files) {
  console.log(`${f}: ${countLines(`${dir}\\${f}`)}`);
}
