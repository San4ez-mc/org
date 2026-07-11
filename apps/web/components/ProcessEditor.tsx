'use client';
import { useState, useTransition } from 'react';
import type { Process, ProcessStep } from '@/lib/api';
import MermaidView from '@/components/MermaidView';
import { updateProcess, deleteProcess } from '@/app/company/[id]/actions';

const card = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' } as const;
const muted = { color: 'hsl(var(--muted-foreground))' } as const;
const input = { background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 7, padding: '6px 9px', color: 'inherit', fontSize: 13, width: '100%' } as const;
const ghost = { background: 'transparent', border: '1px solid hsl(var(--border))', color: 'hsl(var(--muted-foreground))', borderRadius: 7, padding: '4px 10px', fontSize: 12, cursor: 'pointer' } as const;
const primary = { background: 'hsl(var(--primary))', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 13, cursor: 'pointer' } as const;

export default function ProcessEditor({ companyId, process, postTitles }: { companyId: string; process: Process; postTitles: string[] }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(process.name);
  const [description, setDescription] = useState(process.description ?? '');
  const [steps, setSteps] = useState<ProcessStep[]>(process.steps ?? []);
  const [pending, start] = useTransition();

  const setStep = (i: number, k: keyof ProcessStep, v: string) => setSteps((s) => s.map((st, j) => (j === i ? { ...st, [k]: v } : st)));
  const toggleFlag = (i: number, k: 'problem' | 'automatable') => setSteps((s) => s.map((st, j) => (j === i ? { ...st, [k]: !st[k] } : st)));
  const move = (i: number, dir: -1 | 1) => setSteps((s) => { const n = [...s]; const j = i + dir; if (j < 0 || j >= n.length) return s; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const addStep = () => setSteps((s) => [...s, { postTitle: postTitles[0] ?? '', action: '', result: '' }]);
  const removeStep = (i: number) => setSteps((s) => s.filter((_, j) => j !== i));

  const save = () => start(async () => { await updateProcess(companyId, process.id, { name, description, steps }); setEditing(false); });

  const owner = steps.length ? steps[steps.length - 1].postTitle : '';

  return (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {editing ? (
          <input style={{ ...input, width: 320, fontWeight: 600 }} value={name} onChange={(e) => setName(e.target.value)} />
        ) : (
          <div style={{ fontWeight: 600, fontSize: 15 }}>{process.name}</div>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          {editing ? (
            <>
              <button style={primary} disabled={pending} onClick={save}>{pending ? '…' : 'Зберегти'}</button>
              <button style={ghost} onClick={() => { setEditing(false); setName(process.name); setDescription(process.description ?? ''); setSteps(process.steps ?? []); }}>Скасувати</button>
            </>
          ) : (
            <>
              <button style={ghost} onClick={() => setEditing(true)}>Редагувати</button>
              <button style={ghost} onClick={() => { if (confirm('Видалити процес?')) start(() => deleteProcess(companyId, process.id)); }}>Видалити</button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <textarea style={{ ...input, marginTop: 8, minHeight: 44 }} placeholder="Опис процесу" value={description} onChange={(e) => setDescription(e.target.value)} />
      ) : (
        process.description && <div style={{ fontSize: 12.5, ...muted, margin: '6px 0 0' }}>{process.description}</div>
      )}

      {editing ? (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ ...card, padding: 8, display: 'flex', flexDirection: 'column', gap: 6, background: s.problem ? 'rgba(224,122,122,0.07)' : 'hsl(var(--background))' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '30px 180px 1fr 1fr 26px', gap: 8, alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <button style={{ ...ghost, padding: '0 4px', fontSize: 10 }} onClick={() => move(i, -1)}>↑</button>
                  <button style={{ ...ghost, padding: '0 4px', fontSize: 10 }} onClick={() => move(i, 1)}>↓</button>
                </div>
                <select style={input} value={s.postTitle} onChange={(e) => setStep(i, 'postTitle', e.target.value)}>
                  {!postTitles.includes(s.postTitle) && <option value={s.postTitle}>{s.postTitle}</option>}
                  {postTitles.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input style={input} placeholder="Дія" value={s.action} onChange={(e) => setStep(i, 'action', e.target.value)} />
                <input style={input} placeholder="Результат" value={s.result} onChange={(e) => setStep(i, 'result', e.target.value)} />
                <button style={{ ...ghost, padding: '4px 6px' }} onClick={() => removeStep(i)}>×</button>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', paddingLeft: 38 }}>
                <button
                  style={{ ...ghost, ...(s.problem ? { borderColor: '#e07a7a', color: '#e07a7a' } : {}) }}
                  onClick={() => toggleFlag(i, 'problem')}
                >⚠ проблемний</button>
                <button
                  style={{ ...ghost, ...(s.automatable ? { borderColor: '#6ea8fe', color: '#6ea8fe' } : {}) }}
                  onClick={() => toggleFlag(i, 'automatable')}
                >🤖 можна автоматизувати</button>
                <input style={{ ...input, flex: 1, minWidth: 160 }} placeholder="Коментар до блоку" value={s.comment ?? ''} onChange={(e) => setStep(i, 'comment', e.target.value)} />
              </div>
            </div>
          ))}
          <button style={{ ...ghost, alignSelf: 'flex-start' }} onClick={addStep}>+ крок</button>
        </div>
      ) : (
        <>
          {owner && <div style={{ fontSize: 12, ...muted, marginTop: 6 }}>відповідальний за результат: <b>{owner}</b></div>}
          {process.diagram && (
            <div style={{ border: '1px solid hsl(var(--border))', borderRadius: 8, padding: 12, margin: '12px 0 0', background: 'hsl(var(--background))' }}>
              <MermaidView code={process.diagram} id={process.id} />
            </div>
          )}
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(process.steps ?? []).map((s, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '24px 190px 1fr', gap: 10, fontSize: 13, alignItems: 'start' }}>
                <span style={muted}>{i + 1}</span>
                <span><b>{s.postTitle}</b></span>
                <span>
                  {s.action}{s.result && <span style={muted}> → {s.result}</span>}
                  {(s.problem || s.automatable) && (
                    <span style={{ marginLeft: 8, display: 'inline-flex', gap: 6 }}>
                      {s.problem && <span style={{ fontSize: 11, color: '#e07a7a', border: '1px solid #e07a7a', borderRadius: 6, padding: '1px 6px' }}>⚠ проблемний</span>}
                      {s.automatable && <span style={{ fontSize: 11, color: '#6ea8fe', border: '1px solid #6ea8fe', borderRadius: 6, padding: '1px 6px' }}>🤖 автоматизувати</span>}
                    </span>
                  )}
                  {s.comment && <div style={{ ...muted, fontSize: 12, marginTop: 2 }}>💬 {s.comment}</div>}
                  {s.automatable && (
                    <div style={{ fontSize: 11.5, color: '#6ea8fe', marginTop: 3 }}>
                      Цей блок можна автоматизувати — <a href="mailto:olexandrmatsuk@gmail.com" style={{ color: '#6ea8fe' }}>зверніться до Олександра</a>, заощадите час і гроші.
                    </div>
                  )}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
