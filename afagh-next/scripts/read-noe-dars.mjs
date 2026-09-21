import fs from 'fs';
const dec = (p) => {
  const buf = fs.readFileSync(p);
  try { const t = new TextDecoder('utf-8').decode(buf); if (!t.includes('�')) return t; } catch {}
  return new TextDecoder('windows-1256').decode(buf);
};
for (const f of ['نوع درس.txt','وضع نمرات در کارنامه.txt','وضع نمره.txt']) {
  console.log('=====', f, '=====');
  console.log(dec('E:\\git\\information afagh\\'+f).split(/\r?\n/).slice(0,30).join('\n'));
}
