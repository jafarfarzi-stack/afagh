import fs from 'fs';
const buf = fs.readFileSync('E:\\git\\information afagh\\آیین نامه.txt');
console.log('bytes:', Array.from(buf.slice(0,100)));
for (const enc of ['utf-8','utf16le','windows-1256','iso-8859-6','windows-1252']) {
  try {
    const t = new TextDecoder(enc).decode(buf);
    console.log('===', enc, '===');
    console.log(t.slice(0,500));
  } catch(e){ console.log(enc, e.message); }
}
