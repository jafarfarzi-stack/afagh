import VerifyCertificateClient, { VerifiedCertificate } from './VerifyCertificateClient';

export const dynamic = 'force-dynamic';

export const sampleCertificates: Record<string, VerifiedCertificate> = {
  'AFQ-CERT-2026-9041': {
    certificateNumber: 'AFQ-CERT-2026-9041',
    verificationHash: '9e7b23c914d7a82b414f5e89a0b123456789abcdef0123456789abcdef012345',
    fullNameFa: 'امیررضا صادقی‌راد',
    fullNameEn: 'Amir Reza Sadeghi Rad',
    nationalIdMasked: '۰۰۲***۴۵۸۹',
    courseTitleFa: 'بوت‌کمپ جامع برنامه‌نویسی پایتون و هوش مصنوعی کاربردی',
    courseTitleEn: 'Comprehensive Python & Applied Artificial Intelligence Bootcamp',
    courseHours: 60,
    instructorNameFa: 'دکتر محمدرضا جلالی',
    instructorNameEn: 'Dr. M. R. Jalali',
    grade: 19.5,
    gradeStatus: 'عالی (A+)',
    issueDateFa: '۱۴۰۵/۱۰/۲۲',
    issueDateEn: 'January 12, 2027',
    status: 'VALID',
  },
  'AFQ-CERT-2026-8812': {
    certificateNumber: 'AFQ-CERT-2026-8812',
    verificationHash: '7c8a12d904b3e15f628c9a10b4567890123456789abcdef0123456789abcdef0',
    fullNameFa: 'مهسا کاظمی‌تبار',
    fullNameEn: 'Mahsa Kazemi Tabar',
    nationalIdMasked: '۲۷۵***۱۲۳۰',
    courseTitleFa: 'بوت‌کمپ فول‌استک وب (Next.js 14, React & PostgreSQL)',
    courseTitleEn: 'Full-Stack Web Development Bootcamp (Next.js & PostgreSQL)',
    courseHours: 80,
    instructorNameFa: 'مهندس سامان افشار',
    instructorNameEn: 'Eng. Saman Afshar',
    grade: 18.0,
    gradeStatus: 'خیلی خوب (A)',
    issueDateFa: '۱۴۰۵/۱۱/۱۵',
    issueDateEn: 'February 4, 2027',
    status: 'VALID',
  },
};

export default async function VerifyCertificatePage() {
  return <VerifyCertificateClient sampleCertificates={sampleCertificates} />;
}
