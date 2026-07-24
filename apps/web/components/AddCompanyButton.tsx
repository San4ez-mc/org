'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCompany } from '@/app/actions';

const gradBtn: React.CSSProperties = {
  background: 'linear-gradient(135deg, hsl(0 72% 55%), hsl(350 75% 48%))',
  color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px',
  fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: '0 6px 18px hsl(0 72% 45% / 0.3)',
  display: 'inline-flex', alignItems: 'center', gap: 8,
};
const secBtn: React.CSSProperties = {
  background: 'transparent', color: 'hsl(var(--muted-foreground))',
  border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '10px 16px',
  fontSize: 14, cursor: 'pointer',
};
const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10,
  border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))',
  color: 'inherit', fontSize: 14, outline: 'none',
};

export default function AddCompanyButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [abbr, setAbbr] = useState('');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit() {
    if (!name.trim()) { setErr('Введіть назву.'); return; }
    setErr('');
    start(async () => {
      try {
        const { id } = await createCompany({ name: name.trim(), abbr: abbr.trim() || undefined });
        router.push(`/company/${id}`);
      } catch (e) { setErr((e as Error).message); }
    });
  }

  if (!open) {
    return <button style={gradBtn} onClick={() => setOpen(true)}><span style={{ fontSize: 17, lineHeight: 1 }}>＋</span> Додати компанію</button>;
  }

  return (
    <div
      style={{
        width: 380, background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))', borderRadius: 16, padding: 22,
        boxShadow: '0 20px 50px hsl(222 60% 3% / 0.45)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, background: 'linear-gradient(135deg, hsl(0 72% 55% / 0.2), hsl(350 75% 48% / 0.15))',
          border: '1px solid hsl(0 72% 55% / 0.25)',
        }}>🏢</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Нова компанія</div>
          <div style={{ fontSize: 11.5, color: 'hsl(var(--muted-foreground))' }}>Порожня — наповниш на її сторінці</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        <div>
          <label style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', display: 'block', marginBottom: 5 }}>Назва компанії</label>
          <input style={input} placeholder="Напр. FINEKO" value={name} autoFocus
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', display: 'block', marginBottom: 5 }}>Скорочення <span style={{ opacity: 0.6 }}>— необовʼязково</span></label>
          <input style={input} placeholder="Напр. FIN" value={abbr}
            onChange={(e) => setAbbr(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
      </div>

      <p style={{ fontSize: 11.5, color: 'hsl(var(--muted-foreground))', margin: '14px 0 0', lineHeight: 1.5 }}>
        Орг-структуру, Google Drive-папку та імпорт додаси на сторінці компанії.
      </p>
      {err && <p style={{ color: 'hsl(0 70% 62%)', fontSize: 12.5, margin: '10px 0 0' }}>{err}</p>}

      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <button style={{ ...gradBtn, flex: 1, justifyContent: 'center' }} onClick={submit} disabled={pending}>
          {pending ? 'Створюю…' : 'Створити компанію'}
        </button>
        <button style={secBtn} onClick={() => { setOpen(false); setErr(''); }} disabled={pending}>Скасувати</button>
      </div>
    </div>
  );
}
