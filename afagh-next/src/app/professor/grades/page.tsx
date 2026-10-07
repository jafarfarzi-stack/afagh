import { getStaffByUser, requireRole } from '@/lib/auth';
import { currentTermFor } from '@/lib/terms';
import {
  coTaughtPartners,
  professorEnrollmentRows,
  professorScheduleRows,
  universityTitle,
} from '@/lib/professor-data';
import { isDemoProfessorUser } from '@/lib/demo-accounts';
import {
  DEMO_CERTIFICATE_UNIVERSITY_TITLE,
  DEMO_PROFESSOR_FALLBACK_NAME,
  DEMO_TERM_TITLE,
  demoGradesOfferings,
} from '@/lib/demo-professor-data';
import { DEFAULT_RUBRIC } from './grades-core';
import ProfessorGradesClient, { type GradingCourseOffering } from './ProfessorGradesClient';
import type { GradeAppealItem, StudentGradeItem } from './types';

export const dynamic = 'force-dynamic';

const GRADE_STATUS_MAP: Record<string, StudentGradeItem['status']> = {
  DRAFT: 'DRAFT',
  TEMPORARY: 'TEMPORARY',
  FINALIZED: 'FINALIZED',
  APPEALED: 'APPEALED',
  PENDING: 'DRAFT',
};

const APPEAL_STATUS_MAP: Record<string, GradeAppealItem['status']> = {
  OPEN: 'OPEN',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
};

function faDateTime(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fa-IR');
}

export default async function ProfessorGradesPage({
  searchParams,
}: {
  searchParams: Promise<{ offeringId?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireRole(['PROFESSOR']);
  const me = await getStaffByUser(user.id);

  if (!me) {
    return (
      <div className="card text-center p-8">
        <p className="text-slate-600 font-bold">پروندهٔ هیئت علمی یافت نشد.</p>
      </div>
    );
  }

  const defaultOfferingId = sp.offeringId ? Number(sp.offeringId) : undefined;
  const demo = await isDemoProfessorUser(user.id);

  if (demo) {
    const demoName = user.name || DEMO_PROFESSOR_FALLBACK_NAME;
    return (
      <ProfessorGradesClient
        professor={{
          id: me.id,
          name: demoName,
          staffCode: me.staffCode,
          universityTitle: DEMO_CERTIFICATE_UNIVERSITY_TITLE,
        }}
        termTitle={DEMO_TERM_TITLE}
        initialOfferings={demoGradesOfferings(demoName, me.staffCode)}
        defaultOfferingId={defaultOfferingId}
      />
    );
  }

  const universityId = me.universityId ?? user.universityId ?? null;
  const term = await currentTermFor(universityId);
  const termTitle = term?.title ?? '';

  if (!term) {
    return (
      <div className="card text-center p-8 space-y-2">
        <p className="text-slate-600 font-bold">نیمسال تحصیلی جاری برای دانشگاه شما تعیین نشده است.</p>
        <p className="text-xs text-slate-500">پس از تعیین نیمسال جاری توسط اداره آموزش، بارم‌بندی و ثبت نمرات فعال می‌شود.</p>
      </div>
    );
  }

  const scheduleRows = await professorScheduleRows(me.id, term.id, universityId);
  const seen = new Map<number, (typeof scheduleRows)[number]>();
  for (const r of scheduleRows) if (!seen.has(r.id)) seen.set(r.id, r);
  const baseOfferings = [...seen.values()];

  const offeringIds = baseOfferings.map(o => o.id);
  const [{ students: enrollRows, appeals: appealRows }, partners] = await Promise.all([
    professorEnrollmentRows(offeringIds),
    coTaughtPartners(offeringIds),
  ]);

  const enrollByOffering = new Map<number, typeof enrollRows>();
  for (const e of enrollRows) {
    const list = enrollByOffering.get(e.offeringId) ?? [];
    list.push(e);
    enrollByOffering.set(e.offeringId, list);
  }
  const appealsByEnrollment = new Map<number, typeof appealRows>();
  for (const a of appealRows) {
    const list = appealsByEnrollment.get(a.enrollmentId) ?? [];
    list.push(a);
    appealsByEnrollment.set(a.enrollmentId, list);
  }

  const initialOfferings: GradingCourseOffering[] = baseOfferings.map(base => {
    const partner = partners.get(base.id) ?? null;
    const list = enrollByOffering.get(base.id) ?? [];

    const gradeStudents: StudentGradeItem[] = list.map(e => {
      const raw = e.gradeValue === null ? null : Number(e.gradeValue);
      const hasGrade = raw !== null && Number.isFinite(raw);
      return {
        studentId: e.studentId,
        studentCode: e.studentCode,
        fullName: e.fullName,
        entryYear: e.entryYear,
        calculatedFinalScore: hasGrade ? raw : undefined,
        status: GRADE_STATUS_MAP[e.gradeStatus] ?? 'DRAFT',
      };
    });

    const appeals: GradeAppealItem[] = list.flatMap(e => {
      const mine = appealsByEnrollment.get(e.enrollmentId) ?? [];
      const currentGrade = e.gradeValue === null ? 0 : Number(e.gradeValue);
      return mine.map(a => ({
        id: a.id,
        studentId: e.studentId,
        studentCode: e.studentCode,
        fullName: e.fullName,
        currentGrade,
        studentMessage: a.studentMessage,
        status: APPEAL_STATUS_MAP[a.status ?? 'OPEN'] ?? 'OPEN',
        professorReply: a.professorReply ?? undefined,
        newGrade: a.newGrade === null ? undefined : Number(a.newGrade),
        createdAt: faDateTime(a.createdAt),
      }));
    });

    const isCoTaught = !!partner;

    const offering: GradingCourseOffering = {
      id: base.id,
      code: base.code,
      title: base.title,
      groupNumber: base.groupNumber,
      units: base.units,
      courseType: base.courseType,
      isCoTaught,
      rubric: { ...DEFAULT_RUBRIC },
      students: gradeStudents,
      appeals,
      isFinalized: list.length > 0 && list.every(e => (GRADE_STATUS_MAP[e.gradeStatus] ?? 'DRAFT') === 'FINALIZED'),
    };

    if (isCoTaught && partner) {
      offering.coTaughtDetails = {
        theoryProfName: partner.name,
        theoryProfStaffCode: partner.staffCode,
        theoryWeightRatio: Number(partner.sharePercentage ?? 0) / 100,
        theoryWeightMarks: Math.round((Number(partner.sharePercentage ?? 0) / 100) * 20),
        theorySigned: false,
        labProfName: user.name,
        labProfStaffCode: me.staffCode,
        labWeightRatio: 1 - Number(partner.sharePercentage ?? 0) / 100,
        labWeightMarks: Math.round((1 - Number(partner.sharePercentage ?? 0) / 100) * 20),
        labSigned: false,
        currentProfRole: 'THEORY',
      };
    }

    return offering;
  });

  const uniTitle = await universityTitle(universityId);

  const professorData = {
    id: me.id,
    name: user.name,
    staffCode: me.staffCode,
    universityTitle: uniTitle ?? '',
  };

  return (
    <ProfessorGradesClient
      professor={professorData}
      termTitle={termTitle}
      initialOfferings={initialOfferings}
      defaultOfferingId={defaultOfferingId}
    />
  );
}