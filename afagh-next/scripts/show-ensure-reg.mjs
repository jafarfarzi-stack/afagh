import fs from 'fs';
const src = fs.readFileSync('scripts/import-sama-afagh.mjs', 'utf8');
const i = src.indexOf('async function ensureRegulation');
console.log(src.slice(i, i + 2500));
