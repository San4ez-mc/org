'use client';
import { useState, useTransition, useMemo } from 'react';
import type { Member } from '@/lib/api';
import { addMember, updateMember, deleteMember, assignPost, unassignPost, generateAccessToken, refreshMemberPhoto } from '@/app/company/[id]/actions';

interface PostOpt { id: string; name: string; division: string }
const PER = 20;

const card = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' } as const;
const muted = { color: 'hsl(var(--muted-foreground))' } as const;
const input = { background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '7px 10px', color: 'inherit', fontSize: 13 } as const;
const btn = { background: 'hsl(var(--primary))', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer' } as const;
const ghost = { background: 'transparent', border: '1px solid hsl(var(--border))', color: 'hsl(var(--muted-foreground))', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer' } as const;

export default function PeoplePanel({ companyId, members, posts }: { companyId: string; members: Member[]; posts: PostOpt[] }) {
  const [pending, start] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [editId, setEditId] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [photoMsg, setPhotoMsg] = useState<Record<string, string>>({});

  const makeLink = (memberId: string) => start(async () => {
    const t = await generateAccessToken(memberId);
    setLinks((l) => ({ ...l, [memberId]: t }));
    try { await navigator.clipboard.writeText(`${location.origin}/me/${t}`); setCopied(memberId); setTimeout(() => setCopied(null), 2000); } catch { /* clipboard недоступний */ }
  });

  const refreshPhoto = (memberId: string) => start(async () => {
    const found = await refreshMemberPhoto(companyId, memberId);
    setPhotoMsg((m) => ({ ...m, [memberId]: found ? '✓ фото оновлено' : 'фото в Telegram не знайдено' }));
    setTimeout(() => setPhotoMsg((m) => { const { [memberId]: _drop, ...rest } = m; return rest; }), 3000);
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return members;
    return members.filter((m) => {
      const name = `${m.firstName} ${m.lastName ?? ''}`.toLowerCase();
      const inPosts = m.posts.some((p) => p.postUnit.name.toLowerCase().includes(s));
      return name.includes(s) || (m.telegramUsername ?? '').toLowerCase().includes(s) || inPosts;
    });
  }, [members, q]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER));
  const cur = Math.min(page, pageCount - 1);
  const shown = filtered.slice(cur * PER, cur * PER + PER);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Працівники ({members.length})</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input style={{ ...input, width: 220 }} placeholder="Пошук по імені чи посаді…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          <button style={btn} onClick={() => setShowAdd((s) => !s)}>{showAdd ? 'Скасувати' : '+ Додати'}</button>
        </div>
      </div>

      {showAdd && <AddForm companyId={companyId} onDone={() => setShowAdd(false)} pending={pending} start={start} />}

      <div style={{ display: 'grid', gap: 10 }}>
        {shown.map((m) => {
          const heldIds = new Set(m.posts.map((p) => p.postUnitId));
          const free = posts.filter((p) => !heldIds.has(p.id));
          const isEdit = editId === m.id;
          return (
            <div key={m.id} style={{ ...card, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {m.photoUrl ? (
                    <img src={m.photoUrl} alt="" style={{ width: 36, height: 36, borderRadius: '50%' }} />
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'hsl(var(--muted))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{m.firstName[0]}{m.lastName?.[0] ?? ''}</div>
                  )}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{m.firstName} {m.lastName ?? ''}</div>
                    <div style={{ fontSize: 11.5, ...muted, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {m.telegramUsername && <span>@{m.telegramUsername}</span>}
                      {m.telegramUserId && <span>tg id: {m.telegramUserId}</span>}
                      {m.email && <span>{m.email}</span>}
                      {m.birthDate && <span>🎂 {new Date(m.birthDate).toLocaleDateString('uk-UA')}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {m.telegramUserId && <button style={ghost} title="Підтягнути аватарку з Telegram" onClick={() => refreshPhoto(m.id)}>📷 Фото з TG</button>}
                  {photoMsg[m.id] && <span style={{ fontSize: 11.5, ...muted }}>{photoMsg[m.id]}</span>}
                  <button style={ghost} title="Особисте посилання входу для працівника" onClick={() => makeLink(m.id)}>🔗 Вхід</button>
                  <button style={ghost} onClick={() => setEditId(isEdit ? null : m.id)}>{isEdit ? 'Закрити' : 'Редагувати'}</button>
                  <button style={ghost} onClick={() => { if (confirm('Видалити працівника?')) start(() => deleteMember(companyId, m.id)); }}>Видалити</button>
                </div>
              </div>

              {links[m.id] && (
                <div style={{ marginTop: 8, padding: '7px 10px', background: 'hsl(var(--background))', borderRadius: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, ...muted }}>Посилання для входу:</span>
                  <code style={{ fontSize: 11.5, wordBreak: 'break-all' }}>{typeof location !== 'undefined' ? `${location.origin}/me/${links[m.id]}` : `/me/${links[m.id]}`}</code>
                  <button style={ghost} onClick={() => makeLink(m.id)}>{copied === m.id ? '✓ скопійовано' : 'копіювати'}</button>
                </div>
              )}

              {isEdit && <EditForm companyId={companyId} member={m} onDone={() => setEditId(null)} pending={pending} start={start} />}

              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {m.posts.map((p) => (
                  <span key={p.postUnitId} style={{ fontSize: 12, background: 'hsl(var(--muted))', borderRadius: 6, padding: '3px 8px', display: 'flex', gap: 6, alignItems: 'center' }}>
                    {p.postUnit.name}
                    <button onClick={() => start(() => unassignPost(companyId, m.id, p.postUnitId))} style={{ background: 'none', border: 'none', color: 'hsl(var(--muted-foreground))', cursor: 'pointer', padding: 0, fontSize: 13 }}>×</button>
                  </span>
                ))}
                {free.length > 0 && (
                  <select defaultValue="" onChange={(e) => { const v = e.target.value; if (v) start(() => assignPost(companyId, m.id, v)); e.currentTarget.value = ''; }} style={{ ...input, padding: '4px 8px', fontSize: 12 }}>
                    <option value="">+ призначити посаду…</option>
                    {free.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.division}</option>)}
                  </select>
                )}
              </div>
            </div>
          );
        })}
        {!filtered.length && <p style={muted}>{q ? 'Нічого не знайдено.' : 'Працівників ще немає.'}</p>}
      </div>

      {pageCount > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 16 }}>
          <button style={ghost} disabled={cur === 0} onClick={() => setPage(cur - 1)}>←</button>
          <span style={{ fontSize: 13, ...muted }}>{cur + 1} / {pageCount}</span>
          <button style={ghost} disabled={cur >= pageCount - 1} onClick={() => setPage(cur + 1)}>→</button>
        </div>
      )}
    </div>
  );
}

