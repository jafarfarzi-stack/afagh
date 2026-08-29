#!/usr/bin/env bash
# اجرای همهٔ سرویس‌های آفاق — پس از install.sh
# استفاده: ./start.sh [--with-demo]   (--with-demo = فاز صفر روی پورت ۳۰۰۰ هم بالا بیاید)
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p run/logs

G='\033[32m'; Y='\033[33m'; B='\033[1m'; N='\033[0m'
alive() { (echo >/dev/tcp/127.0.0.1/$1) 2>/dev/null; }

# ① MinIO (در صورت نبود، دانلود و اجرای محلی)
if ! alive 9000; then
  echo -e "${B}[MinIO]${N} در حال راه‌اندازی…"
  nohup bash afagh-next/scripts/start-minio.sh > run/logs/minio.log 2>&1 &
  echo $! > run/minio.pid
  for i in $(seq 1 30); do alive 9000 && break; sleep 1; done
fi
alive 9000 && echo -e "${G}✓${N} MinIO :9000 (کنسول :9001)" || echo -e "${Y}⚠${N} MinIO بالا نیامد — بایگانی بدون آن کار نمی‌کند"

# ② PostgreSQL و Redis (باید از قبل نصب/روشن باشند — یا docker compose up -d)
alive 5432 && echo -e "${G}✓${N} PostgreSQL :5432" || { echo "PostgreSQL رو نیست؛ اول install.sh یا docker compose"; exit 1; }
alive 6379 && echo -e "${G}✓${N} Redis :6379" || { echo "Redis رو نیست"; exit 1; }
redis-cli ping >/dev/null 2>&1 && (cd afagh-next && set -a && . ./.env 2>/dev/null; set +a; node scripts/warm-redis.mjs >/dev/null 2>&1 || true)

# ③ کالبد Next.js (پورت ۳۱۰۰)
if ! alive 3100; then
  echo -e "${B}[کالبد]${N} اجرای Next.js پروداکشن…"
  (cd afagh-next && set -a && . ./.env 2>/dev/null; set +a; nohup npm start > ../run/logs/next.log 2>&1 & echo $! > ../run/next.pid)
  for i in $(seq 1 30); do alive 3100 && break; sleep 1; done
fi
alive 3100 && echo -e "${G}✓${N} کالبد :3100 → http://localhost:3100  (ورود: 0000000001 / 123456)" || { echo "کالبد بالا نیامد — run/logs/next.log"; exit 1; }

# ④ فاز صفر (اختیاری)
if [ "${1:-}" = "--with-demo" ] && ! alive 3000; then
  (cd afagh-erp && nohup npm start > ../run/logs/erp.log 2>&1 & echo $! > ../run/erp.pid)
  for i in $(seq 1 20); do alive 3000 && break; sleep 1; done
  alive 3000 && echo -e "${G}✓${N} فاز صفر :3000 → http://localhost:3000" || echo -e "${Y}⚠${N} فاز صفر بالا نیامد — run/logs/erp.log"
fi

echo -e "\nهمه آماده است. وضعیت: ./status.sh   توقف: ./stop.sh"
