import { resolveStudentCurriculum } from '../src/lib/curriculum-apply';

async function main() {
  const r = await resolveStudentCurriculum(31993);
  console.log('Result of resolveStudentCurriculum(31993):', r);
}

main().catch(console.error);
