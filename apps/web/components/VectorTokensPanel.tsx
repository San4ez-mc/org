'use client';
import { useEffect, useState, useCallback } from 'react';
import type { DriveNode } from '@/lib/drive-types';
import { getDriveTree, getVectorTokens, createVectorToken, deleteVectorToken, type VectorTokenRow } from '@/app/company/[id]/actions';

const card: React.CSSProperties = {
  background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
  borderRadius: 'var(--radius)', padding: 16, margin: '16px 0',
};
const btn: React.CSSProperties = {
  background: 'hsl(var(--foreground) / 0.10)', color: 'hsl(var(--foreground))',
  border: '1px solid hsl(var(--border))', borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

function mask(t: string) { return t.length > 14 ? `${t.slice(0, 10)}…${t.slice(-4)}` : t; }

export default function VectorTokensPanel({ companyId }: { companyId: string }) {
  const [tokens, setTokens] = useState<VectorTokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [tree, setTree] = useState<DriveNode[] | null>(null);
  const [label, setLabel] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [freshToken, setFreshToken] = useState<{ token: string; label: string } | null>(null);

  const load = useCallback(async () => {
    try { const r = await getVectorTokens(companyId); setTokens(r.tokens || []); }
    catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  async function openCreate() {
    setShowCreate(true); setFreshToken(null);
    if (!tree) { try { const r = await getDriveTree(companyId); setTree(r.tree ?? []); } catch { /* ignore */ } }
  }

  function toggleFolder(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function submit() {
    if (!selected.size) return;
    setCreating(true); setErr('');
    try {
      const r = await createVectorToken(companyId, [...selected], label.trim() || 'Токен');
      setFreshToken({ token: r.token, label: r.label });
      setSelected(new Set()); setLabel(''); setShowCreate(false);
      await load();
    } catch (e) { setErr('Не вдалось створити токен: ' + (e as Error).message); }
    finally { setCreating(false); }
  }

  async function remove(token: string) {
    if (!confirm('Видалити цей токен? Воронки, що ним користуються, втратять доступ.')) return;
    await deleteVectorToken(companyId, token).catch(() => {});
    await load();
  }

  return (
    <div style={card}>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🔑 Токени доступу до бази знань</div>
      <p style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))', margin: '0 0 12px', lineHeight: 1.5 }}>
        Вектор шукає по всій папці компанії. Щоб дати воронці (напр. Контент-менеджеру) доступ <b>лише до частини папок</b> —
        створи окремий токен, обмежений на потрібні теки, і встав його у воронку. Обмеження поширюється й на підпапки.
      </p>

      {err && <p style={{ color: 'hsl(0 70% 62%)', fontSize: 12.5 }}>{err}</p>}

      {freshToken && (
        <div style={{ background: 'hsl(142 40% 16%)', border: '1px solid hsl(142 40% 30%)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 12.5, color: 'hsl(142 45% 80%)', marginBottom: 6 }}>✅ Новий токен «{freshToken.label}» — скопіюй зараз:</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{ flex: 1, fontSize: 12, background: 'hsl(var(--background))', padding: '6px 8px', borderRadius: 6, wordBreak: 'break-all' }}>{freshToken.token}</code>
            <button style={btn} onClick={() => navigator.clipboard?.writeText(freshToken.token)}>копі</button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>Завантаження…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {tokens.map((t) => (
            <div key={t.token} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 500, flexShrink: 0 }}>{t.isRoot ? '🌐' : '🔒'} {t.label}</span>
              <span style={{ fontSize: 11.5, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }}>
                {t.isRoot ? 'вся папка' : `${t.folderScope?.length ?? 0} тек`}
              </span>
              <code style={{ flex: 1, fontSize: 11.5, color: 'hsl(var(--muted-foreground))', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{mask(t.token)}</code>
              <button onClick={() => navigator.clipboard?.writeText(t.token)} style={{ ...btn, padding: '4px 8px', fontSize: 11 }}>копі</button>
              {!t.isRoot && <button onClick={() => remove(t.token)} style={{ ...btn, padding: '4px 8px', fontSize: 11, color: 'hsl(0 65% 62%)' }}>✕</button>}
            </div>
          ))}
          {tokens.length === 0 && <p style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))' }}>Токенів ще немає (спершу проіндексуй папку).</p>}
        </div>
      )}

      {!showCreate ? (
        <button style={btn} onClick={openCreate} disabled={tokens.length === 0}>➕ Створити токен на папки</button>
      ) : (
        <div style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, padding: 12 }}>
          <input
            value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Назва токена (напр. Контент-менеджер — маркетинг)"
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))', color: 'inherit', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }}
          />
          <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginBottom: 6 }}>Обери теки, до яких дозволити доступ (галочка = тека + її підпапки):</div>
          <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: 8, marginBottom: 10 }}>
            {tree === null ? <p style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))' }}>Читаю дерево…</p>
              : <FolderPicker nodes={tree} selected={selected} onToggle={toggleFolder} />}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btn} onClick={submit} disabled={creating || !selected.size}>{creating ? 'Створюю…' : `Створити (${selected.size} тек)`}</button>
            <button style={{ ...btn, background: 'transparent', color: 'hsl(var(--muted-foreground))' }} onClick={() => { setShowCreate(false); setSelected(new Set()); }}>Скасувати</button>
          </div>
        </div>
      )}
    </div>
  );
}

function FolderPicker({ nodes, selected, onToggle, level = 0 }: { nodes: DriveNode[]; selected: Set<string>; onToggle: (id: string) => void; level?: number }) {
  return (
    <div style={{ marginLeft: level ? 16 : 0 }}>
      {nodes.filter((n) => n.isFolder).map((n) => (
        <FolderRow key={n.id} node={n} selected={selected} onToggle={onToggle} level={level} />
      ))}
    </div>
  );
}

function FolderRow({ node, selected, onToggle, level }: { node: DriveNode; selected: Set<string>; onToggle: (id: string) => void; level: number }) {
  const [open, setOpen] = useState(level < 1);
  const subFolders = (node.children ?? []).filter((c) => c.isFolder);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 2px', fontSize: 13 }}>
        {subFolders.length ? (
          <span onClick={() => setOpen((o) => !o)} style={{ width: 12, cursor: 'pointer', color: 'hsl(var(--muted-foreground))', fontSize: 10 }}>{open ? '▾' : '▸'}</span>
        ) : <span style={{ width: 12 }} />}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', minWidth: 0 }}>
          <input type="checkbox" checked={selected.has(node.id)} onChange={() => onToggle(node.id)} />
          <span>📁</span>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
        </label>
      </div>
      {open && subFolders.length > 0 && <FolderPicker nodes={subFolders} selected={selected} onToggle={onToggle} level={level + 1} />}
    </div>
  );
}
