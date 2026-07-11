import { getCompany } from '@/lib/api';
import CompanyHeader from '@/components/CompanyTabs';
import AddProcessButton from '@/components/AddProcessButton';

export const dynamic = 'force-dynamic';

export default async function ProcessesPage({ params }: { params: { id: string } }) {
  const company = await getCompany(params.id).catch(() => null);
  if (!company) return <p style={{ color: 'hsl(var(--muted-foreground))' }}>Компанію не знайдено.</p>;

  const processes = company.processes ?? [];
  const muted = { color: 'hsl(var(--muted-foreground))' } as const;

  return (
    <div>
      <CompanyHeader company={company} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 14px' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Бізнес-процеси ({processes.length})</h2>
        <AddProcessButton companyId={company.id} />
      </div>

      {processes.length === 0 ? (
        <p style={muted}>Процесів ще немає. Додай перший — або згенеруй ботом.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {processes.map((pr) => {
            const steps = pr.steps ?? [];
            const owner = steps.length ? steps[steps.length - 1].postTitle : null;
            const problems = steps.filter((s) => s.problem).length;
            const autos = steps.filter((s) => s.automatable).length;
            return (
              <a
                key={pr.id}
                href={`/company/${company.id}/processes/${pr.id}`}
                style={{
                  textDecoration: 'none', color: 'inherit',
                  background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)',
                  padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>{pr.name}</div>
                  <div style={{ fontSize: 12.5, ...muted, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 640 }}>
                    {pr.description || `${steps.length} ${steps.length === 1 ? 'крок' : 'кроків'}${owner ? ` · відповідальний: ${owner}` : ''}`}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {problems > 0 && <span style={{ fontSize: 11, color: '#e07a7a', border: '1px solid #e07a7a', borderRadius: 6, padding: '1px 6px' }}>⚠ {problems}</span>}
                  {autos > 0 && <span style={{ fontSize: 11, color: '#6ea8fe', border: '1px solid #6ea8fe', borderRadius: 6, padding: '1px 6px' }}>🤖 {autos}</span>}
                  <span style={{ fontSize: 12, ...muted }}>{steps.length} кр.</span>
                  <span style={{ fontSize: 16, ...muted }}>›</span>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
