import fs from 'fs';

const buf = fs.readFileSync('E:\\git\\information afagh\\tatbigh dars.txt');
const str = buf.toString('latin1');
const lines = str.split('\n');

for (const l of lines) {
  if (l.startsWith('43124') || l.startsWith('99013') || l.startsWith('43126')) {
    console.log(l);
    // inspect hex bytes of course title
    const parts = l.split('\t');
    console.log('Title bytes:', Buffer.from(parts[1], 'latin1'));
  }
}
