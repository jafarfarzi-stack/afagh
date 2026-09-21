import { resolveSamaGradeStatusCode } from '../src/lib/resolve-sama-code';

async function main() {
  const studentId = 31993; // Reg 1393
  const offeringId = 30549; // Course 34038 (اجزاء ماشین ۱-جبرانی, defaultAccept: 12)

  const pass12 = await resolveSamaGradeStatusCode(studentId, offeringId, '18.5');
  console.log('Course 34038 (18.5) -> Expected 12, Got:', pass12);

  const fail12 = await resolveSamaGradeStatusCode(studentId, offeringId, '8.0');
  console.log('Course 34038 (8.0) -> Expected 931 or 22, Got:', fail12);

  // Normal course: offering 17065
  const passNormal = await resolveSamaGradeStatusCode(studentId, 17065, '15.0');
  console.log('Normal Course (15.0) -> Expected 1, Got:', passNormal);

  const failNormal = await resolveSamaGradeStatusCode(studentId, 17065, '8.5');
  console.log('Normal Course (8.5) with Reg 1393 -> Expected 931, Got:', failNormal);
}

main().catch(console.error);
