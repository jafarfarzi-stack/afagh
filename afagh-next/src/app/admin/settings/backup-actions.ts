'use server';

import { pool } from '@/db';
import { S3, ARCHIVE_BUCKET, ensureBucket } from '@/lib/objectStore';
import { requireRole } from '@/lib/auth';

const DB_URL = process.env.DATABASE_URL || '';

// ═══ پشتیبان‌گیری ═══

/** لیست جداول کاربری (بدون جداول سیستمی) */
async function getUserTables(): Promise<string[]> {
  const res = await pool.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' ORDER BY tablename
  `);
  return res.rows.map(r => r.tablename);
}

/** دامپ SQL از یک جدول */
async function dumpTable(table: string): Promise<string> {
  const cols = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [table]);

  if (!cols.rows.length) return '';

  const colDefs = cols.rows.map(c => {
    const nullable = c.is_nullable === 'YES' ? '' : ' NOT NULL';
    const def = c.column_default ? ` DEFAULT ${c.column_default}` : '';
    return `  "${c.column_name}" ${c.data_type}${nullable}${def}`;
  });

  let sql = `DROP TABLE IF EXISTS "${table}" CASCADE;\n`;
  sql += `CREATE TABLE "${table}" (\n${colDefs.join(',\n')}\n);\n\n`;

  const data = await pool.query(`SELECT * FROM "${table}"`);
  if (data.rows.length === 0) return sql;

  const colNames = cols.rows.map(c => `"${c.column_name}"`).join(', ');
  const chunks: string[] = [];
  const BATCH = 500;

  for (let i = 0; i < data.rows.length; i += BATCH) {
    const batch = data.rows.slice(i, i + BATCH);
    const values = batch.map(row => {
      const vals = cols.rows.map(c => {
        const v = row[c.column_name];
        if (v === null || v === undefined) return 'NULL';
        if (typeof v === 'number') return String(v);
        if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
        if (v instanceof Date) return `'${v.toISOString()}'`;
        if (v instanceof Buffer) return `E'\\\\x${v.toString('hex')}'`;
        const s = String(v).replace(/'/g, "''").replace(/\\/g, '\\\\');
        return `'${s}'`;
      });
      return `(${vals.join(', ')})`;
    });
    chunks.push(`INSERT INTO "${table}" (${colNames}) VALUES\n${values.join(',\n')};\n`);
  }

  return sql + chunks.join('\n');
}

/** دامپ کل دیتابیس */
export async function backupDatabaseAction(): Promise<{ ok: boolean; sql?: string; error?: string; tables?: number }> {
  await requireRole(['ADMIN']);
  try {
    const tables = await getUserTables();
    const parts: string[] = [
      '-- ═══ پشتیبان آفاق — ' + new Date().toISOString() + ' ═══',
      '-- بازیابی: psql -U afagh -d afagh_db -f backup.sql',
      '',
    ];

    for (const t of tables) {
      const dump = await dumpTable(t);
      if (dump) parts.push(dump);
    }

    return { ok: true, sql: parts.join('\n'), tables: tables.length };
  } catch (err: any) {
    return { ok: false, error: err.message || 'خطای نامشخص' };
  }
}

// ═══ پشتیبان MinIO ═══

export async function listMinioObjectsAction(): Promise<{ ok: boolean; objects?: { key: string; size: number; lastModified: Date }[]; error?: string }> {
  await requireRole(['ADMIN']);
  try {
    await ensureBucket();
    const exists = await S3.bucketExists(ARCHIVE_BUCKET);
    if (!exists) return { ok: true, objects: [] };

    const objects: { key: string; size: number; lastModified: Date }[] = [];
    const stream = S3.listObjectsV2(ARCHIVE_BUCKET, '', true);
    for await (const obj of stream) {
      if (obj.name) {
        objects.push({
          key: obj.name,
          size: obj.size || 0,
          lastModified: obj.lastModified || new Date(),
        });
      }
    }
    return { ok: true, objects };
  } catch (err: any) {
    return { ok: false, error: err.message || 'خطای نامشخص' };
  }
}

export async function downloadMinioObjectAction(key: string): Promise<{ ok: boolean; data?: string; name?: string; error?: string }> {
  await requireRole(['ADMIN']);
  try {
    const stream = await S3.getObject(ARCHIVE_BUCKET, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buf = Buffer.concat(chunks);
    const name = key.split('/').pop() || key;
    return { ok: true, data: buf.toString('base64'), name };
  } catch (err: any) {
    return { ok: false, error: err.message || 'خطای نامشخص' };
  }
}

// ═══ بازیابی ═══

export async function restoreDatabaseAction(sql: string): Promise<{ ok: boolean; error?: string; statements?: number }> {
  await requireRole(['ADMIN']);
  try {
    const statements: string[] = [];
    let current = '';
    for (const line of sql.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('--') || trimmed === '') continue;
      current += line + '\n';
      if (trimmed.endsWith(';')) {
        statements.push(current.trim());
        current = '';
      }
    }
    if (current.trim()) statements.push(current.trim());

    let executed = 0;
    for (const stmt of statements) {
      if (!stmt || stmt.startsWith('--')) continue;
      await pool.query(stmt);
      executed++;
    }
    return { ok: true, statements: executed };
  } catch (err: any) {
    return { ok: false, error: err.message || 'خطای بازیابی' };
  }
}

export async function restoreMinioObjectAction(key: string, dataBase64: string): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['ADMIN']);
  try {
    await ensureBucket();
    const buf = Buffer.from(dataBase64, 'base64');
    const ext = key.split('.').pop() || 'bin';
    const contentType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : ext === 'png' ? 'image/png'
      : ext === 'pdf' ? 'application/pdf'
      : 'application/octet-stream';
    await S3.putObject(ARCHIVE_BUCKET, key, buf, buf.length, { 'Content-Type': contentType });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || 'خطای بازیابی فایل' };
  }
}

// ═══ آمار ═══

export async function getBackupStatsAction(): Promise<{ ok: boolean; stats?: { tables: number; totalRows: number; dbSize: string; minioObjects: number; minioSize: string }; error?: string }> {
  await requireRole(['ADMIN']);
  try {
    const tables = await getUserTables();
    let totalRows = 0;
    for (const t of tables) {
      const r = await pool.query(`SELECT COUNT(*) as n FROM "${t}"`);
      totalRows += Number(r.rows[0].n);
    }

    const dbSizeRes = await pool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) as size`);
    const dbSize = dbSizeRes.rows[0].size;

    let minioObjects = 0;
    let minioSize = 0;
    try {
      await ensureBucket();
      const exists = await S3.bucketExists(ARCHIVE_BUCKET);
      if (exists) {
        const stream = S3.listObjectsV2(ARCHIVE_BUCKET, '', true);
        for await (const obj of stream) {
          minioObjects++;
          minioSize += obj.size || 0;
        }
      }
    } catch {}

    const formatSize = (bytes: number) => {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    return {
      ok: true,
      stats: {
        tables: tables.length,
        totalRows,
        dbSize,
        minioObjects,
        minioSize: formatSize(minioSize),
      },
    };
  } catch (err: any) {
    return { ok: false, error: err.message || 'خطای نامشخص' };
  }
}
