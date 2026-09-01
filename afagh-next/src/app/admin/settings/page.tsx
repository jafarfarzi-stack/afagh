import { requireRole } from '@/lib/auth';
import { resolveAllSettings, SETTING_GROUPS } from '@/lib/settings';
import { SECRET_MASK, type SettingView } from '@/lib/settings-shared';
import SettingsClient from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  await requireRole(['ADMIN']);
  const all = await resolveAllSettings();

  // مقادیر محرمانه هرگز به مرورگر فرستاده نمی‌شوند — فقط ماسک
  const view: SettingView[] = all.map(s => ({
    key: s.key,
    env: s.env,
    group: s.group,
    label: s.label,
    type: s.type,
    help: s.help,
    envOnly: s.envOnly,
    source: s.source,
    hasEnv: s.hasEnv,
    value: s.type === 'secret' ? (s.value ? SECRET_MASK : '') : s.value,
  }));

  return <SettingsClient settings={view} groups={[...SETTING_GROUPS]} />;
}
