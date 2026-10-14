-- 0095 — ایندکس codeHash برای جست‌وجوی مستقیم توکن اتصال پیام‌رسان
--
-- پس از حذف اسکن حافظه‌ای limit(50)، تطبیق کد با WHERE روی ستون‌های هش
-- انجام می‌شود. tokenHash از قبل ایندکس داشت (ix_messenger_link_tokens_token)؛
-- codeHash نداشت و تطبیق کدها اسکن ترتیبی می‌شد.

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_messenger_link_tokens_code" ON "messenger_link_tokens" ("codeHash");
