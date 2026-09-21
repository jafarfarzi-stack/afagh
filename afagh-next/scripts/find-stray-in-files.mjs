import fs from 'fs';

const buf = fs.readFileSync('E:\\git\\information afagh\\studentraw data.txt', 'latin1');
const lines = buf.split('\n');
console.log('total lines:', lines.length);
for (const t of ['4002239606', '9993264009', '961\t']) {
  const hit = lines.filter(l => l.split('\t')[0] === t.replace('\t', ''));
  console.log(`--- STNO=${t.trim()} matches: ${hit.length}`);
  for (const l of hit.slice(0, 2)) {
    const cols = l.split('\t');
    console.log('  ncols:', cols.length, '| NAME:', JSON.stringify(cols[2]), '| STATUS:', JSON.stringify(cols[4]), '| MAGHTA:', JSON.stringify(cols[7]), '| RESHTE:', JSON.stringify(cols[8]));
  }
}
// check students1.txt too
const buf1 = fs.readFileSync('E:\\git\\information afagh\\students1.txt', 'latin1').split('\n');
for (const t of ['4002239606', '9993264009']) {
  const hit = buf1.filter(l => l.split('\t')[0] === t);
  console.log(`students1 STNO=${t}: ${hit.length} match(es)`);
}
