#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  انتقال داده‌های سامانهٔ قدیمی (سما) به آفاق روی سرور
#
#  قرارداد: این اسکریپت از ریشهٔ ریپو اجرا می‌شود. فایل‌های خروجی قدیمی
#  (TSV با انکودینگ Windows-1256) باید یک‌جا در مسیرِ داده‌ای وجود داشته
#  باشند که کاربر با صفحهٔ میزبان آپلود کرده است.
#
#  استفاده:
#    bash deploy/import-sama.sh /path/to/information-afagh
#    bash deploy/import-sama.sh /path/to/information-afagh --steps pre,terms,majors,students,grades,codemap
#    bash deploy/import-sama.sh /path/to/information-afagh --dry        # فقط شبیه‌سازی، بدون نوشتن
#
#  ترتیب اجراْ داخلِ کانتینرِ afagh-migrator (همان ایمیجی که اسکیما و
#  RLS را ساخته) روی شبکهٔ afagh_default انجام می‌شود؛ نیازی به نصب
#  node/pg روی سرور نیست.
# ════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

PROJECT_NAME="afagh"
NETWORK="${PROJECT_NAME}_default"
IMAGE="afagh-migrator:latest"

SOURCE_DIR="${1:-}"
if [ -z "$SOURCE_DIR" ] || [ ! -d "$SOURCE_DIR" ]; then
  echo "خطا: مسیر پوشهٔ فایل‌های سما را بدهید (که با صفحهٔ میزبان/آپلود منتقل کرده‌اید)." >&2
  echo "استفاده: bash deploy/import-sama.sh /path/to/information-afagh [options]" >&2
  exit 1
fi
SOURCE_DIR="$(cd "$SOURCE_DIR" && pwd)"

shift || true
STEPS="pre,terms,majors,courses,students,grades,codemap"
DRY=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --steps) STEPS="${2}"; shift 2 ;;
    --dry)   DRY="--dry"; shift ;;
    *) echo "آگومان ناشناخته: $1" >&2; exit 1 ;;
  esac
done

# ── ایمیج migrator باید روی سرور ساخته شده باشد (نتیجهٔ deploy-debian.sh) ──
if [ -z "$(docker images -q "$IMAGE" 2>/dev/null)" ]; then
  echo "خطا: ایمیج $IMAGE یافت نشد. اول استقرار (deploy-debian.sh / docker compose build) را کامل کنید." >&2
  exit 1
fi

# ── کانتینر پستگرس درحال‌اجرا را پیدا کن (نام ممکن است با استقرار فرق کند) ──
PG_CONTAINER="$(docker ps --format '{{.Names}}' --filter 'name=^afagh_pg$' 2>/dev/null | head -n1 || true)"
if [ -z "$PG_CONTAINER" ]; then
  PG_CONTAINER="$(docker ps --format '{{.Names}}' --filter 'ancestor=postgres' 2>/dev/null | head -n1 || true)"
fi
if [ -z "$PG_CONTAINER" ]; then
  echo "خطا: کانتینر پستگرس درحال‌اجرا پیدا نشد. کانتینرهای فعال:" >&2
  docker ps --format '  {{.Names}} | {{.Image}} | {{.Status}}' >&2 || true
  exit 1
fi

# ── شبکه‌ای که پستگرس واقعاً رویش است (نه حدس ثابت) + هاست مطمئن ──
NETWORK="$(docker inspect "$PG_CONTAINER" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null | awk '{print $1}')"
if [ -z "$NETWORK" ]; then NETWORK="${PROJECT_NAME}_default"; fi
PG_HOST="$PG_CONTAINER"   # نام کانتینر روی شبکهٔ user-defined همیشه resolve می‌شود

# ── پیش‌پرواز: دیتابیس واقعاً جواب می‌دهد؟ ──
if ! docker exec "$PG_CONTAINER" pg_isready -U afagh -d afagh_db >/dev/null 2>&1; then
  echo "خطا: پستگرس ($PG_CONTAINER) آماده نیست. لاگ: docker logs $PG_CONTAINER --tail 30" >&2
  exit 1
fi

# ── رمز واقعی پستگرس: اول از .env (با تحمل فاصله/کوتیشن)، بعد از کانتینر درحال‌اجرا ──
ENV_FILE="$ROOT/.env"
PGPW="$(grep -E '^[[:space:]]*POSTGRES_PASSWORD[[:space:]]*=' "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2- | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//" || true)"
if [ -z "$PGPW" ]; then
  echo "(.env خوانده نشد؛ تلاش برای خواندن رمز از کانتینر $PG_CONTAINER …)"
  PGPW="$(docker exec "$PG_CONTAINER" printenv POSTGRES_PASSWORD 2>/dev/null | tr -d '\r\n' || true)"
fi
if [ -z "$PGPW" ]; then
  echo "خطا: رمز پستگرس پیدا نشد." >&2
  echo "  بررسی کنید: 1) فایل $ENV_FILE شامل POSTGRES_PASSWORD باشد" >&2
  echo "              2) کانتینر بالا باشد: docker ps --format '{{.Names}}'" >&2
  exit 1
fi

echo "═ انتقال دادهٔ سما → آفاق ═"
echo "  پوشهٔ داده: $SOURCE_DIR"
echo "  مراحل:      $STEPS ${DRY:+[DRY-RUN]}"
echo "  پستگرس:     $PG_CONTAINER روی $NETWORK (هاست $PG_HOST)"
echo ""

# پوشهٔ scripts هاست را روی کانتینر mount می‌کنیم تا همیشه تازه‌ترین نسخهٔ
# اسکریپت‌ها اجرا شود (بدون نیاز به rebuild ایمیج)؛ node_modules از داخل ایمیج می‌ماند
docker run --rm \
  --network "$NETWORK" \
  -v "$SOURCE_DIR:/data:ro" \
  -v "$ROOT/afagh-next/scripts:/app/scripts:ro" \
  -e DATABASE_URL="postgres://afagh:${PGPW}@${PG_HOST}:5432/afagh_db" \
  "$IMAGE" \
  node scripts/import-sama-afagh.mjs --dir "/data" --steps "$STEPS" ${DRY}

# ── مرحلهٔ اختیاری رتبهٔ اساتید (اگر اساتيد.txt وجود داشت، یکجا اجرا می‌شود) ──
if [ -f "$SOURCE_DIR/اساتيد.txt" ]; then
  echo ""
  echo "── به‌روزرسانی رتبهٔ اساتید (از اساتيد.txt) ──"
  docker run --rm \
    --network "$NETWORK" \
    -v "$SOURCE_DIR:/data:ro" \
    -v "$ROOT/afagh-next/scripts:/app/scripts:ro" \
    -e DATABASE_URL="postgres://afagh:${PGPW}@${PG_HOST}:5432/afagh_db" \
    "$IMAGE" \
    node scripts/update_profs_rank.mjs --dir /data || echo "⚠ به‌روزرسانی رتبه ناقص بود — لاگ بالا را ببینید"
fi

echo ""
echo "✅ پایان. اگر نوشتنی بود، همین حالا وارد سامانه شوید و داده‌ها را در پنل ببینید."