type StartFn = (cb: () => void) => void;

function AddForm({ companyId, onDone, pending, start }: { companyId: string; onDone: () => void; pending: boolean; start: StartFn }) {
  const [f, setF] = useState({ firstName: '', lastName: '', telegramUsername: '', telegramUserId: '', email: '', birthDate: '' });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  return (
    <div style={{ ...card, padding: 14, marginBottom: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <input style={input} placeholder="Ім'я" value={f.firstName} onChange={(e) => set('firstName', e.target.value)} />
      <input style={input} placeholder="Прізвище" value={f.lastName} onChange={(e) => set('lastName', e.target.value)} />
      <input style={input} placeholder="@нікнейм" value={f.telegramUsername} onChange={(e) => set('telegramUsername', e.target.value)} />
      <input style={input} placeholder="TG id" value={f.telegramUserId} onChange={(e) => set('telegramUserId', e.target.value)} />
      <input style={input} placeholder="Пошта" value={f.email} onChange={(e) => set('email', e.target.value)} />
      <input style={input} type="date" value={f.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
      <button style={btn} disabled={pending} onClick={() => { if (f.firstName.trim()) { start(() => addMember(companyId, { ...f, telegramUsername: f.telegramUsername.replace(/^@/, '') })); onDone(); } }}>{pending ? '…' : 'Додати'}</button>
    </div>
  );
}

function EditForm({ companyId, member, onDone, pending, start }: { companyId: string; member: Member; onDone: () => void; pending: boolean; start: StartFn }) {
  const [f, setF] = useState({
    firstName: member.firstName, lastName: member.lastName ?? '', telegramUsername: member.telegramUsername ?? '',
    telegramUserId: member.telegramUserId ?? '', email: member.email ?? '', birthDate: member.birthDate ? member.birthDate.slice(0, 10) : '',
  });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  return (
    <div style={{ marginTop: 10, padding: 12, background: 'hsl(var(--background))', borderRadius: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <input style={input} placeholder="Ім'я" value={f.firstName} onChange={(e) => set('firstName', e.target.value)} />
      <input style={input} placeholder="Прізвище" value={f.lastName} onChange={(e) => set('lastName', e.target.value)} />
      <input style={input} placeholder="@нікнейм" value={f.telegramUsername} onChange={(e) => set('telegramUsername', e.target.value)} />
      <input style={input} placeholder="TG id" value={f.telegramUserId} onChange={(e) => set('telegramUserId', e.target.value)} />
      <input style={input} placeholder="Пошта" value={f.email} onChange={(e) => set('email', e.target.value)} />
      <input style={input} type="date" value={f.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
      <button style={btn} disabled={pending} onClick={() => { start(() => updateMember(companyId, member.id, { ...f, telegramUsername: f.telegramUsername.replace(/^@/, '') })); onDone(); }}>{pending ? '…' : 'Зберегти'}</button>
    </div>
  );
}
