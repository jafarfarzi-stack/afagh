#!/usr/bin/env bash
# توقف سرویس‌هایی که start.sh اجرا کرده است
cd "$(dirname "$0")"
for n in next erp minio; do
  if [ -f "run/$n.pid" ]; then
    PID=$(cat run/$n.pid)
    if kill -0 "$PID" 2>/dev/null; then
      kill "$PID" 2>/dev/null && echo "✓ $n (pid $PID) متوقف شد"
    else
      echo "· $n از قبل پایین است"
    fi
    rm -f "run/$n.pid"
  fi
done
echo "· PostgreSQL/Redis (نصب سیستمی) دست‌نخورده ماند"
