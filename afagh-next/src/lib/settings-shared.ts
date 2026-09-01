// ثابت‌های مشترک تنظیمات — قابل استفاده در کامپوننت‌های کلاینت (بدون وابستگی سروری)
export const SECRET_MASK = '••••••••';

export type SettingType = 'text' | 'url' | 'number' | 'boolean' | 'secret';
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
}
