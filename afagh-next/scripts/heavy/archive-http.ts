import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { Client } from 'minio';
import { verifyAuditChain } from '../../src/lib/audit-core';

async function main() {
  if (process.env.HEAVY_TEST_ACK !== 'isolated-local-only') throw new Error('Use only an isolated test environment: HEAVY_TEST_ACK=isolated-local-only');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const base = process.env.HEAVY_BASE_URL || 'http://127.0.0.1:58081';
  const tag = randomBytes(4).toString('hex');
  const localRoot = path.join(process.cwd(), 'data', 'uploads', `heavy-${tag}`);
  const outside = path.join(process.cwd(), 'data', `heavy-secret-${tag}`);
  const failures: string[] = [];
  const summary: Record<string, unknown> = {};
  const fixture: any = { base, tag };
  const minio = new Client({ endPoint: process.env.S3_ENDPOINT!, port: Number(process.env.S3_PORT), useSSL: false, accessKey: process.env.S3_ACCESS_KEY!, secretKey: process.env.S3_SECRET_KEY! });
  const bucket = process.env.S3_BUCKET!;
  const expect = (ok: unknown, label: string) => { if (!ok) failures.push(label); };
  const call = (url: string, options: RequestInit = {}) => fetch(base + url, { ...options, signal: AbortSignal.timeout(30000) });
  const cookie = (token: string) => ({ cookie: `token=${token}` });
  try {
    for (const [name, role] of [['admin', 'ADMIN'], ['owner', 'STUDENT'], ['other', 'STUDENT']]) {
      const token = randomBytes(32).toString('hex');
      const user = (await pool.query('INSERT INTO users ("nationalCode", "firstName", "lastName", "passwordHash") VALUES ($1,$2,$3,$4) RETURNING id', [randomBytes(5).toString('hex'), 'Heavy', name, 'disabled-test-password'])).rows[0];
      await pool.query('INSERT INTO user_roles ("userId", "roleId") SELECT $1,id FROM roles WHERE code=$2', [user.id, role]);
      await pool.query('INSERT INTO sessions (token,"userId","expiresAt") VALUES ($1,$2,now()+interval \'2 hours\')', [token, user.id]);
      fixture[name] = { id: user.id, token };
    }
    const category = (await pool.query('INSERT INTO document_categories (title) VALUES ($1) RETURNING id', [`heavy-${tag}`])).rows[0].id;
    fixture.category = category;
    const form = (body = Buffer.from('%PDF-1.4\nheavy test\n%%EOF'), owner = fixture.owner.id, mime = 'application/pdf') => {
      const f = new FormData(); f.set('studentUserId', String(owner)); f.set('categoryId', String(category));
      f.set('file', new Blob([new Uint8Array(body)], { type: mime }), `test-${tag}.pdf`); return f;
    };
    const upload = (f = form(), token = fixture.owner.token) => call('/api/admin/archive/upload', { method: 'POST', headers: cookie(token), body: f });
    expect((await call('/api/archive/1')).status === 401, 'anonymous read must be 401');
    expect((await upload(form(), 'bogus')).status === 401, 'invalid session upload must be 401');
    expect((await upload(form(), fixture.other.token)).status === 403, 'other user upload must be 403');
    expect((await call('/api/admin/archive/upload', { method: 'POST', headers: { ...cookie(fixture.owner.token), origin: 'https://evil.invalid' }, body: form() })).status === 403, 'cross-origin upload must be 403');
    const malformed = await call('/api/admin/archive/upload', { method: 'POST', headers: { ...cookie(fixture.owner.token), 'Content-Type': 'multipart/form-data' }, body: 'invalid' });
    expect(malformed.status === 400, `malformed multipart must be 400, got ${malformed.status}`);
    expect((await upload(form(Buffer.from('<script>alert(1)</script>'), fixture.owner.id, 'text/html'))).status === 415, 'HTML upload must be 415');
    expect((await upload(form(Buffer.alloc(10 * 1024 * 1024 + 1)))).status === 413, 'oversize upload must be 413');
    const stringFile = form(); stringFile.set('file', 'not a file'); expect((await upload(stringFile)).status === 400, 'string file must be 400');
    expect((await call('/api/archive/2147483648', { headers: cookie(fixture.admin.token) })).status === 400, 'PostgreSQL int overflow must be 400');

    // Cold bucket: simultaneous uploads must not race bucket creation.
    const count = Number(process.env.HEAVY_UPLOAD_COUNT || 120);
    const items: any[] = [];
    const samples: number[] = [];
    let cursor = 0;
    const start = performance.now();
    await Promise.all(Array.from({ length: 24 }, async () => {
      while (cursor < count) {
        const i = cursor++; const body = Buffer.from(`%PDF-1.4\n${tag}-${i}\n` + 'a'.repeat(8192));
        const t = performance.now(); const res = await upload(form(body));
        samples.push(performance.now() - t);
        if (res.status !== 200) { failures.push(`upload ${i}: ${res.status}`); await res.text(); continue; }
        const result = await res.json(); items.push({ ...result, digest: createHash('sha256').update(body).digest('hex') });
      }
    }));
    samples.sort((a,b) => a-b);
    summary.upload = { count, succeeded: items.length, concurrency: 24, durationMs: Math.round(performance.now()-start), p95Ms: Math.round(samples[Math.floor(samples.length*.95)]) };
    expect(new Set(items.map(i => i.key)).size === items.length, 'upload keys must be unique');
    fixture.docId = items[0]?.docId; fixture.key = items[0]?.key;
    assert.ok(fixture.docId, 'at least one upload must succeed');
    expect((await call(`/api/archive/${fixture.docId}`, { headers: cookie(fixture.other.token) })).status === 403, 'other user read must be 403');
    const reads = Number(process.env.HEAVY_READ_COUNT || 600);
    cursor = 0; const readStart = performance.now();
    await Promise.all(Array.from({ length: 32 }, async () => {
      while (cursor < reads) {
        const item = items[cursor++ % items.length];
        const res = await call(`/api/archive/${item.docId}`, { headers: cookie(fixture.owner.token) });
        const buf = Buffer.from(await res.arrayBuffer());
        expect(res.status === 200 && createHash('sha256').update(buf).digest('hex') === item.digest, `read bytes/status ${item.docId}`);
        expect(res.headers.get('x-content-type-options') === 'nosniff', 'missing nosniff');
        expect(res.headers.get('content-security-policy')?.includes('sandbox'), 'missing CSP sandbox');
      }
    }));
    summary.read = { count: reads, concurrency: 32, durationMs: Math.round(performance.now()-readStart) };

    const verify = (body: unknown, token = fixture.admin.token) => call('/api/admin/archive/verify', { method: 'POST', headers: { ...cookie(token), 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.55', 'x-afagh-client-ip': '203.0.113.55', 'x-afagh-proxy-token': 'forged' }, body: JSON.stringify(body) });
    for (const body of [{}, { docId: fixture.docId }, { docId: true, decision: 'VERIFIED' }, { docId: fixture.docId, decision: 'bogus' }]) expect((await verify(body)).status === 400, 'bad decision must be 400');
    expect((await verify({ docId: fixture.docId, decision: 'VERIFIED' }, fixture.owner.token)).status === 403, 'student verification must be 403');
    const transitions = 180; cursor = 0; const verifyStart = performance.now();
    await Promise.all(Array.from({ length: 24 }, async () => {
      while (cursor < transitions) {
        const i = cursor++;
        expect((await verify({ docId: items[i % items.length].docId, decision: i % 2 ? 'VERIFIED' : 'REJECTED', reason: `test ${i}` })).status === 200, 'concurrent verification must succeed');
      }
    }));
    summary.verify = { count: transitions, concurrency: 24, durationMs: Math.round(performance.now()-verifyStart) };
    const audited = (await pool.query('SELECT * FROM audit_logs WHERE "actorUserId" = ANY($1::int[]) ORDER BY id', [[fixture.admin.id, fixture.owner.id]])).rows;
    expect(audited.length === items.length + transitions, 'each successful mutation must have exactly one audit');
    expect(audited.every(r => r.ipAddress === '127.0.0.1'), 'forged IP must never be recorded through Caddy');

    // Fault injection only in this isolated DB: rejected audit INSERT must roll back route mutation.
    await pool.query(`CREATE FUNCTION heavy_reject_${tag}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."actorUserId" IN (${fixture.admin.id},${fixture.owner.id}) THEN RAISE EXCEPTION 'injected audit failure'; END IF; RETURN NEW; END $$`);
    await pool.query(`CREATE TRIGGER heavy_reject_${tag} BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION heavy_reject_${tag}()`);
    try {
      const before = (await pool.query('SELECT "verificationStatus" FROM student_documents WHERE id=$1', [fixture.docId])).rows[0].verificationStatus;
      const failVerify = await verify({ docId: fixture.docId, decision: before === 'VERIFIED' ? 'REJECTED' : 'VERIFIED' });
      expect(failVerify.status >= 500, 'injected audit failure must fail route');
      expect((await pool.query('SELECT "verificationStatus" FROM student_documents WHERE id=$1', [fixture.docId])).rows[0].verificationStatus === before, 'failed audit must roll back document decision');
      const beforeCount = Number((await pool.query('SELECT count(*) FROM student_documents WHERE "personUserId"=$1', [fixture.owner.id])).rows[0].count);
      expect((await upload()).status >= 500, 'upload audit failure must fail route');
      expect(Number((await pool.query('SELECT count(*) FROM student_documents WHERE "personUserId"=$1', [fixture.owner.id])).rows[0].count) === beforeCount, 'failed upload audit must not persist document');
    } finally {
      await pool.query(`DROP TRIGGER heavy_reject_${tag} ON audit_logs; DROP FUNCTION heavy_reject_${tag}()`);
    }
    // Local filesystem, traversal, escaping symlink and missing-object behavior on real GET.
    await mkdir(localRoot, { recursive: true }); await writeFile(path.join(localRoot, 'ok.pdf'), '%PDF-local');
    await writeFile(outside, 'SECRET_MUST_NOT_LEAK'); await symlink(outside, path.join(localRoot, 'escape.pdf'));
    const createDoc = async (key: string) => (await pool.query('INSERT INTO student_documents ("personUserId","categoryId","fileName","fileUrl","mimeType") VALUES ($1,$2,$3,$4,$5) RETURNING id', [fixture.owner.id, category, 'test.pdf', key, 'application/pdf'])).rows[0].id;
    for (const [key, status] of [[`heavy-${tag}/ok.pdf`, 200], [`heavy-${tag}/escape.pdf`, 400], ['../heavy-secret', 400], ['/etc/passwd', 400], ['a/../../secret', 400], [`missing-${tag}`, 404]] as const) {
      const id = await createDoc(key); const res = await call(`/api/archive/${id}`, { headers: cookie(fixture.owner.token) }); const body = await res.text();
      expect(res.status === status, `${key} expected ${status}, got ${res.status}`); expect(!body.includes('SECRET_MUST_NOT_LEAK'), 'local secret leaked');
      if (status !== 200) expect(!body.includes('<svg'), 'error must not fabricate SVG document');
    }
    const bigKey = `heavy-${tag}/large`;
    await minio.putObject(bucket, bigKey, Buffer.alloc(10 * 1024 * 1024 + 1));
    const largeDoc = await createDoc(bigKey);
    expect((await call(`/api/archive/${largeDoc}`, { headers: cookie(fixture.owner.token) })).status === 413, 'oversized stored object must be 413');
    await minio.removeObject(bucket, bigKey);
    // Verify all audit links, not just selected actors.
    const all = (await pool.query('SELECT *, "createdAt" AT TIME ZONE \'UTC\' AS "createdAt" FROM audit_logs ORDER BY id')).rows;
    summary.audit = verifyAuditChain(all);
    expect((summary.audit as any).ok, 'full audit chain must remain valid');
    await writeFile(process.env.HEAVY_FIXTURE_FILE || '/home/user/.cache/heavy-fixtures.json', JSON.stringify(fixture), { mode: 0o600 });
    summary.failures = failures;
    console.log(JSON.stringify(summary, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    await rm(localRoot, { recursive: true, force: true }); await rm(outside, { force: true }); await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
