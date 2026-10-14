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
#    CHEQUE_REMIND_INTERVAL_MIN      یادآوری چک             پیش‌فرض ۶۰
#    GRAD_SCAN_INTERVAL_MIN          پویش فارغ‌التحصیلی      پیش‌فرض ۱۴۴۰
#    BI_REFRESH_INTERVAL_MIN         تازه‌سازی گزارش BI      پیش‌فرض ۷۲۰
#    WORKFLOW_EVENTS_INTERVAL_MIN    رویدادهای گردش کار      پیش‌فرض ۶۰
#    GREETINGS_INTERVAL_MIN          تبریک‌های خودکار         پیش‌فرض ۱۴۴۰
#    SCHED_WARNINGS_INTERVAL_MIN     هشدارهای زمان‌بندی‌شده   پیش‌فرض ۱۵
#    MSG_LINK_PURGE_INTERVAL_MIN     پاکسازی لینک پیام‌رسان   پیش‌فرض ۱۴۴۰
#
#  ⚠️ روش فراخوانی: مسیرهای /api/cron/* کار واقعی را **فقط با POST** انجام می‌دهند؛
#  GET فقط وضعیت خواندنی می‌دهد و هیچ اثری ندارد. پس همهٔ فراخوانی‌های این حلقه
#  POST هستند — با wget ساده (GET) هر پویشی بی‌صدا «انجام می‌شد» ولی در عمل
#  هیچ کاری نمی‌کرد (ریشهٔ خرابی: یادآوری چک و پویش‌ها هرگز اجرا نشدند).
# ══════════════════════════════════════════════════════════════════════
set -u

APP_URL="${APP_URL:-http://app:8080}"

# M-2: کلیدهای محرمانه از volume مشترک (که seed-base هنگام نصب تولید می‌کند)
# اگر ENV ست شده باشد، همان مقداری است که seed-base در DB ثبت کرده — همیشه هم‌ارزند.
# نام هر متغیر = دقیقاً همان کلیدی که مسیر مقصد در DB (getSetting) می‌خواند؛
# کلید اشتباه یعنی ۴۰۱ و پویشی که هرگز اجرا نمی‌شود. پس هر مسیر کلید خودش را دارد.
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
GREET_MIN="$(num "${GREETINGS_INTERVAL_MIN:-1440}" 1440)"
WARN_MIN="$(num "${SCHED_WARNINGS_INTERVAL_MIN:-15}" 15)"
MSGLINK_MIN="$(num "${MSG_LINK_PURGE_INTERVAL_MIN:-1440}" 1440)"

# کلید اختصاصی هر مسیر — نام متغیر = کلیدی که همان route در DB می‌خواند.
# GRAD_CRON_SECRET کلیدِ نسل اول بود و دیگر هیچ مسیری آن را نمی‌خواند؛ اگر امروز
# فراخوانی می‌شد، اپ ۴۰۱ می‌داد و پویش بی‌صدا از دست می‌رفت.
FINANCE_SECRET="${FINANCE_CRON_SECRET:-}"
GRAD_SCAN_SECRET="${GRADUATION_SCAN_CRON_SECRET:-}"
WF_EVENTS_SECRET="${WORKFLOW_EVENTS_CRON_SECRET:-}"
BI_SECRET="${BI_CRON_SECRET:-}"
GREET_SECRET="${GREETINGS_CRON_SECRET:-}"
WARN_SECRET="${SCHED_WARN_CRON_SECRET:-}"
MSGLINK_SECRET="${MSG_LINK_CRON_SECRET:-}"

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
  # ⚠️ مسیرهای /api/cron/* کار واقعی را فقط با POST انجام می‌دهند؛ GET فقط
  #    وضعیت خواندنی می‌دهد. بدون --post-data همهٔ پویش‌ها بی‌صدا no-op بودند.
  _err=$(wget -q -O "$_tmp" --post-data="" --header="x-cron-secret: $_secret" "$APP_URL$_path" 2>&1)
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
      # ✅ ریشهٔ خرابی ۱۹ مهر: در شاخهٔ ok موعد بعدی جلو برده نمی‌شد، پس همهٔ
      # پویش‌ها هر tick دوباره اجرا می‌شدند و پویش فارغ‌التحصیلیِ ۲دقیقه‌ای
      # پشت‌سرهم حلقهٔ رویداد را می‌بلعید و درخواست‌های کاربران (مثل صدور کد
      # اتصال) تایم‌اوت می‌خوردند. حالا موعد بعدی = اکنون + بازهٔ عادی.
      eval "$_nextvar=$(( $(now_min) + _interval ))"
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
next_greet=$start
next_warn=$start
next_msglink=$start

