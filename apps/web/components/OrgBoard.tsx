'use client';
import { useState, useTransition } from 'react';
import type { OrgUnit, Member } from '@/lib/api';
import { updateOrgUnit, addPost, deleteUnit } from '@/app/company/[id]/actions';

const DIVISION_PAEI: Record<number, 'P' | 'A' | 'E' | 'I'> = { 7: 'E', 1: 'I', 2: 'E', 3: 'A', 4: 'P', 5: 'A', 6: 'I' };
const BOARD_ORDER = [7, 1, 2, 3, 4, 5, 6];
const PAEI_COLOR: Record<string, string> = { P: '#e07a7a', A: '#7a93d6', E: '#6bbf72', I: '#d6b84f' };

export default function OrgBoard({ units, members, companyId }: { units: OrgUnit[]; members: Member[]; companyId: string }) {
  const [scale, setScale] = useState(1);
  const [showPeople, setShowPeople] = useState(true);

  const divisions = units.filter((u) => u.type === 'DIVISION');
  const byBoard = (n: number) => divisions.find((d) => d.boardNo === n);
  const childrenOf = (id: string, t: OrgUnit['type']) => units.filter((u) => u.parentId === id && u.type === t);

  // Люди на посаді
  const peopleOf = (postId: string): string[] =>
    members.filter((m) => m.posts.some((p) => p.postUnitId === postId)).map((m) => `${m.firstName} ${m.lastName ?? ''}`.trim());

  const admin = byBoard(7);
  const leadership = admin ? childrenOf(admin.id, 'POST') : [];

  const btn = { width: 30, height: 30, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))', cursor: 'pointer', fontSize: 16 } as const;

  const PostChip = ({ p }: { p: OrgUnit }) => {
    const people = peopleOf(p.id);
    const [, startDel] = useTransition();
    return (
      <div style={{ fontSize: 11.5, background: 'hsl(var(--muted))', borderRadius: 6, padding: '3px 7px', marginBottom: 4, display: 'flex', justifyContent: 'space-between', gap: 6 }}>
        <span>
          {p.name}
          {showPeople && <span style={{ color: 'hsl(var(--muted-foreground))' }}> · {people.length ? people.join(', ') : 'вакансія'}</span>}
        </span>
        <button
          title="Видалити посаду"
          onClick={() => { if (confirm(`Видалити посаду «${p.name}»?`)) startDel(() => deleteUnit(companyId, p.id)); }}
          style={{ background: 'none', border: 'none', color: 'hsl(var(--muted-foreground))', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1 }}
        >
          ×
        </button>
      </div>
    );
  };

  const AddPost = ({ parentId }: { parentId: string }) => {
    const [adding, setAdding] = useState(false);
    const [name, setName] = useState('');
    const [, startAdd] = useTransition();
    if (!adding) return <button onClick={() => setAdding(true)} style={{ background: 'none', border: '1px dashed hsl(var(--border))', color: 'hsl(var(--muted-foreground))', borderRadius: 6, padding: '3px 7px', fontSize: 11, cursor: 'pointer', width: '100%', marginTop: 2 }}>+ посада</button>;
    return (
      <input
        autoFocus
        value={name}
        placeholder="Назва посади"
        onChange={(e) => setName(e.target.value)}
        onBlur={() => setAdding(false)}
        onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { startAdd(() => addPost(companyId, parentId, name.trim())); setName(''); setAdding(false); } if (e.key === 'Escape') setAdding(false); }}
        style={{ fontSize: 11.5, background: 'hsl(var(--background))', border: '1px solid hsl(var(--primary))', borderRadius: 6, padding: '3px 6px', width: '100%', marginTop: 2 }}
      />
    );
  };

  return (
    <div>
      {/* Панель інструментів */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button style={btn} onClick={() => setScale((s) => Math.max(0.4, +(s - 0.1).toFixed(2)))} title="Зменшити">−</button>
        <span style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', width: 44, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
        <button style={btn} onClick={() => setScale((s) => Math.min(1.6, +(s + 0.1).toFixed(2)))} title="Збільшити">+</button>
        <button style={{ ...btn, width: 'auto', padding: '0 10px', fontSize: 12 }} onClick={() => setScale(1)}>Скинути</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'hsl(var(--muted-foreground))', cursor: 'pointer' }}>
          <input type="checkbox" checked={showPeople} onChange={(e) => setShowPeople(e.target.checked)} /> показувати людей
        </label>

        <div title="Кольори відділень за системою Адізеса" style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', fontWeight: 600 }}>PAEI (Адізес):</span>
          {([['P', 'Виробник'], ['A', 'Адміністратор'], ['E', 'Підприємець'], ['I', 'Інтегратор']] as const).map(([r, n]) => (
            <span key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: PAEI_COLOR[r] }} /> {r} · {n}
            </span>
          ))}
        </div>
      </div>

      <div style={{ overflow: 'auto', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', background: 'hsl(var(--background))', padding: 16 }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 'max-content', transition: 'transform 0.12s' }}>
          {leadership.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '10px 18px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}>Керівництво</div>
                <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
                  {leadership.map((p) => {
                    const ppl = peopleOf(p.id);
                    return (
                      <span key={p.id} style={{ fontSize: 13, fontWeight: 600 }}>
                        {p.name}{showPeople && <span style={{ color: 'hsl(var(--muted-foreground))', fontWeight: 400 }}> · {ppl.length ? ppl.join(', ') : 'вакансія'}</span>}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            {BOARD_ORDER.map((n) => {
              const d = byBoard(n);
              if (!d) return null;
              const role = DIVISION_PAEI[n];
              const depts = childrenOf(d.id, 'DEPARTMENT');
              const posts = childrenOf(d.id, 'POST');
              return (
                <div key={d.id} style={{ width: 250, flex: '0 0 250px', background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, borderTop: `3px solid ${PAEI_COLOR[role]}`, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Editable companyId={companyId} unitId={d.id} field="name" value={`${n}. ${d.name}`} bold />
                    <span className={`paei-${role}`} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 5 }}>{role}</span>
                  </div>
                  <Editable companyId={companyId} unitId={d.id} field="ckp" value={d.ckp ?? ''} prefix="ЦКП: " small />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    {depts.map((dep) => {
                      const dPosts = childrenOf(dep.id, 'POST');
                      return (
                        <div key={dep.id} style={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: 8 }}>
                          <Editable companyId={companyId} unitId={dep.id} field="name" value={dep.name} />
                          <Editable companyId={companyId} unitId={dep.id} field="ckp" value={dep.ckp ?? ''} prefix="ЦКП: " small />
                          <div style={{ marginTop: 4 }}>
                            {dPosts.map((p) => <PostChip key={p.id} p={p} />)}
                            <AddPost parentId={dep.id} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {posts.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}>Посади:</div>
                      {posts.map((p) => <PostChip key={p.id} p={p} />)}
                      <AddPost parentId={d.id} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Editable({ companyId, unitId, field, value, bold, small, prefix }: { companyId: string; unitId: string; field: 'name' | 'ckp'; value: string; bold?: boolean; small?: boolean; prefix?: string }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const [pending, start] = useTransition();

  const save = () => {
    setEditing(false);
    // для name прибираємо префікс "N. " якщо був
    const clean = field === 'name' ? val.replace(/^\d+\.\s*/, '') : val;
    if (clean !== value.replace(/^\d+\.\s*/, '')) start(() => updateOrgUnit(companyId, unitId, { [field]: clean }));
  };

  const base = { fontSize: bold ? 13 : small ? 10.5 : 12, fontWeight: bold ? 700 : small ? 400 : 500, color: small ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))' } as const;

  if (editing) {
    return (
      <input
        autoFocus
        value={val}
        disabled={pending}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(value); setEditing(false); } }}
        style={{ ...base, background: 'hsl(var(--background))', border: '1px solid hsl(var(--primary))', borderRadius: 5, padding: '2px 5px', width: '95%' }}
      />
    );
  }
  return (
    <div onClick={() => { setVal(value); setEditing(true); }} title="Клікни, щоб редагувати" style={{ ...base, cursor: 'text', margin: small ? '2px 0 0' : 0 }}>
      {prefix}{value || <span style={{ color: 'hsl(var(--muted-foreground))' }}>—</span>}
    </div>
  );
}
