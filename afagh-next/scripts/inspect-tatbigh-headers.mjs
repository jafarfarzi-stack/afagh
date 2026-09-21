import fs from 'fs';

function inspectFile(path, name) {
  if (!fs.existsSync(path)) {
    console.log(`${name}: NOT FOUND`);
    return;
  }
  const decoder = new TextDecoder('windows-1256');
  const buf = fs.readFileSync(path);
  const text = decoder.decode(buf);
  const lines = text.split(/\r?\n/).filter(x => x.trim()).slice(0, 5);
  console.log(`=== ${name} (${lines.length} lines shown) ===`);
  lines.forEach((l, i) => console.log(i, l.split('\t')));
}

inspectFile('E:\\git\\backup\\information-shams\\tatbigh dars.txt', 'SHAMS tatbigh dars');
inspectFile('E:\\git\\information afagh\\tatbigh dars.txt', 'AFAGH tatbigh dars');
inspectFile('E:\\git\\information afagh\\DOROS.txt', 'AFAGH DOROS');
