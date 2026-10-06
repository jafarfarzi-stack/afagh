import type { ReportFilters, ReportResult } from './actions';
import { paged, studentWhere } from './actions';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { requireRole } from '@/lib/auth';

export const CARDS = [
  { kind: 'proposal-cap', icon: '🎓', title: 'ظرفیت پروپوزال استادان' },
  { kind: 'pending-requests', icon: '⏳', title: 'درخواست‌های درانتظار' },
  { kind: 'defenses', icon: '🎤', title: 'دفاعیات' },
  { kind: 'proposals', icon: '📄', title: 'پروپوزال' },
  { kind: 'seminars', icon: '💬', title: 'سمینار' },
];

const PROPOSAL_FA: Record<string, string> = {
  NOT_STARTED: 'شروع‌نشده',
  SUBMITTED: 'ثبت‌شده',
  SIMILARITY_CHECK: 'بررسی همانندی',
  SIMILARITY_PASSED: 'همانندی قبول',
  SIMILARITY_HIGH: 'همانندی بالا',
  EXPERT_REVIEW: 'بررسی کارشناس',
  APPROVED: 'تصویب‌شده',
  REJECTED: 'ردشده',
  PRIOR_REJECTED: 'رد استعلام پیشین',
};

const DEFREQ_FA: Record<string, string> = {
  NOT_REQUESTED: 'درخواست نشده',
  SUPERVISOR_REVIEW: 'بررسی استاد راهنما',
  SUPERVISOR_REJECTED: 'رد استاد راهنما',
  EXPERT_REVIEW: 'بررسی کارشناس',
  SCHEDULED: 'زمان‌بندی‌شده',
  CONDUCTED: 'برگزارشده',
  PASSED: 'قبول',
  FAILED: 'مردود',
};

const SESSION_FA: Record<string, string> = {
  SCHEDULED: 'زمان‌بندی‌شده',
  CONDUCTED: 'برگزارشده',
  CANCELLED: 'لغوشده',
  RESCHEDULED: 'زمان‌بندی مجدد',
};

const RESULT_FA: Record<string, string> = {
  PASSED: 'قبول',
  FAILED: 'مردود',
  CONDITIONAL: 'مشروط',
};

const fa = (m: Record<string, string>, v: unknown) => m[String(v ?? '')] ?? String(v ?? '—');

const THESIS_FROM = sql`FROM thesis_progress tp
  JOIN students s ON s.id = tp."studentId"
  JOIN users u ON u.id = s."userId"
  LEFT JOIN majors m ON m.id = s."majorId"
  LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
  LEFT JOIN staff sup ON sup.id = tp."supervisorId"
  LEFT JOIN users su ON su.id = sup."userId"`;

const PROPOSAL_PENDING = sql`tp."proposalStatus" IN ('SUBMITTED','SIMILARITY_CHECK','SIMILARITY_PASSED','SIMILARITY_HIGH','EXPERT_REVIEW')`;
const DEFENSE_PENDING = sql`tp."defenseRequestStatus" IN ('SUPERVISOR_REVIEW','EXPERT_REVIEW','SCHEDULED')`;

