import Link from 'next/link';

export type Crumb = { label: string; href?: string };

export function HelpBreadcrumbs({ trail }: { trail: Crumb[] }) {
  return (
    <nav aria-label="مسیر راهنما" className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
      {trail.map((c, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-slate-300">‹</span>}
          {c.href ? (
            <Link href={c.href} className="rounded px-1 py-0.5 font-bold text-indigo-700 hover:bg-indigo-50 hover:underline">
              {c.label}
            </Link>
          ) : (
            <span className="px-1 py-0.5 font-bold text-slate-700">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export type PrevNextTopic = { role: string; slug: string; title: string } | null;

export function HelpPrevNext({ prev, next, listHref, listLabel }: { prev: PrevNextTopic; next: PrevNextTopic; listHref: string; listLabel: string }) {
  return (
    <div className="mt-8 grid gap-2 sm:grid-cols-3">
      <div>
        {next && (
          <Link
            href={`/help/${next.role}/${next.slug}`}
            className="block rounded-2xl border border-slate-200 bg-white p-3 text-xs hover:border-indigo-300 hover:bg-indigo-50/50"
          >
            <span className="block text-[10px] text-slate-400">موضوع بعدی</span>
            <span className="mt-0.5 block font-black text-slate-800">→ {next.title}</span>
          </Link>
        )}
      </div>
      <Link
        href={listHref}
        className="block rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center text-xs font-black text-slate-600 hover:border-slate-400"
      >
        <span className="block text-lg">📚</span>
        {listLabel}
      </Link>
      <div>
        {prev && (
          <Link
            href={`/help/${prev.role}/${prev.slug}`}
            className="block rounded-2xl border border-slate-200 bg-white p-3 text-left text-xs hover:border-indigo-300 hover:bg-indigo-50/50"
          >
            <span className="block text-[10px] text-slate-400">موضوع قبلی</span>
            <span className="mt-0.5 block font-black text-slate-800">{prev.title} ←</span>
          </Link>
        )}
      </div>
    </div>
  );
}
