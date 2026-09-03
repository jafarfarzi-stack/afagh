# syntax=docker/dockerfile:1
# ════════════════════════════════════════════════════════════════════
#  ایمیج پروداکشن کالبد آفاق (Next.js standalone) — لیسن روی پورت ۸۰۸۰
#  ساخت:  docker build -t afagh-app ./afagh-next
#
#  روی سرورهای کم‌حافظه: مقدار هیپ Node را کم/زیاد کنید
#      docker compose build --build-arg NODE_MAX_OLD_SPACE=1536
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
FROM base AS migrator
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["sh", "-c", "npx drizzle-kit push --force && node scripts/seed-base.mjs && node scripts/hardening.mjs"]

# ── بیلد ──
FROM base AS builder
ARG NODE_MAX_OLD_SPACE=3072
ENV NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=${NODE_MAX_OLD_SPACE} \
    NEXT_SKIP_TYPE_CHECK=1 \
    AFAGH_STANDALONE=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# تایپ‌چک داخل ایمیج اجرا نمی‌شود (حافظه‌بر است و در CI/توسعه با npm run typecheck انجام می‌شود)
RUN npm run build

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
