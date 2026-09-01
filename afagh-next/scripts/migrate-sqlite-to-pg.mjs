// ════════════════════════════════════════════════════════════════════
//  مهاجرت SQLite → PostgreSQL — کالبد فاز نهایی (سند §۳۷۰۰: اجرای موازی)
//  نام ستون‌ها ۱:۱ حفظ شده، پس INSERT مستقیم ممکن است.
//  استفاده:  npm run db:push  &&  npm run db:migrate-sqlite
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'fs';
import pg from 'pg';

const SQLITE = process.env.SQLITE_SOURCE || '../afagh-erp/data/afagh.db';
const PG_URL = process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db';
const BATCH = 400;

let sqlite;
try {
  const { default: Database } = await import('better-sqlite3');
  sqlite = new Database(SQLITE, { readonly: true });
  sqlite.pragma('journal_mode = WAL');
} catch (e) {
  const { DatabaseSync } = await import('node:sqlite');
  const d = new DatabaseSync(SQLITE, { readOnly: true });
  sqlite = {
    prepare: (sql) => {
      const s = d.prepare(sql);
      return {
        all: (...args) => s.all(...args),
        get: (...args) => s.get(...args)
      };
    },
    close: () => d.close()
  };
}
const client = new pg.Client({ connectionString: PG_URL });
await client.connect();

// FKها را موقتاً خاموش کن تا ترتیب جدول‌ها مهم نباشد
await client.query('SET session_replication_role = replica');

const { rows: tables } = await client.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"
);

let totalRows = 0;
for (const { table_name: t } of tables) {
  const { rows: cols } = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [t]
  );
  const pgCols = cols.map(c => c.column_name);
  // فقط ستون‌های مشترک (ایزوله از تفاوت‌های احتمالی آینده)
  const sth = sqlite.prepare('PRAGMA table_info(' + JSON.stringify(t) + ')');
  const sqCols = sth.all().map(c => c.name);
  const shared = pgCols.filter(c => sqCols.includes(c));
  if (!shared.length) { console.log('– ' + t + ': مشترک نیست، رد شد'); continue; }

  const sel = shared.map(c => '"' + c + '"').join(', ');
  const rows = sqlite.prepare('SELECT ' + sel + ' FROM "' + t + '"').all();
  if (!rows.length) { console.log('· ' + t + ': خالی'); }
  else {
    const colList = shared.map(c => '"' + c + '"').join(', ');
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const ph = chunk.map((_, r) => '(' + shared.map((_, c) => '$' + (r * shared.length + c + 1)).join(', ') + ')').join(', ');
      const vals = chunk.flatMap(r => shared.map(c => {
        const v = r[c];
        return Buffer.isBuffer(v) ? v : v; // BLOB خام عبور می‌کند
      }));
      await client.query('INSERT INTO "' + t + '" (' + colList + ') VALUES ' + ph + ' ON CONFLICT DO NOTHING', vals);
    }
    console.log('✓ ' + t + ': ' + rows.length + ' سطر');
    totalRows += rows.length;
  }

  // ریست serial پس از درج مستقیم id ها
  if (shared.includes('id')) {
    await client.query("SELECT setval(pg_get_serial_sequence($1, 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM \"" + t + "\"), 1), (SELECT COUNT(*) FROM \"" + t + "\") > 0)", [t]);
  }
}

await client.query('SET session_replication_role = DEFAULT');
await client.end();
sqlite.close();
console.log('════════ مهاجرت کامل: ' + totalRows + ' سطر در ' + tables.length + ' جدول ════════');
