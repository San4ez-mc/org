'use client';
import { useState, useTransition } from 'react';
import { addVacancy } from '@/app/company/[id]/actions';

const inp = { background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 7, padding: '7px 9px', color: 'inherit', fontSize: 13 } as const;

export default function AddVacancy({ companyId, vacantPosts }: { companyId: string; vacantPosts: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [postUnitId, setPostUnitId] = useState('');
  const [description, setDescription] = useState('');
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ background: 'hsl(var(--primary))', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}>
        + Відкрити вакансію
      </button>
    );
  }

  const submit = () => {
    if (!title.trim()) return;
    start(async () => {
      await addVacancy(companyId, { title: title.trim(), postUnitId: postUnitId || undefined, description: description.trim() || undefined });
      setTitle(''); setPostUnitId(''); setDescription(''); setOpen(false);
    });
  };

  return (
    <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--primary))', borderRadius: 'var(--radius)', padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <input autoFocus placeholder="Назва вакансії (напр. Продавець-консультант)" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} style={{ ...inp, width: 260 }} />
      {vacantPosts.length > 0 && (
        <select value={postUnitId} onChange={(e) => setPostUnitId(e.target.value)} style={{ ...inp, maxWidth: 240 }}>
          <option value="">— без прив'язки до посади —</option>
          {vacantPosts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      <input placeholder="Короткий опис (необовʼязково)" value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inp, width: 260 }} />
      <button disabled={pending} onClick={submit} style={{ background: 'hsl(var(--primary))', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}>{pending ? '…' : 'Створити'}</button>
      <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: '1px solid hsl(var(--border))', color: 'hsl(var(--muted-foreground))', borderRadius: 8, padding: '7px 12px', fontSize: 13, cursor: 'pointer' }}>Скасувати</button>
    </div>
  );
}
