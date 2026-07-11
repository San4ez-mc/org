import type { Company } from '@/lib/api';

// Вкладки прибрано — навігація в лівому меню. Лишається заголовок компанії.
export default function CompanyHeader({ company }: { company: Company; active?: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <a href="/" style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', textDecoration: 'none' }}>← Компанії</a>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '8px 0 0' }}>{company.name}</h1>
    </div>
  );
}
