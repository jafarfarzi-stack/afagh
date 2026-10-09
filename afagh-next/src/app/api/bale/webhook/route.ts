import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// وب‌هوک inbound بله حذف شده (حالت فقط-ارسال).
// جفت‌سازی توکن فقط از راه poll worker انجام می‌شود.
export async function POST() {
  return NextResponse.json({ error: 'not_found' }, { status: 404 });
}

export async function GET() {
  return NextResponse.json({ error: 'not_found' }, { status: 404 });
}
