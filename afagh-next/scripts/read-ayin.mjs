import fs from 'fs';
const buf = fs.readFileSync('E:\\git\\information afagh\\آیین نامه.txt');
const txt = new TextDecoder('windows-1256').decode(buf);
console.log(txt.slice(0, 4000));
console.log('---LINES---', txt.split(/\r?\n/).length);
