import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { trustedClientIp } from '../src/lib/proxy-trust';

async function main() {
  const secret = randomBytes(32).toString('hex');
  const temp = await mkdtemp(path.join(tmpdir(), 'afagh-proxy-'));
  const backend = createServer((req, res) => {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ip: trustedClientIp(headers, { enabled: true, secret }), realIp: headers.get('x-real-ip') }));
  });
  backend.listen(0, '127.0.0.1');
  await once(backend, 'listening');
  const backendPort = (backend.address() as { port: number }).port;
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const proxyPort = (reservation.address() as { port: number }).port;
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const source = await readFile(path.join(process.cwd(), '..', 'caddy', 'Caddyfile'), 'utf8');
  const config = '{\n admin off\n auto_https off\n}\n' + source
    .replace('{$DOMAIN}', `http://127.0.0.1:${proxyPort}`)
    .replace('app:8080', `127.0.0.1:${backendPort}`);
  await writeFile(path.join(temp, 'Caddyfile'), config);
  const child = spawn('caddy', ['run', '--config', path.join(temp, 'Caddyfile'), '--adapter', 'caddyfile'], {
    env: { ...process.env, AFAGH_PROXY_SECRET: secret }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Caddy startup timeout')), 15000);
      child.once('error', e => { clearTimeout(timer); reject(e); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Caddy exited: ${code}`)); });
      let log = '';
      child.stderr.on('data', chunk => {
        log += String(chunk);
        if (log.includes('serving initial configuration')) { clearTimeout(timer); resolve(); }
      });
    });
    const forged = {
      'x-forwarded-for': '203.0.113.90, 192.0.2.8', 'x-real-ip': '203.0.113.90',
      'x-afagh-client-ip': '203.0.113.90', 'x-afagh-proxy-token': 'forged',
      'x-forwarded-proto': 'https', 'x-forwarded-ssl': 'on',
    };
    const direct = await (await fetch(`http://127.0.0.1:${backendPort}`, { headers: forged })).json();
    assert.equal(direct.ip, null);
    const proxied = await (await fetch(`http://127.0.0.1:${proxyPort}`, { headers: forged })).json();
    assert.equal(proxied.ip, '127.0.0.1');
    assert.equal(proxied.realIp, null);
    const clean = await (await fetch(`http://127.0.0.1:${proxyPort}`)).json();
    assert.equal(clean.ip, proxied.ip);
    console.log('PASS: real Caddy overwrites forged identity/token; direct forged request untrusted; clean and spoofed requests share real peer IP');
  } finally {
    if (child.pid && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
    backend.closeAllConnections();
    await new Promise<void>(resolve => backend.close(() => resolve()));
    await rm(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
