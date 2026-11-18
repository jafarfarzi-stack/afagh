# سخت‌ترسازی MinIO / Object Storage

> مخاطب: تیم زیرساخت. این سند فقط دستورهای عملیاتی است؛ تغییر کد در همین مخزن
> انجام شده و اینجا فقط «چه چیزی باید روی سرور اجرا شود» آمده است.
>
> ⚠ هیچ رمز واقعی در این فایل نیست. همهٔ مقادیر داخل `<...>` را جای‌گذاری کنید و
> فایل را با رمز واقعی در گیت نگذارید.

---

## ۰. خلاصهٔ مشکل و وضعیت هدف

| موضوع | قبل | بعد |
|---|---|---|
| کلید اپ | کلید **root** مین‌یو (یا `afagh`/`afagh-secret`) | حساب سرویس محدود به دو باکت |
| محل پشتیبان | همان باکت مدارک دانشجویان (`S3_BUCKET`) | باکت جدا `MINIO_BACKUP_BUCKET` (پیش‌فرض `afagh-backup`) |
| رمزنگاری پشتیبان | بدون رمزنگاری | SSE-S3 (`AES256`)؛ در نبودِ پشتیبانی، هشدار فارسی در لاگ |
| وجود باکت اسناد | در **هر آپلود** `bucketExists` + `makeBucket` | یک‌بار در هر پروسه بررسی؛ در نبودِ باکت خطای صریح ۵۰۳ (بدون ساخت) |
| باکت پشتیبان | — | ساختِ تنبل یک‌بار در هر پروسه (memoised) |
| نسخه‌بندی/قفل | ندارد | versioning روی هر دو باکت + object lock روی باکت اسناد |

کلیدهای تازهٔ اپ (`.env`):

```env
MINIO_ACCESS_KEY=<SERVICE_ACCESS_KEY>       # اولویت اول
MINIO_SECRET_KEY=<SERVICE_SECRET_KEY>       # اولویت اول
MINIO_BACKUP_BUCKET=afagh-backup            # اختیاری، پیش‌فرض همین است
```

ترتیب خواندن کلید در کد: `MINIO_ACCESS_KEY/MINIO_SECRET_KEY` ← `S3_ACCESS_KEY/S3_SECRET_KEY`
← `MINIO_ROOT_USER/MINIO_ROOT_PASSWORD`. **کلید روت را در پروداکشن به اپ ندهید.**

---

## ۱. پیش‌نیاز: نصب `mc` و اتصال با کلید روت

```bash
mc alias set afagh https://minio.example.ir <ROOT_ACCESS_KEY> <ROOT_SECRET_KEY>
mc admin info afagh
```

> از این پس `afagh` فقط برای کارهای مدیریتی (mc admin) استفاده می‌شود، نه برای اپ.

---

## ۲. (الف) حساب سرویس غیر‌روت، محدود به دو باکت

### ۲.۱. ساخت باکت‌ها (اگر نیستند)

```bash
# باکت اسناد — اپ از این پس آن را نمی‌سازد؛ باید از قبل باشد (+ object lock)
mc mb --with-lock afagh/afagh-archive
# باکت پشتیبان — اپ در اولین پشتیبان‌گیری خودش می‌سازد، ولی ساخت دستی بهتر است
mc mb afagh/afagh-backup
```

> `--with-lock` فقط در لحظهٔ ساخت معنا دارد. اگر `afagh-archive` از قبل وجود دارد و
> بدون lock ساخته شده، بخش ۳.۱ را ببینید (ساخت باکت تازه + `mc mirror`).

### ۲.۲. سیاست حداقلی (فقط همین دو باکت)

فایل `/tmp/afagh-app-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListOnlyAfaghBuckets",
      "Effect": "Allow",
      "Action": [
        "s3:GetBucketLocation",
        "s3:ListBucket",
        "s3:ListBucketMultipartUploads",
        "s3:GetBucketVersioning"
      ],
      "Resource": [
        "arn:aws:s3:::afagh-archive",
        "arn:aws:s3:::afagh-backup"
      ]
    },
    {
      "Sid": "ObjectsInAfaghBuckets",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts",
        "s3:GetObjectVersion"
      ],
      "Resource": [
        "arn:aws:s3:::afagh-archive/*",
        "arn:aws:s3:::afagh-backup/*"
      ]
    }
  ]
}
```

> نکته: اپ دیگر باکت نمی‌سازد، پس `s3:CreateBucket`/`s3:DeleteBucket` عمداً داده
> نشده است. اگر می‌خواهید ساختِ تنبلِ باکت پشتیبان با همین کلید کار کند، فقط
> `s3:CreateBucket` را با Resource باکت پشتیبان اضافه کنید (یا باکت را دستی بسازید —
> توصیهٔ ما).

