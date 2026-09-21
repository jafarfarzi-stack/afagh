import fs from 'fs';
const lines = fs.readFileSync('grade-engine-changes-SHAMS.csv', 'utf8').trim().split('\n');
console.log('total rows:', lines.length - 1);
const to941 = lines.filter(l => l.endsWith(',"941"') || l.includes('"941"'));
console.log('rows mentioning 941:', to941.length);
console.log(to941.slice(0, 8).join('\n'));
