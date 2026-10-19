#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
#  phase5/backup-encrypt.sh — پشتیبان رمزشده (age یا gpg)
#
#  کاربرد:
#    DATABASE_URL=... AFAGH_BACKUP_ENC_KEY=... ./scripts/phase5/backup-encrypt.sh
#    یا با age: AGE_RECIPIENT=age1... ./scripts/phase5/backup-encrypt.sh
#
#  متغیرها:
#    DATABASE_URL               (الزامی)
#    AFAGH_BACKUP_ENC_KEY       کلید متقارن (برای gpg یا age -p)
#    AGE_RECIPIENT              گیرندهٔ age (عمومی) — جایگزین کلید متقارن
#    AFAGH_BACKUP_ENC_DIR       مقصد (پیش‌فرض /backups یا ./backups)
#    AFAGH_BACKUP_ENC_KEEP_DAYS نگهداری (پیش‌فرض 14)
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

ENC_DIR="${AFAGH_BACKUP_ENC_DIR:-}"
if [[ -z "$ENC_DIR" ]]; then
  for c in /backups "$(pwd)/backups"; do
    if mkdir -p "$c" 2>/dev/null && touch "$c/.probe" 2>/dev/null; then
      rm -f "$c/.probe"
      ENC_DIR="$c"
      break
    fi
  done
fi
: "${ENC_DIR:?no writable backup dir found (set AFAGH_BACKUP_ENC_DIR)}"
mkdir -p "$ENC_DIR"
chmod 700 "$ENC_DIR"

KEEP_DAYS="${AFAGH_BACKUP_ENC_KEEP_DAYS:-14}"

STAMP="$(date -u +%Y-%m-%dT%H-%M-%S)"
OUT="$ENC_DIR/afagh-${STAMP}.dump.enc"

# انتخاب موتور رمزنگاری
if command -v age >/dev/null 2>&1; then
  ENC_ENGINE="age"
elif command -v gpg >/dev/null 2>&1; then
  ENC_ENGINE="gpg"
else
  echo "❌ نه age و نه gpg یافت نشد — نصب یکی الزامی است." >&2
  exit 1
fi

if [[ "$ENC_ENGINE" == "age" && -z "${AGE_RECIPIENT:-}" && -z "${AFAGH_BACKUP_ENC_KEY:-}" ]]; then
  echo "❌ برای age باید AGE_RECIPIENT یا AFAGH_BACKUP_ENC_KEY تنظیم شود." >&2
  exit 1
fi
if [[ "$ENC_ENGINE" == "gpg" && -z "${AFAGH_BACKUP_ENC_KEY:-}" ]]; then
  echo "❌ برای gpg باید AFAGH_BACKUP_ENC_KEY تنظیم شود." >&2
  exit 1
fi

echo "▶ پشتیبان‌گیری رمزشده ($ENC_ENGINE) → $OUT"

# pg_dump → encrypt → file  (fail-closed: هر شکستی خروج غیرصفر)
if [[ "$ENC_ENGINE" == "age" ]]; then
  if [[ -n "${AGE_RECIPIENT:-}" ]]; then
    pg_dump "$DATABASE_URL" -Fc | age -r "$AGE_RECIPIENT" -o "$OUT"
  else
    # کلید متقارن → age -p (passphrase)
    printf '%s' "$AFAGH_BACKUP_ENC_KEY" | pg_dump "$DATABASE_URL" -Fc | age -p -o "$OUT" 2>/dev/null || {
      # fallback: gpg-style via passphrase file
      pg_dump "$DATABASE_URL" -Fc | age -p -o "$OUT"
    }
  fi
else
  pg_dump "$DATABASE_URL" -Fc | gpg --batch --yes --pinentry-mode loopback \
    --symmetric --cipher-algo AES256 --passphrase "$AFAGH_BACKUP_ENC_KEY" -o "$OUT"
fi

chmod 600 "$OUT"

# checksum
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$OUT" > "$OUT.sha256"
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$OUT" > "$OUT.sha256"
fi

# retention prune
if [[ "$KEEP_DAYS" =~ ^[0-9]+$ && "$KEEP_DAYS" -gt 0 ]]; then
  find "$ENC_DIR" -maxdepth 1 -type f -name 'afagh-*.dump.enc' -mtime +"$KEEP_DAYS" -print -delete 2>/dev/null || true
fi

echo "✅ پشتیبان رمزشده آماده است: $OUT"
ls -lh "$OUT"
