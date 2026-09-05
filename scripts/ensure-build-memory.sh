#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  تأمین حافظهٔ کافی برای بیلد Next.js روی سرور
#
#  چرا لازم است؟
#    «next build» روی سرور کوچک و بدون swap توسط OOM killer کشته می‌شود؛
#    داکر آن را این‌طور گزارش می‌کند:
#        > [app builder 3/3] RUN npm run build
#        1257.4 Killed
#        target app: failed to solve: process "/bin/sh -c npm run build"
#                   did not complete successfully: exit code: 137
#    یعنی exit code 137 = سیگنال ۹ (SIGKILL) از طرف کرنل، نه خطای کد.
#
#  اجرا:
#      sudo bash scripts/ensure-build-memory.sh           # swap ۴ گیگ
#      sudo SWAP_GB=2 bash scripts/ensure-build-memory.sh # swap ۲ گیگ
#      bash scripts/ensure-build-memory.sh --dry-run      # فقط گزارش، بدون تغییر
#
#  خروجی: سقف هیپ پیشنهادی بیلد را چاپ می‌کند. اگر مجموع RAM+swap کم باشد
#  یک swapfile می‌سازد، فعال و در /etc/fstab دائمی می‌کند (idempotent).
# ════════════════════════════════════════════════════════════════════
set -euo pipefail

DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then DRY_RUN=1; fi

SWAP_GB="${SWAP_GB:-4}"
SWAPFILE="${SWAPFILE:-/swapfile}"
# حداقل RAM+swap برای بیلد امن (بیلد Turbopack این پروژه در اندازه‌گیری
# واقعی به ~۴۰۰MB هیپ رسید، ولی سر ۳۰۷۲MB هیپِ مجاز روی سرور ۲ گیگی
# از حافظهٔ فیزیکی رد می‌شود و OOM می‌شود).
MIN_TOTAL_MB="${MIN_TOTAL_MB:-4096}"

MEM_MB=$(free -m | awk '/Mem:/{print $2}')
SWAP_MB=$(free -m | awk '/Swap:/{print $2}')
TOTAL_MB=$((MEM_MB + SWAP_MB))
DISK_AVAIL_GB=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')

echo "── حافظهٔ سرور ──────────────────────────────────────────"
echo "  RAM:        ${MEM_MB}MB"
echo "  swap فعال:  ${SWAP_MB}MB"
echo "  مجموع:      ${TOTAL_MB}MB   (حداقل پیشنهادی برای بیلد: ${MIN_TOTAL_MB}MB)"
echo "  فضای آزاد /: ${DISK_AVAIL_GB:-?}GB   (ایمیج‌ها ~۳GB می‌خواهند)"

# ── سقف هیپ پیشنهادی بیلد (در .env بگذارید: NODE_MAX_OLD_SPACE=…) ──
if   [ "${MEM_MB}" -lt 1500 ]; then SUGGEST=1024
elif [ "${MEM_MB}" -lt 2500 ]; then SUGGEST=1536
elif [ "${MEM_MB}" -lt 4000 ]; then SUGGEST=2048
else SUGGEST=3072
fi
echo "  سقف هیپ پیشنهادی بیلد: NODE_MAX_OLD_SPACE=${SUGGEST}"
echo "──────────────────────────────────────────────────────────"

if [ "${TOTAL_MB}" -ge "${MIN_TOTAL_MB}" ]; then
  echo "✓ حافظه کافی است — swap لازم نیست."
  exit 0
fi

echo "⚠ مجموع RAM+swap از ${MIN_TOTAL_MB}MB کمتر است → بیلد با exit code 137 کشته می‌شود."
echo "  راه‌حل: ${SWAP_GB} گیگ swap در ${SWAPFILE}"

if [ "${DRY_RUN}" = "1" ]; then
  echo "(حالت --dry-run — هیچ تغییری روی سیستم داده نشد)"
  exit 0
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "✗ برای ساخت swap به root نیاز است:  sudo bash $0" >&2
  exit 1
fi

if [ "${DISK_AVAIL_GB:-0}" -lt "$((SWAP_GB + 3))" ]; then
  echo "⚠ فضای آزاد دیسک (${DISK_AVAIL_GB:-?}GB) برای swap ${SWAP_GB}G + ایمیج‌ها کم است" >&2
fi

if swapon --show=NAME --noheadings 2>/dev/null | grep -qx "${SWAPFILE}"; then
  echo "✓ ${SWAPFILE} از قبل فعال است"
else
  if [ -f "${SWAPFILE}" ]; then
    echo "… ${SWAPFILE} وجود دارد ولی فعال نیست — فعال می‌شود"
  else
    echo "… ساخت ${SWAPFILE} (${SWAP_GB}G)"
    if ! fallocate -l "${SWAP_GB}G" "${SWAPFILE}" 2>/dev/null; then
      dd if=/dev/zero of="${SWAPFILE}" bs=1M count=$((SWAP_GB * 1024)) status=none
    fi
    chmod 600 "${SWAPFILE}"
    mkswap "${SWAPFILE}" >/dev/null
  fi
  swapon "${SWAPFILE}"
  if ! grep -q "^${SWAPFILE}" /etc/fstab 2>/dev/null; then
    echo "${SWAPFILE} none swap sw 0 0" >> /etc/fstab
    echo "✓ در /etc/fstab ثبت شد (بعد از ریبوت هم فعال می‌ماند)"
  fi
  # swap فقط سوپاپ اطمینان بیلد است؛ نباید کارایی زمان اجرا را کم کند
  sysctl -w vm.swappiness=10 >/dev/null 2>&1 || true
  if ! grep -q '^vm.swappiness' /etc/sysctl.conf 2>/dev/null; then
    echo 'vm.swappiness=10' >> /etc/sysctl.conf
  fi
fi

echo "✓ swap فعال: $(free -m | awk '/Swap:/{print $2}')MB"
echo "→ حالا بیلد بزنید:  NODE_MAX_OLD_SPACE=${SUGGEST} docker compose build"
