import { getCompany, getPolicies } from '@/lib/api';
import CompanyHeader from '@/components/CompanyTabs';
import PolicyList from '@/components/PolicyList';

export const dynamic = 'force-dynamic';

export default async function PoliciesPage({ params }: { params: { id: string } }) {
  const company = await getCompany(params.id).catch(() => null);
  if (!company) return <p style={{ color: 'hsl(var(--muted-foreground))' }}>Компанію не знайдено.</p>;
  const policies = await getPolicies(params.id).catch(() => []);

  return (
    <div>
      <CompanyHeader company={company} />
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '4px 0 6px' }}>Кадрові накази / політики</h2>
      <p style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))', marginBottom: 14 }}>
        Розпорядження компанії (накази, чинні політики) — окремо від посадових інструкцій.
      </p>
      <PolicyList companyId={params.id} policies={policies} />
    </div>
  );
}
