-- 0115_university_brand
-- برندینگ اختصاصی هر دانشگاه: ستون JSON برای بازنویسیِ تم‌های سخت‌کد (UNI_THEMES).
-- مقدارِ خالی (NULL) → استفاده از تمِ پیش‌فرضِ هاردکد (در لایهٔ اپلیکیشن ادغام می‌شود).
ALTER TABLE "universities" ADD COLUMN IF NOT EXISTS "brand_json" jsonb;
