'use client';
import { useEffect, useState, useCallback } from 'react';
import type { DriveNode } from '@/lib/drive-types';
import { getStructureProposal, proposeStructure, saveStructureProposal, applyStructure, getDriveTree, type ProposedNode, type StructureProposal } from '@/app/company/[id]/actions';

const card: React.CSSProperties = {
  background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
  borderRadius: 'var(--radius)', padding: 16, margin: '16px 0',
};
const muted: React.CSSProperties = { color: 'hsl(var(--muted-foreground))', fontSize: 12 };
const btn: React.CSSProperties = {
  background: 'hsl(var(--foreground) / 0.10)', color: 'hsl(var(--foreground))',
  border: '1px solid hsl(var(--border))', borderRadius: 9, padding: '9px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
};
const iconBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, padding: '0 4px', color: 'hsl(var(--muted-foreground))',
};

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
function childrenAt(tree: ProposedNode[], path: number[]): ProposedNode[] {
  let arr = tree;
  for (const i of path) { const n = arr[i]; n.children = n.children || []; arr = n.children; }
  return arr;
}

// ── Наявне дерево (ліворуч, read-only) ──
function CurrentTree({ nodes, level = 0 }: { nodes: DriveNode[]; level?: number }) {
  return (
    <div style={{ marginLeft: level ? 12 : 0 }}>
      {nodes.filter((n) => n.isFolder).map((n) => (
        <div key={n.id}>
          <div style={{ fontSize: 12.5, padding: '2px 0' }}>📁 {n.name}</div>
          {n.children && <CurrentTree nodes={n.children} level={level + 1} />}
        </div>
      ))}
    </div>
  );
}

// ── Пропозиція (праворуч, редагована) ──
const descInput: React.CSSProperties = {
  width: '100%', fontSize: 11.5, background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))',
  borderRadius: 5, padding: '2px 6px', color: 'inherit', boxSizing: 'border-box',
};

// #312 План змін — кольори за дією
const ACTION: Record<string, { color: string; label: string }> = {
  keep: { color: 'hsl(142 50% 50%)', label: 'без змін' },
  rename: { color: 'hsl(210 75% 60%)', label: 'перейменовано' },
  move: { color: 'hsl(270 65% 66%)', label: 'перенесено' },
  new: { color: 'hsl(40 80% 58%)', label: 'нова' },
};
const actOf = (n: ProposedNode): string => ACTION[n.action || 'new'] ? (n.action || 'new') : 'new';

function countActions(nodes: ProposedNode[], acc: Record<string, number> = { keep: 0, rename: 0, move: 0, new: 0 }): Record<string, number> {
  for (const n of nodes) { acc[actOf(n)] = (acc[actOf(n)] || 0) + 1; if (n.children) countActions(n.children, acc); }
  return acc;
}

