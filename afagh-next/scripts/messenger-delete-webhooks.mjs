#!/usr/bin/env node
/**
 * حذف یک‌بارهٔ وب‌هوک همهٔ بات‌های پیام‌رسان (مهاجرت به فقط-ارسال).
 *
 * اجرا (یک بار توسط مجری استقرار، پس از دیپلوی نسخهٔ send-only):
 *   node scripts/messenger-delete-webhooks.mjs
 *
 * توکن‌ها از همان ENVهای پنل تنظیمات خوانده می‌شوند. هرگز با خطا خارج
 * نمی‌شود: اگر API در دسترس نباشد، لاگ + ادامه (استقرار نباید بمیرد).
 */
const CHANNELS = [
  { name: 'TELEGRAM', env: 'TELEGRAM_BOT_TOKEN', base: process.env.TELEGRAM_API_BASE || 'https://api.telegram.org', style: 'BOT' },
  { name: 'BALE', env: 'BALE_BOT_TOKEN', base: process.env.BALE_API_BASE || 'https://tapi.bale.ai', style: 'BOT' },
  { name: 'SOROUSH', env: 'SOROUSH_BOT_TOKEN', base: process.env.SOROUSH_API_BASE || 'https://api.soroush.app', style: 'BOT' },
  { name: 'EITAA', env: 'EITAA_BOT_TOKEN', base: process.env.EITAA_API_BASE || 'https://eitaayar.ir/api', style: 'EITAA' },
  { name: 'IGAP', env: 'IGAP_BOT_TOKEN', base: process.env.IGAP_API_BASE || 'https://igap.ai/api', style: 'BOT' },
];

let failures = 0;
for (const ch of CHANNELS) {
  const token = (process.env[ch.env] || '').trim();
  if (!token) {
    console.log(`— ${ch.name}: توکن تنظیم نشده، رد شد.`);
    continue;
  }
  const root = ch.base.replace(/\/+$/, '');
  const url = ch.style === 'EITAA' ? `${root}/${token}/deleteWebhook` : `${root}/bot${token}/deleteWebhook`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(url, { method: 'POST', signal: ctrl.signal });
    clearTimeout(t);
    console.log(`${r.ok ? '✅' : '⚠'} ${ch.name}: deleteWebhook → HTTP ${r.status}`);
    if (!r.ok) failures++;
  } catch (e) {
    failures++;
    console.log(`⚠ ${ch.name}: در دسترس نیست (${e.message}) — ادامه.`);
  }
}
console.log(failures ? `تمام شد با ${failures} مورد ناموفق (بعداً دوباره اجرا کنید).` : 'تمام وب‌هوک‌ها حذف شدند.');
process.exit(0); // عمداً همیشه صفر — هرگز استقرار را نمی‌میراند
