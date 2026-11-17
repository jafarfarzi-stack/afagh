import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/lib/**/*.{ts,tsx}',
  ],
  /* ── `hover:` فقط روی دستگاه‌هایی که واقعاً hover دارند ──
     در موبایل/تبلت، hover چسبنده باعث می‌شد کارت پس از لمس «بالا مانده»
     بماند. این گزینه رفتار v4 را به تیلویند ۳ می‌آورد. */
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      fontFamily: { sans: ['Vazirmatn', 'Tahoma', 'sans-serif'] },
      /* ── سازگاری با کلاس‌های سبکِ v4 که در کد استفاده شده‌اند ──
         پیش‌تر `shadow-xs` (۱۱۲ مورد) و `backdrop-blur-xs`/`blur-xs` (۳۸ مورد)
         در تیلویند ۳ وجود نداشتند و **بی‌صدا حذف** می‌شدند؛ نتیجه: کارت‌ها و
         منوها بدون سایه و بدون بلور رندر می‌شدند («UI تخت»).
         اینجا همان پله‌ها با نامِ موردانتظارِ کد تعریف می‌شوند. */
      boxShadow: {
        xs: '0 1px 2px 0 rgb(15 23 42 / 0.06)',
        '2xs': '0 1px 1px 0 rgb(15 23 42 / 0.04)',
        /* ── مقیاسِ ارتفاعِ تازه (e1/e2/e3) ──
           e1 = سطحِ نشسته روی صفحه (با خطِ نوریِ inset در بالا)،
           e2 = سطحِ شناور/کارتِ فعال، e3 = دیالوگ و شیت. */
        e1: 'inset 0 1px 0 0 rgb(255 255 255 / .85), 0 1px 2px 0 rgb(15 23 42 / .05), 0 4px 8px -4px rgb(15 23 42 / .06), 0 12px 24px -16px rgb(15 23 42 / .16)',
        e2: '0 2px 4px -1px rgb(15 23 42 / .06), 0 10px 20px -8px rgb(15 23 42 / .12), 0 24px 40px -24px rgb(15 23 42 / .22)',
        e3: '0 4px 8px -2px rgb(15 23 42 / .08), 0 16px 32px -12px rgb(15 23 42 / .16), 0 48px 72px -32px rgb(15 23 42 / .28)',
        /* فشرده‌شدن (کلیدِ فیزیکی) و حالت‌های کلید/درخشش/فوکوس */
        pressed: 'inset 0 2px 4px 0 rgb(15 23 42 / .12), inset 0 1px 0 0 rgb(15 23 42 / .06)',
        key: 'inset 0 1px 0 0 rgb(255 255 255 / .18), 0 1px 0 0 rgb(15 23 42 / .10), 0 2px 4px -1px rgb(15 23 42 / .18)',
        glow: '0 0 0 1px rgb(79 70 229 / .18), 0 6px 16px -6px rgb(79 70 229 / .45)',
        focus: '0 0 0 3px rgb(79 70 229 / .22)',
      },
      blur: { xs: '2px' },
      backdropBlur: { xs: '2px' },

      /* ── شعاع‌های معنایی: به‌جای پنج شعاع پراکندهٔ lg/xl/2xl/3xl ── */
      borderRadius: { control: '0.75rem', card: '1rem', panel: '1.25rem' },

      /* ── پله‌های متنِ ریز: جانشین اندازه‌های هاردکد `text-[10px]`/`text-[11px]` ──
         با کف ۱۱px برای خوانایی فارسی؛ نام‌ها همان اندازهٔ واقعی را می‌دهند. */
      fontSize: {
        '2xs': ['0.75rem', { lineHeight: '1.5' }],
        '3xs': ['0.6875rem', { lineHeight: '1.45' }],
      },

      /* ── انیمیشن ورود (جانشین پلاگین نصب‌نشدهٔ tailwindcss-animate) ──
         کد فعلی از ترکیب `animate-in fade-in zoom-in-95` استفاده می‌کند؛
         همان قرارداد در globals.css با کلاس‌های سازگار پیاده شده است.
         این کلیدها برای استفاده‌های تازه (`animate-enter`) هم در دسترس‌اند. */
      keyframes: {
        enter: {
          from: { opacity: '0', transform: 'translate3d(0, 0.25rem, 0) scale(0.98)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: { enter: 'enter 180ms ease-out both' },

      /* ── زمان‌بندیِ حرکت: کوتاه و یکنواخت تا حسِ «فوری» بدهد ──
         press کوتاه‌تر است چون بازخوردِ فشار باید بی‌درنگ دیده شود. */
      transitionDuration: { DEFAULT: '140ms', press: '90ms' },
      transitionTimingFunction: { DEFAULT: 'cubic-bezier(0.16,1,0.3,1)' },
    },
  },
  plugins: [],
};
export default config;

