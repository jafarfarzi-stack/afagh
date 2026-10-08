import type { HelpIndexEntry, HelpRoleGuide, HelpTopic } from '@/components/help/help-types';
import { studentGuide } from './student';
import { professorGuide } from './professor';
import { adminGuide } from './admin';
import { groupManagerGuide } from './group-manager';
import { sharedGuide } from './shared';

export const HELP_ROLE_ORDER = ['student', 'professor', 'group-manager', 'admin', 'shared'] as const;

export type HelpRoleKey = (typeof HELP_ROLE_ORDER)[number];

const GUIDES: Record<HelpRoleKey, HelpRoleGuide> = {
  student: studentGuide,
  professor: professorGuide,
  'group-manager': groupManagerGuide,
  admin: adminGuide,
  shared: sharedGuide,
};

export function isHelpRoleKey(v: unknown): v is HelpRoleKey {
  return typeof v === 'string' && (HELP_ROLE_ORDER as readonly string[]).includes(v);
}

export function getRoleGuide(role: HelpRoleKey): HelpRoleGuide {
  return GUIDES[role];
}

export function allRoleGuides(): HelpRoleGuide[] {
  return HELP_ROLE_ORDER.map(k => GUIDES[k]);
}

const GUIDE_ROLES: Record<HelpRoleKey, string[]> = {
  student: ['STUDENT'],
  professor: ['PROFESSOR'],
  'group-manager': ['DEP_HEAD'],
  admin: ['ADMIN', 'EDU_EXPERT', 'VICE_EDU', 'FINANCE_EXPERT', 'FINANCE', 'MILITARY_OFFICER', 'ARCHIVE_EXPERT', 'PROCTOR', 'VAULT_MANAGER', 'DEP_HEAD', 'GRADUATION_EXPERT'],
  shared: [],
};

export function canViewGuide(sessionRoles: string[], role: HelpRoleKey): boolean {
  if (sessionRoles.includes('ADMIN')) return true;
  if (role === 'shared') return true;
  return GUIDE_ROLES[role].some(r => sessionRoles.includes(r));
}

export function visibleGuides(sessionRoles: string[]): HelpRoleGuide[] {
  return allRoleGuides().filter(g => canViewGuide(sessionRoles, g.role as HelpRoleKey));
}

export function defaultGuideForRoles(sessionRoles: string[]): HelpRoleKey {
  if (sessionRoles.includes('ADMIN')) return 'admin';
  if (sessionRoles.includes('DEP_HEAD')) return 'group-manager';
  if (sessionRoles.includes('PROFESSOR')) return 'professor';
  if (sessionRoles.includes('STUDENT')) return 'student';
  return 'shared';
}

export function buildHelpIndex(guides: HelpRoleGuide[] = allRoleGuides()): HelpIndexEntry[] {
  const out: HelpIndexEntry[] = [];
  for (const g of guides) {
    for (const s of g.sections) {
      for (const t of s.topics) {
        out.push({
          role: g.role,
          roleLabel: g.title,
          roleIcon: g.icon,
          slug: t.slug,
          title: t.title,
          section: s.title,
          sectionKey: s.key,
          path: t.path,
          summary: t.summary,
          keywords: t.keywords,
        });
      }
    }
  }
  return out;
}

export function findTopic(role: HelpRoleKey, slug: string): { sectionKey: string; sectionTitle: string; topic: HelpTopic } | null {
  const g = GUIDES[role];
  for (const s of g.sections) {
    for (const t of s.topics) {
      if (t.slug === slug) return { sectionKey: s.key, sectionTitle: s.title, topic: t };
    }
  }
  return null;
}

export function topicPrevNext(role: HelpRoleKey, slug: string): { prev: { role: string; slug: string; title: string } | null; next: { role: string; slug: string; title: string } | null } {
  const flat: HelpTopic[] = GUIDES[role].sections.flatMap(s => s.topics);
  const i = flat.findIndex(t => t.slug === slug);
  if (i < 0) return { prev: null, next: null };
  const toNav = (t: HelpTopic | undefined) => (t ? { role: GUIDES[role].role, slug: t.slug, title: t.title } : null);
  return { prev: toNav(flat[i - 1]), next: toNav(flat[i + 1]) };
}

export function countTopics(role: HelpRoleKey): number {
  return GUIDES[role].sections.reduce((n, s) => n + s.topics.length, 0);
}
