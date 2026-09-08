#!/usr/bin/env node
/**
 * پاکسازی گروه‌های تکراری «بدون کد» — idempotent
 *  - گروه‌های عددی (نام ~ ^\d+$) که با departmentCode=NULL و بدون عضو/درس/رشته هستند → غیرفعال
 *  - گروه‌های هم‌نامِ هم‌دانشکده: قدیمی‌ترین می‌ماند، بقیه اگر خالی باشند غیرفعال
 *  استفاده:
 *    node scripts/cleanup-departments.mjs --dry
 *    node scripts/cleanup-departments.mjs --apply
 */
import pg from 'pg';
const { Pool } = pg;
const raw = process.argv.slice(2);
const args = {};
for (let i=0;i<raw.length;i++) if(raw[i].startsWith('--')){ const k=raw[i].slice(2); args[k]=(raw[i+1]&&!raw[i+1].startsWith('--'))?raw[++i]:'true';}
const DRY = args.dry==='true' || (!args.apply && !args.dry) ? true : false; // پیش‌فرض dry
const APPLY = args.apply==='true';
const dbUrl = args.db || process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db';
const pool=new Pool({connectionString:dbUrl,max:5});
const q=async(t,p)=>(await pool.query(t,p)).rows;
try{
  console.log(`cleanup-departments | ${APPLY?'APPLY':'DRY'} | ${dbUrl.replace(/:[^@]+@/,'://***@')}`);
  // ۱) گروه‌های بدون کد (به درخواست کاربر: حذف) — اول عددی‌ها، بعد کل بی‌کدها
  const withoutCode = await q(`SELECT d.id, d.name, d."facultyId", f.name as facultyName, d."departmentCode", d."isActive"
    FROM departments d JOIN faculties f ON f.id=d."facultyId"
    WHERE d."departmentCode" IS NULL ORDER BY d."facultyId", d.name`);
  console.log(`  بدون کد: ${withoutCode.length} (عددی ~ ${withoutCode.filter(r=>/^\s*\d+\s*$/.test(r.name)).length} تا)`);
  for(const r of withoutCode){
    const [st]=await q(`SELECT count(*)::int c FROM staff WHERE "departmentId"=$1`,[r.id]);
    const [co]=await q(`SELECT count(*)::int c FROM courses WHERE "departmentId"=$1`,[r.id]);
    const [ma]=await q(`SELECT count(*)::int c FROM majors WHERE "departmentId"=$1`,[r.id]);
    const total=(st?.c||0)+(co?.c||0)+(ma?.c||0);
    const isNumeric=/^\s*\d+\s*$/.test(r.name);
    const action = total===0 ? (isNumeric?'حذف':'غیرفعال') : 'نگه‌داری (دارای داده)';
    console.log(`   - [${r.id}] "${r.name}" @ ${r.facultyName} | staff=${st.c} courses=${co.c} majors=${ma.c} active=${r.isActive} -> ${action}`);
    if(total===0 && APPLY){
      if(isNumeric){
        // FK ها را آزاد کن بعد حذف
        await pool.query(`UPDATE staff SET "departmentId"=NULL WHERE "departmentId"=$1`,[r.id]);
        await pool.query(`UPDATE courses SET "departmentId"=NULL WHERE "departmentId"=$1`,[r.id]);
        await pool.query(`UPDATE majors SET "departmentId"=NULL WHERE "departmentId"=$1`,[r.id]);
        await pool.query(`DELETE FROM departments WHERE id=$1`,[r.id]);
        console.log('     ✓ حذف شد');
      } else if(r.isActive!==0){
        await pool.query(`UPDATE departments SET "isActive"=0 WHERE id=$1`,[r.id]);
        console.log('     ✓ غیرفعال شد');
      }
    }
  }
  // ۲) هم‌نامِ هم‌دانشکده
  const dup = await q(`SELECT "facultyId", name, array_agg(id ORDER BY id) as ids, count(*)::int c FROM departments GROUP BY "facultyId", name HAVING count(*)>1`);
  console.log(`  هم‌نامِ هم‌دانشکده: ${dup.length} خوشه`);
  for(const g of dup){
    const ids=g.ids;
    // قدیمی‌ترین می‌ماند
    const keep=ids[0];
    const rest=ids.slice(1);
    const fac=(await q(`SELECT name FROM faculties WHERE id=$1`,[g.facultyId]))[0]?.name||g.facultyId;
    console.log(`   - "${g.name}" @ ${fac} : keep ${keep}, dups ${rest.join(',')}`);
    for(const id of rest){
      const [st]=await q(`SELECT count(*)::int c FROM staff WHERE "departmentId"=$1`,[id]);
      const [co]=await q(`SELECT count(*)::int c FROM courses WHERE "departmentId"=$1`,[id]);
      const [ma]=await q(`SELECT count(*)::int c FROM majors WHERE "departmentId"=$1`,[id]);
      const total=(st?.c||0)+(co?.c||0)+(ma?.c||0);
      const row=(await q(`SELECT "isActive" FROM departments WHERE id=$1`,[id]))[0];
      if(total===0){
        console.log(`      · [${id}] خالی -> ${row.isActive===0?'از قبل غیرفعال':'غیرفعال'}`);
        if(row.isActive!==0 && APPLY) await pool.query(`UPDATE departments SET "isActive"=0 WHERE id=$1`,[id]);
      } else {
        console.log(`      · [${id}] دارای داده staff=${st.c} courses=${co.c} majors=${ma.c} -> نگه‌داری، ادغام دستی لازم است`);
      }
    }
  }
  console.log(APPLY?'✅ اعمال شد.':'--dry: چیزی نوشته نشد. برای اعمال --apply بدهید.');
}catch(err){ console.error('❌',err.message, err.stack); process.exitCode=1; } finally{ await pool.end(); }
