import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { students, users } from '@/db/schema';
import { DEMO_ACCOUNTS, isDemoMode } from './auth';

export type DemoAccountKind = 'PROFESSOR' | 'STUDENT' | 'STAFF' | 'ADMIN' | 'OTHER';

export function demoAccountKind(nationalCode: string | null | undefined): DemoAccountKind | null {
  if (!nationalCode) return null;
  const hit = DEMO_ACCOUNTS[String(nationalCode).trim()];
  if (!hit) return null;
  if (hit.isStudent) return 'STUDENT';
  if (hit.role === 'PROFESSOR') return 'PROFESSOR';
  if (hit.role === 'ADMIN') return 'ADMIN';
  if (hit.role) return 'STAFF';
  return 'OTHER';
}

export function isDemoNationalCode(nationalCode: string | null | undefined): boolean {
  return isDemoMode() && demoAccountKind(nationalCode) !== null;
}

export function isDemoAccountOfKind(nationalCode: string | null | undefined, kind: DemoAccountKind): boolean {
  return isDemoMode() && demoAccountKind(nationalCode) === kind;
}

export async function demoKindForUser(userId: number): Promise<DemoAccountKind | null> {
  if (!isDemoMode()) return null;
  try {
    const [u] = await db
      .select({ nationalCode: users.nationalCode })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return demoAccountKind(u?.nationalCode);
  } catch {
    return null;
  }
}

export async function isDemoStudentUser(userId: number): Promise<boolean> {
  return (await demoKindForUser(userId)) === 'STUDENT';
}

export async function isDemoProfessorUser(userId: number): Promise<boolean> {
  return (await demoKindForUser(userId)) === 'PROFESSOR';
}

export async function isDemoStudentRecord(studentId: number): Promise<boolean> {
  if (!isDemoMode()) return false;
  try {
    const [row] = await db
      .select({ nationalCode: users.nationalCode })
      .from(students)
      .innerJoin(users, eq(users.id, students.userId))
      .where(and(eq(students.id, studentId)))
      .limit(1);
    return demoAccountKind(row?.nationalCode) === 'STUDENT';
  } catch {
    return false;
  }
}