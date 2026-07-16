import { getPortfolio } from '@/lib/api';
import StageSelect from '@/components/StageSelect';
import CloneFromButton from '@/components/CloneFromButton';

export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  const companies = await getPortfolio().catch(() => null);
  if (!companies) return <p style={{ color: 'hsl(var(--muted-foreground))' }}>Не вдалось завантажити портфель (API недоступний).</p>;

  const th = { textAlign: 'left', fontSize: 12, fontWeight: 500, color: 'hsl(var(--muted-foreground))', padding: '8px 12px', borderBottom: '1px solid hsl(var(--border))' } as const;
  const td = { fontSize: 13, padding: '9px 12px', borderBottom: '1px solid hsl(var(--border))', verticalAlign: 'top' } as const;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Портфель клієнтів</h1>
      <p style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))', marginBottom: 16 }}>
        Усі компанії поруч для порівняння, стадія впровадження й клонування налаштувань (посади/процеси) між клієнтами.
      </p>

      <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
          <thead>
            <tr>
              <th style={th}>Компанія</th>
              <th style={th}>Створено</th>
              <th style={th}>Люди</th>
              <th style={th}>Посади</th>
              <th style={th}>Вакантно</th>
              <th style={th}>Процеси</th>
              <th style={th}>Стадія</th>
              <th style={th}>Клонувати налаштування</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id}>
                <td style={td}>
                  <a href={`/company/${c.id}`} style={{ color: 'hsl(var(--primary))', textDecoration: 'none', fontWeight: 600 }}>{c.name}</a>
                  {c.abbr ? <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 12 }}> ({c.abbr})</span> : null}
                </td>
                <td style={{ ...td, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap' }}>{new Date(c.createdAt).toLocaleDateString('uk-UA')}</td>
                <td style={td}>{c.members}</td>
                <td style={td}>{c.posts}</td>
                <td style={{ ...td, color: c.vacantPosts > 0 ? '#d6b84f' : 'inherit' }}>{c.vacantPosts}</td>
                <td style={td}>{c.processes}</td>
                <td style={td}><StageSelect companyId={c.id} value={c.implementationStage} /></td>
                <td style={td}>
                  <CloneFromButton targetId={c.id} options={companies.filter((x) => x.id !== c.id).map((x) => ({ id: x.id, name: x.name }))} />
                </td>
              </tr>
            ))}
            {companies.length === 0 ? (
              <tr><td style={{ ...td, color: 'hsl(var(--muted-foreground))' }} colSpan={8}>Ще немає компаній.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
