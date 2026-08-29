import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { myStatus } from '@/lib/waitingRoom';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const st = await myStatus(user.id);
  return NextResponse.json(st);
}
