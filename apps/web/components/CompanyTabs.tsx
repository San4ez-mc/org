import type { Company } from '@/lib/api';

const tabs = [
  { key: '', label: 'Компанія' },
  { key: '/structure', label: 'Орг.структура' },
  { key: '/processes', label: 'Бізнес-процеси' },
];

export default function CompanyTabs({ company, active }: { company: Company; active: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <a href="/" style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', textDecoration: 'none' }}>← Компанії</a>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '8px 0 12px' }}>{company.name}</h1>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid hsl(var(--border))' }}>
        {tabs.map((t) => {
          const on = active === t.key;
          return (
            <a
              key={t.key}
              href={`/company/${company.id}${t.key}`}
              style={{
                padding: '8px 14px',
                fontSize: 14,
                textDecoration: 'none',
                color: on ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                borderBottom: on ? '2px solid hsl(var(--primary))' : '2px solid transparent',
                fontWeight: on ? 600 : 400,
              }}
            >
              {t.label}
            </a>
          );
        })}
      </div>
    </div>
  );
}
