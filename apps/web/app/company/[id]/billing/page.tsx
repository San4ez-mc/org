import { getCompany, getBilling } from '@/lib/api';
import CompanyHeader from '@/components/CompanyTabs';
import BillingPanel from '@/components/BillingPanel';

export const dynamic = 'force-dynamic';

export default async function BillingPage({ params }: { params: { id: string } }) {
  const [company, billing] = await Promise.all([
    getCompany(params.id).catch(() => null),
    getBilling(params.id).catch(() => null),
  ]);
  if (!company || !billing) return <p style={{ color: 'hsl(var(--muted-foreground))' }}>Не вдалось завантажити білінг.</p>;

  return (
    <div>
      <CompanyHeader company={company} />
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '4px 0 12px' }}>Підписка та оплата</h2>
      <BillingPanel companyId={company.id} billing={billing} />
    </div>
  );
}