```bash
mc admin policy create afagh afagh-app-rw /tmp/afagh-app-policy.json
```

### ۲.۳. ساخت حساب سرویس

```bash
# گزینهٔ ترجیحی: service account با سیاست درون‌خطی، منقضی‌شدن ۹۰ روزه
mc admin user svcacct add --policy /tmp/afagh-app-policy.json \
  --expiry 90d afagh <SERVICE_ACCOUNT_NAME>
```

> `--expiry` و شکل مقدارش (مدت یا تاریخ) به نسخهٔ `mc` وابسته است؛ اگر نسخهٔ شما
> آن را نمی‌شناسد، پرچم را حذف کنید. `--policy` برای svcacct باید مسیر فایل JSON
> باشد (همان فایل بخش ۲.۲).

خروجی شامل `Access Key` و `Secret Key` است؛ همان دو مقدار را در `.env` بگذارید:

```env
MINIO_ACCESS_KEY=<Access Key>
MINIO_SECRET_KEY=<Secret Key>
```

اگر نسخهٔ `mc` شما `--policy` برای svcacct ندارد، مسیر جایگزین (کاربر IAM):

```bash
mc admin user add afagh <APP_ACCESS_KEY> <APP_SECRET_KEY>
mc admin policy attach afagh afagh-app-rw --user <APP_ACCESS_KEY>
```

> برای چرخش دوره‌ای، ساختِ حساب سرویس تازه سریع‌تر و بی‌خطرتر از تغییر رمز کاربر است.

---

## ۳. (ب) نسخه‌بندی و قفل اشیا

```bash
mc version enable afagh/afagh-archive
mc version enable afagh/afagh-backup
mc version info afagh/afagh-archive
mc version info afagh/afagh-backup
```

### ۳.۱. Object lock روی باکت اسناد

Object lock **فقط با versioning** و **فقط در لحظهٔ ساخت باکت** فعال می‌شود.

```bash
# اگر باکت را تازه با --with-lock ساخته‌اید:
mc retention set --default GOVERNANCE 30d afagh/afagh-archive
mc retention info afagh/afagh-archive
```

اگر `afagh-archive` از قبل بدون lock وجود دارد (وضعیت فعلی بیشتر نصب‌ها):

```bash
# ۱) باکت تازه با lock
mc mb --with-lock afagh/afagh-archive-locked
mc version enable afagh/afagh-archive-locked
mc retention set --default GOVERNANCE 30d afagh/afagh-archive-locked

# ۲) کپی اشیا (نسخه‌ها هم منتقل می‌شوند)
mc mirror --preserve --versions afagh/afagh-archive afagh/afagh-archive-locked

# ۳) تغییر نام: بعد از تأیید سلامت، S3_BUCKET=afagh-archive-locked
#    در .env و restart اپ. باکت قدیمی را چند روز فقط‌خواندنی نگه دارید.
```

> `GOVERNANCE` (نه `COMPLIANCE`) انتخاب شده تا حذفِ اضطراری با مجوز
> `s3:BypassGovernanceRetention` ممکن بماند. برای مدارک تحصیلی الزامی،
> `COMPLIANCE` را با حقوقی هماهنگ کنید.

---

## ۴. (ج) چرخهٔ عمر (Lifecycle)

لینک‌های اشتراک با `presignedGetObject` ساخته می‌شوند (اعتبار ۵ دقیقه) و **شیئی
در باکت نمی‌سازند**؛ پس برای آن‌ها قاعدهٔ lifecycle لازم نیست. قواعد لازم فقط برای
نسخه‌های غیرجاری، نشانگرهای حذف و multipartهای نیمه‌کاره است:

```bash
# نسخه‌های قدیمیِ اسناد پس از ۹۰ روز حذف شوند (نسخهٔ جاری دست‌نخورده می‌ماند)
mc ilm rule add --noncurrent-expiry-days 90 afagh/afagh-archive

# نشانگرهای حذفِ کهنه (۳۰ روز)
mc ilm rule add --expire-delete-marker afagh/afagh-archive

# پشتیبان‌ها: نسخه‌های غیرجاری بعد از ۳۰ روز
mc ilm rule add --noncurrent-expiry-days 30 afagh/afagh-backup

mc ilm rule ls afagh/afagh-archive
mc ilm rule ls afagh/afagh-backup
```

اگر نسخهٔ `mc` شما این پرچم‌ها را نمی‌شناسد، `mc ilm rule add --help` را ببینید
(نام پرچم‌ها بین نسخه‌ها تغییر کرده است: `--expiry-days` / `--expire-days`).

