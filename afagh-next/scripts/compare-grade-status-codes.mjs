import fs from 'fs';
import { GRADE_STATUS_CODES } from '../src/lib/grade-status-codes.js';

const sama = JSON.parse(fs.readFileSync('scripts/sama-grade-status-table.json', 'utf8'));

console.log('Total Sama definitions:', sama.length);
console.log('Current GRADE_STATUS_CODES count:', GRADE_STATUS_CODES.length);

const currentMap = new Map(GRADE_STATUS_CODES.map(g => [g.code, g]));

for (const s of sama) {
  const code = s.Code;
  const title = s.Title;
  const affectsGpa = s.Avgeffect === 'True' || s.TermAvgEffect === 'True';
  const passed = s.AssumeAsPassed === 'True';
  const cur = currentMap.get(code);
  if (!cur) {
    console.log(`MISSING in codebase: Code=${code} Title=${title} affectsGpa=${affectsGpa} passed=${passed}`);
  } else {
    if (cur.affectsGpa !== affectsGpa || cur.passed !== passed) {
      console.log(`MISMATCH for Code=${code}: Sama(affects=${affectsGpa}, passed=${passed}) vs Current(affects=${cur.affectsGpa}, passed=${cur.passed})`);
    }
  }
}
