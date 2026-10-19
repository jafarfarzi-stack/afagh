import { NextResponse } from 'next/server';
import { pool } from '@/db';

export const dynamic = 'force-dynamic';

/**
 * بررسی سلامت سرویس برای load-balancer / monitoring.
 * هیچ دادهٔ حساسی برنمی‌گرداند؛ فقط وضعیت کلی و اتصال DB.
 */
export async function GET() {
  try {
    await pool.query('select 1');
    return NextResponse.json({ status: 'ok', db: 'ok' }, { status: 200 });
  } catch {
    return NextResponse.json({ status: 'degraded', db: 'down' }, { status: 503 });
  }
}