> ⚠ با object lock فعال، قاعدهٔ expiry روی نسخه‌های قفل‌شده اثر نمی‌کند تا وقتی
> دورهٔ retention تمام شود — این رفتار مورد انتظار است.

پاک‌سازی خودکار پشتیبان‌ها در خود اپ انجام می‌شود (`cleanupOldBackups`، ۱۰ مورد
آخر در هر باکت)، پس قاعدهٔ expiry برای باکت پشتیبان اختیاری است.

---

## ۵. (د) چرخش کلیدهای اپ

```bash
# ۱) حساب سرویس تازه
mc admin user svcacct add --policy /tmp/afagh-app-policy.json --expiry 90d afagh <SERVICE_ACCOUNT_NAME_NEW>

# ۲) در سرور: .env را به‌روز کنید (بدون commit)
#    MINIO_ACCESS_KEY=<NEW_ACCESS_KEY>
#    MINIO_SECRET_KEY=<NEW_SECRET_KEY>
#    MINIO_BACKUP_BUCKET=afagh-backup

# ۳) بازگرداندن اپ (کلیدها فقط هنگام بالا آمدن خوانده می‌شوند)
docker compose up -d --force-recreate web

# ۴) تأیید سلامت و سپس غیرفعال‌کردن کلید قبلی
mc admin user svcacct info afagh <OLD_ACCESS_KEY>
mc admin user svcacct disable afagh <OLD_ACCESS_KEY>
# بعد از ۲۴ ساعت بدون خطا:
mc admin user svcacct rm afagh <OLD_ACCESS_KEY>
```

اگر قبلاً اپ با کلید روت بالا می‌آمد، در لاگ یک هشدار فارسی با کلید
`object_store_root_credentials` می‌بینید؛ بعد از چرخش باید قطع شود:

```bash
docker compose logs --since 10m web | grep object_store_root_credentials
```

> کلید روت مین‌یو را بعد از چرخش هم عوض کنید (تغییر `MINIO_ROOT_PASSWORD` در
> `.env` خودِ مین‌یو و restart آن) — این رمز دیگر جایی در اپ استفاده نمی‌شود.

---

## ۶. (ه) تأیید نهایی

```bash
# ۱) حساب سرویس/کاربر و سیاستش
#    برای service account:
mc admin user svcacct info afagh <APP_ACCESS_KEY>
#    برای کاربر IAM (مسیر جایگزین):
mc admin user info afagh <APP_ACCESS_KEY>
mc admin policy entities afagh --user <APP_ACCESS_KEY>

# ۲) باکت‌ها و نسخه‌بندی
mc ls afagh
mc version info afagh/afagh-archive
mc version info afagh/afagh-backup

# ۳) دسترسی محدود بودن کلید: باید فقط دو باکت را ببیند
mc alias set afagh-app https://minio.example.ir <APP_ACCESS_KEY> <APP_SECRET_KEY>
mc ls afagh-app                       # فقط afagh-archive و afagh-backup
mc ls afagh-app/afagh-other-bucket    # باید AccessDenied بدهد

# ۴) رمزنگاری یک پشتیبان تازه (بعد از یک بار پشتیبان‌گیری از پنل)
mc stat afagh/afagh-backup/afagh-backup/db-<TIMESTAMP>-<HASH>.sql.gz
# در خروجی باید X-Amz-Server-Side-Encryption: AES256 دیده شود

# ۵) اثر انگشت یک سند موجود (کلید از جدول student_documents.file_url)
mc stat afagh/afagh-archive/archive/<STUDENT_ID>/<FILE_KEY>
```

