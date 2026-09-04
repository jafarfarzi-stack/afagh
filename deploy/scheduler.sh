#!/bin/sh
# ══════════════════════════════════════════════════════════════════════
#  زمان‌بند پویش‌های آفاق
#
#  پیش از این هیچ cron‌ای در استقرار زمان‌بندی نشده بود، پس endpoint‌های
#  /api/cron/* هرگز خودکار صدا زده نمی‌شدند — از جمله یادآوری چک که بدون
#  آن قابلیت «پیام پیش از سررسید» عملاً کار نمی‌کرد. این سرویس همان حلقهٔ
#  گمشده است: هر SCHEDULER_TICK_SECONDS بیدار می‌شود و پویش‌هایی را که
#  موعدشان رسیده فراخوانی می‌کند.
#
#  همهٔ فاصله‌ها از ENV می‌آیند (به دقیقه)، نه از کد:
#    CHEQUE_REMIND_INTERVAL_MIN     یادآوری چک          پیش‌فرض ۶۰
#    GRAD_SCAN_INTERVAL_MIN         پویش فارغ‌التحصیلی  پیش‌فرض ۱۴۴۰
#    BI_REFRESH_INTERVAL_MIN        تازه‌سازی گزارش BI   پیش‌فرض ۷۲۰
#    WORKFLOW_EVENTS_INTERVAL_MIN   رویدادهای گردش کار   پیش‌فرض ۶۰
#
#  مسیرها GET را به POST واگذار می‌کنند، پس فراخوانی ساده می‌ماند.
# ══════════════════════════════════════════════════════════════════════
set -u

APP_URL="${APP_URL:-http://app:8080}"

# M-2: کلیدهای محرمانه از volume مشترک (که seed-base هنگام نصب تولید می‌کند)
# اگر ENV ست شده باشد، همان مقداری است که seed-base در DB ثبت کرده — همیشه هم‌ارزند.
if [ -f /secrets/cron.env ]; then
  . /secrets/cron.env
fi

# مقدار غیرعددی یا تهی → پیش‌فرض. بدون این محافظ، یک ENV اشتباه
# حلقه را با خطای حساب می‌شکند و زمان‌بند بی‌صدا می‌میرد.
num() {
  case "$1" in
    ''|*[!0-9]*) echo "$2" ;;
    *) echo "$1" ;;
  esac
}

TICK="$(num "${SCHEDULER_TICK_SECONDS:-60}" 60)"
CHEQUE_MIN="$(num "${CHEQUE_REMIND_INTERVAL_MIN:-60}" 60)"
GRAD_MIN="$(num "${GRAD_SCAN_INTERVAL_MIN:-1440}" 1440)"
BI_MIN="$(num "${BI_REFRESH_INTERVAL_MIN:-720}" 720)"
WF_MIN="$(num "${WORKFLOW_EVENTS_INTERVAL_MIN:-60}" 60)"

FINANCE_SECRET="${FINANCE_CRON_SECRET:-}"
GRAD_SECRET="${GRAD_CRON_SECRET:-}"
BI_SECRET="${BI_CRON_SECRET:-}"

now_min() { echo $(( $(date +%s) / 60 )); }

# فراخوانی یک پویش.
# شکست شبکه یا ۵۰۰ نباید زمان‌بند را از کار بیندازد — فقط گزارش می‌شود
# و نوبت بعدی سر جایش می‌رسد.
call() {
  _path="$1"
  _secret="$2"
  if [ -z "$_secret" ]; then
    echo "[scheduler] $_path: کلید محرمانه تنظیم نشده — فراخوانی نشد"
    return 0
  fi
  _resp=$(wget -q -O - \
    --header="x-cron-secret: $_secret" \
    "$APP_URL$_path" 2>/dev/null | head -c 400)
  echo "[scheduler] $(date '+%Y-%m-%d %H:%M:%S') $_path -> ${_resp:-بدون پاسخ}"
}

start=$(now_min)
next_cheque=$start
next_grad=$start
next_bi=$start
next_wf=$start

echo "[scheduler] شروع — app=$APP_URL tick=${TICK}s"
echo "[scheduler] فاصله‌ها (دقیقه): cheque=$CHEQUE_MIN grad=$GRAD_MIN bi=$BI_MIN workflow=$WF_MIN"
if [ -z "$FINANCE_SECRET" ]; then
  echo "[scheduler] هشدار: FINANCE_CRON_SECRET خالی است — یادآوری چک ارسال نمی‌شود"
fi
if [ -z "$GRAD_SECRET" ]; then
  echo "[scheduler] هشدار: GRAD_CRON_SECRET خالی است — پویش فارغ‌التحصیلی/گردش کار اجرا نمی‌شود"
fi
if [ -z "$BI_SECRET" ]; then
  echo "[scheduler] هشدار: BI_CRON_SECRET خالی است — تازه‌سازی گزارش‌های تحلیلی اجرا نمی‌شود"
fi

while :; do
  now=$(now_min)

  if [ "$now" -ge "$next_cheque" ]; then
    call "/api/cron/cheque-reminders" "$FINANCE_SECRET"
    next_cheque=$(( now + CHEQUE_MIN ))
  fi

  if [ "$now" -ge "$next_grad" ]; then
    call "/api/cron/graduation-scan" "$GRAD_SECRET"
    next_grad=$(( now + GRAD_MIN ))
  fi

  if [ "$now" -ge "$next_bi" ]; then
    call "/api/cron/bi-refresh" "$BI_SECRET"
    next_bi=$(( now + BI_MIN ))
  fi

  if [ "$now" -ge "$next_wf" ]; then
    call "/api/cron/workflow-events" "$GRAD_SECRET"
    next_wf=$(( now + WF_MIN ))
  fi

  sleep "$TICK"
done
