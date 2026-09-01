/** @type {import('next').NextConfig} */
// output: 'standalone' → خروجی خودکفا برای ایمیج Docker (سرور کوچک node server.js)
// NEXT_SKIP_TYPE_CHECK=1 → رد کردن تایپ‌چک هنگام بیلد داکر (حافظه‌بر است؛
// در توسعه و CI با «npm run typecheck» به‌طور کامل انجام می‌شود).
const skipTypeCheck = process.env.NEXT_SKIP_TYPE_CHECK === '1';

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  typescript: { ignoreBuildErrors: skipTypeCheck },
  eslint: { ignoreDuringBuilds: skipTypeCheck },
};

export default nextConfig;
