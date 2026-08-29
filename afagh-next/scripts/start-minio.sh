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
export MINIO_ROOT_USER=${MINIO_ROOT_USER:-afagh}
export MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD:-afagh-secret}
exec "$BIN" server /tmp/afagh-minio --address 0.0.0.0:9000 --console-address 0.0.0.0:9001
