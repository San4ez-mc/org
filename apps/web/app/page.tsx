import { getCompanies } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function CompaniesPage() {
  let companies;
  try {
    companies = await getCompanies();
  } catch {
    return <p style={{ color: 'hsl(var(--muted-foreground))' }}>Не вдалось завантажити компанії (API недоступний).</p>;
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Компанії</h1>
      <p style={{ color: 'hsl(var(--muted-foreground))', marginBottom: 20, fontSize: 14 }}>
        Створені через бот структури. {companies.length} шт.
      </p>
      <div style={{ display: 'grid', gap: 12 }}>
        {companies.map((c) => (
          <a
            key={c.id}
            href={`/company/${c.id}`}
            style={{
              display: 'block',
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 'var(--radius)',
              padding: '14px 16px',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <div style={{ fontWeight: 600 }}>{c.name}</div>
            <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>
              створено {new Date(c.createdAt).toLocaleDateString('uk-UA')}
            </div>
          </a>
        ))}
        {!companies.length && <p style={{ color: 'hsl(var(--muted-foreground))' }}>Ще немає компаній. Створи через бот.</p>}
      </div>
    </div>
  );
}
