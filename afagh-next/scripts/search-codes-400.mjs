import fs from 'fs';
import path from 'path';

function searchInFiles() {
  const dir = 'E:\\git\\information afagh';
  for (const f of fs.readdirSync(dir)) {
    try {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      if (stat.size > 20000000) continue; // skip huge files
      const content = fs.readFileSync(full, 'latin1');
      if (content.includes('400\t') || content.includes('\t400\t') || content.includes('44\t') || content.includes('\t44\t')) {
        console.log('Found in:', f);
      }
    } catch {}
  }
}
searchInFiles();
