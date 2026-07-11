'use client';
import { useState, useTransition } from 'react';
import { addStatistic } from '@/app/company/[id]/actions';

const inp = { background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 7, padding: '7px 9px', color: 'inherit', fontSize: 13 } as const;

export default function AddStatistic({ companyId, units }: { companyId: string; units: { id: string; name: string; type: string }[] }) {
  const [open, setOpen] = useState(false);
  const [orgUnitId, setOrgUnitId] = useState(units[0]?.id ?? '');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [higher, setHigher] = useState(true);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ background: 'hsl(var(--primary))', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}>
        + Додати статистику
      </button>
    );
  }

  const submit = () => {
    if (!orgUnitId || !name.trim()) return;
    start(async () => { await addStatistic(companyId, { orgUnitId, name: name.trim(), unit: unit.trim() || undefined, higherIsBetter: higher }); setName(''); setUnit(''); setOpen(false); });
  };

  return (
    <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--primary))', borderRadius: 'var(--radius)', padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <select value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)} style={{ ...inp, maxWidth: 240 }}>
        {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      <input autoFocus placeholder="Що вимірюємо (напр. Дохід)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} style={{ ...inp, width: 220 }} />
      <input placeholder="одиниця (грн, шт, %)" value={unit} onChange={(e) => setUnit(e.target.value)} style={{ ...inp, width: 150 }} />
      <label style={{ fontSize: 12.5, display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
        <input type="checkbox" checked={higher} onChange={(e) => setHigher(e.target.checked)} /> більше = краще
      </label>
      <button disabled={pending} onClick={submit} style={{ background: 'hsl(var(--primary))', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}>{pending ? '…' : 'Створити'}</button>
      <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: '1px solid hsl(var(--border))', color: 'hsl(var(--muted-foreground))', borderRadius: 8, padding: '7px 12px', fontSize: 13, cursor: 'pointer' }}>Скасувати</button>
    </div>
  );
}
