--> statement-breakpoint
CREATE TABLE login_notices (
  id SERIAL PRIMARY KEY,
  "universityId" INTEGER REFERENCES universities(id) ON DELETE CASCADE,
  title VARCHAR(150) NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  kind VARCHAR(20) NOT NULL DEFAULT 'info',
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE login_slides (
  id SERIAL PRIMARY KEY,
  "universityId" INTEGER REFERENCES universities(id) ON DELETE CASCADE,
  title VARCHAR(150) NOT NULL,
  subtitle VARCHAR(255) NOT NULL DEFAULT '',
  "imageUrl" VARCHAR(500) NOT NULL DEFAULT '',
  "linkUrl" VARCHAR(500) NOT NULL DEFAULT '',
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX idx_login_notices_scope ON login_notices ("universityId", "isActive", "sortOrder");
--> statement-breakpoint
CREATE INDEX idx_login_slides_scope ON login_slides ("universityId", "isActive", "sortOrder");
--> statement-breakpoint
INSERT INTO login_notices (title, body, kind, "isActive", "sortOrder") VALUES
('ورود اول و تغییر گذرواژه',
 'در اولین ورود، گذرواژه شما برابر کد ملی / کد پرسنلی / شماره دانشجویی است و سامانه شما را به صفحه تغییر گذرواژه می‌فرستد.',
 'important', 1, 0),
('جابه‌جایی بین حساب‌ها',
 'اگر با یک کد ملی چند حساب دارید (دو شماره دانشجویی یا هم‌زمان دانشجو و استاد)، از بنر بالای کارتابل بدون خروج، بین حساب‌ها جابه‌جا شوید.',
 'info', 1, 1);
--> statement-breakpoint
INSERT INTO login_slides (title, subtitle, "linkUrl", "isActive", "sortOrder") VALUES
('سامانه جامع دانشگاهی آفاق', 'یک ورود برای همه خدمات آموزشی، مالی و پژوهشی', '/help?tab=shared', 1, 0),
('انتخاب واحد و کارنامه آنلاین', 'اخذ دروس ترم، برنامه هفتگی، کارت آزمون و کارنامه در کارتابل دانشجو', '/help?tab=student', 1, 1),
('کارتابل اساتید و مدیران گروه', 'حضور و غیاب، ثبت نمرات، قرارداد و مدیریت ارائه‌های ترم', '/help?tab=professor', 1, 2);
