// ═══════════════════════════════════════════════════════════════
//  تلگرام — لایهٔ سازگاری با کدهای قبلی
//
//  تمام منطق در messenger-bot.ts زندگی می‌کند.
//  این فایل فقط exportهای قبلی را نگه می‌دارد تا کد موجود نشکند.
// ═══════════════════════════════════════════════════════════════

export {
  handleTelegramUpdate,
  setTelegramWebhook,
  sendTelegramToUser,
} from './messenger-bot';

// re-export types for convenience
export type { MessengerChannel as TelegramChannel } from './messenger-bot';
