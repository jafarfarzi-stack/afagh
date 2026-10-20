#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════
 *  backfill-pii.mjs — رمزنگاری کدهای ملی موجود (فاز ۵)
 *
 *  پیش‌نیازها:
 *    ۱) اجرای 01-add-pii-columns.sql (افزودن ستون‌های Enc / BlindIndex)
 *    ۲) تنظیم DATABASE_URL و AFAGH_PII_KEY در محیط
 *
 *  رفتار:
 *    • idempotent: فقط ردیف‌هایی که Enc خالی/NULL هستند پردازش می‌شوند.
 *    • دسته‌ای (batch ۵۰۰) و تراکنشی.
 *    • --dry-run : فقط شمارش، بدون UPDATE.
 *    • هرگز مقدار کد ملی را چاپ نمی‌کند (maskPii).
 *
 *  ⚠ الگوریتم رمزنگاری باید با src/lib/pii.ts یکسان بماند. اگر pii.ts تغییر
 *  کرد، این اسکریپت هم باید به‌روز شود.
 * ════════════════════════════════════════════════════════════════════════
 */
import { createCipheriv, createHmac, randomBytes, scryptSync } from 'node:crypto';
import pg from 'pg';

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH = 500;
const PASSPHRASE_SALT = 'afagh:pii:v1';
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const IV_BYTES = 12;
const ENVELOPE_VERSION = 'v1';

function deriveKey(raw) {
  const v = String(raw).trim();
  if (/^[0-9a-fA-F]{64}$/.test(v)) return Buffer.from(v, 'hex');
  return scryptSync(v, PASSPHRASE_SALT, 32, SCRYPT_OPTS);
}

function piiKey() {
  const raw = (process.env.AFAGH_PII_KEY ?? '').trim();
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('AFAGH_PII_KEY تعریف نشده است — backfill در پروداکشن بدون کلید مجاز نیست.');
    }
    console.warn('[backfill-pii] ⚠ AFAGH_PII_KEY تنظیم نشده — کلید توسعهٔ عمومی استفاده می‌شود.');
    return deriveKey('afagh-dev-pii-key-not-for-production');
  }
  return deriveKey(raw);
}

