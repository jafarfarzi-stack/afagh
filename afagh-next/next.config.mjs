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
  ...(standalone ? { output: 'standalone' } : {}),
  typescript: { ignoreBuildErrors: skipTypeCheck },
};

export default nextConfig;
