import { getCompany, type OrgUnit } from '@/lib/api';
import CompanyHeader from '@/components/CompanyTabs';
import ProcessEditor from '@/components/ProcessEditor';
import AddProcessButton from '@/components/AddProcessButton';

export const dynamic = 'force-dynamic';

export default async function ProcessesPage({ params }: { params: { id: string } }) {
  const company = await getCompany(params.id).catch(() => null);
  if (!company) return <p style={{ color: 'hsl(var(--muted-foreground))' }}>Компанію не знайдено.</p>;

  const postTitles = [...new Set(company.orgUnits.filter((u: OrgUnit) => u.type === 'POST').map((p) => p.name))]
    .filter((n) => n !== 'Голова відділення' && n !== 'Керівник відділу');
  const processes = company.processes ?? [];

  return (
    <div>
      <CompanyHeader company={company} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 14px' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Бізнес-процеси ({processes.length})</h2>
        <AddProcessButton companyId={company.id} />
      </div>

      {processes.length === 0 ? (
        <p style={{ color: 'hsl(var(--muted-foreground))' }}>Процесів ще немає. Додай перший — або згенеруй ботом.</p>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {processes.map((pr) => (
            <ProcessEditor key={pr.id} companyId={company.id} process={pr} postTitles={postTitles} />
          ))}
        </div>
      )}
    </div>
  );
}
