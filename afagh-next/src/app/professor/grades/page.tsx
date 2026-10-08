import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { universities } from '@/db/schema';
import { getSetting } from '@/lib/settings';
import { getStaffByUser, requireRole } from '@/lib/auth';
import {
  coTaughtPartners,
  groupIntoMerged,
  mergedDisplayTitle,
  mergedGroupKey,
  offeringSharedKeys,
  professorEnrollmentRows,
  professorScheduleRows,
  universityTitle,
} from '@/lib/professor-data';
import { professorTermFilter } from '@/lib/professor-term-filter';
import { isDemoProfessorUser } from '@/lib/demo-accounts';
import {
  DEMO_CERTIFICATE_UNIVERSITY_TITLE,
  DEMO_PROFESSOR_FALLBACK_NAME,
  DEMO_TERM_TITLE,
  demoGradesOfferings,
} from '@/lib/demo-professor-data';
import { DEFAULT_RUBRIC } from './grades-core';
import ProfessorGradesClient, { type GradingCourseOffering } from './ProfessorGradesClient';
import ProfessorTermFilterBanner from '../term-filter-banner';
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
  const universityId = me.universityId ?? user.universityId ?? null;
  const { term, selectedTerm } = await professorTermFilter(universityId);

  if (demo) {
    const demoName = user.name || DEMO_PROFESSOR_FALLBACK_NAME;
    return (
      <div className="space-y-3">
        <ProfessorTermFilterBanner selectedTerm={selectedTerm} universityId={universityId} demo />
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
      </div>
    );
  }

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

  const slotsByOffering = new Map<number, { dayOfWeek: number | null; startTime: string; endTime: string; roomKey: string }[]>();
  for (const r of scheduleRows) {
    const list = slotsByOffering.get(r.id) ?? [];
    list.push({ dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime, roomKey: r.roomName });
    slotsByOffering.set(r.id, list);
  }

  const offeringIds = baseOfferings.map(o => o.id);
  const sharedKeys = await offeringSharedKeys(offeringIds);
  const offeringGroups = groupIntoMerged(
    baseOfferings,
    o => o.id,
    o => mergedGroupKey(sharedKeys.get(o.id) ?? null, slotsByOffering.get(o.id) ?? []),
  );
  const memberToPrimary = new Map<number, number>();
  for (const g of offeringGroups) for (const id of g.memberIds) memberToPrimary.set(id, g.primaryId);
  const resolvedDefaultOfferingId = defaultOfferingId ? (memberToPrimary.get(defaultOfferingId) ?? defaultOfferingId) : undefined;
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

  const initialOfferings: GradingCourseOffering[] = offeringGroups.map(g => {
    const base = g.members.find(m => m.id === g.primaryId) ?? g.members[0];
    const codes = [...new Set(g.members.map(m => m.code))];
    const partner = partners.get(base.id) ?? null;
    const unionEnroll = g.members.flatMap(m => enrollByOffering.get(m.id) ?? []);
    const seenStudents = new Set<number>();
    const list = unionEnroll.filter(e => {
      if (seenStudents.has(e.studentId)) return false;
      seenStudents.add(e.studentId);
      return true;
    });

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
        enrollmentOfferingId: e.offeringId,
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
        enrollmentOfferingId: e.offeringId,
      }));
    });

    const isCoTaught = !!partner;

    const offering: GradingCourseOffering = {
      id: base.id,
      code: codes.join(' / '),
      title: g.merged ? mergedDisplayTitle(base.title, codes) : base.title,
      groupNumber: base.groupNumber,
      units: Math.max(...g.members.map(m => m.units)),
      courseType: base.courseType,
      isCoTaught,
      isMerged: g.merged,
      mergedCodes: g.merged ? codes : undefined,
      memberOfferingIds: g.merged ? g.memberIds : undefined,
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
  const [uniLogoRow] = universityId
    ? await db.select({ logoUrl: universities.logoUrl }).from(universities).where(eq(universities.id, universityId)).limit(1)
    : [];
  const universityLogoUrl = uniLogoRow?.logoUrl || (await getSetting('UNIVERSITY_LOGO').catch(() => '')) || null;

  const professorData = {
    id: me.id,
    name: user.name,
    staffCode: me.staffCode,
    universityTitle: uniTitle ?? '',
    universityLogoUrl,
  };

  return (
    <div className="space-y-3">
      <ProfessorTermFilterBanner selectedTerm={selectedTerm} universityId={universityId} />
      <ProfessorGradesClient
        professor={professorData}
        termTitle={termTitle}
        initialOfferings={initialOfferings}
        defaultOfferingId={resolvedDefaultOfferingId}
      />
    </div>
  );
}