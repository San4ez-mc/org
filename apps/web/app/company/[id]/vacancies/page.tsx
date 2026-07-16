import { getCompany, getVacancies } from '@/lib/api';
import CompanyHeader from '@/components/CompanyTabs';
import AddVacancy from '@/components/AddVacancy';

export const dynamic = 'force-dynamic';

const statusLabel: Record<string, string> = { OPEN: 'Відкрита', ON_HOLD: 'На паузі', CLOSED: 'Закрита' };
const statusColor: Record<string, string> = { OPEN: '#6bbf72', ON_HOLD: '#d6b84f', CLOSED: 'hsl(var(--muted-foreground))' };
const muted = { color: 'hsl(var(--muted-foreground))' } as const;

export default async function VacanciesPage({ params }: { params: { id: string } }) {
  const company = await getCompany(params.id).catch(() => null);
  if (!company) return <p style={muted}>Компанію не знайдено.</p>;
  const vacancies = await getVacancies(params.id).catch(() => []);
  const vacantPosts = company.orgUnits.filter((u) => u.type === 'POST' && u.isVacant).map((u) => ({ id: u.id, name: u.name }));

  return (
    <div>
      <CompanyHeader company={company} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 14px', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Рекрутинг-воронка ({vacancies.length})</h2>
        <AddVacancy companyId={params.id} vacantPosts={vacantPosts} />
      </div>

      {vacancies.length === 0 ? (
        <p style={muted}>Вакансій ще немає.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {vacancies.map((v) => {
            const active = v.candidates.filter((c) => c.stage !== 'REJECTED' && c.stage !== 'HIRED').length;
            const hired = v.candidates.filter((c) => c.stage === 'HIRED').length;
            return (
              <a
                key={v.id}
                href={`/company/${params.id}/vacancies/${v.id}`}
                style={{ display: 'block', background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: '12px 14px', textDecoration: 'none', color: 'inherit' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{v.title}</span>
                    {v.postUnit ? <span style={{ ...muted, fontSize: 12 }}> · посада: {v.postUnit.name}</span> : null}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: statusColor[v.status] ?? 'inherit' }}>{statusLabel[v.status] ?? v.status}</span>
                </div>
                <div style={{ ...muted, fontSize: 12, marginTop: 4 }}>
                  {v.candidates.length} кандидатів · {active} в роботі{hired ? ` · ${hired} найнято` : ''}
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
