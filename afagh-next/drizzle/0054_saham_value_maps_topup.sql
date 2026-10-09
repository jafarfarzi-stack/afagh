-- 0054_saham_value_maps_topup.sql
-- تکمیل نگاشت‌های سهام: مذاهب جدید وزارت (۰/۴/۵/۶) + وضعیت‌های WITHDRAWN/UNKNOWN.
-- idempotent: ON CONFLICT DO NOTHING.
INSERT INTO saham_value_maps ("field", "sourceValue", "sahamTitle") VALUES
  ('religion', '0', 'نامشخص'),
  ('religion', '4', 'ارتودوكس'),
  ('religion', '5', 'پروتستان'),
  ('religion', '6', 'ساير مذاهب'),
  ('student_status', 'WITHDRAWN', 'غیرفعال - انصراف ( ترک تحصیل )'),
  ('student_status', 'UNKNOWN', 'غیرفعال - سایر')
ON CONFLICT DO NOTHING;
