# مهاجرت PII — رمزنگاری کدهای ملی (فاز ۵)

## وضعیت
این پوشهٔ **پیشنهادی** است. `src/db/schema.ts` و `drizzle/**` متعلق به جلسهٔ دیگری هستند و در اینجا تغییر داده نشده‌اند. جلسهٔ دیگر باید `01-add-pii-columns.sql` را در یک مهاجرت Drizzle ادغام کند و سپس schema.ts را به‌روز کند.

## ترتیب اجرا

1. **پشتیبان** از دیتابیس بگیرید (`scripts/backup-db.mjs` یا `pg_dump`).
2. جلسهٔ دیگر: اجرای `01-add-pii-columns.sql` (افزودن ستون‌های `*Enc` و `*BlindIndex`).
3. تنظیم `AFAGH_PII_KEY` در `/root/afagh/.env` (۶۴ hex یا عبارت عبور قوی).
4. اجرای dry-run:
   ```bash
   AFAGH_PII_KEY=... DATABASE_URL=... node scripts/phase5/backfill-pii.mjs --dry-run
   ```
5. اجرای واقعی:
   ```bash
   AFAGH_PII_KEY=... DATABASE_URL=... node scripts/phase5/backfill-pii.mjs
   ```
6. تأیید: هیچ ردیفی `nationalCodeEnc IS NULL` نباشد (به‌جز ردیف‌هایی که کد ملی ندارند).
7. کد خواندن/نوشتن را به ستون‌های Enc/BlindIndex منتقل کنید (گام ۳ برنامهٔ مهاجرت در `src/lib/pii.ts`).
8. پس از تأیید کامل، ستون متن ساده را در یک مهاجرت جدا `DROP COLUMN` کنید.

## گردش کلید (Key Rotation)

- `AFAGH_PII_KEY_PREVIOUS` را هنگام تعویض کلید تنظیم کنید تا دادهٔ قدیمی هنوز خوانده شود.
- `encryptPii` همیشه با کلید جاری می‌نویسد.
- `blindIndex` فقط از کلید جاری استفاده می‌کند؛ پس هنگام گردش کلید، **شاخص‌های کور باید در همان backfill بازمحاسبه شوند** وگرنه جست‌وجوهای برابری از کار می‌افتند.
- پس از backfill کامل، `AFAGH_PII_KEY_PREVIOUS` را حذف کنید.

## بازگشت (Rollback)

- ستون‌های جدید nullable هستند؛ حذف آن‌ها (`DROP COLUMN ...Enc`, `...BlindIndex`) بی‌خطر است.
- کلید جدید را قبل از حذف ستون‌ها حذف نکنید.

## هشدار
- هرگز `AFAGH_PII_KEY` را در گیت یا لاگ ذخیره نکنید.
- backfill را روی پروداکشن فقط پس از پشتیبان و در زمان کم‌ترافیک اجرا کنید.
