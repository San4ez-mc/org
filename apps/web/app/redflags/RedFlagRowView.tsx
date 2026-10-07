'use client';
import { useState, useTransition } from 'react';
import { updateRedFlag, type RedFlagRow } from './actions';

const STATUS: Record<string, string> = { open: 'Нове', checking: 'Перевіряю', closed: 'Закрито', dismissed: 'Відхилено' };
const field = { background: 'hsl(var(--background))', color: 'inherit', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '6px 8px', fontSize: 13 } as const;

export default function RedFlagRowView({ flag }: { flag: RedFlagRow }) {
  const [note, setNote] = useState(flag.adminNote ?? '');
  const [pending, start] = useTransition();
  const save = (data: { status?: string; adminNote?: string }) => start(async () => { await updateRedFlag(flag.id, data); });

  return (
    <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: 14, opacity: pending ? 0.6 : 1 }}>
      <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span>{new Date(flag.createdAt).toLocaleString('uk-UA')}</span>
        <span>{flag.companyName ?? flag.companyId}</span>
        <span>{flag.memberName ?? 'невідомий'}</span>
      </div>
      <div style={{ fontSize: 14, margin: '8px 0', whiteSpace: 'pre-wrap' }}>{flag.text}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={flag.status} onChange={(e) => save({ status: e.target.value })} style={field}>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)}
          onBlur={() => { if (note !== (flag.adminNote ?? '')) save({ adminNote: note }); }}
          placeholder="Моя нотатка" style={{ ...field, flex: 1, minWidth: 200 }} />
      </div>
    </div>
  );
}
