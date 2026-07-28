import type { Company } from '@/lib/api';

// Вкладки прибрано — навігація в лівому меню. Тонка смужка-заголовок (в один рядок).
export default function CompanyHeader({ company }: { company: Company; active?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, minWidth: 0 }}>
      <a href="/" style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', textDecoration: 'none', flexShrink: 0 }}>← Компанії</a>
      <span style={{ color: 'hsl(var(--border))', fontSize: 12 }}>/</span>
      <h1 style={{ fontSize: 15, fontWeight: 700, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{company.name}</h1>
    </div>
  );
}
