'use client';
import { useEffect, useState, useCallback } from 'react';
import type { DriveNode } from '@/lib/drive-types';
import { getStructureProposal, proposeStructure, getDriveTree, type ProposedNode, type StructureProposal } from '@/app/company/[id]/actions';

const card: React.CSSProperties = {
  background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
  borderRadius: 'var(--radius)', padding: 16, margin: '16px 0',
};
const muted: React.CSSProperties = { color: 'hsl(var(--muted-foreground))', fontSize: 12 };
const btn: React.CSSProperties = {
  background: 'hsl(var(--foreground) / 0.10)', color: 'hsl(var(--foreground))',
  border: '1px solid hsl(var(--border))', borderRadius: 9, padding: '9px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
};

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

function ProposedTree({ nodes, level = 0 }: { nodes: ProposedNode[]; level?: number }) {
  return (
    <div style={{ marginLeft: level ? 12 : 0 }}>
      {nodes.map((n, i) => (
        <div key={i} style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500 }} title={n.descSystem ? `Система: ${n.descSystem}` : ''}>
            {n.type === 'Таблиця' ? '📊' : n.type === 'Документ' ? '📄' : '📁'} {n.name}
          </div>
          {n.descUser && <div style={{ ...muted, marginLeft: 18, lineHeight: 1.4 }}>{n.descUser}</div>}
          {n.children && n.children.length > 0 && <ProposedTree nodes={n.children} level={level + 1} />}
        </div>
      ))}
    </div>
  );
}

export default function StructureProposalPanel({ companyId }: { companyId: string }) {
  const [proposal, setProposal] = useState<StructureProposal | null>(null);
  const [tree, setTree] = useState<DriveNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const [p, t] = await Promise.all([getStructureProposal(companyId), getDriveTree(companyId)]);
      setProposal(p.proposal); setTree(t.tree ?? []);
    } catch (e) { setErr((e as Error).message); }
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  async function generate() {
    setLoading(true); setErr('');
    try { setProposal(await proposeStructure(companyId)); }
    catch (e) { setErr('Не вдалось згенерувати: ' + (e as Error).message); }
    finally { setLoading(false); }
  }

  const col: React.CSSProperties = { flex: 1, minWidth: 0, border: '1px solid hsl(var(--border))', borderRadius: 10, padding: 10, maxHeight: 460, overflowY: 'auto' };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>🏗️ Пропозиція нової структури папок</div>
        <button style={btn} onClick={generate} disabled={loading}>{loading ? 'Генерую…' : (proposal ? '🔄 Перегенерувати' : '🏗️ Згенерувати пропозицію')}</button>
      </div>
      <p style={{ ...muted, margin: '0 0 12px', lineHeight: 1.5 }}>
        ШІ пропонує впорядковану структуру за канонічним шаблоном (7 відділень) з описами кожної теки.
        Зліва — як є зараз, справа — пропозиція. <i>Перетягування й «Застосувати» — у наступному оновленні.</i>
      </p>
      {err && <p style={{ color: 'hsl(0 70% 62%)', fontSize: 12.5 }}>{err}</p>}

      {proposal ? (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ ...col, minWidth: 240 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--muted-foreground))', marginBottom: 8 }}>НАЯВНЕ</div>
            {tree ? <CurrentTree nodes={tree} /> : <span style={muted}>…</span>}
          </div>
          <div style={{ ...col, minWidth: 260, borderColor: 'hsl(142 40% 30% / 0.5)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'hsl(142 45% 65%)', marginBottom: 8 }}>ПРОПОЗИЦІЯ ШІ</div>
            <ProposedTree nodes={proposal.structure} />
          </div>
        </div>
      ) : !loading && (
        <p style={muted}>Пропозиції ще немає — натисни «Згенерувати».</p>
      )}
    </div>
  );
}
