import fs from 'fs';

const files = [
  'نحوه ورود به دانشگاه.txt',
  'نحوه ورورد به دانشگاه.txt',
  'شيوه آموزش.txt',
  'نوع دوره.txt',
  'دوره.txt',
  'دانشکده.txt',
  'وضعيت نظام وظيفه.txt',
  'نظام وظيفه.txt'
];

for (const f of files) {
  const p = 'E:\\git\\information afagh\\' + f;
  if (fs.existsSync(p)) {
    console.log(`=== ${f} ===`);
    console.log(fs.readFileSync(p, 'utf8').slice(0, 500));
  }
}
