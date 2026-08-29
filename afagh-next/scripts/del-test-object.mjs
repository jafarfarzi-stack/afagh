import * as Minio from 'minio';
const c = new Minio.Client({ endPoint: '127.0.0.1', port: 9000, useSSL: false, accessKey: 'afagh', secretKey: 'afagh-secret' });
const key = process.argv[2];
await c.removeObject('afagh-archive', key);
const rest = await new Promise(r => { const xs = []; const s = c.listObjectsV2('afagh-archive', 'archive/', true); s.on('data', x => xs.push(x.name)); s.on('end', () => r(xs)); });
console.log('✓ شیء حذف شد؛ باقی‌مانده در باکت:', rest.length);
