'use client';
import { useState } from 'react';
import type { OrgUnit } from '@/lib/api';

const DIVISION_PAEI: Record<number, 'P' | 'A' | 'E' | 'I'> = { 7: 'E', 1: 'I', 2: 'E', 3: 'A', 4: 'P', 5: 'A', 6: 'I' };
const BOARD_ORDER = [7, 1, 2, 3, 4, 5, 6];
const PAEI_COLOR: Record<string, string> = { P: '#e07a7a', A: '#7a93d6', E: '#6bbf72', I: '#d6b84f' };

export default function OrgBoard({ units }: { units: OrgUnit[] }) {
  const [scale, setScale] = useState(1);
  const divisions = units.filter((u) => u.type === 'DIVISION');
  const byBoard = (n: number) => divisions.find((d) => d.boardNo === n);
  const childrenOf = (id: string, t: OrgUnit['type']) => units.filter((u) => u.parentId === id && u.type === t);

  const admin = byBoard(7);
  const leadership = admin ? childrenOf(admin.id, 'POST') : [];

  const btn = {
    width: 30, height: 30, borderRadius: 8, border: '1px solid hsl(var(--border))',
    background: 'hsl(var(--card))', color: 'hsl(var(--foreground))', cursor: 'pointer', fontSize: 16,
  } as const;

  return (
    <div>
      {/* Панель зуму */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button style={btn} onClick={() => setScale((s) => Math.max(0.4, +(s - 0.1).toFixed(2)))} title="Зменшити">−</button>
        <span style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', width: 44, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
        <button style={btn} onClick={() => setScale((s) => Math.min(1.6, +(s + 0.1).toFixed(2)))} title="Збільшити">+</button>
        <button style={{ ...btn, width: 'auto', padding: '0 10px', fontSize: 12 }} onClick={() => setScale(1)}>Скинути</button>
      </div>

      {/* Полотно борду (горизонтальний скрол) */}
      <div style={{ overflow: 'auto', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', background: 'hsl(var(--background))', padding: 16 }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 'max-content', transition: 'transform 0.12s' }}>
          {/* Керівництво */}
          {leadership.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '10px 18px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}>Керівництво</div>
                <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
                  {leadership.map((p) => (
                    <span key={p.id} style={{ fontSize: 13, fontWeight: 600 }}>
                      {p.name}<span style={{ color: 'hsl(var(--muted-foreground))', fontWeight: 400 }}> · {holder(p)}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 7 відділень в ОДНУ лінію */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            {BOARD_ORDER.map((n) => {
              const d = byBoard(n);
              if (!d) return null;
              const role = DIVISION_PAEI[n];
              const depts = childrenOf(d.id, 'DEPARTMENT');
              const posts = childrenOf(d.id, 'POST');
              return (
                <div key={d.id} style={{ width: 240, flex: '0 0 240px', background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, borderTop: `3px solid ${PAEI_COLOR[role]}`, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{n}. {d.name}</span>
                    <span className={`paei-${role}`} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 5 }}>{role}</span>
                  </div>
                  {d.ckp && <div style={{ fontSize: 10.5, color: 'hsl(var(--muted-foreground))', margin: '4px 0 10px' }}>ЦКП: {d.ckp}</div>}

                  {/* Відділи — під відділенням */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {depts.map((dep) => {
                      const dPosts = childrenOf(dep.id, 'POST');
                      return (
                        <div key={dep.id} style={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 500 }}>{dep.name}</div>
                          {dep.ckp && <div style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>ЦКП: {dep.ckp}</div>}
                          {dPosts.map((p) => (
                            <div key={p.id} style={{ fontSize: 11.5, marginTop: 4 }}>• {p.name}<span style={{ color: 'hsl(var(--muted-foreground))' }}> · {holder(p)}</span></div>
                          ))}
                        </div>
                      );
                    })}
                  </div>

                  {/* Посади прямо у відділенні (тейлоровані) */}
                  {posts.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}>Посади:</div>
                      {posts.map((p) => (
                        <div key={p.id} style={{ fontSize: 11.5, background: 'hsl(var(--muted))', borderRadius: 6, padding: '3px 7px', marginBottom: 4 }}>
                          {p.name}<span style={{ color: 'hsl(var(--muted-foreground))' }}> · {holder(p)}</span>
                        </div>
                      ))}
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

function holder(p: OrgUnit): string {
  return p.isVacant || !p.holderName ? 'вакансія' : p.holderName;
}
