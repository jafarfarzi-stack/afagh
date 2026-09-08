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
STEPS="pre,terms,majors,students,grades,codemap"
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

# ── رمز واقعی پستگرس از .env ریشهٔ پروژه (تصادفی و ساختهٔ deploy) ──
ENV_FILE="$ROOT/.env"
PGPW="$(grep -E '^POSTGRES_PASSWORD=' "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2- || true)"
if [ -z "$PGPW" ]; then
  echo "خطا: POSTGRES_PASSWORD در $ENV_FILE یافت نشد." >&2
  exit 1
fi

echo "═ انتقال دادهٔ سما → آفاق ═"
echo "  پوشهٔ داده: $SOURCE_DIR"
echo "  مراحل:      $STEPS ${DRY:+[DRY-RUN]}"
echo "  کانتینر:    $NETWORK / $IMAGE"
echo ""

docker run --rm \
  --network "$NETWORK" \
  -v "$SOURCE_DIR:/data:ro" \
  -e DATABASE_URL="postgres://afagh:${PGPW}@postgres:5432/afagh_db" \
  "$IMAGE" \
  node scripts/import-sama-afagh.mjs --dir "/data" --steps "$STEPS" ${DRY}

echo ""
echo "✅ پایان. اگر نوشتنی بود، همین حالا وارد سامانه شوید و داده‌ها را در پنل ببینید."