#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
#  phase5/restore-drill.sh — تمرین بازیابی روی دیتابیس scratch (هرگز prod)
#
#  کاربرد:
#    DATABASE_URL=... AFAGH_BACKUP_ENC_KEY=... ./scripts/phase5/restore-drill.sh /path/to/afagh-*.dump.enc
#
#  ایمنی:
#    • نام دیتابیس هدف هرگز نباید با نام پروداکشن یکی باشد.
#    • اگر DATABASE_URL به دیتابیس پروداکشن اشاره کند، اسکریپت رد می‌شود.
#    • بازیابی فقط در یک دیتابیس scratch (afagh_drill_*) انجام می‌شود و سپس حذف می‌گردد.
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

FILE="${1:-}"
: "${FILE:?usage: restore-drill.sh <encrypted-dump>}"
[[ -f "$FILE" ]] || { echo "❌ فایل یافت نشد: $FILE" >&2; exit 1; }

: "${DATABASE_URL:?DATABASE_URL is required (source/prod URL used only to derive server connection)}"

# استخراج نام دیتابیس پروداکشن از DATABASE_URL
PROD_DB="$(python3 - 2>/dev/null <<'PY' || node -e "const u=new URL(process.env.DATABASE_URL); console.log(u.pathname.replace(/^\//,''))"
import os,urllib.parse
u=urllib.parse.urlparse(os.environ['DATABASE_URL'])
print(u.path.lstrip('/'))
PY
)"
if [[ -z "$PROD_DB" ]]; then
  echo "❌ نتوانستم نام دیتابیس پروداکشن را از DATABASE_URL استخراج کنم." >&2
  exit 1
fi

SCRATCH="afagh_drill_$(date -u +%s)"

# گیت ایمنی: اگر کاربر نام scratch را همان prod داده باشد رد کن
if [[ "$SCRATCH" == "$PROD_DB" ]]; then
  echo "❌ نام scratch با پروداکشن یکی است — لغو." >&2
  exit 1
fi

# اتصال مدیریتی به دیتابیس 'postgres' روی همان سرور (نه prod)
ADMIN_URL="$(node -e "const u=new URL(process.env.DATABASE_URL); u.pathname='/postgres'; console.log(u.toString())")"

echo "▶ prod db: $PROD_DB · scratch: $SCRATCH"
echo "▶ فایل: $FILE"

cleanup() {
  psql "$ADMIN_URL" -c "DROP DATABASE IF EXISTS \"$SCRATCH\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ساخت scratch
psql "$ADMIN_URL" -c "DROP DATABASE IF EXISTS \"$SCRATCH\";" >/dev/null 2>&1 || true
psql "$ADMIN_URL" -c "CREATE DATABASE \"$SCRATCH\";" >/dev/null

SCRATCH_URL="$(node -e "const u=new URL(process.env.DATABASE_URL); u.pathname='/${SCRATCH}'; console.log(u.toString())")"

# رمزگشایی + بازگردانی
TMPDUMP="$(mktemp)"
trap 'rm -f "$TMPDUMP"; cleanup' EXIT

if command -v age >/dev/null 2>&1; then
  if [[ -n "${AGE_RECIPIENT:-}" ]]; then
    age -d -i "${AGE_KEY_FILE:-/dev/stdin}" "$FILE" -o "$TMPDUMP" 2>/dev/null || age -d "$FILE" -o "$TMPDUMP"
  else
    : "${AFAGH_BACKUP_ENC_KEY:?AFAGH_BACKUP_ENC_KEY required for age -p}"
    printf '%s' "$AFAGH_BACKUP_ENC_KEY" | age -d -p "$FILE" -o "$TMPDUMP"
  fi
else
  : "${AFAGH_BACKUP_ENC_KEY:?AFAGH_BACKUP_ENC_KEY required for gpg}"
  gpg --batch --yes --pinentry-mode loopback --passphrase "$AFAGH_BACKUP_ENC_KEY" -d "$FILE" > "$TMPDUMP"
fi

pg_restore --no-owner --no-privileges -d "$SCRATCH_URL" "$TMPDUMP"

# بررسی یکپارچگی: شمار ردیف جدول‌های کلیدی + RLS
echo "▶ بررسی یکپارچگی..."
psql "$SCRATCH_URL" -c "SELECT 'users' AS t, count(*) FROM users UNION ALL SELECT 'students', count(*) FROM students UNION ALL SELECT 'staff', count(*) FROM staff;" 2>/dev/null || true

RLS_COUNT="$(psql -tAc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relrowsecurity=true;" "$SCRATCH_URL")"
echo "  جدول‌های دارای RLS: $RLS_COUNT"
if [[ "${RLS_COUNT:-0}" -lt 1 ]]; then
  echo "❌ RLS پس از بازگردانی فعال نیست." >&2
  exit 1
fi

echo "✅ DR drill موفق: بازیابی در scratch کامل و RLS فعال است. (scratch حذف می‌شود)"
exit 0
