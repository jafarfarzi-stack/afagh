#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  نصب کامل سامانه جامع آفاق — دیتابیس و سرویس‌ها روی Docker
#  PostgreSQL + Redis + MinIO  →  Docker
#  Next.js (afagh-next)        →  همین سیستم (Node)
#
#  اجرا:   ./install-docker.sh [--with-demo-data] [--fresh] [--skip-build] [--start]
# ════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$PWD"; NEXT="$ROOT/afagh-next"; ERP="$ROOT/afagh-erp"
COMPOSE="$NEXT/docker-compose.yml"; PROJECT="afagh"

G='\033[32m'; R='\033[31m'; Y='\033[33m'; C='\033[36m'; B='\033[1m'; N='\033[0m'
step() { echo -e "\n${C}═══ $1 ═══${N}"; }
ok()   { echo -e "  ${G}[OK]${N}   $1"; }
warn() { echo -e "  ${Y}[!]${N}    $1"; }
die()  { echo -e "  ${R}[X]${N}    $1"; exit 1; }

WITH_DEMO=0; FRESH=0; SKIP_BUILD=0; START=0
for a in "$@"; do case "$a" in
  --with-demo-data) WITH_DEMO=1 ;;
  --fresh) FRESH=1 ;;
  --skip-build) SKIP_BUILD=1 ;;
  --start) START=1 ;;
  -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
  *) die "سوییچ ناشناخته: $a" ;;
esac; done

dc() { docker compose -p "$PROJECT" -f "$COMPOSE" "$@"; }

echo -e "\n${B}════════ نصب سامانه جامع آفاق (Docker) ════════${N}"

# ── ۰) پیش‌نیازها ──
step "۰/۷ بررسی پیش‌نیازها"
[ -d "$NEXT" ] || die "پوشهٔ afagh-next پیدا نشد — اسکریپت باید در ریشهٔ پروژه اجرا شود."
command -v node >/dev/null || die "Node.js نصب نیست (۱۸ به بالا)"
NODE_MAJOR=$(node -e 'console.log(process.versions.node.split(".")[0])')
[ "$NODE_MAJOR" -ge 18 ] || die "نسخهٔ Node باید ≥۱۸ باشد (فعلی: $(node -v))"
ok "Node $(node -v) + npm $(npm -v)"
command -v docker >/dev/null || die "Docker نصب نیست"
docker info >/dev/null 2>&1 || die "Docker در حال اجرا نیست (سرویس/Docker Desktop را روشن کنید)"
ok "Docker آمادهٔ کار است"

# ── ۱) کانتینرها ──
step "۱/۷ راه‌اندازی PostgreSQL + Redis + MinIO روی Docker"
if [ "$FRESH" = "1" ]; then warn "حالت --fresh: حذف کانتینرها و کل داده"; dc down -v >/dev/null 2>&1 || true; fi
# کانتینرهای نصب‌های قدیمی (پروژهٔ پیش‌فرض afagh-next) پورت‌ها را اشغال می‌کنند
if [ -n "$(docker ps -aq --filter 'label=com.docker.compose.project=afagh-next' 2>/dev/null)" ]; then
  warn "کانتینرهای نصب قبلی پیدا شد — حذف می‌شوند (volume دادهٔ قدیمی دست‌نخورده می‌ماند)"
  docker compose -p afagh-next -f "$COMPOSE" down >/dev/null 2>&1 || true
fi
dc up -d || die "docker compose up ناموفق بود"
ok "کانتینرها بالا آمدند (پروژهٔ docker: $PROJECT)"

printf "  … در انتظار آماده‌شدن PostgreSQL"
PG_READY=0
for _ in $(seq 1 90); do
  if docker exec afagh_pg pg_isready -U afagh -d afagh_db >/dev/null 2>&1; then PG_READY=1; break; fi
  printf "."; sleep 2
done; echo ""
[ "$PG_READY" = "1" ] || die "PostgreSQL آماده نشد — لاگ: docker compose -p $PROJECT logs postgres"
ok "PostgreSQL :5432 (کاربر afagh / دیتابیس afagh_db)"
docker exec afagh_redis redis-cli ping >/dev/null 2>&1 && ok "Redis :6379" || warn "Redis پاسخ نداد"
for _ in $(seq 1 30); do curl -fsS http://127.0.0.1:9000/minio/health/live >/dev/null 2>&1 && break; sleep 2; done
curl -fsS http://127.0.0.1:9000/minio/health/live >/dev/null 2>&1 \
  && ok "MinIO :9000 (کنسول :9001 — afagh / afagh-secret)" || warn "MinIO آماده نشد — بایگانی مدارک کار نمی‌کند"

