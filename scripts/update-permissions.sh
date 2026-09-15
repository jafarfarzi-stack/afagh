#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════
#  به‌روزرسانی امن سرور — «ماتریس دسترسی‌ها» (/admin/permissions)
#
#  فلسفهٔ این اسکریپت: «اگر چیزی خراب شد، سرویسِ در حال کار نباید بخوابد.»
#
#   ۱) از ایمیج فعلی یک تگ rollback می‌گیرد
#   ۲) ایمیج جدید را می‌سازد — کانتینر قدیمی همچنان بالاست
#      ↳ اگر بیلد شکست بخورد، هیچ چیزی عوض نشده و اسکریپت متوقف می‌شود
#   ۳) دیتابیس را با SQL خالص seed می‌کند (بدون بیلد migrator)
#   ۴) فقط سرویس app را جایگزین می‌کند
#   ۵) سلامت را چک می‌کند؛ اگر بالا نیامد، خودکار به ایمیج قبلی برمی‌گردد
#
#  اجرا (در ریشهٔ مخزن روی سرور):
#      bash scripts/update-permissions.sh
#
#  گزینه‌ها:
#      --db-only     فقط seed دیتابیس؛ هیچ بیلدی انجام نمی‌شود
#      --no-pull     کد را از گیت نگیر (فرض: از قبل به‌روز است)
# ══════════════════════════════════════════════════════════════════
set -Eeuo pipefail

BRANCH="arena/01a07109-afagh"
DB_ONLY=0
NO_PULL=0
for a in "$@"; do
  case "$a" in
    --db-only) DB_ONLY=1 ;;
    --no-pull) NO_PULL=1 ;;
    *) echo "گزینهٔ ناشناخته: $a" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")/.."
ROOT="$PWD"
say() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || die "docker پیدا نشد."
DC="docker compose"
$DC version >/dev/null 2>&1 || DC="docker-compose"
[ -f docker-compose.yml ] || die "docker-compose.yml در $ROOT نیست — از ریشهٔ مخزن اجرا کنید."

DB_USER="${POSTGRES_USER:-afagh}"
DB_NAME="${POSTGRES_DB:-afagh_db}"
SQL_FILE="afagh-next/scripts/seed-permissions.sql"

# ── ۰) گرفتن کد ────────────────────────────────────────────────────
if [ "$NO_PULL" -eq 0 ]; then
  say "دریافت کد از گیت ($BRANCH)"
  if ! git diff --quiet || ! git diff --cached --quiet; then
    die "تغییرات کامیت‌نشدهٔ محلی دارید. اول 'git stash' یا کامیت کنید."
  fi
  OLD_COMMIT="$(git rev-parse HEAD)"
  git fetch origin "$BRANCH"
  git checkout -f "$BRANCH"
  git reset --hard "origin/$BRANCH"
  echo "  کامیت قبلی (برای بازگشت دستی): $OLD_COMMIT"
  echo "  کامیت جدید: $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"
fi

[ -f "$SQL_FILE" ] || die "$SQL_FILE پیدا نشد."

# ── ۱) بیلد امن (کانتینر فعلی دست‌نخورده می‌ماند) ──────────────────
ROLLBACK_TAG=""
if [ "$DB_ONLY" -eq 0 ]; then
  if docker image inspect afagh-app:latest >/dev/null 2>&1; then
    ROLLBACK_TAG="afagh-app:rollback-$(date +%Y%m%d-%H%M%S)"
    docker image tag afagh-app:latest "$ROLLBACK_TAG"
    say "ایمیج فعلی برای بازگشت نگه داشته شد: $ROLLBACK_TAG"
  fi

  say "بیلد ایمیج جدید app (سرویس فعلی همچنان در حال سرویس‌دهی است)"
  if ! $DC build app; then
    echo
    echo "  ↩ بیلد شکست خورد — هیچ تغییری روی سرویسِ در حال کار اعمال نشد."
    echo "     سایت شما همچنان با نسخهٔ قبلی بالاست."
    echo "     اگر خطا 'exit code: 137' بود یعنی کمبود حافظه:"
    echo "       sudo bash scripts/ensure-build-memory.sh"
    echo "       echo 'NODE_MAX_OLD_SPACE=1536' >> .env   # سپس دوباره اجرا کنید"
    die "بیلد ناموفق."
  fi
fi

# ── ۲) seed دیتابیس با SQL خالص (idempotent، بدون بیلد migrator) ───
say "هم‌ترازسازی کاتالوگ مجوزها در دیتابیس"
$DC exec -T postgres psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" < "$SQL_FILE" \
  || die "seed دیتابیس ناموفق بود (کانتینر postgres بالاست؟ نام کاربر/دیتابیس درست است؟)."

[ "$DB_ONLY" -eq 1 ] && { say "فقط دیتابیس به‌روز شد (--db-only). تمام."; exit 0; }

# ── ۳) جایگزینی فقط سرویس app ──────────────────────────────────────
say "راه‌اندازی نسخهٔ جدید app"
$DC up -d --no-deps app

# ── ۴) بررسی سلامت + بازگشت خودکار ────────────────────────────────
say "بررسی سلامت (حداکثر ۹۰ ثانیه)"
HEALTHY=0
for i in $(seq 1 45); do
  if $DC exec -T app node -e "fetch('http://127.0.0.1:8080/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    HEALTHY=1; break
  fi
  sleep 2
  printf '.'
done
echo

if [ "$HEALTHY" -eq 1 ]; then
  printf '\n\033[1;32m✔ به‌روزرسانی موفق بود.\033[0m\n'
  echo "  اکنون /admin/permissions را با حساب مدیر باز کنید:"
  echo "  باید ۱۱ نقش واقعی، ۳۲ مجوز و دکمهٔ «تأیید و ذخیرهٔ تغییر دسترسی‌ها» را ببینید."
  [ -n "$ROLLBACK_TAG" ] && echo "  (ایمیج قبلی تا اطمینان شما نگه داشته شده: $ROLLBACK_TAG)"
  exit 0
fi

echo "  سرویس جدید سالم نشد — لاگ:"
$DC logs --tail 40 app || true

if [ -n "$ROLLBACK_TAG" ]; then
  say "بازگشت خودکار به ایمیج قبلی"
  docker image tag "$ROLLBACK_TAG" afagh-app:latest
  $DC up -d --no-deps --force-recreate app
  echo "  ↩ به نسخهٔ قبلی برگشتیم. دادهٔ مجوزها در دیتابیس ماند (بی‌ضرر است)."
fi
die "به‌روزرسانی ناموفق — سرویس به حالت قبل برگشت."
