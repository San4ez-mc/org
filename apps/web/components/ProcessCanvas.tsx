'use client';
import { useCallback, useMemo, useState } from 'react';
import ReactFlow, {
  Background, Controls, MiniMap, Handle, Position, addEdge, useNodesState, useEdgesState,
  type Node, type Edge, type Connection, type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { Process, ProcessGraph } from '@/lib/api';
import { updateProcess } from '@/app/company/[id]/actions';

// ── кольори лейнів за відповідальним ────────────────────────────────
function hue(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
function kindStyle(kind: string, postTitle?: string): React.CSSProperties {
  if (kind === 'start') return { background: 'hsl(150 45% 20%)', borderColor: 'hsl(150 45% 45%)' };
  if (kind === 'end') return { background: 'hsl(0 0% 24%)', borderColor: 'hsl(0 0% 45%)' };
  if (kind === 'decision') return { background: 'hsl(45 55% 22%)', borderColor: 'hsl(45 60% 48%)' };
  const h = postTitle ? hue(postTitle) : 210;
  return { background: `hsl(${h} 42% 20%)`, borderColor: `hsl(${h} 45% 45%)` };
}

// ── кастомна нода ───────────────────────────────────────────────────
function CardNode({ data, selected }: NodeProps) {
  const kind = data.kind ?? 'step';
  const st = kindStyle(kind, data.postTitle);
  return (
    <div style={{
      minWidth: 140, maxWidth: 220, padding: '8px 12px', borderRadius: kind === 'decision' ? 14 : 8,
      border: `1.5px solid ${st.borderColor}`, background: st.background, color: '#fff', fontSize: 12.5,
      boxShadow: selected ? '0 0 0 2px hsl(var(--primary))' : 'none', textAlign: 'center',
    }}>
      <Handle type="target" position={Position.Top} style={{ background: '#888' }} />
      {kind === 'decision' && <div style={{ fontSize: 10, opacity: 0.8 }}>◆ рішення</div>}
      {data.postTitle && kind === 'step' && <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 2 }}>{data.postTitle}</div>}
      <div style={{ fontWeight: 500 }}>{data.label}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#888' }} />
    </div>
  );
}

const nodeTypes = { card: CardNode };

// ── seed з кроків, якщо графа ще нема ───────────────────────────────
function seedFromProcess(p: Process): ProcessGraph {
  const nodes: ProcessGraph['nodes'] = [{ id: 'start', type: 'card', position: { x: 260, y: 0 }, data: { label: 'Початок', kind: 'start' } }];
  const edges: ProcessGraph['edges'] = [];
  const steps = p.steps ?? [];
  let prev = 'start';
  steps.forEach((s, i) => {
    const id = `s${i}`;
    nodes.push({ id, type: 'card', position: { x: 200, y: 90 + i * 100 }, data: { label: s.action || `Крок ${i + 1}`, kind: 'step', postTitle: s.postTitle } });
    edges.push({ id: `e-${prev}-${id}`, source: prev, target: id });
    prev = id;
  });
  const endId = 'end';
  nodes.push({ id: endId, type: 'card', position: { x: 260, y: 90 + steps.length * 100 }, data: { label: 'Кінець', kind: 'end' } });
  edges.push({ id: `e-${prev}-${endId}`, source: prev, target: endId });
  return { nodes, edges };
}

