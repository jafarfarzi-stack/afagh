#!/bin/bash
# اجرای MinIO برای توسعه — سند §۲۴۴۵ (Object Storage بایگانی)
# باینری عمداً خارج از workspace دانلود می‌شود (حجم ~۱۰۰MB)؛ دیتا هم در /tmp.
set -e
BIN=/tmp/minio-bin/minio
mkdir -p /tmp/minio-bin /tmp/afagh-minio
if [ ! -x "$BIN" ]; then
  echo "⬇ دانلود MinIO…"
  curl -fsSL https://dl.min.io/server/minio/release/linux-amd64/minio -o "$BIN"
  chmod +x "$BIN"
fi
# امنیت: بدون اعتبارنامهٔ پیش‌فرض ضعیف؛ هر دو متغیر باید از محیط بیایند وگرنه خارج می‌شویم.
if [ -z "${MINIO_ROOT_USER:-}" ] || [ -z "${MINIO_ROOT_PASSWORD:-}" ]; then
  echo "❌ خطا: متغیرهای محیطی MINIO_ROOT_USER و MINIO_ROOT_PASSWORD الزامی هستند." >&2
  echo "   از اعتبارنامهٔ پیش‌فرض استفاده نمی‌شود (خطر امنیتی). نمونه:" >&2
  echo "   MINIO_ROOT_USER=admin MINIO_ROOT_PASSWORD='یک‌رمز-قوی-حداقل-۸کاراکتری' ./scripts/start-minio.sh" >&2
  exit 1
fi
export MINIO_ROOT_USER MINIO_ROOT_PASSWORD
# امنیت: اتصال فقط به loopback تا سرویس روی همهٔ اینترفیس‌ها افشا نشود؛ قابل بازنویسی با MINIO_BIND_ADDR.
BIND_ADDR=${MINIO_BIND_ADDR:-127.0.0.1}
exec "$BIN" server /tmp/afagh-minio --address "$BIND_ADDR:9000" --console-address "$BIND_ADDR:9001"
