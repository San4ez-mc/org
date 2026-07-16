import { getCompanies } from '@/lib/api';

export const dynamic = 'force-dynamic';

const STATE_LABEL: Record<string, string> = { trial: 'тріал', active: 'активна', past_due: 'прострочено', expired: 'не активна' };
const STATE_COLOR: Record<string, string> = { trial: '#e5c76b', active: '#6bbf72', past_due: '#e08a4f', expired: '#e05c5c' };

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontWeight: 600 }}>{c.name}</div>
              {c.billing && (
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'hsl(var(--muted))', color: STATE_COLOR[c.billing.state] }}>
                  {STATE_LABEL[c.billing.state]}
                </span>
              )}
            </div>
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
