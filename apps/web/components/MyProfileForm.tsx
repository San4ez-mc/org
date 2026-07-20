'use client';
import { useState, useTransition } from 'react';
import { updateMyProfile } from '@/app/me/[token]/actions';

type Member = { firstName: string; lastName: string | null; telegramUsername?: string | null; email?: string | null; birthDate?: string | null; photoUrl?: string | null };

const card = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: 16 } as const;
const inp: React.CSSProperties = { background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '8px 10px', color: 'inherit', fontSize: 13, width: '100%', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { fontSize: 11.5, color: 'hsl(var(--muted-foreground))', marginBottom: 3 };

// #236 Самореєстрація: працівник доповнює власний профіль після входу за токеном.
export default function MyProfileForm({ token, member }: { token: string; member: Member }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    firstName: member.firstName ?? '',
    lastName: member.lastName ?? '',
    telegramUsername: member.telegramUsername ?? '',
    email: member.email ?? '',
    birthDate: member.birthDate ?? '',
    photoUrl: member.photoUrl ?? '',
  });
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); setDone(false); };

  const save = () => {
    setErr('');
    start(async () => {
      try { await updateMyProfile(token, f); setDone(true); setOpen(false); }
      catch (e) { setErr((e as Error).message); }
    });
  };

  const filled = [member.telegramUsername, member.email, member.birthDate].filter(Boolean).length;

  if (!open) {
    return (
      <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
        <div style={{ fontSize: 13 }}>
          <span style={{ fontWeight: 600 }}>Мій профіль</span>
          <span style={{ color: 'hsl(var(--muted-foreground))' }}> · заповнено {filled}/3 контактів{done ? ' · збережено ✅' : ''}</span>
        </div>
        <button onClick={() => setOpen(true)} style={{ background: 'hsl(var(--primary))', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>
          {filled < 3 ? 'Доповнити профіль' : 'Редагувати'}
        </button>
      </div>
    );
  }

  return (
    <div style={{ ...card, marginBottom: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Мій профіль</div>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        <div><div style={lbl}>Імʼя</div><input style={inp} value={f.firstName} onChange={set('firstName')} /></div>
        <div><div style={lbl}>Прізвище</div><input style={inp} value={f.lastName} onChange={set('lastName')} /></div>
        <div><div style={lbl}>Telegram (@нік)</div><input style={inp} value={f.telegramUsername} onChange={set('telegramUsername')} placeholder="@username" /></div>
        <div><div style={lbl}>Email</div><input style={inp} type="email" value={f.email} onChange={set('email')} /></div>
        <div><div style={lbl}>Дата народження</div><input style={inp} type="date" value={f.birthDate} onChange={set('birthDate')} /></div>
        <div><div style={lbl}>Фото (URL)</div><input style={inp} value={f.photoUrl} onChange={set('photoUrl')} placeholder="https://..." /></div>
      </div>
      {err && <div style={{ fontSize: 12, color: '#e07a7a', marginTop: 8 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={save} disabled={pending} style={{ background: 'hsl(var(--primary))', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>{pending ? 'Зберігаю…' : 'Зберегти'}</button>
        <button onClick={() => setOpen(false)} disabled={pending} style={{ background: 'transparent', border: '1px solid hsl(var(--border))', color: 'inherit', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>Скасувати</button>
      </div>
    </div>
  );
}
