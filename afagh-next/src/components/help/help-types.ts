export type HelpShotTone = 'wireframe';

export type HelpShot = {
  n: number;
  caption: string;
  alt: string;
  tone?: HelpShotTone;
};

export type HelpStep = {
  title: string;
  body: string[];
};

export type HelpTable = {
  caption?: string;
  head: string[];
  rows: string[][];
};

export type HelpNoteTone = 'info' | 'ok' | 'warn' | 'danger';

export type HelpNote = {
  tone: HelpNoteTone;
  title: string;
  body: string;
};

export type HelpLink = {
  title: string;
  href: string;
  note?: string;
};

export type HelpTopic = {
  slug: string;
  title: string;
  path: string;
  summary: string;
  keywords: string[];
  updated: string;
  intro: string[];
  steps: HelpStep[];
  tables?: HelpTable[];
  notes?: HelpNote[];
  troubleshooting: string[];
  related?: HelpLink[];
  shots?: HelpShot[];
};

export type HelpSection = {
  key: string;
  title: string;
  icon: string;
  blurb: string;
  topics: HelpTopic[];
};

export type HelpQuickTask = {
  title: string;
  hint: string;
  href: string;
  role: string;
  topicSlug?: string;
};

export type HelpRoleGuide = {
  role: string;
  title: string;
  icon: string;
  audience: string;
  roles: string[];
  landing: string[];
  quickTasks: HelpQuickTask[];
  sections: HelpSection[];
};

export type HelpIndexEntry = {
  role: string;
  roleLabel: string;
  roleIcon: string;
  slug: string;
  title: string;
  section: string;
  sectionKey: string;
  path: string;
  summary: string;
  keywords: string[];
};

export type HelpIndexSection = {
  key: string;
  title: string;
  icon: string;
  blurb: string;
  topics: HelpTopic[];
};