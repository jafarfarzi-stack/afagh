import { requireRole } from '@/lib/auth';
import { getBool, getSetting } from '@/lib/settings';
import { SECRET_MASK } from '@/lib/settings-shared';
import TemplateEngineClient, { type IntegrationSettingsProps } from './TemplateEngineClient';

export const dynamic = 'force-dynamic';

/** مقادیر محرمانه ماسک می‌شوند؛ اگر کاربر تغییرشان ندهد، دست‌نخورده باقی می‌مانند */
const mask = (v: string) => (v ? SECRET_MASK : '');

export default async function AdminTemplatesPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT']);

  const [
    bbbUrl, bbbSecret, moodleUrl, moodleToken, autoRecord,
    baleToken, baleChannel, eitaaToken, eitaaChannel, telegramToken, telegramChannel,
    smsProvider, smsApiKey, smsSender,
    payProvider, payTerminal, payMerchant, payKey, payCallback, paySandbox, payWage,
  ] = await Promise.all([
    getSetting('BBB_URL'), getSetting('BBB_SECRET'), getSetting('MOODLE_URL'), getSetting('MOODLE_TOKEN'), getBool('BBB_AUTO_RECORD'),
    getSetting('BALE_TOKEN'), getSetting('BALE_CHANNEL'), getSetting('EITAA_TOKEN'), getSetting('EITAA_CHANNEL'),
    getSetting('TELEGRAM_TOKEN'), getSetting('TELEGRAM_CHANNEL'),
    getSetting('SMS_PROVIDER'), getSetting('SMS_API_KEY'), getSetting('SMS_SENDER'),
    getSetting('PAY_PROVIDER'), getSetting('PAY_TERMINAL_ID'), getSetting('PAY_MERCHANT_ID'),
    getSetting('PAY_MERCHANT_KEY'), getSetting('PAY_CALLBACK_URL'), getBool('PAY_SANDBOX'), getSetting('PAY_WAGE_PERCENT'),
  ]);

  const settings: IntegrationSettingsProps = {
    bbb: { url: bbbUrl, secret: mask(bbbSecret), moodleUrl, moodleToken: mask(moodleToken), autoRecord },
    bots: {
      baleToken: mask(baleToken), baleChannel,
      eitaaToken: mask(eitaaToken), eitaaChannel,
      telegramToken: mask(telegramToken), telegramChannel,
      smsProvider, smsApiKey: mask(smsApiKey), smsSender,
    },
    pay: {
      provider: payProvider, terminalId: payTerminal, merchantId: payMerchant,
      merchantKey: mask(payKey), callbackUrl: payCallback, sandbox: paySandbox, wagePercent: payWage,
    },
  };

  return <TemplateEngineClient settings={settings} />;
}
