/** لینک امن برای href: مسیر نسبی تک‌اسلش (نه «//») یا https:// — بقیه (javascript:, data:, //host) رد می‌شوند. */
export function isSafeLinkUrl(s: string): boolean {
  if (typeof s !== 'string') return false;
  if (/[\u0000-\u001f\u007f\\]/.test(s)) return false;
  return /^\/(?!\/)/.test(s) || /^https:\/\/[^\s/?#]/i.test(s);
}
