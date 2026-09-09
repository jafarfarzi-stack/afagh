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

# ── فراخوانی یک پویش، با تشخیص واقعی وضعیت (P1 — بازبینی پروداکشن) ──
# پیش از این خروجی فقط «log» می‌شد و چون به `head` لوله می‌شد، کد خطای wget دور
# ریخته می‌شد؛ یعنی ۴۰۱/۵۰۰/timeout از «ارتباط برقرار نشد» قابل تشخیص نبود و
# پویشِ خراب بی‌صدا تا نوبت بعدی (مثلاً ۲۴ ساعت بعد) رها می‌شد.
#
# سه دسته، چون واکنش درست‌شان فرق دارد:
#   ok        → شمارش شکست‌های پیوسته صفر می‌شود
#   retryable → ۵xx / timeout / عدم دسترسی به شبکه → تلاش دوباره پس از RETRY_MIN
#   permanent → ۴۰۱/۴۰۳/۴۰۴ (کلید پویش یا مسیر غلط) → فریاد CRITICAL و صبر تا
#               بازهٔ عادی؛ کوبیدن به درگاهِ بدپیکربندی فایده ندارد
RETRY_MIN=$(num "${SCHEDULER_RETRY_MIN:-5}" 5)
FAIL_ALERT_AT=$(num "${SCHEDULER_FAIL_ALERT_AT:-3}" 3)

# call <برچسب> <مسیر> <کلید> <نام متغیرِ next> <بازهٔ عادی دقیقه>
# در POSIX ش (alpine) مقداردهی متغیر پویا فقط با eval ممکن است.
call() {
  _label="$1" _path="$2" _secret="$3" _nextvar="$4" _interval="$5"
  if [ -z "$_secret" ]; then
    echo "[scheduler] $_label: کلید محرمانه تنظیم نشده — فراخوانی نشد"
    return 0
  fi
  _tmp=$(mktemp 2>/dev/null || echo /tmp/afagh-cron.$$)
  _err=$(wget -q -O "$_tmp" --header="x-cron-secret: $_secret" "$APP_URL$_path" 2>&1)
  _rc=$?
  _body=$(head -c 220 "$_tmp" 2>/dev/null | tr '\n' ' ')
  rm -f "$_tmp"

  _kind=ok
  if [ "$_rc" -ne 0 ]; then
    case "$_err$_body" in
      *"401"*|*"403"*|*"404"*|*"405"*) _kind=permanent ;;
      *)                              _kind=retryable ;;
    esac
  fi

  eval "_fails=\${${_label}_fails:-0}"
  case "$_kind" in
    ok)
      eval "${_label}_fails=0"
      echo "[scheduler] $(date '+%Y-%m-%d %H:%M:%S') $_label $_path -> ok ${_body:+· $_body}"
      ;;
    retryable)
      _fails=$((_fails + 1)); eval "${_label}_fails=$_fails"
      eval "$_nextvar=$(( $(now_min) + RETRY_MIN ))"
      echo "[scheduler] $(date '+%Y-%m-%d %H:%M:%S') ⚠ $_label $_path -> خطای موقت (rc=$_rc ${_err:-بدون پیام}) — تلاش دوباره پس از ${RETRY_MIN} دقیقه"
      if [ "$_fails" -ge "$FAIL_ALERT_AT" ]; then
        echo "[scheduler] $(date '+%Y-%m-%d %H:%M:%S') [ALERT] $_label $_fails بار پشت‌سرهم شکست خورد — لاگ اپ: docker logs afagh_app"
      fi
      ;;
    permanent)
      _fails=$((_fails + 1)); eval "${_label}_fails=$_fails"
      eval "$_nextvar=$(( $(now_min) + _interval ))"
      echo "[scheduler] $(date '+%Y-%m-%d %H:%M:%S') [CRITICAL] $_label $_path -> رد شد (${_err:-HTTP $_rc}) — کلید پویش/endpoint در .env را بررسی کنید؛ تلاش بعدی در بازهٔ عادی"
      ;;
  esac
  return 0
}

start=$(now_min)
next_cheque=$start
next_grad=$start
next_bi=$start
next_wf=$start

echo "[scheduler] شروع — app=$APP_URL tick=${TICK}s retry=${RETRY_MIN}min alert_after=${FAIL_ALERT_AT}"
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
    call cheque "/api/cron/cheque-reminders" "$FINANCE_SECRET" next_cheque "$CHEQUE_MIN"
  fi

  if [ "$now" -ge "$next_grad" ]; then
    call grad "/api/cron/graduation-scan" "$GRAD_SECRET" next_grad "$GRAD_MIN"
  fi

  if [ "$now" -ge "$next_bi" ]; then
    call bi "/api/cron/bi-refresh" "$BI_SECRET" next_bi "$BI_MIN"
  fi

  if [ "$now" -ge "$next_wf" ]; then
    call workflow "/api/cron/workflow-events" "$GRAD_SECRET" next_wf "$WF_MIN"
  fi

  sleep "$TICK"
done
