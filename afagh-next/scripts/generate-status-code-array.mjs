import fs from 'fs';

const sama = JSON.parse(fs.readFileSync('scripts/sama-grade-status-table.json', 'utf8'));

// We want to construct an accurate GRADE_STATUS_CODES array
const rows = sama.map(s => {
  const code = s.Code;
  const title = s.Title;
  const passed = s.AssumeAsPassed === 'True';
  const affectsGpa = s.Avgeffect === 'True';
  const affectsTermGpa = s.TermAvgEffect === 'True';
  const isDropped = title.includes('حذف') || ['-1', '-3', '-4', '-5', '-91', '6', '7', '8', '9', '14', '15', '55', '200', '201', '931', '941', '951'].includes(code);
  return {
    code,
    title,
    passed,
    affectsGpa,
    affectsTermGpa,
    isDropped,
  };
});

console.log(JSON.stringify(rows.slice(0, 10), null, 2));
