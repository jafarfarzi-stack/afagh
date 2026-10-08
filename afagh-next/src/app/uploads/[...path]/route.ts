import { join, normalize, sep } from 'node:path';
import { readFile, stat } from 'node:fs/promises';

export const dynamic = 'force-dynamic';

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/**
 * سرو فایل‌های بارگذاری‌شده (ارم‌ها، تصاویر اسلایدر) — خوانش تازه از دیسک.
 * چرا هندلر و نه public/ مستقیم؟ سرور standalone فهرست public را هنگام بوت
 * کش می‌کند؛ فایلِ تازه‌آپلودشده تا ری‌استارت 404 می‌خورد (تست‌شده).
 * این هندلر در هر درخواست از دیسک می‌خواند، پس آپلود بلافاصله دیده می‌شود.
 */
export async function GET(_req: Request, props: { params: Promise<{ path: string[] }> }) {
  const { path } = await props.params;
  const safe = normalize(path.join('/')).replace(/^(\.\.(\/|\\|$))+/, '');
  if (!safe || safe.includes('..') || safe.includes(sep === '/' ? '\\' : '/')) {
    return new Response('bad path', { status: 400 });
  }
  const ext = safe.split('.').pop()?.toLowerCase() ?? '';
  const mime = MIME[ext];
  if (!mime) return new Response('unsupported type', { status: 415 });
  const abs = join(process.cwd(), 'public', 'uploads', safe);
  // قفل traversal: مسیر نهایی باید داخل public/uploads بماند
  const base = join(process.cwd(), 'public', 'uploads') + sep;
  if (!normalize(abs).startsWith(base)) return new Response('forbidden', { status: 403 });
  try {
    const st = await stat(abs);
    if (!st.isFile() || st.size > 5 * 1024 * 1024) return new Response('not found', { status: 404 });
    const buf = await readFile(abs);
    return new Response(new Uint8Array(buf), {
      headers: {
        'content-type': mime,
        'content-length': String(st.size),
        'cache-control': 'public, max-age=3600',
      },
    });
  } catch {
    return new Response('not found', { status: 404 });
  }
}
