'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { DriveNode } from '@/lib/drive-types';
import { getDriveTree, saveDriveExclusions } from '@/app/company/[id]/actions';

const card: React.CSSProperties = {
  background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
  borderRadius: 'var(--radius)', padding: 16, margin: '16px 0',
};

/** Порахувати теки/файли у піддереві (для лічильника). */
function countNodes(nodes: DriveNode[]): { folders: number; files: number } {
  let folders = 0, files = 0;
  const walk = (ns: DriveNode[]) => {
    for (const n of ns) {
      if (n.isFolder) { folders++; if (n.children) walk(n.children); }
      else files++;
    }
  };
  walk(nodes);
  return { folders, files };
}

export default function DriveTreeManager({ companyId }: { companyId: string }) {
  const [tree, setTree] = useState<DriveNode[] | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await getDriveTree(companyId);
        if (!alive) return;
        setTree(r.tree ?? []);
        setExcluded(new Set(r.excludedIds ?? []));
      } catch (e) {
        if (alive) setErr('Не вдалось прочитати папку: ' + (e as Error).message + ' (перевір авторизацію Google Drive)');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [companyId]);

  const persist = useCallback((ids: Set<string>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving('saving');
    saveTimer.current = setTimeout(async () => {
      try {
        await saveDriveExclusions(companyId, [...ids]);
        setSaving('saved');
        setTimeout(() => setSaving('idle'), 1500);
      } catch { setSaving('idle'); setErr('Не вдалось зберегти виключення.'); }
    }, 600);
  }, [companyId]);

  const toggle = useCallback((id: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      persist(next);
      return next;
    });
  }, [persist]);

  const stats = tree ? countNodes(tree) : { folders: 0, files: 0 };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>🗂️ Вміст робочої папки</div>
        <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
          {saving === 'saving' && '💾 зберігаю…'}
          {saving === 'saved' && '✅ збережено'}
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))', margin: '0 0 12px', lineHeight: 1.5 }}>
        Познач 🚫 теки чи файли, які система <b>НЕ має читати</b> при індексації (особисте, чернетки, архіви).
        Виключення теки поширюється на весь її вміст. Зміни зберігаються автоматично.
      </p>

      {loading && <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>⏳ Читаю структуру папки з Google Drive…</p>}
      {err && <p style={{ color: 'hsl(0 70% 60%)', fontSize: 12.5 }}>{err}</p>}

      {tree && !loading && (
        <>
          <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginBottom: 8 }}>
            Тек: <b>{stats.folders}</b> · файлів: <b>{stats.files}</b> · виключено позначок: <b>{excluded.size}</b>
          </div>
          {tree.length === 0 ? (
            <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>Папка порожня або немає доступу.</p>
          ) : (
            <div style={{ maxHeight: 520, overflowY: 'auto', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: 8 }}>
              <TreeLevel nodes={tree} level={0} excluded={excluded} ancestorExcluded={false} onToggle={toggle} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TreeLevel({ nodes, level, excluded, ancestorExcluded, onToggle }: {
  nodes: DriveNode[]; level: number; excluded: Set<string>; ancestorExcluded: boolean; onToggle: (id: string) => void;
}) {
  return (
    <div style={{ marginLeft: level ? 14 : 0 }}>
      {nodes.map((n) => (
        <Row key={n.id} node={n} level={level} excluded={excluded} ancestorExcluded={ancestorExcluded} onToggle={onToggle} />
      ))}
    </div>
  );
}

function Row({ node, level, excluded, ancestorExcluded, onToggle }: {
  node: DriveNode; level: number; excluded: Set<string>; ancestorExcluded: boolean; onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(level < 1);
  const selfExcluded = excluded.has(node.id);
  const off = selfExcluded || ancestorExcluded; // ефективно виключено
  const kids = node.children ?? [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 4px', borderRadius: 6, fontSize: 13.5, opacity: off ? 0.5 : 1 }}>
        {/* стрілка розкриття (тільки для тек) */}
        {node.isFolder ? (
          <span onClick={() => setOpen((o) => !o)} style={{ width: 12, cursor: 'pointer', color: 'hsl(var(--muted-foreground))', fontSize: 10 }}>
            {kids.length ? (open ? '▾' : '▸') : ''}
          </span>
        ) : <span style={{ width: 12 }} />}

        <span>{node.isFolder ? '📁' : '📄'}</span>

        <a
          href={node.webViewLink ?? (node.isFolder ? `https://drive.google.com/drive/folders/${node.id}` : `https://drive.google.com/file/d/${node.id}/view`)}
          target="_blank"
          style={{ flex: 1, minWidth: 0, textDecoration: off ? 'line-through' : 'none', color: off ? 'hsl(var(--muted-foreground))' : (node.isFolder ? 'inherit' : 'hsl(var(--primary))'), fontWeight: node.isFolder ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {node.name}
        </a>
        {node.isFolder && !!kids.length && <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>({kids.length})</span>}

        {/* перемикач виключення — недоступний, якщо предок уже виключено */}
        {ancestorExcluded ? (
          <span title="виключено разом із текою-предком" style={{
            flexShrink: 0, fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999,
            background: 'hsl(0 60% 45% / 0.12)', color: 'hsl(0 65% 62%)', border: '1px solid hsl(0 60% 45% / 0.3)',
          }}>🚫 виключено</span>
        ) : (
          <button
            onClick={() => onToggle(node.id)}
            title={selfExcluded ? 'Повернути в індексацію' : 'Виключити з індексації'}
            style={{
              flexShrink: 0, cursor: 'pointer', fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999,
              background: selfExcluded ? 'hsl(0 65% 48%)' : 'transparent',
              color: selfExcluded ? '#fff' : 'hsl(var(--muted-foreground))',
              border: selfExcluded ? '1px solid hsl(0 65% 48%)' : '1px solid hsl(var(--border))',
            }}
          >
            {selfExcluded ? '🚫 виключено' : 'виключити'}
          </button>
        )}
      </div>

      {node.isFolder && open && kids.length > 0 && (
        <TreeLevel nodes={kids} level={level + 1} excluded={excluded} ancestorExcluded={off} onToggle={onToggle} />
      )}
    </div>
  );
}
