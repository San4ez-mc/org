import { getCompany, getStatistics, type Statistic } from '@/lib/api';
import CompanyHeader from '@/components/CompanyTabs';
import OrgBoard from '@/components/OrgBoard';

export const dynamic = 'force-dynamic';

export default async function StructurePage({ params }: { params: { id: string } }) {
  let company;
  try {
    company = await getCompany(params.id);
  } catch {
    return <p style={{ color: 'hsl(var(--muted-foreground))' }}>Компанію не знайдено або API недоступний.</p>;
  }
  // #214 sparkline: статистики одиниць (не критично, якщо нема)
  let statistics: Statistic[] = [];
  try { statistics = await getStatistics(params.id); } catch { statistics = []; }

  return (
    <div>
      <CompanyHeader company={company} />
      <OrgBoard units={company.orgUnits} members={company.members} companyId={company.id} statistics={statistics} />
    </div>
  );
}
