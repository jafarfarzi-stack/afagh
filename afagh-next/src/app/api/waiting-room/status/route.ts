import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { myStatus } from '@/lib/waitingRoom';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await myStatus(user.id));
  } catch {
    // این مسیر هر ۱٫۵ ثانیه از صفحهٔ انتخاب واحد صدا زده می‌شود؛ اگر ۵۰۰
    // بدهد، کنسول دانشجو پر از خطا می‌شود و صفحه خراب به نظر می‌رسد.
    return NextResponse.json({ state: 'IDLE', degraded: true });
  }
}
