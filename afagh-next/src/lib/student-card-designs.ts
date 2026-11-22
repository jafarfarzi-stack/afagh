import { getSettings, getSetting } from '@/lib/settings';
import {
  CARD_FIELD_DEFS,
  DEFAULT_CARD_BACK,
  DEFAULT_CARD_DESIGN,
  DEFAULT_SIGNATURE,
  clampNum,
  parseBool,
  parseCardDesign,
  safeBgUrl,
  safeHex,
  type CardBackDesign,
  type CardDesign,
  type CardLogoPos,
  type CardSignature,
  type CardTemplate,
} from '@/components/StudentCardView';

/**
 * ─────────────────────────────────────────────────────────────────────
 *  «طراحی‌های نام‌دار کارت دانشجو» — منبعِ واحد برای:
 *    • فرم طراحی (/admin/student-cards/design)
 *    • صدور کارت (انتخاب طراحی)
 *    • صفحهٔ چاپ (طراحیِ ثبت‌شده روی همان کارت)
 *
 *  ذخیره در `system_settings` به‌صورت JSON (بدون جدول جدید و بدون مهاجرت):
 *    STUDENT_CARD_DESIGNS            → آرایهٔ طراحی‌ها (حداکثر ۲۰)
 *    STUDENT_CARD_DEFAULT_DESIGN_ID  → طراحی پیش‌فرض هنگام صدور
 *
 *  اگر هیچ طراحیِ JSON ذخیره نشده باشد، از کلیدهای تختِ قبلی
 *  (STUDENT_CARD_TEMPLATE/… ) یک طراحی «پیش‌فرض» ساخته می‌شود تا
 *  نصب‌های موجود بی‌تغییر کار کنند.
 * ─────────────────────────────────────────────────────────────────────
 */

export const CARD_DESIGNS_KEY = 'STUDENT_CARD_DESIGNS';
export const CARD_DEFAULT_DESIGN_KEY = 'STUDENT_CARD_DEFAULT_DESIGN_ID';
export const CARD_ASSET_PREFIX = 'card-design/';
export const MAX_CARD_DESIGNS = 20;

/** کلیدهای تختِ نسخهٔ قبل — فقط برای ساخت طراحیِ پیش‌فرض */
export const LEGACY_DESIGN_KEYS = [
  'STUDENT_CARD_TEMPLATE',
  'STUDENT_CARD_ACCENT',
  'STUDENT_CARD_HEADER',
  'STUDENT_CARD_FOOTER',
  'STUDENT_CARD_FIELDS',
  'STUDENT_CARD_SHOW_PHOTO',
  'STUDENT_CARD_SHOW_QR',
  'STUDENT_CARD_SHOW_LOGO',
  'STUDENT_CARD_LOGO_POS',
  'STUDENT_CARD_LOGO_MM',
  'STUDENT_CARD_WIDTH_MM',
  'STUDENT_CARD_HEIGHT_MM',
  'STUDENT_CARD_BG_OVERLAY',
] as const;

export type SavedCardDesign = {
  id: string;
  title: string;
  front: CardDesign;
  back: CardBackDesign;
  updatedAt: string;
};

const ID_RE = /^[A-Za-z0-9_-]{4,40}$/;
const TEMPLATES: CardTemplate[] = ['CLASSIC', 'MODERN', 'MINIMAL'];

export function isValidDesignId(id: unknown): id is string {
  return typeof id === 'string' && ID_RE.test(id);
}

export function newDesignId(): string {
  // شناسهٔ کوتاه و امن برای URL/JSON — بدون وابستگی
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function str(v: unknown, max: number, fallback = ''): string {
  const s = String(v ?? '').trim();
  return (s || fallback).slice(0, max);
}

function normalizeSignature(raw: unknown, fallback: CardSignature = DEFAULT_SIGNATURE): CardSignature {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    show: parseBool(o.show, fallback.show),
    title: str(o.title, 40, fallback.title),
    imageUrl: safeBgUrl(o.imageUrl),
    mm: clampNum(o.mm, fallback.mm, 6, 30),
  };
}

export function normalizeFront(raw: unknown): CardDesign {
  const o = (raw ?? {}) as Record<string, unknown>;
  const t = String(o.template || 'CLASSIC').toUpperCase() as CardTemplate;
  const template: CardTemplate = TEMPLATES.includes(t) ? t : 'CLASSIC';
  const lp = String(o.logoPos || 'start');
  const logoPos: CardLogoPos = lp === 'center' || lp === 'end' ? lp : 'start';
  const fields = Array.isArray(o.fields)
    ? o.fields.map(f => String(f)).filter(f => !!CARD_FIELD_DEFS[f])
    : DEFAULT_CARD_DESIGN.fields;
  return {
    template,
    accent: safeHex(o.accent, DEFAULT_CARD_DESIGN.accent),
    header: str(o.header, 80, DEFAULT_CARD_DESIGN.header),
    footer: str(o.footer, 200, ''),
    fields: fields.length ? Array.from(new Set(fields)) : DEFAULT_CARD_DESIGN.fields,
    showPhoto: parseBool(o.showPhoto, true),
    showQr: parseBool(o.showQr, true),
    showLogo: parseBool(o.showLogo, true),
    logoPos,
    logoMm: clampNum(o.logoMm, 10, 6, 18),
    widthMm: clampNum(o.widthMm, 85.6, 50, 120),
    heightMm: clampNum(o.heightMm, 53.98, 30, 100),
    bgUrl: safeBgUrl(o.bgUrl),
    bgOverlay: clampNum(o.bgOverlay, 65, 0, 100),
    signature: normalizeSignature(o.signature),
  };
}

