import { requireRole } from '@/lib/auth';
import { alumniOf, getProfile, myDegrees, myRequests, serviceCatalog } from '@/lib/alumni';
import AlumniClient from './AlumniClient';

export const dynamic = 'force-dynamic';

export default async function AlumniHome() {
  const user = await requireRole(['STUDENT']);
  const me = (await alumniOf(user.id))!;
  const [services, requests, degrees, profile] = await Promise.all([
    serviceCatalog(), myRequests(me.studentId), myDegrees(me.studentId), getProfile(me.studentId),
  ]);

  return (
    <AlumniClient
      me={{ fullName: me.fullName, studentCode: me.studentCode, majorName: me.majorName, degreeTitle: me.degreeTitle, entryYear: me.entryYear }}
      services={services}
      initialRequests={requests}
      degrees={degrees}
      initialProfile={{
        employmentStatus: profile?.employmentStatus ?? '',
        organization: profile?.organization ?? '',
        jobTitle: profile?.jobTitle ?? '',
        contactEmail: profile?.contactEmail ?? '',
        contactMobile: profile?.contactMobile ?? '',
        linkedinUrl: profile?.linkedinUrl ?? '',
        allowContact: profile?.allowContact !== 0,
      }}
    />
  );
}
