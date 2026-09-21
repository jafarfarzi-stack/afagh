import fs from 'fs';
const decoder = new TextDecoder('windows-1256');

const buf = fs.readFileSync('E:\\git\\backup\\information-afagh\\گروههاي اموزشي.txt');
const lines = decoder.decode(buf).split(/\r?\n/).filter(x => x.trim());
console.log('Total depts in file:', lines.length - 1);
const depts = [];
for (let i = 1; i < lines.length; i++) {
  const p = lines[i].split('\t');
  depts.push({ code: p[0], name: p[1], facCode: p[3] });
}
console.table(depts);
