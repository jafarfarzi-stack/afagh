// client-safe: no next/headers, no db
export type UniTheme = {
  header: string; badge: string; ring: string; soft: string;
  navPanel: string; navBorder: string; navHover: string; navActive: string; navMuted: string; navInput: string;
};
export const UNI_THEMES: Record<string, UniTheme> = {
  AFAGH: {
    header: 'bg-indigo-950',
    badge: 'bg-indigo-700 hover:bg-indigo-600 border-indigo-500',
    ring: 'border-indigo-700/60',
    soft: 'bg-indigo-900/80 text-indigo-200',
    navPanel: 'bg-indigo-950 border-indigo-700/50',
    navBorder: 'border-indigo-800/60',
    navHover: 'hover:bg-indigo-900/70',
    navActive: 'bg-indigo-700 font-bold',
    navMuted: 'text-indigo-400',
    navInput: 'bg-indigo-900/70 border-indigo-700/60 placeholder:text-indigo-400 focus:border-indigo-400',
  },
  ZARINE: {
    header: 'bg-orange-950',
    badge: 'bg-orange-700 hover:bg-orange-600 border-orange-500',
    ring: 'border-orange-700/60',
    soft: 'bg-orange-900/80 text-orange-200',
    navPanel: 'bg-orange-950 border-orange-700/50',
    navBorder: 'border-orange-800/60',
    navHover: 'hover:bg-orange-900/70',
    navActive: 'bg-orange-700 font-bold',
    navMuted: 'text-orange-400',
    navInput: 'bg-orange-900/70 border-orange-700/60 placeholder:text-orange-400 focus:border-orange-400',
  },
  ALLAME: {
    header: 'bg-emerald-950',
    badge: 'bg-emerald-700 hover:bg-emerald-600 border-emerald-500',
    ring: 'border-emerald-700/60',
    soft: 'bg-emerald-900/80 text-emerald-200',
    navPanel: 'bg-emerald-950 border-emerald-700/50',
    navBorder: 'border-emerald-800/60',
    navHover: 'hover:bg-emerald-900/70',
    navActive: 'bg-emerald-700 font-bold',
    navMuted: 'text-emerald-400',
    navInput: 'bg-emerald-900/70 border-emerald-700/60 placeholder:text-emerald-400 focus:border-emerald-400',
  },
  SHAMS: {
    header: 'bg-rose-950',
    badge: 'bg-rose-700 hover:bg-rose-600 border-rose-500',
    ring: 'border-rose-700/60',
    soft: 'bg-rose-900/80 text-rose-200',
    navPanel: 'bg-rose-950 border-rose-700/50',
    navBorder: 'border-rose-800/60',
    navHover: 'hover:bg-rose-900/70',
    navActive: 'bg-rose-700 font-bold',
    navMuted: 'text-rose-400',
    navInput: 'bg-rose-900/70 border-rose-700/60 placeholder:text-rose-400 focus:border-rose-400',
  },
  NAZHAND: {
    header: 'bg-cyan-950',
    badge: 'bg-cyan-700 hover:bg-cyan-600 border-cyan-500',
    ring: 'border-cyan-700/60',
    soft: 'bg-cyan-900/80 text-cyan-200',
    navPanel: 'bg-cyan-950 border-cyan-700/50',
    navBorder: 'border-cyan-800/60',
    navHover: 'hover:bg-cyan-900/70',
    navActive: 'bg-cyan-700 font-bold',
    navMuted: 'text-cyan-400',
    navInput: 'bg-cyan-900/70 border-cyan-700/60 placeholder:text-cyan-400 focus:border-cyan-400',
  },
};

export function uniTheme(code: string): UniTheme {
  const hit = UNI_THEMES[String(code || '').toUpperCase()];
  if (hit) return hit;
  const palette = Object.values(UNI_THEMES);
  let h = 0;
  const s = String(code || '?');
  for (let i = 0; i < s.length; i++) h = ((h * 31 + s.charCodeAt(i)) >>> 0);
  return palette[h % palette.length];
}

const DOT: Record<string, string> = {
  AFAGH: 'bg-indigo-400', ZARINE: 'bg-orange-400', ALLAME: 'bg-emerald-400',
  SHAMS: 'bg-rose-400', NAZHAND: 'bg-cyan-400',
};
const DOT_FALLBACK = ['bg-indigo-400', 'bg-orange-400', 'bg-emerald-400', 'bg-rose-400', 'bg-cyan-400', 'bg-amber-400', 'bg-teal-400', 'bg-fuchsia-400'];
export function uniDot(code: string): string {
  const c = String(code || '').toUpperCase();
  if (DOT[c]) return DOT[c];
  let h = 0;
  for (let i = 0; i < c.length; i++) h = ((h * 31 + c.charCodeAt(i)) >>> 0);
  return DOT_FALLBACK[h % DOT_FALLBACK.length];
}
