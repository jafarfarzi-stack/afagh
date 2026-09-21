import fs from 'fs';
const decoder = new TextDecoder('windows-1256');

const tatbighBuf = fs.readFileSync('E:\\git\\information afagh\\tatbigh dars.txt');
const tatbighLines = decoder.decode(tatbighBuf).split(/\r?\n/).filter(x => x.trim());

const dorosBuf = fs.readFileSync('E:\\git\\information afagh\\DOROS.txt');
const dorosLines = decoder.decode(dorosBuf).split(/\r?\n/).filter(x => x.trim());

const dorosMap = new Map();
for (let i = 1; i < dorosLines.length; i++) {
  const p = dorosLines[i].split('\t');
  const c = p[2]?.trim();
  const acc = p[7]?.trim();
  const rej = p[8]?.trim();
  if (c && (acc || rej)) {
    dorosMap.set(c, { acc, rej });
  }
}

let jebCount = 0;
let jebInDoros = 0;
let jebAccCodes = {};

for (let i = 1; i < tatbighLines.length; i++) {
  const p = tatbighLines[i].split('\t');
  const code = p[0]?.trim();
  const type = p[7]?.trim();
  if (type?.includes('جبران')) {
    jebCount++;
    const d = dorosMap.get(code);
    if (d) {
      jebInDoros++;
      jebAccCodes[d.acc] = (jebAccCodes[d.acc] || 0) + 1;
    }
  }
}

console.log('Total compensatory in tatbigh:', jebCount);
console.log('Found in DOROS:', jebInDoros);
console.log('Accept codes for compensatory in DOROS:', jebAccCodes);
