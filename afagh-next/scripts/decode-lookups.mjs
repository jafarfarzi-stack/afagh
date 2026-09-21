import fs from 'fs';

const decoder = new TextDecoder('windows-1256');

function readFile1256(filename) {
  const buf = fs.readFileSync('E:\\git\\information afagh\\' + filename);
  return decoder.decode(buf);
}

const files = [
  'دانشکده.txt',
  'نحوه ورود به دانشگاه.txt',
  'نظام وظيفه.txt',
  'دوره.txt',
  'شيوه آموزش.txt',
  'نوع دوره.txt'
];

for (const f of files) {
  console.log(`\n=================== ${f} ===================`);
  const lines = readFile1256(f).split(/\r?\n/).filter(x => x.trim());
  lines.slice(0, 15).forEach((l, i) => console.log(`${i}: ${l}`));
}
