import fs from 'fs';

const decoder = new TextDecoder('windows-1256');

function checkShams() {
  const buf = fs.readFileSync('E:\\git\\backup\\information-shams\\tatbigh dars.txt');
  const lines = decoder.decode(buf).split(/\r?\n/).filter(x => x.trim());
  console.log('SHAMS tatbigh lines:', lines.length);
  const sample = [];
  for (let i = 1; i < Math.min(lines.length, 10); i++) {
    const p = lines[i].split('\t');
    sample.push({
      code: p[0],
      title: p[1],
      group: p[3],
      units: p[4],
      theory: p[5],
      prac: p[6],
      type: p[7],
      degree: p[8],
      pass: p[24],
      fail: p[25]
    });
  }
  console.table(sample);
}

checkShams();
