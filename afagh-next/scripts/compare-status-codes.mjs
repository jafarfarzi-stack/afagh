import fs from 'fs';

const sama = JSON.parse(fs.readFileSync('scripts/sama-grade-status-table.json', 'utf8'));

// Extract array from src/lib/grade-status-codes.ts
const tsContent = fs.readFileSync('src/lib/grade-status-codes.ts', 'utf8');
const codeMatches = [...tsContent.matchAll(/\{\s*code:\s*'([^']+)',\s*title:\s*'([^']+)',\s*passed:\s*(true|false),\s*affectsGpa:\s*(true|false)\s*\}/g)];

const currentMap = new Map();
for (const m of codeMatches) {
  currentMap.set(m[1], { code: m[1], title: m[2], passed: m[3] === 'true', affectsGpa: m[4] === 'true' });
}

console.log('Total Sama definitions in table:', sama.length);
console.log('Current in TS file:', currentMap.size);

for (const s of sama) {
  const code = s.Code;
  const title = s.Title;
  // Notice in Sama: Avgeffect is cumulative GPA effect, TermAvgEffect is semester GPA effect.
  // Both are false for non-GPA codes!
  const affectsCumulativeGpa = s.Avgeffect === 'True';
  const affectsTermGpa = s.TermAvgEffect === 'True';
  const passed = s.AssumeAsPassed === 'True';
  const cur = currentMap.get(code);
  if (!cur) {
    console.log(`MISSING: Code=${code.padEnd(5)} | Title=${title.padEnd(40)} | Avgeffect=${affectsCumulativeGpa} | Passed=${passed}`);
  } else {
    if (cur.affectsGpa !== affectsCumulativeGpa || cur.passed !== passed) {
      console.log(`DIFF: Code=${code.padEnd(5)} | Sama(affectsCum=${affectsCumulativeGpa}, passed=${passed}) vs Codebase(affects=${cur.affectsGpa}, passed=${cur.passed})`);
    }
  }
}
