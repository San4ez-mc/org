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
          <div key={i} style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 12.5 }}>{n.type === 'Таблиця' ? '📊' : n.type === 'Документ' ? '📄' : '📁'}</span>
              <input value={n.name} onChange={(e) => onRename(p, e.target.value)}
                style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500, background: 'transparent', border: '1px solid transparent', borderRadius: 5, padding: '1px 4px', color: 'inherit' }}
                onFocus={(e) => (e.target.style.borderColor = 'hsl(var(--border))')}
                onBlur={(e) => (e.target.style.borderColor = 'transparent')} />
              <button style={iconBtn} title="Додати підтеку" onClick={() => onAdd(p)}>＋</button>
              <button style={{ ...iconBtn, color: 'hsl(0 60% 60%)' }} title="Видалити" onClick={() => onDelete(p)}>✕</button>
            </div>
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

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>🏗️ Пропозиція нової структури папок</div>
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
    </div>
  );
}
