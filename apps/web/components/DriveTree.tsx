'use client';
import { useState } from 'react';
import type { DriveNode } from '@/lib/api';

export default function DriveTree({ nodes, level = 0 }: { nodes: DriveNode[]; level?: number }) {
  return (
    <div style={{ marginLeft: level ? 16 : 0 }}>
      {nodes.map((n) => (n.isFolder ? <Folder key={n.id} node={n} level={level} /> : <FileRow key={n.id} node={n} />))}
    </div>
  );
}

function Folder({ node, level }: { node: DriveNode; level: number }) {
  const [open, setOpen] = useState(level < 1);
  const kids = node.children ?? [];
  return (
    <div>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderRadius: 6, cursor: 'pointer', fontSize: 13.5, userSelect: 'none' }}
      >
        <span style={{ width: 12, color: 'hsl(var(--muted-foreground))', fontSize: 10 }}>{kids.length ? (open ? '▾' : '▸') : ''}</span>
        <span>📁</span>
        <span style={{ fontWeight: 500 }}>{node.name}</span>
        {!!kids.length && <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>({kids.length})</span>}
      </div>
      {open && kids.length > 0 && <DriveTree nodes={kids} level={level + 1} />}
    </div>
  );
}

function FileRow({ node }: { node: DriveNode }) {
  return (
    <a
      href={node.webViewLink ?? `https://drive.google.com/file/d/${node.id}/view`}
      target="_blank"
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px 5px 24px', borderRadius: 6, fontSize: 13.5, textDecoration: 'none', color: 'inherit' }}
    >
      <span>📄</span>
      <span style={{ color: 'hsl(var(--primary))' }}>{node.name}</span>
    </a>
  );
}