export function normalizeBack(raw: unknown): CardBackDesign {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    enabled: parseBool(o.enabled, false),
    header: str(o.header, 80, DEFAULT_CARD_BACK.header),
    body: String(o.body ?? DEFAULT_CARD_BACK.body).slice(0, 800),
    accent: safeHex(o.accent, DEFAULT_CARD_BACK.accent),
    bgUrl: safeBgUrl(o.bgUrl),
    bgOverlay: clampNum(o.bgOverlay, 80, 0, 100),
    showQr: parseBool(o.showQr, true),
    signature: normalizeSignature(o.signature, DEFAULT_CARD_BACK.signature),
  };
}

export function normalizeDesign(raw: unknown): SavedCardDesign | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isValidDesignId(o.id)) return null;
  return {
    id: o.id,
    title: str(o.title, 60, 'بدون عنوان'),
    front: normalizeFront(o.front),
    back: normalizeBack(o.back),
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt.slice(0, 40) : '',
  };
}

/** پارسِ امنِ JSON طراحی‌ها — هر ردیفِ نامعتبر حذف می‌شود */
export function parseDesignsJson(raw: string | null | undefined): SavedCardDesign[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const seen = new Set<string>();
    const out: SavedCardDesign[] = [];
    for (const item of arr) {
      const d = normalizeDesign(item);
      if (!d || seen.has(d.id)) continue;
      seen.add(d.id);
      out.push(d);
      if (out.length >= MAX_CARD_DESIGNS) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** طراحیِ پیش‌فرضِ ساخته‌شده از کلیدهای تختِ قدیمی */
async function legacyDesign(): Promise<SavedCardDesign> {
  const values = await getSettings(LEGACY_DESIGN_KEYS);
  return {
    id: 'default',
    title: 'طراحی پیش‌فرض',
    front: parseCardDesign(values),
    back: { ...DEFAULT_CARD_BACK, accent: safeHex(values.STUDENT_CARD_ACCENT, DEFAULT_CARD_BACK.accent) },
    updatedAt: '',
  };
}

export type CardDesignsState = { designs: SavedCardDesign[]; defaultId: string };

/** همهٔ طراحی‌ها + شناسهٔ پیش‌فرض (همیشه حداقل یک طراحی برمی‌گرداند) */
export async function getCardDesigns(): Promise<CardDesignsState> {
  const [raw, rawDefault] = await Promise.all([
    getSetting(CARD_DESIGNS_KEY).catch(() => ''),
    getSetting(CARD_DEFAULT_DESIGN_KEY).catch(() => ''),
  ]);
  let designs = parseDesignsJson(raw);
  if (!designs.length) designs = [await legacyDesign()];
  const wanted = String(rawDefault || '').trim();
  const defaultId = designs.some(d => d.id === wanted) ? wanted : designs[0].id;
  return { designs, defaultId };
}

/** طراحیِ یک کارت با شناسهٔ ثبت‌شده — در نبود/حذف، پیش‌فرض برمی‌گردد */
export async function getCardDesign(id: string | null | undefined): Promise<{
  design: SavedCardDesign;
  defaultId: string;
  found: boolean;
}> {
  const { designs, defaultId } = await getCardDesigns();
  const hit = id ? designs.find(d => d.id === id) : undefined;
  return {
    design: hit ?? designs.find(d => d.id === defaultId) ?? designs[0],
    defaultId,
    found: !!hit,
  };
}

/** نشانی عمومیِ دارایی طراحی (تصویر پس‌زمینه/امضا) — کلید در query رمز می‌شود */
export function cardAssetUrl(key: string): string {
  const k = Buffer.from(key, 'utf8').toString('base64url');
  return `/api/card-design/asset?k=${k}`;
}

/** کلیدِ معتبر برای خواندن از Object Storage (فقط دارایی‌های طراحی) */
export function parseCardAssetKey(encoded: string | null | undefined): string | null {
  if (!encoded) return null;
  let key: string;
  try {
    key = Buffer.from(String(encoded), 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!key.startsWith(CARD_ASSET_PREFIX)) return null;
  if (key.includes('..') || key.length > 160) return null;
  if (!/^card-design\/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(key)) return null;
  return key;
}
