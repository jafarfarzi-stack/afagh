import fs from 'fs';
const decoder = new TextDecoder('windows-1256');

function printFile(file) {
  const buf = fs.readFileSync(`E:\\git\\backup\\information-afagh\\${file}`);
  const lines = decoder.decode(buf).split(/\r?\n/).filter(x => x.trim());
  console.log(`=== ${file} (${lines.length} lines) ===`);
  lines.slice(0, 15).forEach((l, i) => console.log(i, l.split('\t')));
}

printFile('گروههاي اموزشي.txt');
printFile('مقطعها.txt');
printFile('نوع درس.txt');
