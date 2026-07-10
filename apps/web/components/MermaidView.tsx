'use client';
import { useEffect, useRef, useState } from 'react';

let mermaidInit = false;

export default function MermaidView({ code, id }: { code: string; id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        if (!mermaidInit) {
          mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose', flowchart: { htmlLabels: true } });
          mermaidInit = true;
        }
        const { svg } = await mermaid.render(`m_${id}`, code);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (err) {
    return <pre style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', whiteSpace: 'pre-wrap', overflow: 'auto' }}>{code}</pre>;
  }
  return <div ref={ref} style={{ overflow: 'auto' }} />;
}