بررسی سمت اپ:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://erp.example.ir/api/admin/archive/upload
# 401/403 = مسیر بالاست و به storage وصل است؛ 503 = باکت اسناد دیده نمی‌شود
```

> اگر باکت اسناد حذف/تغییر نام داده شود، اپ **نمی‌سازد**؛ آپلود با پیام فارسی
> «فضای ذخیره‌سازی اسناد آماده نیست…» و کد ۵۰۳ برمی‌گردد. پس از اصلاح باکت،
> حداکثر ۶۰ ثانیه بعد (پروب منفی) بدون restart هم درست می‌شود.

---

## ۷. چک‌لیست قبل / بعد

**قبل از تغییر**

- [ ] `mc admin info` سالم است و نسخهٔ مین‌یو/`mc` ثبت شده.
- [ ] خروجی `mc ls --recursive afagh/afagh-archive` (فهرست پشتیبان‌ها و اسناد) آرشیو شده.
- [ ] یک پشتیبان دیتابیس تازه گرفته و **بازیابی آن روی محیط تست** تأیید شده.
- [ ] `mc admin user list afagh` و کلیدهای فعال ثبت شده (برای rollback).
- [ ] `.env` فعلی (کلیدها) در خزانهٔ اسرار پشتیبان‌گیری شده — نه در گیت.
- [ ] فضای دیسک برای نسخهٔ دوم باکت اسناد (versioning) بررسی شده است.

**بعد از تغییر**

- [ ] `MINIO_ACCESS_KEY/MINIO_SECRET_KEY` حساب سرویس است، نه روت.
- [ ] `object_store_root_credentials` در لاگ نیست.
- [ ] `mc ls afagh-app` فقط دو باکت را نشان می‌دهد و باکت دیگر `AccessDenied` است.
- [ ] `mc version info` روی هر دو باکت `Enabled` است.
- [ ] پشتیبان تازه در `afagh-backup` است و SSE=AES256 دارد (`mc stat`).
- [ ] دانلود پشتیبان از پنل کار می‌کند (هم بکاپ تازه، هم یک بکاپ قدیمی).
- [ ] بازیابی یک سند آرشیو از پنل تست شده است.
- [ ] آپلود سند جدید موفق است و در `student_documents` رکورد دارد.
- [ ] با متوقف‌کردن موقت مین‌یو، آپلود پیام فارسی ۵۰۳ می‌دهد (نه سند جعلی).

---

## ۸. Rollback

اگر چیزی درست نشد، ترتیب بازگشت:

```bash
# ۱) اپ را با کلید قبلی برگردانید (فقط .env و restart)
#    MINIO_ACCESS_KEY/MINIO_SECRET_KEY را حذف یا به مقدار قبلی برگردانید
#    S3_ACCESS_KEY/S3_SECRET_KEY قبلی باید هنوز معتبر باشند (کلید قدیمی را حذف نکنید)
docker compose up -d --force-recreate web

# ۲) اگر کد جدید نمی‌تواند پشتیبان‌های تازه را بخواند، اشیا را به مکان قدیمی برگردانید:
mc mirror --preserve afagh/afagh-backup/afagh-backup afagh/afagh-archive/afagh-backup
#    سپس MINIO_BACKUP_BUCKET را حذف کنید (کد به پیش‌فرض/مکان قدیمی برمی‌گردد).

# ۳) object lock را نمی‌توان غیرفعال کرد؛ اگر باکت قفل‌دار مشکل ساخت،
#    S3_BUCKET را به باکت قبلی برگردانید (دادهٔ هر دو باکت سر جای خود است).
```

نکته‌ها:

- versioning را **خاموش نکنید**؛ خاموش‌کردن نسخه‌های موجود را حذف نمی‌کند ولی
  محافظت را از بین می‌برد.
- باکت پشتیبان تازه را پاک نکنید تا آرشیو پشتیبان‌ها حفظ شود.
- لینک‌های presigned قبلی حداکثر ۵ دقیقه بعد منقضی می‌شوند؛ rollback آن‌ها را خراب نمی‌کند.
- کلید قبلی را تا پایان تأیید rollback غیرفعال نکنید.

---

## ۹. یادداشت‌های پیاده‌سازی (برای مرجع تیم توسعه)

- `src/lib/objectStore.ts`
  - ترتیب کلیدها و هشدار یک‌بارهٔ `object_store_root_credentials` (بدون چاپ رمز).
  - `isBucketAvailable()`: بررسی وجود باکت memoised در `globalThis`؛ مثبت تا پایان
    پروسه، منفی ۶۰ ثانیه (برای self-heal بعد از ساخت باکت).
  - `ensureBucket()` دیگر باکت نمی‌سازد؛ `ObjectStoreBucketMissingError` می‌دهد.
  - `ensureBackupBucket()`: promise memoised برای ساختِ تنبل باکت پشتیبان؛ در خطا
    پاک می‌شود تا تلاش بعدی دوباره انجام شود.
  - `isSseUnsupportedError()` + `x-amz-server-side-encryption: AES256` در متادیتای
    `putObject` (معادل `ServerSideEncryption` در S3؛ minio-js هدرهای `x-amz-*` را
    دست‌نخورده پاس می‌دهد).
  - سازگاری خواندن: کلیدهای `afagh-backup/` که با `ARCHIVE_BUCKET` خوانده شوند،
    اول از باکت پشتیبان و بعد از مکان قدیمی خوانده می‌شوند.
- `src/app/admin/settings/backup-actions.ts`: همهٔ نوشتن‌های پشتیبان روی
  `BACKUP_BUCKET` + `application/gzip`؛ فهرست/هرس پشتیبان‌ها هر دو مکان را می‌بیند.
- `src/app/api/admin/archive/upload/route.ts`: شکست ذخیره‌سازی → `503` با پیام فارسی،
  بدون ثبت رکورد در `student_documents`.
