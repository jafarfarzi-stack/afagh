import fs from 'fs';
// مقطعها + degree levels in DB
const dec = (p) => {
  const buf = fs.readFileSync(p);
  // try utf8 first
  try { const t = new TextDecoder('utf-8').decode(buf); if (t.includes('�')===false) return t; } catch {}
  return new TextDecoder('windows-1256').decode(buf);
};
for (const f of ['مقطعها.txt','وضعيت دانشجو.txt','students1.txt']) {
  console.log('=====', f, '=====');
  const t = dec('E:\\git\\information afagh\\'+f);
  console.log(t.split(/\r?\n/).slice(0,15).join('\n'));
}
