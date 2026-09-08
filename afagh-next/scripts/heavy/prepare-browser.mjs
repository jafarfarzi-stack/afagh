import fs from 'node:fs';
import crypto from 'node:crypto';
import { Pool } from 'pg';
if(process.env.HEAVY_TEST_ACK!=='isolated-local-only')throw new Error('Isolated test DB only');
const fixturePath=process.env.HEAVY_FIXTURE_FILE||'/home/user/.cache/heavy-fixtures.json';
const f=JSON.parse(fs.readFileSync(fixturePath,'utf8'));
const pool=new Pool({connectionString:process.env.DATABASE_URL});
try{
 const pass=crypto.randomBytes(18).toString('hex'),salt=crypto.randomBytes(16).toString('hex');
 const hash=crypto.scryptSync(pass,salt,32,{N:16384,r:8,p:1}).toString('hex');
 const r=await pool.query('UPDATE users SET "passwordHash"=$1,"mustChangePassword"=1 WHERE id=$2 RETURNING "nationalCode"',[salt+':'+hash,f.admin.id]);
 f.browser={code:r.rows[0].nationalCode,pass};fs.writeFileSync(fixturePath,JSON.stringify(f),{mode:0o600});
 console.log('Browser fixture prepared; credentials not logged');
}finally{await pool.end();}
