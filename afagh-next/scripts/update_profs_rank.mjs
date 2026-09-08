import { createReadStream } from 'node:fs';
import pg from 'pg';
const { Pool } = pg;
const pool=new Pool({connectionString:process.env.DATABASE_URL||'postgres://afagh:afagh@localhost:5432/afagh_db',max:5});
const q=async(t,p)=>(await pool.query(t,p)).rows;
const dec=new TextDecoder('windows-1256');
async function* rows(path){
  const s=createReadStream(path,{highWaterMark:4*1024*1024});
  let carry=Buffer.alloc(0),hdr=null;
  for await(const ch of s){
    const buf=Buffer.concat([carry,ch]);
    let st=0;
    for(let i=0;i<buf.length;i++) if(buf[i]===10){
      const line=dec.decode(buf.subarray(st,i)).replace(/\r/g,'');
      st=i+1;
      if(!line.trim()) continue;
      const cols=line.split('\t');
      if(!hdr){hdr=cols.map(c=>c.trim()); continue;}
      yield {hdr, cols};
    }
    carry=buf.subarray(st);
  }
}
function clean(s){ return String(s??'').replace(/\x00/g,'').replace(/\s+/g,' ').trim(); }
// mapping Payeh -> rank title (based on common Iranian academic ranks)
const PAYEH_RANK = { '0':'—', '1':'مربی', '2':'استادیار', '3':'دانشیار', '4':'استاد', '5':'استاد ممتاز' };
const EMP_MAP = { '1':'رسمی', '2':'پیمانی', '3':'حق التدریس', '4':'مدعو', '0':'—' };
const file='E:\\git\\information afagh\\اساتيد.txt';
let n=0, upd=0;
for await(const {hdr, cols} of rows(file)){
  const code=clean(cols[0]);
  const nc=clean(cols[60]);
  if(!/^\d+$/.test(code) || code==='0' || !/^\d{10}$/.test(nc)) continue;
  const payeh=clean(cols[53]); // Payeh
  const degree=clean(cols[4]); // Degree (maybe empty)
  const empSt=clean(cols[5]); // EmploymentStatus
  const persNo=clean(cols[55])||clean(cols[11])||null; // ProfessorID or PersonnelNo
  const field=clean(cols[78])||null;
  const coop = EMP_MAP[empSt] || empSt || null;
  const rank = PAYEH_RANK[payeh] || payeh || null;
  // we store Payeh as academicBase, and rank as academicRank if payeh maps
  // update staff where staffCode = code
  const res = await pool.query('UPDATE staff SET "academicBase"=$2, "academicRank"=COALESCE(NULLIF("academicRank",\'\'),$3), "cooperationType"=COALESCE(NULLIF("cooperationType",\'\'),$4), "degree"=COALESCE(NULLIF("degree",\'\'),$5), "fieldOfStudy"=COALESCE(NULLIF("fieldOfStudy",\'\'),$6), "personnelNo"=COALESCE(NULLIF("personnelNo",\'\'),$7) WHERE "staffCode"=$1', [code, payeh||null, rank, coop, degree||null, field, persNo]);
  if(res.rowCount) upd++;
  n++;
  if(n%5000===0) console.log(`... ${n} upd ${upd}`);
}
console.log(`Done scanned ${n} upd ${upd}`);
await pool.end();
