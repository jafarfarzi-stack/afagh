import type { HelpIndexEntry } from './help-types';

const ARABIC_INDIC = /[\u0660-\u0669\u06f0-\u06f9]/g;
const DIACRITICS = /[\u064b-\u0652\u0670\u0653-\u0655\u06d6-\u06ed]/g;
const TATWEEL = /\u0640/g;
const ZWNJ = /\u200c/g;
const PUNCT = /[\s\u060c\u061b\u061f\u0629\u064b-\u065f\u00ab\u00bb\u2018\u2019\u201c\u201d"()[\]{}<>#*+=~`|\\/\-_.:;!?،۔'"]+/g;

const CHAR_MAP: Array<[RegExp, string]> = [
  [/\u064a/g, '\u06cc'],
  [/\u0649/g, '\u06cc'],
  [/\u0643/g, '\u06a9'],
  [/\u06aa/g, '\u06a9'],
  [/\u0644\u0627/g, '\u0644\u0627'],
  [/\u0629/g, '\u0647'],
  [/\u06c0/g, '\u0647'],
  [/\u0624/g, '\u0648'],
  [/\u0626/g, '\u06cc'],
  [/[\u0623\u0625\u0622\u0671]/g, '\u0627'],
  [TATWEEL, ''],
  [DIACRITICS, ''],
];

export function toLatinDigits(input: string | null | undefined): string {
  return String(input ?? '').replace(ARABIC_INDIC, d => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

export function normalizeHelpText(input: string | null | undefined): string {
  let s = toLatinDigits(String(input ?? '')).toLowerCase();
  for (const [re, to] of CHAR_MAP) s = s.replace(re, to);
  return s.replace(ZWNJ, ' ').replace(PUNCT, ' ').replace(/\s+/g, ' ').trim();
}

export function compactHelpText(input: string | null | undefined): string {
  return normalizeHelpText(input).replace(/\s+/g, '');
}

export function helpTextTokens(input: string | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const token of normalizeHelpText(input).split(' ')) {
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

const FIELD_WEIGHT: Record<string, number> = {
  title: 12,
  keywords: 8,
  summary: 4,
  section: 3,
  path: 2,
};

function fieldsFor(entry: HelpIndexEntry): Array<[string, string, number]> {
  return [
    ['title', normalizeHelpText(entry.title), FIELD_WEIGHT.title],
    ['keywords', normalizeHelpText(entry.keywords.join(' ')), FIELD_WEIGHT.keywords],
    ['summary', normalizeHelpText(entry.summary), FIELD_WEIGHT.summary],
    ['section', normalizeHelpText(entry.section), FIELD_WEIGHT.section],
    ['path', normalizeHelpText(entry.path), FIELD_WEIGHT.path],
  ];
}

export function helpEntrySearchText(entry: HelpIndexEntry): string {
  return normalizeHelpText(
    [entry.title, entry.summary, entry.keywords.join(' '), entry.section, entry.roleLabel].join(' '),
  );
}

export function helpScoreEntry(entry: HelpIndexEntry, query: string): number {
  const tokens = helpTextTokens(query);
  if (tokens.length === 0) return 0;
  const fields = fieldsFor(entry);
  const compact = compactHelpText(helpEntrySearchText(entry));
  let total = 0;
  for (const token of tokens) {
    let best = 0;
    for (const [name, text, weight] of fields) {
      if (!text) continue;
      if (text === token) best = Math.max(best, weight * 3);
      else if (text.includes(token)) best = Math.max(best, weight);
      else if (token.length >= 3 && name === 'title' && compactHelpText(text).includes(token)) {
        best = Math.max(best, weight - 1);
      }
    }
    if (best === 0 && token.length >= 3 && compact.includes(compactHelpText(token))) best = 2;
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

export function searchHelpIndex(
  index: HelpIndexEntry[],
  query: string,
  options: { role?: string | null; limit?: number } = {},
): HelpIndexEntry[] {
  const role = options.role ?? null;
  const pool = role ? index.filter(e => e.role === role) : index;
  const q = normalizeHelpText(query);
  if (!q) return pool.slice(0, options.limit ?? pool.length);
  return pool
    .map(entry => ({ entry, score: helpScoreEntry(entry, q) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, 'fa'))
    .slice(0, options.limit ?? pool.length)
    .map(x => x.entry);
}