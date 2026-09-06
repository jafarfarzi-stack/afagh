# syntax=docker/dockerfile:1
# ════════════════════════════════════════════════════════════════════
#  ایمیج پروداکشن کالبد آفاق (Next.js standalone) — لیسن روی پورت ۸۰۸۰
#  ساخت:  docker build -t afagh-app ./afagh-next
#
#  روی سرورهای کم‌حافظه (بیلد با «exit code: 137» یا «Killed» می‌میرد = OOM):
#      ۱) swap بسازید:  sudo bash scripts/ensure-build-memory.sh
#      ۲) هیپ را کم کنید:  docker compose build --build-arg NODE_MAX_OLD_SPACE=1536
#         (یا در .env:  NODE_MAX_OLD_SPACE=1536)
#  اندازه‌گیری واقعی بیلد این پروژه: اوج ۴۱۲MB هیپ، ۲۲ ثانیه روی ۲ هسته.
#  پس سقف ۳۰۷۲ فقط روی سرورهای بزرگ لازم است و روی سرور ۲ گیگی باعث OOM می‌شود.
# ════════════════════════════════════════════════════════════════════
FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ── وابستگی‌ها ──
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --omit=optional

# ── مهاجرت/سخت‌سازی دیتابیس ──
# نیازی به بیلد Next ندارد؛ فقط drizzle-kit (devDependency) و اسکریپت‌ها.
# postgresql-client برای پشتیبان پیش از استقرار (backup-db.mjs) نصب می‌شود.
FROM base AS migrator
ENV NODE_ENV=production
# ⚠️ نسخهٔ pg_dump باید ≥ نسخهٔ سرور باشد.
#    Debian bookworm فقط postgresql-client-15 دارد ولی سرویس postgres در
#    docker-compose نسخهٔ ۱۶ است؛ pg_dump 15 با «server version mismatch»
#    شکست می‌خورد و چون پشتیبان‌گیری نخستین گام migrator است، کل استقرار با
#    exit 1 متوقف می‌شد (بدون آنکه هیچ‌کدام از پچ‌ها اجرا شود).
#    پس کلاینت ۱۶ را از مخزن رسمی PGDG نصب می‌کنیم. اگر شبکه در دسترس نبود،
#    به کلاینت توزیع برمی‌گردیم تا بیلد نشکند؛ backup-db خودش تشخیص می‌دهد.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg; \
    ( install -d /usr/share/postgresql-common/pgdg \
      && curl -fsSL --retry 3 --max-time 30 \
           https://www.postgresql.org/media/keys/ACCC4CF8.asc \
           -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
      && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
           > /etc/apt/sources.list.d/pgdg.list \
      && apt-get update \
      && apt-get install -y --no-install-recommends postgresql-client-16 ) \
    || apt-get install -y --no-install-recommends postgresql-client; \
    rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# ترتیب: پشتیبان → push → پچ‌ها → دادهٔ پایه → سخت‌سازی (+اعتبارسنجی)
# اگر هر مرحله شکست بخورد، exit-code غیرصفر → اپ (depends_on مخصوص) استارت نمی‌شود.
CMD ["sh", "-c", "set -e; \
  echo '=== گام ۱/۵: پشتیبان پیش از استقرار ==='; node scripts/backup-db.mjs; \
  echo '=== گام ۲/۵: همگام‌سازی اسکیما (drizzle push) ==='; npx drizzle-kit push --force; \
  echo '=== گام ۳/۵: پچ‌های اسکیما ==='; node scripts/apply-patches.mjs; \
  echo '=== گام ۴/۵: دادهٔ پایه ==='; node scripts/seed-base.mjs; \
  echo '=== گام ۵/۵: سخت‌سازی و RLS ==='; node scripts/hardening.mjs; \
  echo '=== ✅ migrator با موفقیت تمام شد ==='"]

# ── بیلد ──
# NEXT_PUBLIC_AFAGH_DEMO_LOCK=1 در build تزریق می‌شود: Next این متغیر را در
# باندل جای‌گذاری می‌کند → «کد دمو در بیلد تولید اساساً غیرفعال است» (بازبینی بند ۵)،
# نه صرفاً با ENV قابل خاموش‌کردن.
FROM base AS builder
ARG NODE_MAX_OLD_SPACE=2048
# آرگومان‌های اضافهٔ «next build» — مثلاً «--webpack» اگر Turbopack روی سرور
# شما حافظهٔ زیادی گرفت:  docker compose build --build-arg NEXT_BUILD_ARGS=--webpack
ARG NEXT_BUILD_ARGS=""
ENV NODE_ENV=production \
    NEXT_PUBLIC_AFAGH_DEMO_LOCK=1 \
    NODE_OPTIONS=--max-old-space-size=${NODE_MAX_OLD_SPACE} \
    NEXT_SKIP_TYPE_CHECK=1 \
    AFAGH_STANDALONE=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# تایپ‌چک داخل ایمیج اجرا نمی‌شود (حافظه‌بر است و در CI/توسعه با npm run typecheck انجام می‌شود)
RUN npm run build ${NEXT_BUILD_ARGS}

# ── اجرا ──
FROM base AS runner
ENV NODE_ENV=production \
    PORT=8080 \
    HOSTNAME=0.0.0.0
RUN groupadd --gid 1001 nodejs && useradd --uid 1001 --gid nodejs --create-home nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:8080/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
