#!/bin/sh
set -e

# اصلاح دسترسی uploads volume (Docker volume به صورت root ساخته می‌شود)
chown -R nextjs:nodejs /app/public/uploads 2>/dev/null || true

exec node server.js
