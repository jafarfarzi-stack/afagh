import { notFound } from 'next/navigation';
import { HELP_TABS, getHelpTab, isTabKey } from '../../content';

export async function generateMetadata(props: { params: Promise<{ role: string }> }) {
  const { role } = await props.params;
  const tab = isTabKey(role) ? getHelpTab(role) : null;
  return { title: tab ? `${tab.label} — نسخه چاپی` : 'راهنما' };
}

/**
 * نسخه چاپی تک‌نقش برای تولید PDF (کرومیوم print-to-pdf).
 * مسیر: /help/print/student | professor | group-manager | admin | shared
 * عمداً بدون کروم سایت، سیاه‌روی‌سفید، با page-break برای PDF تمیز.
 */
export default async function HelpPrintPage(props: { params: Promise<{ role: string }> }) {
  const { role } = await props.params;
  if (!isTabKey(role)) notFound();
  const tab = getHelpTab(role);
  const date = new Date().toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div dir="rtl" className="print-guide">
      <style>{`
        .print-guide { font-family: 'Vazirmatn', Tahoma, sans-serif; color: #111; background: #fff; max-width: 720px; margin: 0 auto; padding: 24px; }
        .print-guide h1 { font-size: 22px; font-weight: 800; margin: 0 0 4px; }
        .print-guide .meta { font-size: 11px; color: #555; margin-bottom: 16px; border-bottom: 2px solid #111; padding-bottom: 12px; }
        .print-guide section { margin: 0 0 18px; page-break-inside: avoid; }
        .print-guide h2 { font-size: 15px; font-weight: 800; margin: 0 0 6px; background: #f1f5f9; padding: 6px 10px; border-radius: 8px; }
        .print-guide p, .print-guide li { font-size: 12px; line-height: 1.9; }
        .print-guide ol { margin: 6px 0; padding-right: 20px; }
        .print-guide .note { font-size: 11px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 8px 10px; margin-top: 6px; }
        .print-guide .links { font-size: 11px; color: #333; margin-top: 6px; }
        @media print { .print-guide { max-width: none; padding: 0; } }
      `}</style>

      <h1>
        {tab.icon} {tab.label} — سامانه دانشگاهی آفاق
      </h1>
      <div className="meta">
        {tab.subtitle} · تاریخ صدور: {date}
      </div>

      {tab.sections.map((s, idx) => (
        <section key={s.id}>
          <h2>
            {idx + 1}. {s.icon} {s.title}
          </h2>
          {s.intro && <p>{s.intro}</p>}
          {s.steps && (
            <ol>
              {s.steps.map((st, i) => (
                <li key={i}>{st}</li>
              ))}
            </ol>
          )}
          {s.note && <div className="note">💡 {s.note}</div>}
          {s.links && (
            <div className="links">
              پیوندها در سامانه: {s.links.map(l => `${l.label} (${l.href})`).join(' · ')}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
