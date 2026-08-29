#!/usr/bin/env bash
# وضعیت زندهٔ همهٔ سرویس‌ها
cd "$(dirname "$0")"
alive() { (echo >/dev/tcp/127.0.0.1/$1) 2>/dev/null; }
G='\033[32m'; R='\033[31m'; N='\033[0m'
st() { alive $2 && echo -e "  ${G}✓${N} $1 — پورت $2" || echo -e "  ${R}✗${N} $1 — پورت $2 پایین"; }
echo "═══ وضعیت سرویس‌های آفاق ═══"
st "PostgreSQL" 5432
st "Redis"      6379
st "MinIO"      9000
st "کالبد Next.js" 3100
st "فاز صفر (اختیاری)" 3000
echo "────────────────────────"
if alive 6379; then echo "  Redis: $(redis-cli ping 2>/dev/null) | کلاس‌های گرم: $(redis-cli HLEN afagh:caps 2>/dev/null || echo 0) | صف: $(redis-cli LLEN afagh:wr:queue 2>/dev/null || echo 0)"; fi
if alive 5432; then PGPASSWORD=afagh psql -h 127.0.0.1 -U afagh -d afagh_db -t -A -c "SELECT '  PostgreSQL ' || version() || ' — جداول: ' || count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" 2>/dev/null | head -1; fi
if alive 3100; then echo "  کالبد /login → HTTP $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/login)"; fi
