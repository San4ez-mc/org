'use client';
import { useState, useTransition } from 'react';
import { cloneFromCompany, type CloneFromResult } from '@/app/portfolio-actions';

const inp = { background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 6, padding: '4px 7px', color: 'inherit', fontSize: 12 } as const;
const btn = { background: 'hsl(var(--primary))', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' } as const;

export default function CloneFromButton({ targetId, options }: { targetId: string; options: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState(options[0]?.id ?? '');
  const [structure, setStructure] = useState(true);
  const [processes, setProcesses] = useState(true);
  const [result, setResult] = useState<CloneFromResult | null>(null);
  const [pending, start] = useTransition();

  if (!options.length) return <span style={{ fontSize: 11.5, color: 'hsl(var(--muted-foreground))' }}>—</span>;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ background: 'transparent', border: '1px solid hsl(var(--border))', color: 'hsl(var(--muted-foreground))', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
        Клонувати з…
      </button>
    );
  }

  const submit = () => {
    if (!sourceId) return;
    start(async () => setResult(await cloneFromCompany(targetId, sourceId, { structure, processes })));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 190 }}>
      <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} style={inp}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <div style={{ display: 'flex', gap: 10, fontSize: 11.5 }}>
        <label style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={structure} onChange={(e) => setStructure(e.target.checked)} /> Посади
        </label>
        <label style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={processes} onChange={(e) => setProcesses(e.target.checked)} /> Процеси
        </label>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button disabled={pending || (!structure && !processes)} onClick={submit} style={btn}>{pending ? '…' : 'Клонувати'}</button>
        <button onClick={() => { setOpen(false); setResult(null); }} style={{ ...btn, background: 'transparent', border: '1px solid hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>✕</button>
      </div>
      {result && (
        <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', margin: 0 }}>
          +{result.created.posts} посад, +{result.created.processes} процесів
          {(result.skipped.posts || result.skipped.processes) ? ` (пропущено ${result.skipped.posts + result.skipped.processes})` : ''}
        </p>
      )}
    </div>
  );
}
