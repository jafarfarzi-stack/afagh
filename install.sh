#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  نصب کامل سامانه جامع آفاق — یک دستور تا اجرا
#  afagh-erp (فاز صفر/دمو SQLite) + afagh-next (PostgreSQL+Redis+MinIO)
#  استفاده:  ./install.sh          (سرویس‌های محلی از قبل نصب/روشن)
#            AFAGH_USE_DOCKER=1 ./install.sh   (با docker compose)
# ════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")"

G='\033[32m'; R='\033[31m'; Y='\033[33m'; B='\033[1m'; N='\033[0m'
ok()   { echo -e "  ${G}✓${N} $1"; }
bad()  { echo -e "  ${R}✗${N} $1"; }
step() { echo -e "\n${B}═══ $1 ═══${N}"; }
die()  { bad "$1"; exit 1; }

echo -e "${B}════════ نصب کامل سامانه جامع آفاق ══════${N}"

# ── ۰) پیش‌نیازها ──
step "۰/۶ بررسی پیش‌نیازها"
command -v node >/dev/null || die "Node.js نصب نیست (≥۱۸ لازم است)"
NODE_MAJOR=$(node -e 'console.log(process.versions.node.split(".")[0])')
[ "$NODE_MAJOR" -ge 18 ] || die "نسخهٔ Node باید ≥۱۸ باشد (فعلی: $(node -v))"
ok "Node $(node -v) + npm $(npm -v)"

USE_DOCKER="${AFAGH_USE_DOCKER:-0}"
if [ "$USE_DOCKER" = "1" ]; then
  command -v docker >/dev/null || die "docker پیدا نشد"
  step "سرویس‌های زیرین با Docker (PostgreSQL + Redis + MinIO)"
  (cd afagh-next && docker compose up -d) || die "docker compose ناموفق"
  ok "کانتینرها بالا شدند (اولین بار ممکن است چند دقیقه image بکشد)"
else
  step "۱/۶ سرویس‌های محلی"
  (echo >/dev/tcp/127.0.0.1/5432) 2>/dev/null && ok "PostgreSQL :5432" || die "PostgreSQL رو نیست — یا روشن کنید یا AFAGH_USE_DOCKER=1 بزنید"
  (echo >/dev/tcp/127.0.0.1/6379) 2>/dev/null && ok "Redis :6379" || die "Redis رو نیست — apt install redis-server && service redis-server start"
  (echo >/dev/tcp/127.0.0.1/9000) 2>/dev/null && ok "MinIO :9000" || {
    echo -e "  ${Y}MinIO محلی نیست — هنگام start.sh خودکار دانلود/اجرا می‌شود${N}"
  }
fi

wait_port() { for i in $(seq 1 60); do (echo >/dev/tcp/127.0.0.1/$1) 2>/dev/null && return 0; sleep 1; done; return 1; }
wait_port 5432 || die "PostgreSQL آماده نشد"
wait_port 6379 || die "Redis آماده نشد"

# ── ۲) نقش‌ها و دیتابیس PostgreSQL (idempotent) ──
step "۲/۶ دیتابیس PostgreSQL (نقش‌ها + afagh_db)"
if sudo -n true 2>/dev/null && sudo -u postgres psql -tAc "SELECT 1" >/dev/null 2>&1; then
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='afagh'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE ROLE afagh LOGIN PASSWORD 'afagh' SUPERUSER CREATEDB;" >/dev/null
  ok "نقش afagh"
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='afagh_db'" | grep -q 1 || \
    sudo -u postgres createdb -O afagh afagh_db
  ok "دیتابیس afagh_db"
else
  PGPASSWORD=afagh psql -h 127.0.0.1 -U afagh -d afagh_db -tAc "SELECT 1" >/dev/null 2>&1 \
    && ok "نقش/دیتابیس از قبل موجود است" || {
    bad "دسترسی مدیر PG نداریم — دستی اجرا کنید:"
    echo "    sudo -u postgres psql -c \"CREATE ROLE afagh LOGIN PASSWORD 'afagh' SUPERUSER CREATEDB;\""
    echo "    sudo -u postgres createdb -O afagh afagh_db"
    exit 1
  }
fi
export PGPASSWORD=afagh
PSQL="psql -h 127.0.0.1 -U afagh -d afagh_db"

# ── ۳) نصب وابستگی‌ها ──
step "۳/۶ نصب وابستگی‌های Node"
(cd afagh-erp && npm install --no-audit --no-fund >/dev/null) && ok "afagh-erp (فاز صفر)"
(cd afagh-next && npm install --no-audit --no-fund >/dev/null) && ok "afagh-next (کالبد)"

# ── ۴) اسکیمای PostgreSQL + سخت‌سازی + مهاجرت دمو ──
step "۴/۶ اسکیما + RLS + دادهٔ دمو"
cd afagh-next
[ -f .env ] || cp .env.example .env
set -a; . ./.env; set +a
export DATABASE_URL="${DATABASE_URL:-postgres://afagh:afagh@127.0.0.1:5432/afagh_db}"
npx drizzle-kit push --force >/dev/null 2>&1 && ok "۷۳ جدول با Drizzle ساخته/تأیید شد" || die "drizzle-kit push ناموفق"
$PSQL -f src/db/pg-hardening.sql >/dev/null 2>&1 && ok "سخت‌سازی: ایندکس‌ها + RLS (۱۱ سیاست) + نقش afagh_app" || die "pg-hardening ناموفق"
if [ -f "${SQLITE_SOURCE:-../afagh-erp/data/afagh.db}" ]; then
  node scripts/migrate-sqlite-to-pg.mjs | tail -1 && ok "دادهٔ دموی فاز صفر منتقل شد (idempotent)"
else
  echo -e "  ${Y}فایل SQLite دمو نبود — از seed فاز صفر اجرا کنید${N}"
fi
cd ..

# ── ۵) Redis و بیلد ──
step "۵/۶ گرم‌کردن Redis + بیلد پروداکشن"
(cd afagh-next && set -a && . ./.env && set +a && node scripts/warm-redis.mjs) && ok "ظرفیت کلاس‌ها در Redis (§۱۰۰۶)"
(cd afagh-next && set -a && . ./.env && set +a && npm run build >/dev/null 2>&1) && ok "بیلد Next.js پروداکشن" || die "بیلد ناموفق"

# ── ۶) جمع‌بندی ──
step "۶/۶ تمام شد ✓"
echo -e """
${G}نصب کامل شد.${N} اجرا:   ${B}./start.sh${N}   سپس:
  • کالبد مدرن  → http://localhost:3100   (مدیر 0000000001 / 123456)
  • فاز صفر دمو → http://localhost:3000    (کارشناس بایگانی 0099999999 / 123456)
  • کنسول MinIO → http://localhost:9001   (afagh / afagh-secret)
وضعیت سرویس‌ها: ${B}./status.sh${N}   توقف: ${B}./stop.sh${N}"""
