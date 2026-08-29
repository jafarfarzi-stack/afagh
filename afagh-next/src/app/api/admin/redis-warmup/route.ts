import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { ensureWorker, warmupCapacities, waitingRoomStats } from '@/lib/waitingRoom';

export const dynamic = 'force-dynamic';

export async function POST() {
  const user = await getSessionUser();
  if (!user || (!user.roles.includes('ADMIN'))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  ensureWorker();
  const warmed = await warmupCapacities(true);
  return NextResponse.json({ warmed, ...(await waitingRoomStats()) });
}
