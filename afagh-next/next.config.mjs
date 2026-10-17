/** @type {import('next').NextConfig} */
// output: 'standalone' → خروجی خودکفا برای ایمیج Docker (سرور کوچک node server.js)
// NEXT_SKIP_TYPE_CHECK=1 → رد کردن تایپ‌چک هنگام بیلد داکر (حافظه‌بر است؛
// در توسعه و CI با «npm run typecheck» به‌طور کامل انجام می‌شود).
const skipTypeCheck = process.env.NEXT_SKIP_TYPE_CHECK === '1';

// output:'standalone' فقط برای ایمیج Docker لازم است (CMD node server.js).
// روی ویندوز/اجرای محلی باید خاموش باشد، چون «next start» با standalone
// ترکیب پشتیبانی‌نشده است و خودِ Next هشدار می‌دهد. Dockerfile این متغیر را
// در مرحلهٔ builder تنظیم می‌کند.
const standalone = process.env.AFAGH_STANDALONE === '1';

// توجه (Next 16): کلید «eslint» در next.config دیگر پشتیبانی نمی‌شود و خودِ
// «next build» هم دیگر ESLint اجرا نمی‌کند؛ گذاشتنش فقط دو هشدار
// «Unrecognized key(s) in object: 'eslint'» در لاگ بیلد تولید می‌کرد.
// (پروژه اسکریپت lint جداگانه ندارد؛ دروازه‌های CI تایپ‌چک و تست‌اند.)
const nextConfig = {
  reactStrictMode: true,
  // 🔒 افشای فناوری را خاموش می‌کند (X-Powered-By: Next.js)
  poweredByHeader: false,
  ...(standalone ? { output: 'standalone' } : {}),
  typescript: { ignoreBuildErrors: skipTypeCheck },
  /**
   * هدرهای امنیتی پایه روی همهٔ پاسخ‌ها.
   *
   * توجه: `frame-ancestors`/`X-Frame-Options` عمداً اینجا نیست، چون سامانه در
   * «دامنهٔ واسط» داخل iframe استفاده می‌شود و بستن قاب، آن یکپارچگی را می‌شکند؛
   * دروازهٔ کلیک‌جکینگ باید در لبه (CDN/Caddy) و با علم به همان یکپارچگی تنظیم شود.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
          { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(self), camera=(self), payment=()' },
          // CSP حداقلی و بی‌خطر: جلوی <object>/<base> تزریقی را می‌گیرد بدون
          // اینکه اسکریپت‌های درون‌خطی Next را بشکند.
          { key: 'Content-Security-Policy', value: "object-src 'none'; base-uri 'self'" },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
