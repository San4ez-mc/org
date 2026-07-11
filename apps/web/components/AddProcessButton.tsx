'use client';
import { useState, useTransition } from 'react';
import { addProcess } from '@/app/company/[id]/actions';

export default function AddProcessButton({ companyId }: { companyId: string }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [pending, start] = useTransition();

  if (!adding) {
    return (
      <button onClick={() => setAdding(true)} style={{ background: 'hsl(var(--primary))', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}>
        + Додати процес
      </button>
    );
  }
  return (
    <span style={{ display: 'flex', gap: 6 }}>
      <input
        autoFocus
        value={name}
        placeholder="Назва процесу"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { start(() => addProcess(companyId, name.trim())); setName(''); setAdding(false); } if (e.key === 'Escape') setAdding(false); }}
        style={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--primary))', borderRadius: 8, padding: '7px 10px', color: 'inherit', fontSize: 13 }}
      />
      <button disabled={pending} onClick={() => { if (name.trim()) { start(() => addProcess(companyId, name.trim())); setName(''); setAdding(false); } }} style={{ background: 'hsl(var(--primary))', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 13, cursor: 'pointer' }}>{pending ? '…' : 'ОК'}</button>
    </span>
  );
}
