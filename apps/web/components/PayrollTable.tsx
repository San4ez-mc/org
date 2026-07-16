'use client';
import { useState, useTransition } from 'react';
import type { PayrollDivision } from '@/lib/api';
import { updateOrgUnit } from '@/app/company/[id]/actions';

const card = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' } as const;
const muted = { color: 'hsl(var(--muted-foreground))' } as const;
const input = { background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 6, padding: '5px 8px', color: 'inherit', fontSize: 12.5, width: 110 } as const;

const uah = (n: number) => `${Math.round(n).toLocaleString('uk-UA')} ₴`;

export default function PayrollTable({ companyId, divisions }: { companyId: string; divisions: PayrollDivision[] }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {divisions.map((d) => (
        <DivisionCard key={d.id} companyId={companyId} division={d} />
      ))}
    </div>
  );
}

function DivisionCard({ companyId, division }: { companyId: string; division: PayrollDivision }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={card}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', flexWrap: 'wrap' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', width: 10 }}>{open ? '▾' : '▸'}</span>
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>{division.name}</span>
          <span style={{ ...muted, fontSize: 12 }}>{division.postsFilled}/{division.postsTotal} зайнято</span>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 12.5 }}>
          <span>{uah(division.totalMonthly)} / міс</span>
          {division.postsWithoutSalary > 0 && <span style={{ color: '#d6b84f' }}>{division.postsWithoutSalary} без ФОП</span>}
        </div>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid hsl(var(--border))', padding: '6px 14px 12px' }}>
          {division.posts.length === 0 ? (
            <p style={{ ...muted, fontSize: 12.5, margin: '8px 0 0' }}>У цьому відділенні ще немає посад.</p>
          ) : (
            <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
              {division.posts.map((p) => (
                <PostRow key={p.id} companyId={companyId} post={p} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PostRow({ companyId, post }: { companyId: string; post: { id: string; name: string; isVacant: boolean; salary: number | null } }) {
  const [value, setValue] = useState(post.salary != null ? String(post.salary) : '');
  const [pending, start] = useTransition();

  const save = () => {
    const trimmed = value.trim();
    const salary = trimmed === '' ? null : Number(trimmed);
    if (salary !== null && Number.isNaN(salary)) return;
    start(() => updateOrgUnit(companyId, post.id, { salary }));
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid hsl(var(--border))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <span>{post.name}</span>
        <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 5, background: 'hsl(var(--muted))', color: post.isVacant ? '#d6b84f' : '#6bbf72' }}>
          {post.isVacant ? 'вакансія' : 'зайнята'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          placeholder="грн/міс"
          inputMode="numeric"
          disabled={pending}
          style={input}
        />
      </div>
    </div>
  );
}
