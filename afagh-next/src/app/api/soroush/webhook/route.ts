import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// وب‌هوک inbound سروش حذف شده (حالت فقط-ارسال).
// اتصال جدید سروش فریز است (poll ندارد).
export async function POST() {
  return NextResponse.json({ error: 'not_found' }, { status: 404 });
}

export async function GET() {
  return NextResponse.json({ error: 'not_found' }, { status: 404 });
}
