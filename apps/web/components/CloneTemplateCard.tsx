'use client';
import { useState, useTransition } from 'react';
import { cloneTemplate, getTemplateDetailAction, type CloneTemplateResult } from '@/app/company/[id]/actions';
import type { TemplateSummary, TemplateDetail } from '@/lib/api';

const card = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: 14 } as const;
const muted = { color: 'hsl(var(--muted-foreground))' } as const;
const chip = { fontSize: 11.5, padding: '2px 8px', borderRadius: 6, background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' } as const;

export default function CloneTemplateCard({ companyId, template }: { companyId: string; template: TemplateSummary }) {
  const [structure, setStructure] = useState(true);
  const [processes, setProcesses] = useState(true);
  const [instructions, setInstructions] = useState(true);
  const [detail, setDetail] = useState<TemplateDetail | null>(null);
  const [result, setResult] = useState<CloneTemplateResult | null>(null);
  const [pending, start] = useTransition();

  const toggleDetail = () => {
    if (detail) { setDetail(null); return; }
    start(async () => setDetail(await getTemplateDetailAction(template.key)));
  };

  const submit = () => {
    setResult(null);
    start(async () => setResult(await cloneTemplate(companyId, template.key, { structure, processes, instructions })));
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <h3 style={{ fontSize: 14.5, fontWeight: 600, margin: 0 }}>{template.label}</h3>
          <p style={{ ...muted, fontSize: 12.5, margin: '4px 0 0' }}>{template.description}</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <span style={chip}>{template.counts.posts} посад</span>
          <span style={chip}>{template.counts.processes} процеси</span>
          <span style={chip}>{template.counts.instructions} інструкції</span>
        </div>
      </div>

      <button onClick={toggleDetail} style={{ marginTop: 8, background: 'transparent', border: 'none', color: 'hsl(var(--primary))', fontSize: 12.5, cursor: 'pointer', padding: 0 }}>
        {detail ? '▾ Сховати вміст' : '▸ Показати вміст'}
      </button>

      {detail && (
        <div style={{ marginTop: 8, fontSize: 12.5, display: 'grid', gap: 6 }}>
          {detail.posts.length > 0 && <div><b>Посади:</b> {detail.posts.map((p) => p.title).join(', ')}</div>}
          {detail.processes.length > 0 && <div><b>Процеси:</b> {detail.processes.map((p) => p.name).join(', ')}</div>}
          {detail.instructions.length > 0 && <div><b>Інструкції:</b> {detail.instructions.map((i) => i.title).join(', ')}</div>}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12.5, display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={structure} onChange={(e) => setStructure(e.target.checked)} /> Посади
        </label>
        <label style={{ fontSize: 12.5, display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={processes} onChange={(e) => setProcesses(e.target.checked)} /> Процеси
        </label>
        <label style={{ fontSize: 12.5, display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={instructions} onChange={(e) => setInstructions(e.target.checked)} /> Інструкції
        </label>
        <button
          disabled={pending || (!structure && !processes && !instructions)}
          onClick={submit}
          style={{ marginLeft: 'auto', background: 'hsl(var(--primary))', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}
        >
          {pending ? '…' : 'Клонувати в компанію'}
        </button>
      </div>

      {result && (
        <p style={{ fontSize: 12, marginTop: 8, color: 'hsl(var(--muted-foreground))' }}>
          Додано: {result.created.posts} посад, {result.created.processes} процесів, {result.created.instructions} інструкцій.
          {(result.skipped.posts || result.skipped.processes || result.skipped.instructions) ? (
            <> Пропущено (вже було): {result.skipped.posts + result.skipped.processes + result.skipped.instructions}.</>
          ) : null}
        </p>
      )}
    </div>
  );
}
