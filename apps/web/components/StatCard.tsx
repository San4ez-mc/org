'use client';
import { useState, useTransition } from 'react';
import type { Statistic, StatPoint } from '@/lib/api';
import { addPoint, deleteStatistic, updateStatistic } from '@/app/company/[id]/actions';

const card = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' } as const;
const muted = { color: 'hsl(var(--muted-foreground))' } as const;
const inp = { background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 7, padding: '5px 8px', color: 'inherit', fontSize: 13 } as const;
const ghost = { background: 'transparent', border: '1px solid hsl(var(--border))', color: 'hsl(var(--muted-foreground))', borderRadius: 7, padding: '5px 10px', fontSize: 12, cursor: 'pointer' } as const;

const GOOD = '#4caf82';
const BAD = '#e07a7a';

function Chart({ points, good }: { points: StatPoint[]; good: (delta: number) => string }) {
  const W = 560, H = 130, pad = 14;
  if (points.length === 0) return <div style={{ ...muted, fontSize: 12.5, padding: '18px 0' }}>Ще немає даних — додай першу точку нижче.</div>;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const n = points.length;
  const x = (i: number) => (n === 1 ? W / 2 : pad + (i / (n - 1)) * (W - 2 * pad));
  const y = (v: number) => H - pad - ((v - min) / span) * (H - 2 * pad);
  const poly = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const lastDelta = n >= 2 ? points[n - 1].value - points[n - 2].value : 0;
  const lineColor = good(lastDelta);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} preserveAspectRatio="none">
      <line x1={pad} y1={y(max)} x2={W - pad} y2={y(max)} stroke="hsl(var(--border))" strokeWidth={1} strokeDasharray="3 3" />
      <line x1={pad} y1={y(min)} x2={W - pad} y2={y(min)} stroke="hsl(var(--border))" strokeWidth={1} strokeDasharray="3 3" />
      {n >= 2 && <polyline points={poly} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" />}
      {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.value)} r={3} fill={lineColor} />)}
    </svg>
  );
}

export default function StatCard({ companyId, statistic }: { companyId: string; statistic: Statistic }) {
  const pts = [...(statistic.points ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const [value, setValue] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [pending, start] = useTransition();

  const good = (delta: number) => (delta === 0 ? 'hsl(var(--muted-foreground))' : (delta > 0) === statistic.higherIsBetter ? GOOD : BAD);
  const n = pts.length;
  const last = n ? pts[n - 1] : null;
  const delta = n >= 2 ? pts[n - 1].value - pts[n - 2].value : 0;
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';

  const submit = () => {
    const v = Number(value.replace(',', '.'));
    if (Number.isNaN(v)) return;
    start(async () => { await addPoint(companyId, statistic.id, v, date); setValue(''); });
  };
  const removePoint = (d: string) => start(() => updateStatistic(companyId, statistic.id, { points: pts.filter((p) => p.date !== d) }));

  return (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{statistic.name} {statistic.unit && <span style={muted}>, {statistic.unit}</span>}</div>
          <div style={{ fontSize: 12, ...muted, marginTop: 2 }}>
            {statistic.orgUnit.name} · {statistic.higherIsBetter ? 'краще ↑' : 'краще ↓'}
          </div>
        </div>
        {last && (
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: good(delta) }}>{arrow} {last.value}</span>
            <div style={{ fontSize: 11, ...muted }}>останнє · {last.date}</div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 10 }}><Chart points={pts} good={good} /></div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp} />
        <input placeholder="значення" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} style={{ ...inp, width: 110 }} />
        <button style={{ ...ghost, borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))' }} disabled={pending} onClick={submit}>{pending ? '…' : '+ точка'}</button>
        <span style={{ flex: 1 }} />
        <button style={{ ...ghost, borderColor: BAD, color: BAD }} onClick={() => { if (confirm(`Видалити статистику «${statistic.name}»?`)) start(() => deleteStatistic(companyId, statistic.id)); }}>Видалити</button>
      </div>

      {n > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {pts.map((p) => (
            <span key={p.date} style={{ fontSize: 11, ...muted, border: '1px solid hsl(var(--border))', borderRadius: 6, padding: '1px 6px', display: 'inline-flex', gap: 5, alignItems: 'center' }}>
              {p.date}: <b style={{ color: 'hsl(var(--foreground))' }}>{p.value}</b>
              <button onClick={() => removePoint(p.date)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 12 }}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
