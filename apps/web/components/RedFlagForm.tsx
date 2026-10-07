'use client';
import { useState, useTransition } from 'react';
import { raiseRedFlag } from '@/app/me/[token]/actions';

const card = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: 16 } as const;

// Ф4: тихий канал. Повідомлення йде напряму консультанту, повз керівників компанії.
export default function RedFlagForm({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  const send = () => {
    setErr('');
    start(async () => {
      try { await raiseRedFlag(token, text); setSent(true); setText(''); setOpen(false); }
      catch (e) { setErr((e as Error).message); }
    });
  };

  if (sent && !open) {
    return <div style={{ ...card, marginTop: 24, fontSize: 13 }}>✅ Дякуємо. Повідомлення передано конфіденційно, ваш керівник його не бачить.</div>;
  }

  return (
    <div style={{ ...card, marginTop: 24 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>🔒 Конфіденційне повідомлення</div>
      <div style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))', marginTop: 3 }}>
        Якщо щось реально не працює (процес обходять, інструкція не відповідає дійсності) і говорити про це керівнику незручно.
        Побачить лише незалежний консультант платформи. Керівники компанії — ні.
      </div>
      {!open ? (
        <button onClick={() => setOpen(true)} style={{ marginTop: 10, background: 'transparent', color: 'inherit', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '7px 12px', fontSize: 13, cursor: 'pointer' }}>
          Написати
        </button>
      ) : (
        <div style={{ marginTop: 10 }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={4000} placeholder="Що саме не так?"
            style={{ width: '100%', boxSizing: 'border-box', background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: 10, color: 'inherit', fontSize: 13 }} />
          {err && <div style={{ color: '#e07a7a', fontSize: 12.5, marginTop: 6 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={send} disabled={pending} style={{ background: 'hsl(var(--primary))', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>
              {pending ? 'Надсилаю…' : 'Надіслати конфіденційно'}
            </button>
            <button onClick={() => setOpen(false)} style={{ background: 'transparent', color: 'inherit', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>Скасувати</button>
          </div>
        </div>
      )}
    </div>
  );
}