export default function ProcessCanvas({ companyId, process, postTitles, onClose }: { companyId: string; process: Process; postTitles: string[]; onClose: () => void }) {
  const initial = useMemo<ProcessGraph>(() => (process.graph && process.graph.nodes?.length ? process.graph : seedFromProcess(process)), [process]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges as Edge[]);
  const [selNode, setSelNode] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const touch = () => setDirty(true);
  const onConnect = useCallback((c: Connection) => { setEdges((e) => addEdge({ ...c, id: `e-${Date.now()}` }, e)); touch(); }, [setEdges]);

  const addNode = (kind: string) => {
    const id = `n-${Date.now()}`;
    setNodes((n) => [...n, { id, type: 'card', position: { x: 360, y: 60 + n.length * 24 }, data: { label: kind === 'decision' ? 'Рішення?' : 'Новий крок', kind, postTitle: kind === 'step' ? postTitles[0] : undefined } } as Node]);
    setSelNode(id); setSelEdge(null); touch();
  };

  const patchNode = (id: string, patch: Record<string, unknown>) => { setNodes((n) => n.map((nd) => (nd.id === id ? { ...nd, data: { ...nd.data, ...patch } } : nd))); touch(); };
  const delNode = (id: string) => { setNodes((n) => n.filter((nd) => nd.id !== id)); setEdges((e) => e.filter((ed) => ed.source !== id && ed.target !== id)); setSelNode(null); touch(); };
  const patchEdge = (id: string, label: string) => { setEdges((e) => e.map((ed) => (ed.id === id ? { ...ed, label } : ed))); touch(); };
  const delEdge = (id: string) => { setEdges((e) => e.filter((ed) => ed.id !== id)); setSelEdge(null); touch(); };

  const save = async () => {
    setSaving(true);
    const graph: ProcessGraph = {
      nodes: nodes.map((n) => ({ id: n.id, type: 'card', position: n.position, data: n.data as ProcessGraph['nodes'][number]['data'] })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.label ? String(e.label) : undefined })),
    };
    await updateProcess(companyId, process.id, { graph });
    setSaving(false); setDirty(false);
  };

  const node = nodes.find((n) => n.id === selNode);
  const edge = edges.find((e) => e.id === selEdge);
  const ghost: React.CSSProperties = { background: 'transparent', border: '1px solid hsl(var(--border))', color: 'hsl(var(--muted-foreground))', borderRadius: 7, padding: '5px 10px', fontSize: 12, cursor: 'pointer' };
  const inp: React.CSSProperties = { background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 7, padding: '6px 9px', color: 'inherit', fontSize: 13, width: '100%' };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
        <button style={ghost} onClick={() => addNode('step')}>+ крок</button>
        <button style={ghost} onClick={() => addNode('decision')}>+ рішення ◆</button>
        <button style={ghost} onClick={() => addNode('start')}>+ старт</button>
        <button style={ghost} onClick={() => addNode('end')}>+ кінець</button>
        <span style={{ flex: 1 }} />
        <button style={{ ...ghost, ...(dirty ? { borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))' } : {}) }} disabled={saving || !dirty} onClick={save}>{saving ? '…' : dirty ? 'Зберегти схему' : 'Збережено'}</button>
        <button style={ghost} onClick={onClose}>Закрити</button>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, height: 460, border: '1px solid hsl(var(--border))', borderRadius: 8, overflow: 'hidden', background: 'hsl(var(--background))' }}>
          <ReactFlow
            nodes={nodes} edges={edges} nodeTypes={nodeTypes}
            onNodesChange={(c) => { onNodesChange(c); if (c.some((x) => x.type === 'position' || x.type === 'remove')) touch(); }}
            onEdgesChange={(c) => { onEdgesChange(c); if (c.some((x) => x.type === 'remove')) touch(); }}
            onConnect={onConnect}
            onNodeClick={(_, n) => { setSelNode(n.id); setSelEdge(null); }}
            onEdgeClick={(_, e) => { setSelEdge(e.id); setSelNode(null); }}
            onPaneClick={() => { setSelNode(null); setSelEdge(null); }}
            fitView deleteKeyCode={['Backspace', 'Delete']}
          >
            <Background />
            <Controls />
            <MiniMap pannable style={{ background: 'hsl(var(--card))' }} />
          </ReactFlow>
        </div>

        {/* панель редагування вибраного */}
        <div style={{ width: 210, flex: '0 0 210px', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: 12, fontSize: 12.5, height: 'fit-content' }}>
          {node ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontWeight: 600 }}>Блок</div>
              <textarea style={{ ...inp, minHeight: 44 }} value={String(node.data.label ?? '')} onChange={(e) => patchNode(node.id, { label: e.target.value })} />
              <select style={inp} value={String(node.data.kind ?? 'step')} onChange={(e) => patchNode(node.id, { kind: e.target.value })}>
                <option value="step">крок</option>
                <option value="decision">рішення ◆</option>
                <option value="start">старт</option>
                <option value="end">кінець</option>
              </select>
              {node.data.kind === 'step' && (
                <select style={inp} value={String(node.data.postTitle ?? '')} onChange={(e) => patchNode(node.id, { postTitle: e.target.value })}>
                  <option value="">— відповідальний —</option>
                  {!postTitles.includes(String(node.data.postTitle ?? '')) && node.data.postTitle && <option value={String(node.data.postTitle)}>{String(node.data.postTitle)}</option>}
                  {postTitles.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
              <button style={{ ...ghost, borderColor: '#e07a7a', color: '#e07a7a' }} onClick={() => delNode(node.id)}>Видалити блок</button>
            </div>
          ) : edge ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontWeight: 600 }}>Звʼязок</div>
              <input style={inp} placeholder="Мітка (напр. так / ні)" value={String(edge.label ?? '')} onChange={(e) => patchEdge(edge.id, e.target.value)} />
              <button style={{ ...ghost, borderColor: '#e07a7a', color: '#e07a7a' }} onClick={() => delEdge(edge.id)}>Видалити звʼязок</button>
            </div>
          ) : (
            <div style={{ color: 'hsl(var(--muted-foreground))', lineHeight: 1.5 }}>
              Клікни блок або звʼязок, щоб редагувати.<br /><br />
              Тягни від нижнього кружечка до верхнього іншого блоку — створиться звʼязок. Del — видалити вибране.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
