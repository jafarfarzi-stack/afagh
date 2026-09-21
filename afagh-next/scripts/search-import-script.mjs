import fs from 'fs';

const content = fs.readFileSync('scripts/import-sama-afagh.mjs', 'utf8');
const lines = content.split('\n');
lines.forEach((l, idx) => {
  if (l.toLowerCase().includes('.txt') || l.includes('students') || l.includes('student2') || l.includes('studentraw')) {
    console.log(`${idx + 1}: ${l.slice(0, 100)}`);
  }
});
