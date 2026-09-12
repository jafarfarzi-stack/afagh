import { NextRequest, NextResponse } from 'next/server';
import { importPhotoArchive, type PhotoScope } from '@/lib/migration/photos';
import { MAX_ARCHIVE_BYTES, readUpload, requireMigrationAdmin } from '@/lib/migration/http';
import { assertSameOrigin } from '@/lib/security';

export const dynamic = 'force-dynamic';

const SCOPES: PhotoScope[] = ['all', 'professor', 'student', 'staff'];

/** واردسازی دسته‌ای عکس افراد از آرشیو ZIP (تحلیل اولیه یا ثبت نهایی) */
export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;
  const auth = await requireMigrationAdmin();
  if ('res' in auth) return auth.res;

  const form = await req.formData();
  const file = form.get('file') as File | null;
  const scopeRaw = String(form.get('scope') || 'all') as PhotoScope;
  const scope = SCOPES.includes(scopeRaw) ? scopeRaw : 'all';
  const commit = String(form.get('commit') ?? '0') === '1';
  if (!file) return NextResponse.json({ error: 'فایلی ارسال نشد' }, { status: 400 });
  if (!/\.zip$/i.test(file.name)) {
    return NextResponse.json({ error: 'فقط آرشیو ZIP پذیرفته می‌شود (RAR و 7z پشتیبانی نمی‌شوند).' }, { status: 400 });
  }

  try {
    const buf = await readUpload(file, MAX_ARCHIVE_BYTES);
    const report = await importPhotoArchive(buf, file.name, scope, commit);
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json({ error: 'خطای واردسازی عکس‌ها: ' + (e as Error).message }, { status: 500 });
  }
}