export async function run(kind: string, f: ReportFilters): Promise<ReportResult | null> {
  await requireRole(['ADMIN', 'EDU_EXPERT']);

  switch (kind) {
    // ── پروپوزال‌ها ──
    case 'proposals': {
      const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name,
        m.name AS major, d.title AS degree, s."entryYear" AS y,
        tp."titleFa" AS title, su."firstName" || ' ' || su."lastName" AS supervisor,
        tp."proposalStatus" AS pst, tp."proposalSubmittedAt" AS submitted`;
      const r = await paged(
        [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'major', title: 'رشته' }, { key: 'degree', title: 'مقطع' },
          { key: 'y', title: 'ورودی' }, { key: 'title', title: 'عنوان پایان‌نامه' },
          { key: 'supervisor', title: 'استاد راهنما' }, { key: 'pst', title: 'وضعیت پروپوزال' },
          { key: 'submitted', title: 'تاریخ ثبت' },
        ],
        THESIS_FROM, studentWhere(f), cols,
        sql`ORDER BY tp."proposalSubmittedAt" DESC NULLS LAST, s."studentCode"`, f,
      );
      r.rows = r.rows.map(x => ({ ...x, pst: fa(PROPOSAL_FA, x.pst) }));
      r.summary = `${r.total.toLocaleString('fa-IR')} پرونده پروپوزال`;
      return r;
    }

    // ── دفاعیات (جلسات زمان‌بندی‌شده) ──
    case 'defenses': {
      const from = sql`FROM defense_sessions ds
        JOIN thesis_progress tp ON tp.id = ds."thesisProgressId"
        JOIN students s ON s.id = ds."studentId"
        JOIN users u ON u.id = s."userId"
        LEFT JOIN majors m ON m.id = s."majorId"
        LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
        LEFT JOIN staff sup ON sup.id = ds."supervisorId"
        LEFT JOIN users su ON su.id = sup."userId"
        LEFT JOIN classrooms r ON r.id = ds."roomId"`;
      const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name,
        m.name AS major, d.title AS degree,
        ds."scheduledAt" AS scheduled, r.name AS room,
        su."firstName" || ' ' || su."lastName" AS supervisor,
        ds.status AS st, ds.result AS res`;
      const r = await paged(
        [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'major', title: 'رشته' }, { key: 'degree', title: 'مقطع' },
          { key: 'scheduled', title: 'زمان دفاع' }, { key: 'room', title: 'سالن' },
          { key: 'supervisor', title: 'استاد راهنما' }, { key: 'st', title: 'وضعیت جلسه' },
          { key: 'res', title: 'نتیجه' },
        ],
        from, studentWhere(f), cols,
        sql`ORDER BY ds."scheduledAt" DESC NULLS LAST, s."studentCode"`, f,
      );
      r.rows = r.rows.map(x => ({ ...x, st: fa(SESSION_FA, x.st), res: x.res == null ? '—' : fa(RESULT_FA, x.res) }));
      const agg = await db.execute<{ n: string }>(
        sql`SELECT COUNT(*)::int AS n FROM defense_sessions ds WHERE ds.status = 'SCHEDULED'`,
      );
      const scheduled = Number(agg.rows[0]?.n ?? 0);
      r.summary = `${r.total.toLocaleString('fa-IR')} جلسه دفاع — ${scheduled.toLocaleString('fa-IR')} زمان‌بندی‌شده`;
      return r;
    }

    // ── درخواست‌های درانتظار (پروپوزال/دفاع) ──
    case 'pending-requests': {
      const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name,
        m.name AS major, d.title AS degree,
        tp."titleFa" AS title, su."firstName" || ' ' || su."lastName" AS supervisor,
        CASE WHEN ${DEFENSE_PENDING} AND ${PROPOSAL_PENDING} THEN 'پروپوزال + دفاع'
             WHEN ${DEFENSE_PENDING} THEN 'دفاع'
             ELSE 'پروپوزال' END AS req,
        tp."proposalStatus" AS pst, tp."defenseRequestStatus" AS dst,
        tp."proposalSubmittedAt" AS submitted, tp."defenseRequestedAt" AS requested`;
      const r = await paged(
        [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'major', title: 'رشته' }, { key: 'degree', title: 'مقطع' },
          { key: 'title', title: 'عنوان پایان‌نامه' }, { key: 'supervisor', title: 'استاد راهنما' },
          { key: 'req', title: 'نوع درخواست' }, { key: 'pst', title: 'وضعیت پروپوزال' },
          { key: 'dst', title: 'وضعیت دفاع' }, { key: 'submitted', title: 'ثبت پروپوزال' },
          { key: 'requested', title: 'درخواست دفاع' },
        ],
        THESIS_FROM, [...studentWhere(f), sql`(${PROPOSAL_PENDING} OR ${DEFENSE_PENDING})`], cols,
        sql`ORDER BY s."studentCode"`, f,
      );
      r.rows = r.rows.map(x => ({ ...x, pst: fa(PROPOSAL_FA, x.pst), dst: fa(DEFREQ_FA, x.dst) }));
      r.summary = `${r.total.toLocaleString('fa-IR')} درخواست درانتظار (پروپوزال/دفاع)`;
      return r;
    }

    // ── NEEDS-SCHEMA: ظرفیت پروپوزال استادان ──
    // سقف ظرفیت راهنمایی در هیچ جدولی تعریف نشده (فقط بار فعلی از
    // thesis_progress.supervisorId قابل شمارش است، نه «ظرفیت/باقی‌مانده»).
    // DDL پیشنهادی:
    //   CREATE TABLE supervisor_proposal_capacity (
    //     id SERIAL PRIMARY KEY,
    //     "staffId" INTEGER NOT NULL REFERENCES staff(id),
    //     "academicYear" INTEGER NOT NULL,
    //     "maxActive" INTEGER NOT NULL DEFAULT 6,
    //     "universityId" INTEGER REFERENCES universities(id),
    //     UNIQUE ("staffId", "academicYear")
    //   );
    case 'proposal-cap':
    // ── NEEDS-SCHEMA: سمینار ──
    // هیچ جدول سمیناری در schema.ts وجود ندارد (grep seminar → صفر).
    // DDL پیشنهادی:
    //   CREATE TABLE seminars (
    //     id SERIAL PRIMARY KEY,
    //     "studentId" INTEGER NOT NULL REFERENCES students(id),
    //     "thesisProgressId" INTEGER REFERENCES thesis_progress(id),
    //     title VARCHAR(300) NOT NULL,
    //     "scheduledAt" TIMESTAMP,
    //     "roomId" INTEGER REFERENCES classrooms(id),
    //     "supervisorId" INTEGER REFERENCES staff(id),
    //     status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED',
    //     score NUMERIC(4,2),
    //     "universityId" INTEGER REFERENCES universities(id),
    //     "createdAt" TIMESTAMP DEFAULT NOW()
    //   );
    //   CREATE INDEX idx_seminars_student ON seminars("studentId");
    case 'seminars':
      return null;

    default:
      return null;
  }
}
