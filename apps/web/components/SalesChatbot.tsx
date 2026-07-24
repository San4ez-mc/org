'use client';
import { useState } from 'react';

type Msg = { from: 'bot' | 'user'; text: string };

const GREETING: Msg = {
  from: 'bot',
  text: 'Привіт! 👋 Я — асистент Живої Орг.Платформи. Допоможу зрозуміти, як перетворити ваш бізнес на керовану систему: жива орг-структура, процеси, посадові інструкції та ШІ-аналітика. Що вас цікавить?',
};
const QUICK = ['Що це дає власнику?', 'Скільки це коштує?', 'Як почати?'];

// Заготовки відповідей (потім підключимо реальний бот)
const STUB: Record<string, string> = {
  'Що це дає власнику?': 'Ви бачите весь бізнес як живу систему: хто за що відповідає, де вузькі місця, наскільки компанія залежить від вас особисто — і як цю залежність знижувати.',
  'Скільки це коштує?': 'Вартість залежить від розміру компанії й обсягу впровадження. Лишіть контакт — консультант підготує пропозицію саме під вас.',
  'Як почати?': 'Починаємо з діагностики: підключаємо вашу структуру (навіть із Google Drive), і за кілька тижнів у вас жива, несуперечлива модель бізнесу.',
};

export default function SalesChatbot() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState('');

  function send(text: string) {
    const t = text.trim();
    if (!t) return;
    const reply = STUB[t] ?? 'Дякую! Це демо-версія асистента — скоро я відповідатиму на будь-які питання. А поки лишіть контакт, і консультант звʼяжеться з вами. 🙌';
    setMsgs((m) => [...m, { from: 'user', text: t }, { from: 'bot', text: reply }]);
    setInput('');
  }

  return (
    <div style={{ position: 'fixed', right: 22, bottom: 22, zIndex: 50, fontFamily: 'inherit' }}>
      {open && (
        <div
          style={{
            position: 'absolute', bottom: 74, right: 0, width: 330,
            background: 'hsl(222 32% 11% / 0.96)', backdropFilter: 'blur(12px)',
            border: '1px solid hsl(0 0% 100% / 0.1)', borderRadius: 16,
            boxShadow: '0 24px 60px hsl(222 60% 2% / 0.6)', overflow: 'hidden',
            display: 'flex', flexDirection: 'column', maxHeight: 460,
          }}
        >
          {/* Хедер */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', borderBottom: '1px solid hsl(0 0% 100% / 0.08)', background: 'linear-gradient(135deg, hsl(0 72% 55% / 0.18), transparent)' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: 'linear-gradient(135deg, hsl(0 72% 55%), hsl(350 75% 48%))' }}>🤖</div>
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>Асистент FINEKO</div>
              <div style={{ fontSize: 11, color: 'hsl(142 50% 60%)' }}>● на звʼязку</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Закрити" style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'hsl(215 20% 65%)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>

          {/* Стрічка повідомлень */}
          <div style={{ padding: 12, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ alignSelf: m.from === 'bot' ? 'flex-start' : 'flex-end', maxWidth: '85%' }}>
                <div style={{
                  fontSize: 12.8, lineHeight: 1.45, padding: '9px 12px', borderRadius: 12,
                  background: m.from === 'bot' ? 'hsl(222 20% 18%)' : 'linear-gradient(135deg, hsl(0 72% 52%), hsl(350 75% 46%))',
                  color: m.from === 'bot' ? 'hsl(210 20% 92%)' : '#fff',
                  borderTopLeftRadius: m.from === 'bot' ? 3 : 12, borderTopRightRadius: m.from === 'bot' ? 12 : 3,
                }}>{m.text}</div>
              </div>
            ))}
            {msgs.length <= 1 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                {QUICK.map((q) => (
                  <button key={q} onClick={() => send(q)} style={{ fontSize: 11.5, padding: '6px 10px', borderRadius: 999, border: '1px solid hsl(0 72% 55% / 0.4)', background: 'hsl(0 72% 55% / 0.08)', color: 'hsl(0 80% 78%)', cursor: 'pointer' }}>{q}</button>
                ))}
              </div>
            )}
          </div>

          {/* Ввід */}
          <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid hsl(0 0% 100% / 0.08)' }}>
            <input
              value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send(input)}
              placeholder="Напишіть питання…"
              style={{ flex: 1, background: 'hsl(222 20% 8%)', border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '9px 11px', color: 'inherit', fontSize: 12.8, outline: 'none' }}
            />
            <button onClick={() => send(input)} aria-label="Надіслати" style={{ background: 'linear-gradient(135deg, hsl(0 72% 55%), hsl(350 75% 48%))', border: 'none', borderRadius: 10, width: 38, color: '#fff', fontSize: 15, cursor: 'pointer' }}>➤</button>
          </div>
        </div>
      )}

      {/* Плаваюча кнопка */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Чат з асистентом"
        style={{
          width: 60, height: 60, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, hsl(0 72% 55%), hsl(350 75% 46%))',
          boxShadow: '0 10px 30px hsl(0 72% 45% / 0.5)', color: '#fff', fontSize: 26,
          display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
        }}
      >
        {open ? '×' : '🤖'}
        {!open && <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', boxShadow: '0 0 0 0 hsl(0 72% 55% / 0.5)', animation: 'salespulse 2.4s infinite' }} />}
      </button>

      <style>{`@keyframes salespulse{0%{box-shadow:0 0 0 0 hsl(0 72% 55% / .45)}70%{box-shadow:0 0 0 16px hsl(0 72% 55% / 0)}100%{box-shadow:0 0 0 0 hsl(0 72% 55% / 0)}}`}</style>
    </div>
  );
}