function EditableTree({ nodes, path, onRename, onDelete, onAdd, onDesc }: {
  nodes: ProposedNode[]; path: number[];
  onRename: (p: number[], v: string) => void; onDelete: (p: number[]) => void; onAdd: (p: number[]) => void;
  onDesc: (p: number[], field: 'descUser' | 'descSystem', v: string) => void;
}) {
  return (
    <div style={{ marginLeft: path.length ? 12 : 0 }}>
      {nodes.map((n, i) => {
        const p = [...path, i];
        return (
          <div key={i} style={{ marginBottom: 6, borderLeft: `3px solid ${ACTION[actOf(n)].color}`, paddingLeft: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 12.5 }}>{n.type === 'Таблиця' ? '📊' : n.type === 'Документ' ? '📄' : '📁'}</span>
              <input value={n.name} onChange={(e) => onRename(p, e.target.value)}
                style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500, background: 'transparent', border: '1px solid transparent', borderRadius: 5, padding: '1px 4px', color: 'inherit' }}
                onFocus={(e) => (e.target.style.borderColor = 'hsl(var(--border))')}
                onBlur={(e) => (e.target.style.borderColor = 'transparent')} />
              <span style={{ fontSize: 10, color: ACTION[actOf(n)].color, flexShrink: 0 }}>{ACTION[actOf(n)].label}</span>
              <button style={iconBtn} title="Додати підтеку" onClick={() => onAdd(p)}>＋</button>
              <button style={{ ...iconBtn, color: 'hsl(0 60% 60%)' }} title="Видалити" onClick={() => onDelete(p)}>✕</button>
            </div>
            {(actOf(n) === 'move' || actOf(n) === 'rename') && n.origin && (
              <div style={{ marginLeft: 20, fontSize: 10.5, color: ACTION[actOf(n)].color, opacity: 0.85 }}>← {actOf(n) === 'move' ? 'з' : 'було'}: {n.origin}</div>
            )}
            <div style={{ marginLeft: 20, display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
              <input value={n.descUser || ''} onChange={(e) => onDesc(p, 'descUser', e.target.value)} placeholder="опис для людини — що тут зберігати" style={descInput} />
              <input value={n.descSystem || ''} onChange={(e) => onDesc(p, 'descSystem', e.target.value)} placeholder="⚙ системний опис — ключові слова для авто-розкладки файлів" style={{ ...descInput, color: 'hsl(210 45% 62%)' }} />
            </div>
            {n.children && n.children.length > 0 && (
              <EditableTree nodes={n.children} path={p} onRename={onRename} onDelete={onDelete} onAdd={onAdd} onDesc={onDesc} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// #312 Read-only дерево з описами (для попапу «детальний опис»)
function ReadonlyTree({ nodes, level = 0 }: { nodes: ProposedNode[]; level?: number }) {
  return (
    <div style={{ marginLeft: level ? 16 : 0 }}>
      {nodes.map((n, i) => (
        <div key={i} style={{ marginBottom: 7, borderLeft: `3px solid ${ACTION[actOf(n)].color}`, paddingLeft: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{n.type === 'Таблиця' ? '📊' : n.type === 'Документ' ? '📄' : '📁'} {n.name}
            <span style={{ fontSize: 10, color: ACTION[actOf(n)].color, marginLeft: 6 }}>{ACTION[actOf(n)].label}</span>
            {(actOf(n) === 'move' || actOf(n) === 'rename') && n.origin && <span style={{ fontSize: 10.5, color: ACTION[actOf(n)].color, opacity: 0.85 }}> ← {n.origin}</span>}
          </div>
          {n.descUser && <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', lineHeight: 1.4 }}>{n.descUser}</div>}
          {n.descSystem && <div style={{ fontSize: 11, color: 'hsl(210 45% 62%)', lineHeight: 1.4 }}>⚙ {n.descSystem}</div>}
          {n.children && n.children.length > 0 && <ReadonlyTree nodes={n.children} level={level + 1} />}
        </div>
      ))}
    </div>
  );
}

export default function StructureProposalPanel({ companyId }: { companyId: string }) {
  const [structure, setStructure] = useState<ProposedNode[] | null>(null);
  const [meta, setMeta] = useState<StructureProposal | null>(null);
  const [tree, setTree] = useState<DriveNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState('');
  const [err, setErr] = useState('');
  const [showInfo, setShowInfo] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, t] = await Promise.all([getStructureProposal(companyId), getDriveTree(companyId)]);
      setMeta(p.proposal); setStructure(p.proposal?.structure ?? null); setTree(t.tree ?? []); setDirty(false);
    } catch (e) { setErr((e as Error).message); }
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  async function generate() {
    setLoading(true); setErr(''); setResult('');
    try { const p = await proposeStructure(companyId); setMeta(p); setStructure(p.structure); setDirty(false); }
    catch (e) { setErr('Не вдалось згенерувати: ' + (e as Error).message); }
    finally { setLoading(false); }
  }

  const mutate = (fn: (s: ProposedNode[]) => void) => {
    setStructure((prev) => { const next = clone(prev || []); fn(next); return next; });
    setDirty(true); setResult('');
  };
  const onRename = (p: number[], v: string) => mutate((s) => { childrenAt(s, p.slice(0, -1))[p[p.length - 1]].name = v; });
  const onDelete = (p: number[]) => mutate((s) => { childrenAt(s, p.slice(0, -1)).splice(p[p.length - 1], 1); });
  const onAdd = (p: number[]) => mutate((s) => { childrenAt(s, p).push({ name: 'Нова тека', type: 'folder', descUser: '', descSystem: '' }); });
  const onDesc = (p: number[], field: 'descUser' | 'descSystem', v: string) => mutate((s) => { (childrenAt(s, p.slice(0, -1))[p[p.length - 1]] as any)[field] = v; });

  async function save() {
    if (!structure) return;
    setSaving(true); setErr('');
    try { await saveStructureProposal(companyId, structure); setDirty(false); }
    catch (e) { setErr('Не вдалось зберегти: ' + (e as Error).message); }
    finally { setSaving(false); }
  }

  async function apply() {
    if (!confirm('Створити ці теки на Google Drive? (наявні файли НЕ переміщуються — лише створюються теки нової структури)')) return;
    setApplying(true); setErr(''); setResult('');
    try { const r = await applyStructure(companyId); setResult(`✅ Готово: створено/знайдено ${r.created} тек на Диску.`); }
    catch (e) { setErr('Не вдалось застосувати: ' + (e as Error).message); }
    finally { setApplying(false); }
  }

  const col: React.CSSProperties = { flex: 1, minWidth: 240, border: '1px solid hsl(var(--border))', borderRadius: 10, padding: 10, maxHeight: 480, overflowY: 'auto' };
  const counts = structure ? countActions(structure) : { keep: 0, rename: 0, move: 0, new: 0 };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>🏗️ Пропозиція нової структури папок</div>
          {structure && <button style={{ ...iconBtn, fontSize: 15, border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '2px 7px' }} title="Детальний опис + повне дерево" onClick={() => setShowInfo(true)}>ℹ</button>}
        </div>
        <button style={btn} onClick={generate} disabled={loading}>{loading ? 'Генерую…' : (structure ? '🔄 Перегенерувати' : '🏗️ Згенерувати')}</button>
      </div>
      <p style={{ ...muted, margin: '0 0 12px', lineHeight: 1.5 }}>
        ШІ пропонує структуру (мінімальна реструктуризація, на основі наявних тек). Праворуч редагуй: назви, <b>опис для людини</b> і <b>системний опис</b> (за ним ШІ потім розкладатиме файли — заповнюй уважно!).
        «Застосувати» поки лише <b>створює теки</b>; переміщення файлів — наступний крок (з попереднім списком «що куди»).
      </p>
      {err && <p style={{ color: 'hsl(0 70% 62%)', fontSize: 12.5 }}>{err}</p>}

      {structure ? (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={col}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--muted-foreground))', marginBottom: 8 }}>НАЯВНЕ</div>
              {tree ? <CurrentTree nodes={tree} /> : <span style={muted}>…</span>}
            </div>
            <div style={{ ...col, borderColor: 'hsl(142 40% 30% / 0.5)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'hsl(142 45% 65%)', marginBottom: 8 }}>ПРОПОЗИЦІЯ (редагована)</div>
              <EditableTree nodes={structure} path={[]} onRename={onRename} onDelete={onDelete} onAdd={onAdd} onDesc={onDesc} />
            </div>
          </div>
          {/* #312 Легенда + лічильники плану змін */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontSize: 12 }}>
            {(['keep', 'rename', 'move', 'new'] as const).map((k) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: ACTION[k].color, display: 'inline-block' }} />
                <span style={{ color: 'hsl(var(--muted-foreground))' }}>{ACTION[k].label}: <b style={{ color: 'hsl(var(--foreground))' }}>{counts[k]}</b> тек</span>
              </span>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button style={btn} onClick={save} disabled={saving || !dirty}>{saving ? 'Зберігаю…' : (dirty ? '💾 Зберегти зміни' : '✅ Збережено')}</button>
            <button style={{ ...btn, background: 'hsl(142 40% 20%)', borderColor: 'hsl(142 40% 30%)' }} onClick={apply} disabled={applying || dirty}>
              {applying ? 'Застосовую…' : '📁 Застосувати (створити теки)'}
            </button>
            {dirty && <span style={muted}>спершу збережи зміни</span>}
            {result && <span style={{ fontSize: 12.5, color: 'hsl(142 45% 65%)' }}>{result}</span>}
          </div>
        </>
      ) : !loading && <p style={muted}>Пропозиції ще немає — натисни «Згенерувати».</p>}

      {showInfo && structure && (
        <div onClick={() => setShowInfo(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, overflowY: 'auto' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 14, padding: 20, maxWidth: 760, width: '100%', maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>📋 Детальний опис пропонованої структури</div>
              <button style={{ ...iconBtn, fontSize: 16 }} onClick={() => setShowInfo(false)}>✕</button>
            </div>
            <p style={{ ...muted, marginBottom: 14, lineHeight: 1.5 }}>
              Повне дерево з описами кожної теки: що там зберігати (людський опис) і за якими ознаками система розкладатиме файли (⚙ системний опис). Колір ліворуч = план зміни (див. легенду в панелі).
            </p>
            <ReadonlyTree nodes={structure} />
          </div>
        </div>
      )}
    </div>
  );
}