# ── ۲) .env ──
step "۲/۷ فایل تنظیمات .env"
if [ ! -f "$NEXT/.env" ]; then
  cp "$NEXT/.env.example" "$NEXT/.env"
  printf 'S3_ACCESS_KEY=afagh\nS3_SECRET_KEY=afagh-secret\n' >> "$NEXT/.env"
  ok "ساخته شد: afagh-next/.env"
else
  ok "از قبل موجود بود: afagh-next/.env (دست‌نخورده ماند)"
fi
set -a; . "$NEXT/.env"; set +a
export DATABASE_URL="${DATABASE_URL:-postgres://afagh:afagh@127.0.0.1:5432/afagh_db}"
export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"

# ── ۳) وابستگی‌ها ──
step "۳/۷ نصب وابستگی‌های Node"
LOCK_HASH=$(sha256sum "$NEXT/package-lock.json" | cut -d' ' -f1)
STAMP="$NEXT/node_modules/.afagh-lock-hash"
if [ -f "$STAMP" ] && [ "$(cat "$STAMP")" = "$LOCK_HASH" ]; then
  ok "وابستگی‌ها به‌روزند — نصب مجدد لازم نشد"
else
  [ -d "$NEXT/node_modules" ] && { warn "package-lock تغییر کرده — پاک‌سازی node_modules و .next"; rm -rf "$NEXT/node_modules" "$NEXT/.next"; }
  (cd "$NEXT" && npm install --no-audit --no-fund) || die "npm install ناموفق"
  echo "$LOCK_HASH" > "$STAMP"
  ok "afagh-next نصب شد"
fi

# ── ۴) اسکیما ──
step "۴/۷ ساخت جدول‌ها روی PostgreSQL (Drizzle)"
(cd "$NEXT" && npx drizzle-kit push --force) || die "drizzle-kit push ناموفق"
ok "جدول‌ها ساخته/به‌روز شدند (شامل migration_runs و ستون‌های هدف‌گیری ارائه)"
(cd "$NEXT" && npm run db:hardening >/dev/null 2>&1) \
  && ok "سخت‌سازی: ایندکس‌ها + RLS + نقش فقط‌خواندنی afagh_app" \
  || warn "سخت‌سازی ناموفق بود — سامانه کار می‌کند ولی RLS فعال نشد"

# ── ۵) دادهٔ دمو ──
step "۵/۷ دادهٔ نمونه"
if [ "$WITH_DEMO" = "1" ]; then
  if [ ! -f "$ERP/data/afagh.db" ]; then
    warn "دیتابیس دموی فاز صفر موجود نیست — در حال ساخت…"
    (cd "$ERP" && npm install --no-audit --no-fund >/dev/null 2>&1 && npm run seed >/dev/null 2>&1) || warn "seed فاز صفر ناموفق بود"
  fi
  if [ -f "$ERP/data/afagh.db" ]; then
    (cd "$NEXT" && node scripts/migrate-sqlite-to-pg.mjs >/dev/null 2>&1) \
      && ok "دادهٔ دمو به PostgreSQL منتقل شد (idempotent)" || warn "انتقال دادهٔ دمو ناموفق بود"
  else
    warn "بدون دادهٔ دمو ادامه می‌دهیم — حساب‌های دمو هنگام اولین ورود خودکار ساخته می‌شوند"
  fi
else
  warn "رد شد. برای دادهٔ نمونه با --with-demo-data اجرا کنید"
fi
(cd "$NEXT" && node scripts/warm-redis.mjs >/dev/null 2>&1) && ok "ظرفیت کلاس‌ها در Redis گرم شد" || true

# ── ۶) بیلد ──
step "۶/۷ بیلد پروداکشن Next.js"
if [ "$SKIP_BUILD" = "1" ]; then warn "رد شد (--skip-build)"; else
  (cd "$NEXT" && npm run build) || die "بیلد ناموفق"; ok "بیلد موفق"
fi

# ── ۷) جمع‌بندی ──
step "۷/۷ نصب تمام شد"
cat <<EOF

  اجرا:
      cd afagh-next && npm start        → http://localhost:3100
      (حالت توسعه: npm run dev)

  حساب‌های دمو — رمز همه: 123456
      مدیر    0000000001    →  /admin
      استاد   0011111111    →  /professor
      دانشجو  31412001      →  /student

  سرویس‌های Docker:
      وضعیت:  docker compose -p $PROJECT -f afagh-next/docker-compose.yml ps
      توقف :  docker compose -p $PROJECT -f afagh-next/docker-compose.yml stop
      حذف کامل داده: docker compose -p $PROJECT -f afagh-next/docker-compose.yml down -v
      کنسول MinIO: http://localhost:9001  (afagh / afagh-secret)

EOF

if [ "$START" = "1" ]; then
  step "اجرای سرور روی پورت ۳۱۰۰ (توقف با Ctrl+C)"
  (cd "$NEXT" && npm start)
fi
