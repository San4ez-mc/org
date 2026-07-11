import { getCompany, type OrgUnit } from '@/lib/api';
import ProcessEditor from '@/components/ProcessEditor';

export const dynamic = 'force-dynamic';

export default async function ProcessPage({ params }: { params: { id: string; processId: string } }) {
  const company = await getCompany(params.id).catch(() => null);
  if (!company) return <p style={{ color: 'hsl(var(--muted-foreground))' }}>Компанію не знайдено.</p>;

  const process = (company.processes ?? []).find((p) => p.id === params.processId);
  if (!process) {
    return (
      <div>
        <a href={`/company/${company.id}/processes`} style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', textDecoration: 'none' }}>← Бізнес-процеси</a>
        <p style={{ color: 'hsl(var(--muted-foreground))', marginTop: 12 }}>Процес не знайдено.</p>
      </div>
    );
  }

  const postTitles = [...new Set(company.orgUnits.filter((u: OrgUnit) => u.type === 'POST').map((p) => p.name))]
    .filter((n) => n !== 'Голова відділення' && n !== 'Керівник відділу');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13 }}>
        <a href={`/company/${company.id}/processes`} style={{ color: 'hsl(var(--muted-foreground))', textDecoration: 'none' }}>← Бізнес-процеси</a>
        <span style={{ color: 'hsl(var(--muted-foreground))' }}>·</span>
        <span style={{ color: 'hsl(var(--muted-foreground))' }}>{company.name}</span>
      </div>
      <ProcessEditor companyId={company.id} process={process} postTitles={postTitles} />
    </div>
  );
}
