import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { dryRun, ENTITIES, logDryRun, type Entity } from '@/lib/migration/engine';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.roles.includes('ADMIN')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const form = await req.formData();
  const entity = String(form.get('entity') || '') as Entity;
  const file = form.get('file') as File | null;
  if (!ENTITIES.some(e => e.id === entity)) return NextResponse.json({ error: 'نوع داده نامعتبر' }, { status: 400 });
  if (!file) return NextResponse.json({ error: 'فایلی ارسال نشد' }, { status: 400 });
  const text = await file.text();
  if (text.length > 20 * 1024 * 1024) return NextResponse.json({ error: 'حجم فایل بیش از ۲۰MB' }, { status: 413 });
  const report = await dryRun(entity, text, file.name);
  await logDryRun(user.id, report);
  return NextResponse.json(report);
}
