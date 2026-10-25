// تولید آیکون‌های PWA از یک SVG ساده (بدون فونت — مصون از نبودِ فونتِ فارسی در librsvg)
// اجرا: node scripts/gen-pwa-icons.mjs
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
await mkdir(outDir, { recursive: true });

// مربعِ گردِ نیلی + گریدِ ۲×۲ سفید/کم‌رنگ (نمادِ داشبورد) — کاملاً هندسی و بی‌فونت
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#4f46e5"/>
  <rect x="132" y="132" width="108" height="108" rx="28" fill="#ffffff"/>
  <rect x="272" y="132" width="108" height="108" rx="28" fill="#a5b4fc"/>
  <rect x="132" y="272" width="108" height="108" rx="28" fill="#a5b4fc"/>
  <rect x="272" y="272" width="108" height="108" rx="28" fill="#ffffff"/>
</svg>`;
const buf = Buffer.from(svg);

const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['maskable-512.png', 512],
  ['apple-touch-icon.png', 180],
];
for (const [name, size] of targets) {
  await sharp(buf).resize(size, size).png().toFile(join(outDir, name));
  console.log('wrote', name, size);
}
