import fs from 'fs';

const decoder = new TextDecoder('windows-1256');

function analyzeAfagh() {
  const tatbighBuf = fs.readFileSync('E:\\git\\information afagh\\tatbigh dars.txt');
  const tatbighLines = decoder.decode(tatbighBuf).split(/\r?\n/).filter(x => x.trim());
  console.log('AFAGH tatbigh dars total lines:', tatbighLines.length);

  const dorosBuf = fs.readFileSync('E:\\git\\information afagh\\DOROS.txt');
  const dorosLines = decoder.decode(dorosBuf).split(/\r?\n/).filter(x => x.trim());
  console.log('AFAGH DOROS total lines:', dorosLines.length);

  const dorosMap = new Map(); // lessonCode -> array of { accept, reject, subType, reshteh }
  for (let i = 1; i < dorosLines.length; i++) {
    const cols = dorosLines[i].split('\t');
    const code = cols[2]?.trim();
    if (!code) continue;
    const accept = cols[7]?.trim() || null;
    const reject = cols[8]?.trim() || null;
    const subType = cols[3]?.trim() || null;
    if (!dorosMap.has(code)) dorosMap.set(code, []);
    dorosMap.get(code).push({ accept, reject, subType });
  }

  console.log('Unique lesson codes in DOROS:', dorosMap.size);

  let withCodes = 0;
  let codeStats = {};
  for (const [code, list] of dorosMap.entries()) {
    const hasAny = list.find(x => x.accept || x.reject);
    if (hasAny) {
      withCodes++;
      const key = `${hasAny.accept || '-'}/${hasAny.reject || '-'}`;
      codeStats[key] = (codeStats[key] || 0) + 1;
    }
  }

  console.log('Unique lesson codes in DOROS with accept/reject codes:', withCodes);
  console.log('Distribution of (accept/reject):', codeStats);
}

analyzeAfagh();
