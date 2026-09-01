# syntax=docker/dockerfile:1
# ════════════════════════════════════════════════════════════════════
#  ایمیج پروداکشن کالبد آفاق (Next.js standalone) — لیسن روی پورت ۸۰۸۰
#  ساخت:  docker build -t afagh-app ./afagh-next
# ════════════════════════════════════════════════════════════════════
FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ── وابستگی‌ها ──
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --omit=optional

# ── بیلد ──
FROM base AS builder
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── مهاجرت/سخت‌سازی دیتابیس (drizzle-kit در devDependencies است) ──
FROM builder AS migrator
ENV NODE_ENV=production
CMD ["sh", "-c", "npx drizzle-kit push --force && node scripts/hardening.mjs"]

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
