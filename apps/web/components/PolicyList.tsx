'use client';
import { useMemo, useState, useTransition } from 'react';
import type { Policy, PolicyKind } from '@/lib/api';
import { addPolicy, updatePolicy, deletePolicy } from '@/app/company/[id]/actions';

const card = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' } as const;
const muted = { color: 'hsl(var(--muted-foreground))' } as const;
const input = { background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '7px 10px', color: 'inherit', fontSize: 13 } as const;
const btn = { background: 'hsl(var(--primary))', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer' } as const;
const ghost = { background: 'transparent', border: '1px solid hsl(var(--border))', color: 'hsl(var(--muted-foreground))', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer' } as const;

const KIND_LABEL: Record<PolicyKind, string> = { ORDER: 'Наказ', POLICY: 'Політика' };
const STATUS_LABEL: Record<string, string> = { DRAFT: 'Чернетка', ACTIVE: 'Чинний', ARCHIVED: 'Архів' };
const STATUS_COLOR: Record<string, string> = { DRAFT: '#d6b84f', ACTIVE: '#6bbf72', ARCHIVED: 'hsl(var(--muted-foreground))' };

export default function PolicyList({ companyId, policies }: { companyId: string; policies: Policy[] }) {
  const [filter, setFilter] = useState<'ALL' | PolicyKind>('ALL');
  const [showAdd, setShowAdd] = useState(false);

  const shown = useMemo(() => (filter === 'ALL' ? policies : policies.filter((p) => p.kind === filter)), [policies, filter]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['ALL', 'ORDER', 'POLICY'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                ...ghost,
                background: filter === f ? 'hsl(var(--muted))' : 'transparent',
                color: filter === f ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
              }}
            >
              {f === 'ALL' ? 'Усі' : KIND_LABEL[f]}
            </button>
          ))}
        </div>
        <button style={btn} onClick={() => setShowAdd((s) => !s)}>{showAdd ? 'Скасувати' : '+ Додати'}</button>
      </div>

      {showAdd && <AddPolicyForm companyId={companyId} onDone={() => setShowAdd(false)} />}

      <div style={{ display: 'grid', gap: 8, marginTop: showAdd ? 12 : 0 }}>
        {shown.map((p) => <PolicyCard key={p.id} companyId={companyId} policy={p} />)}
        {shown.length === 0 && <p style={muted}>Ще немає записів.</p>}
      </div>
    </div>
  );
}

function AddPolicyForm({ companyId, onDone }: { companyId: string; onDone: () => void }) {
  const [kind, setKind] = useState<PolicyKind>('ORDER');
  const [title, setTitle] = useState('');
  const [number, setNumber] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [body, setBody] = useState('');
  const [pending, start] = useTransition();

  const submit = () => {
    if (!title.trim() || !body.trim()) return;
    start(async () => {
      await addPolicy(companyId, { kind, title: title.trim(), body: body.trim(), number: number.trim() || undefined, effectiveDate: effectiveDate || undefined });
      setTitle(''); setNumber(''); setEffectiveDate(''); setBody('');
      onDone();
    });
  };

  return (
    <div style={{ ...card, borderColor: 'hsl(var(--primary))', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={kind} onChange={(e) => setKind(e.target.value as PolicyKind)} style={{ ...input, width: 140 }}>
          <option value="ORDER">Наказ</option>
          <option value="POLICY">Політика</option>
        </select>
        <input placeholder="Назва" value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...input, flex: 1, minWidth: 200 }} />
        {kind === 'ORDER' && <input placeholder="№ (напр. 12/2026)" value={number} onChange={(e) => setNumber(e.target.value)} style={{ ...input, width: 140 }} />}
        <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} title="Дата набуття чинності" style={{ ...input, width: 150 }} />
      </div>
      <textarea placeholder="Текст наказу/політики…" value={body} onChange={(e) => setBody(e.target.value)} rows={4} style={{ ...input, resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button disabled={pending} onClick={submit} style={btn}>{pending ? '…' : 'Створити'}</button>
        <button onClick={onDone} style={ghost}>Скасувати</button>
      </div>
    </div>
  );
}

function PolicyCard({ companyId, policy }: { companyId: string; policy: Policy }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(policy.title);
  const [body, setBody] = useState(policy.body);
  const [pending, start] = useTransition();

  const saveEdit = () => start(async () => { await updatePolicy(companyId, policy.id, { title, body }); setEditing(false); });

  return (
    <div style={{ ...card, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 6, background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
              {KIND_LABEL[policy.kind]}{policy.number ? ` №${policy.number}` : ''}
            </span>
            {editing ? (
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...input, fontSize: 13.5, fontWeight: 600 }} />
            ) : (
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>{policy.title}</span>
            )}
          </div>
          <div style={{ ...muted, fontSize: 11.5, marginTop: 4 }}>
            {policy.effectiveDate ? `чинний з ${new Date(policy.effectiveDate).toLocaleDateString('uk-UA')}` : `створено ${new Date(policy.createdAt).toLocaleDateString('uk-UA')}`}
          </div>
        </div>
        <select
          value={policy.status}
          disabled={pending}
          onChange={(e) => start(() => updatePolicy(companyId, policy.id, { status: e.target.value }))}
          style={{ ...input, fontSize: 12, padding: '4px 8px', color: STATUS_COLOR[policy.status], fontWeight: 600 }}
        >
          <option value="DRAFT">Чернетка</option>
          <option value="ACTIVE">Чинний</option>
          <option value="ARCHIVED">Архів</option>
        </select>
      </div>

      {editing ? (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} style={{ ...input, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={pending} onClick={saveEdit} style={btn}>{pending ? '…' : 'Зберегти'}</button>
            <button onClick={() => { setEditing(false); setTitle(policy.title); setBody(policy.body); }} style={ghost}>Скасувати</button>
          </div>
        </div>
      ) : (
        <>
          <p style={{ fontSize: 13, marginTop: 8, whiteSpace: 'pre-wrap', ...(expanded ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) }}>
            {policy.body}
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button onClick={() => setExpanded((e) => !e)} style={{ background: 'transparent', border: 'none', color: 'hsl(var(--primary))', fontSize: 12, cursor: 'pointer', padding: 0 }}>
              {expanded ? '▾ Згорнути' : '▸ Показати повністю'}
            </button>
            <button onClick={() => setEditing(true)} style={{ background: 'transparent', border: 'none', color: 'hsl(var(--muted-foreground))', fontSize: 12, cursor: 'pointer', padding: 0 }}>Редагувати</button>
            <button onClick={() => start(() => deletePolicy(companyId, policy.id))} style={{ background: 'transparent', border: 'none', color: 'hsl(var(--muted-foreground))', fontSize: 12, cursor: 'pointer', padding: 0 }}>Видалити</button>
          </div>
        </>
      )}
    </div>
  );
}
