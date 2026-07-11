import { getCompany, getStatistics, type OrgUnit } from '@/lib/api';
import CompanyHeader from '@/components/CompanyTabs';
import StatCard from '@/components/StatCard';
import AddStatistic from '@/components/AddStatistic';

export const dynamic = 'force-dynamic';

const TYPE_ORDER: Record<string, number> = { DIVISION: 0, DEPARTMENT: 1, SECTION: 2, POST: 3 };
const TYPE_LABEL: Record<string, string> = { DIVISION: 'Відділення', DEPARTMENT: 'Відділ', SECTION: 'Секція', POST: 'Посада' };

export default async function StatsPage({ params }: { params: { id: string } }) {
  const [company, statistics] = await Promise.all([
    getCompany(params.id).catch(() => null),
    getStatistics(params.id).catch(() => []),
  ]);
  if (!company) return <p style={{ color: 'hsl(var(--muted-foreground))' }}>Компанію не знайдено.</p>;

  // одиниці, до яких можна привʼязати статистику (відділення/відділи/посади)
  const units = [...company.orgUnits]
    .filter((u: OrgUnit) => u.type !== 'SECTION')
    .sort((a, b) => (TYPE_ORDER[a.type] - TYPE_ORDER[b.type]) || (a.boardNo ?? 0) - (b.boardNo ?? 0))
    .map((u) => ({ id: u.id, name: `${TYPE_LABEL[u.type] ?? ''}: ${u.name}`, type: u.type }));

  return (
    <div>
      <CompanyHeader company={company} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 6px', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Статистики по ЦКП ({statistics.length})</h2>
        <AddStatistic companyId={company.id} units={units} />
      </div>
      <p style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))', margin: '0 0 14px' }}>
        Вимірюваний показник результату (ЦКП) кожної одиниці. Керуй по тренду: зростає ✓ чи падає — а не по відчуттях.
      </p>

      {statistics.length === 0 ? (
        <p style={{ color: 'hsl(var(--muted-foreground))' }}>Статистик ще немає. Додай першу — напр. «Дохід» для відділення доходу.</p>
      ) : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
          {statistics.map((s) => <StatCard key={s.id} companyId={company.id} statistic={s} />)}
        </div>
      )}
    </div>
  );
}