function normalize(v) {
  return String(v ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[\s\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/[‐‑‒–—―−-]/g, '')
    .trim();
}

function maskPii(v) {
  const c = String(v ?? '').trim();
  if (!c) return '—';
  if (c.length <= 5) return '*****';
  return `${c.slice(0, 3)}*****${c.slice(-2)}`;
}

function encryptPii(plain) {
  const text = String(plain ?? '');
  if (!text) return '';
  const key = piiKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENVELOPE_VERSION}:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function isCiphertext(v) {
  const s = String(v ?? '');
  const parts = s.split(':');
  if (parts.length !== 4 || parts[0] !== ENVELOPE_VERSION) return false;
  const [, iv, tag, data] = parts;
  return /^[0-9a-f]{24}$/i.test(iv) && /^[0-9a-f]{32}$/i.test(tag) && /^[0-9a-f]*$/i.test(data) && data.length % 2 === 0;
}

function blindIndex(value, context) {
  const normalized = normalize(value);
  const ctx = String(context ?? '').trim();
  if (!normalized) throw new Error('شاخص کور برای مقدار خالی ساخته نمی‌شود.');
  if (!ctx) throw new Error('context خالی مجاز نیست.');
  const indexKey = createHmac('sha256', piiKey()).update(`${PASSPHRASE_SALT}:blind-index`).digest();
  return createHmac('sha256', indexKey).update(`${ENVELOPE_VERSION}|${ctx}|${normalized}`, 'utf8').digest('hex');
}

// ── جدول‌ها و ستون‌ها (نام‌های واقعی از src/db/schema.ts) ──────────────
const TARGETS = [
  { table: 'persons', pk: 'id', plain: 'canonicalNationalCode', enc: 'canonicalNationalCodeEnc', idx: 'canonicalNationalCodeBlindIndex', ctx: 'persons.canonicalNationalCode' },
  { table: 'person_source_identities', pk: 'id', plain: 'sourceNationalCode', enc: 'sourceNationalCodeEnc', idx: 'sourceNationalCodeBlindIndex', ctx: 'person_source_identities.sourceNationalCode' },
  { table: 'identity_resolution_reviews', pk: 'id', plain: 'sourceNationalCode', enc: 'sourceNationalCodeEnc', idx: 'sourceNationalCodeBlindIndex', ctx: 'identity_resolution_reviews.sourceNationalCode' },
  { table: 'identity_resolution_reviews', pk: 'id', plain: 'candidateNationalCode', enc: 'candidateNationalCodeEnc', idx: 'candidateNationalCodeBlindIndex', ctx: 'identity_resolution_reviews.candidateNationalCode' },
  { table: 'users', pk: 'id', plain: 'nationalCode', enc: 'nationalCodeEnc', idx: 'nationalCodeBlindIndex', ctx: 'users.nationalCode' },
  { table: 'admissions_staging', pk: 'id', plain: 'nationalCode', enc: 'nationalCodeEnc', idx: 'nationalCodeBlindIndex', ctx: 'admissions_staging.nationalCode' },
];

const PG_URL = process.env.DATABASE_URL;
if (!PG_URL) { console.error('❌ DATABASE_URL لازم است.'); process.exit(1); }

const client = new pg.Client({ connectionString: PG_URL });
await client.connect();

let totalProcessed = 0;
let totalSkipped = 0;
let totalErrors = 0;

for (const t of TARGETS) {
  console.log(`\n▶ ${t.table}.${t.plain}  (context=${t.ctx})${DRY_RUN ? '  [DRY-RUN]' : ''}`);
  // اطمینان از وجود ستون‌ها
  const colCheck = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [t.table, t.enc],
  );
  if (colCheck.rowCount === 0) {
    console.warn(`  ⚠ ستون ${t.enc} در ${t.table} وجود ندارد — این target رد می‌شود (ابتدا 01-add-pii-columns.sql را اجرا کنید).`);
    continue;
  }

  let lastPk = 0;
  let processed = 0;
  let skipped = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await client.query(
      `SELECT "${t.pk}" AS pk, "${t.plain}" AS plain, "${t.enc}" AS enc FROM "${t.table}" ` +
      `WHERE ("${t.enc}" IS NULL OR "${t.enc}" = '') AND "${t.pk}" > $2 ORDER BY "${t.pk}" LIMIT $1`,
      [BATCH, lastPk],
    );
    if (res.rows.length === 0) break;

    for (const row of res.rows) {
      const plain = row.plain;
      if (plain === null || plain === undefined || String(plain).trim() === '') {
        skipped++;
        continue;
      }
      if (isCiphertext(row.enc)) {
        skipped++;
        continue;
      }
      try {
        const encVal = encryptPii(plain);
        const idxVal = blindIndex(plain, t.ctx);
        if (DRY_RUN) {
          console.log(`  · ردیف ${row.pk}: ${maskPii(plain)} → (dry)`);
        } else {
          await client.query(
            `UPDATE "${t.table}" SET "${t.enc}" = $1, "${t.idx}" = $2 WHERE "${t.pk}" = $3`,
            [encVal, idxVal, row.pk],
          );
        }
        processed++;
      } catch (e) {
        totalErrors++;
        console.error(`  ✗ ردیف ${row.pk}: ${e.message}`);
      }
    }
    if (res.rows.length > 0) lastPk = res.rows[res.rows.length - 1].pk;
    if (res.rows.length < BATCH) break;
  }

  console.log(`  ✓ پردازش: ${processed} · رد شده: ${skipped}`);
  totalProcessed += processed;
  totalSkipped += skipped;
}

await client.end();

console.log(`\n═══ جمع‌بندی ═══`);
console.log(`پردازش‌شده: ${totalProcessed}`);
console.log(`رد شده: ${totalSkipped}`);
console.log(`خطا: ${totalErrors}`);
if (DRY_RUN) console.log('(DRY-RUN — هیچ UPDATE ای انجام نشد)');
if (totalErrors > 0) process.exit(1);
process.exit(0);
