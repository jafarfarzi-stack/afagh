import fs from 'fs';
for (const d of ['E:\\git\\afagh', 'E:\\git\\zarine', 'E:\\git\\zarine information', 'E:\\git\\allame']) {
  try {
    const names = fs.readdirSync(d).slice(0, 40);
    console.log('---', d, `(${fs.readdirSync(d).length} entries) ---`);
    for (const n of names) {
      let sz = '';
      try { const st = fs.statSync(d + '\\' + n); sz = st.isDirectory() ? '<DIR>' : (st.size / 1048576).toFixed(1) + 'MB'; } catch {}
      console.log(' ', sz, n);
    }
  } catch (e) { console.log(d, 'ERR', e.message); }
}
