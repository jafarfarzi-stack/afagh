-- ══════════════════════════════════════════════════════════════════════
-- 0073 — سخت‌سازی verification_otps: otpCode (متن خام) → otpHash
--
-- متن خام OTP هرگز نباید در دیتابیس بنشیند (نشت بکاپ/لاگ = جعل تأیید).
-- این جدول در کد خواننده/نویسنده‌ای ندارد (فقط schema + RLS) پس مهاجرت
-- صرفاً بازنام‌گذاری + تعریض ستون است؛ نویسنده‌های آینده باید HMAC نمک‌دار
-- (فلفل AFAGH_OTP_PEPPER) با طول hex=64 بنویسند و با timingSafeEqual بخوانند.
-- ردیف‌های قدیمی (در صورت وجود) مقدار هش‌شده ندارند و باید منقضی فرض شوند.
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "verification_otps" RENAME COLUMN "otpCode" TO "otpHash";
--> statement-breakpoint
ALTER TABLE "verification_otps" ALTER COLUMN "otpHash" TYPE varchar(64);
