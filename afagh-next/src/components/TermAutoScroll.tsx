'use client';

import { useEffect } from 'react';

export default function TermAutoScroll({ targetId }: { targetId: string | null }) {
  useEffect(() => {
    if (!targetId) return;
    const el = document.getElementById(targetId);
    if (!el) return;
    const id = window.setTimeout(() => {
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 60);
    return () => window.clearTimeout(id);
  }, [targetId]);
  return null;
}