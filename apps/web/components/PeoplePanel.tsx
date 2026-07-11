'use client';
import { useState, useTransition } from 'react';
import type { Member } from '@/lib/api';
import { addMember, deleteMember, assignPost, unassignPost } from '@/app/company/[id]/actions';

interface PostOpt { id: string; name: string; division: string }

export default function PeoplePanel({ companyId, members, posts }: { companyId: string; members: Member[]; posts: PostOpt[] }) {
  const [pending, start] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [tg, setTg] = useState('');

  const card = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' } as const;
  const muted = { color: 'hsl(var(--muted-foreground))' } as const;
  const input = { background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '7px 10px', color: 'inherit', fontSize: 13 } as const;
  const btn = { background: 'hsl(var(--primary))', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer' } as const;

  const submitAdd = () => {
    if (!first.trim()) return;
    start(async () => {
      await addMember(companyId, { firstName: first.trim(), lastName: last.trim() || undefined, telegramUsername: tg.trim().replace(/^@/, '') || undefined });
      setFirst(''); setLast(''); setTg(''); setShowAdd(false);
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Працівники ({members.length})</h2>
        <button style={btn} onClick={() => setShowAdd((s) => !s)}>{showAdd ? 'Скасувати' : '+ Додати працівника'}</button>
      </div>

      {showAdd && (
        <div style={{ ...card, padding: 14, marginBottom: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input style={input} placeholder="Ім'я" value={first} onChange={(e) => setFirst(e.target.value)} />
          <input style={input} placeholder="Прізвище" value={last} onChange={(e) => setLast(e.target.value)} />
          <input style={input} placeholder="@нікнейм у Telegram" value={tg} onChange={(e) => setTg(e.target.value)} />
          <button style={btn} disabled={pending} onClick={submitAdd}>{pending ? '…' : 'Додати'}</button>
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {members.map((m) => {
          const heldIds = new Set(m.posts.map((p) => p.postUnitId));
          const free = posts.filter((p) => !heldIds.has(p.id));
          return (
            <div key={m.id} style={{ ...card, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {m.photoUrl ? (
                    <img src={m.photoUrl} alt="" style={{ width: 36, height: 36, borderRadius: '50%' }} />
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'hsl(var(--muted))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                      {m.firstName[0]}{m.lastName?.[0] ?? ''}
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{m.firstName} {m.lastName ?? ''}</div>
                    {m.telegramUsername && <div style={{ fontSize: 12, ...muted }}>@{m.telegramUsername}</div>}
                  </div>
                </div>
                <button
                  onClick={() => start(() => deleteMember(companyId, m.id))}
                  style={{ background: 'transparent', border: '1px solid hsl(var(--border))', color: 'hsl(var(--muted-foreground))', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
                >
                  Видалити
                </button>
              </div>

              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {m.posts.map((p) => (
                  <span key={p.postUnitId} style={{ fontSize: 12, background: 'hsl(var(--muted))', borderRadius: 6, padding: '3px 8px', display: 'flex', gap: 6, alignItems: 'center' }}>
                    {p.postUnit.name}
                    <button onClick={() => start(() => unassignPost(companyId, m.id, p.postUnitId))} style={{ background: 'none', border: 'none', color: 'hsl(var(--muted-foreground))', cursor: 'pointer', padding: 0, fontSize: 13 }}>×</button>
                  </span>
                ))}
                {free.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => { const v = e.target.value; if (v) start(() => assignPost(companyId, m.id, v)); e.currentTarget.value = ''; }}
                    style={{ ...input, padding: '4px 8px', fontSize: 12 }}
                  >
                    <option value="">+ призначити посаду…</option>
                    {free.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.division}</option>)}
                  </select>
                )}
              </div>
            </div>
          );
        })}
        {!members.length && <p style={muted}>Працівників ще немає. Додай першого — або признач людей ботом.</p>}
      </div>
    </div>
  );
}
