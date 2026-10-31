import 'server-only';
import crypto from 'crypto';
import { getBbbConfig } from '@/lib/settings';

// فراخوانی‌های سمت سرور به API بیگ‌بلوباتن (create / isMeetingRunning / getMeetingInfo).
// کلید مخفی و رمزهای عمومی فقط در سرور استفاده می‌شوند و هرگز به مرورگر نمی‌روند.
// نام جلسه‌ها ثابت و بر پایهٔ شناسهٔ ارائه است، پس ساخت دوباره بی‌خطر (idempotent) است.

type BbbConfig = Awaited<ReturnType<typeof getBbbConfig>>;

/** شناسهٔ یکتا و پایدار جلسهٔ هر ارائه */
export function meetingIdFor(offeringId: number): string {
  return `afagh-off-${offeringId}`;
}

function sha1(raw: string): string {
  return crypto.createHash('sha1').update(raw).digest('hex');
}

async function bbbCall(cfg: BbbConfig, name: string, params: Record<string, string>): Promise<{ ok: boolean; xml: string; error?: string }> {
  if (!cfg.configured) return { ok: false, xml: '', error: 'سرویس کلاس مجازی پیکربندی نشده است — پنل مدیر ← پیکربندی سامانه ← کلاس مجازی' };
  const qs = new URLSearchParams(params).toString();
  const url = `${cfg.url}/${name}?${qs}&checksum=${sha1(`${name}${qs}${cfg.secret}`)}`;
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    const xml = await res.text();
    const rc = /<returncode>([^<]+)<\/returncode>/.exec(xml)?.[1];
    if (rc !== 'SUCCESS') {
      const msg = /<message>([^<]*)<\/message>/.exec(xml)?.[1];
      return { ok: false, xml, error: msg || 'پاسخ نامعتبر از سرور بیگ‌بلوباتن' };
    }
    return { ok: true, xml };
  } catch (e) {
    return { ok: false, xml: '', error: `ارتباط با سرور بیگ‌بلوباتن برقرار نشد: ${(e as Error).message}` };
  }
}

/** ساخت جلسه در سرور BBB (اگر از قبل باشد، همان را برمی‌گرداند) */
export async function createBbbMeeting(opts: { meetingId: string; name: string }): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getBbbConfig();
  const r = await bbbCall(cfg, 'create', {
    meetingID: opts.meetingId,
    name: opts.name.slice(0, 255),
    moderatorPW: cfg.moderatorPw,
    attendeePW: cfg.attendeePw,
    record: cfg.autoRecord ? 'true' : 'false',
    autoStartRecording: cfg.autoRecord ? 'true' : 'false',
    allowStartStopRecording: 'true',
  });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/** وضعیت زندهٔ جلسه: در حال برگزاری؟ و چند نفر حاضرند؟ */
export async function getBbbStatus(meetingId: string): Promise<{ ok: boolean; running: boolean; participantCount: number; error?: string }> {
  const cfg = await getBbbConfig();
  const running = await bbbCall(cfg, 'isMeetingRunning', { meetingID: meetingId });
  if (!running.ok) return { ok: false, running: false, participantCount: 0, error: running.error };
  if (!/<running>true<\/running>/.test(running.xml)) return { ok: true, running: false, participantCount: 0 };
  const info = await bbbCall(cfg, 'getMeetingInfo', { meetingID: meetingId });
  const count = Number(/<participantCount>(\d+)<\/participantCount>/.exec(info.xml)?.[1] ?? 0);
  return { ok: true, running: true, participantCount: Number.isFinite(count) ? count : 0 };
}
