import { requireRole } from '@/lib/auth';
import { NextResponse } from 'next/server';
import EnrollmentApprovalsClient from './EnrollmentApprovalsClient';

export const dynamic = 'force-dynamic';

export default async function EnrollmentApprovalsPage() {
  const denied = await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU']);
  if (denied) return denied;
  return <EnrollmentApprovalsClient />;
}