echo "[scheduler] شروع — app=$APP_URL tick=${TICK}s retry=${RETRY_MIN}min alert_after=${FAIL_ALERT_AT}"
echo "[scheduler] فاصله‌ها (دقیقه): cheque=$CHEQUE_MIN grad=$GRAD_MIN bi=$BI_MIN workflow=$WF_MIN"
if [ -z "$FINANCE_SECRET" ]; then
  echo "[scheduler] هشدار: FINANCE_CRON_SECRET خالی است — یادآوری چک ارسال نمی‌شود"
fi
if [ -z "$GRAD_SCAN_SECRET" ]; then
  echo "[scheduler] هشدار: GRADUATION_SCAN_CRON_SECRET خالی است — پویش فارغ‌التحصیلی اجرا نمی‌شود"
fi
if [ -z "$WF_EVENTS_SECRET" ]; then
  echo "[scheduler] هشدار: WORKFLOW_EVENTS_CRON_SECRET خالی است — رویدادهای گردش کار اجرا نمی‌شود"
fi
if [ -z "$MSGLINK_SECRET" ]; then
  echo "[scheduler] هشدار: MSG_LINK_CRON_SECRET خالی است — پاکسازی لینک پیام‌رسان اجرا نمی‌شود"
fi
if [ -z "$BI_SECRET" ]; then
  echo "[scheduler] هشدار: BI_CRON_SECRET خالی است — تازه‌سازی گزارش‌های تحلیلی اجرا نمی‌شود"
fi
if [ -z "$GREET_SECRET" ]; then
  echo "[scheduler] هشدار: GREETINGS_CRON_SECRET خالی است — تبریک‌های خودکار اجرا نمی‌شود"
fi
if [ -z "$WARN_SECRET" ]; then
  echo "[scheduler] هشدار: SCHED_WARN_CRON_SECRET خالی است — هشدارهای زمان‌بندی‌شده ارسال نمی‌شود"
fi

while :; do
  now=$(now_min)

  if [ "$now" -ge "$next_cheque" ]; then
    call cheque "/api/cron/cheque-reminders" "$FINANCE_SECRET" next_cheque "$CHEQUE_MIN"
  fi

  if [ "$now" -ge "$next_grad" ]; then
    call grad "/api/cron/graduation-scan" "$GRAD_SCAN_SECRET" next_grad "$GRAD_MIN"
  fi

  if [ "$now" -ge "$next_bi" ]; then
    call bi "/api/cron/bi-refresh" "$BI_SECRET" next_bi "$BI_MIN"
  fi

  if [ "$now" -ge "$next_wf" ]; then
    call workflow "/api/cron/workflow-events" "$WF_EVENTS_SECRET" next_wf "$WF_MIN"
  fi

  if [ "$now" -ge "$next_greet" ]; then
    call greet "/api/cron/greetings" "$GREET_SECRET" next_greet "$GREET_MIN"
  fi

  if [ "$now" -ge "$next_warn" ]; then
    call schedwarn "/api/cron/scheduled-warnings" "$WARN_SECRET" next_warn "$WARN_MIN"
  fi

  if [ "$now" -ge "$next_msglink" ]; then
    call msglink "/api/cron/messenger-link-purge" "$MSGLINK_SECRET" next_msglink "$MSGLINK_MIN"
  fi

  sleep "$TICK"
done
