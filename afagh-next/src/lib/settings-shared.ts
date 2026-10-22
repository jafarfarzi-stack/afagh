// ثابت‌های مشترک تنظیمات — قابل استفاده در کامپوننت‌های کلاینت (بدون وابستگی سروری)
export const SECRET_MASK = '••••••••';

export type SettingType = 'text' | 'textarea' | 'url' | 'number' | 'boolean' | 'secret' | 'image' | 'select';
export type SettingSource = 'db' | 'env' | 'default';

export interface SettingView {
  key: string;
  env: string;
  group: string;
  label: string;
  type: SettingType;
  help?: string;
  envOnly?: boolean;
  value: string;
  source: SettingSource;
  hasEnv: boolean;
  /** مقدار پیش‌فرضِ تعریف‌شده در کد — برای type === 'select' */
  default?: string;
  /** گزینه‌های مجاز — برای type === 'select' */
  options?: { value: string; label: string }[];
}
