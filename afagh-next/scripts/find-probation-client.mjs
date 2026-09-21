import fs from 'fs';

const content = fs.readFileSync('src/app/admin/students/StudentsManagerClient.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('مشروط')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
