import fs from 'fs';
import path from 'path';

const dir = 'E:\\git\\information afagh';

const lookupFiles = [
  'دانشکده.txt',
  'نحوه ورود به دانشگاه.txt',
  'نحوه ورورد به دانشگاه.txt',
  'نظام وظيفه.txt',
  'وضعيت نظام وظيفه.txt',
  'دوره.txt',
  'نوع دوره.txt',
  'مقطعها.txt',
  'وضعيت دانشجو.txt',
  'وضع نمره.txt',
  'وضع نمرات در کارنامه.txt'
];

for (const f of lookupFiles) {
  const p = path.join(dir, f);
  if (fs.existsSync(p)) {
    console.log(`\n=================== ${f} ===================`);
    const buf = fs.readFileSync(p);
    const txt = new TextDecoder('windows-1256').decode(buf);
    console.log(txt.trim());
  }
}
