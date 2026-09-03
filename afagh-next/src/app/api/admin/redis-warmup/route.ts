import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/security';
import { ensureWorker, warmupCapacities, waitingRoomStats } from '@/lib/waitingRoom';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;
  const user = await getSessionUser();
  if (!user || (!user.roles.includes('ADMIN'))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  ensureWorker();
  const warmed = await warmupCapacities(true);
  return NextResponse.json({ warmed, ...(await waitingRoomStats()) });
}
