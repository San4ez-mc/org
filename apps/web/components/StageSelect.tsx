'use client';
import { useTransition } from 'react';
import { setImplementationStage } from '@/app/portfolio-actions';
import type { ImplementationStage } from '@/lib/api';

const LABELS: Record<ImplementationStage, string> = { onboarding: 'Онбординг', active: 'Активна', paused: 'Призупинено', churned: 'Відтік' };
const COLORS: Record<ImplementationStage, string> = { onboarding: '#d6b84f', active: '#6bbf72', paused: 'hsl(var(--muted-foreground))', churned: '#e07a7a' };

export default function StageSelect({ companyId, value }: { companyId: string; value: ImplementationStage }) {
  const [pending, start] = useTransition();

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => start(() => setImplementationStage(companyId, e.target.value as ImplementationStage))}
      style={{
        background: 'hsl(var(--background))', color: COLORS[value] ?? 'inherit',
        border: '1px solid hsl(var(--border))', borderRadius: 6, padding: '4px 8px', fontSize: 12.5, fontWeight: 600,
      }}
    >
      {(Object.keys(LABELS) as ImplementationStage[]).map((k) => (
        <option key={k} value={k}>{LABELS[k]}</option>
      ))}
    </select>
  );
}
