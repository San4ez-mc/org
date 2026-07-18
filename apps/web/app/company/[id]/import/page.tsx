import { getCompany } from '@/lib/api';
import CompanyHeader from '@/components/CompanyTabs';
import ImportForm from '@/components/ImportForm';

export const dynamic = 'force-dynamic';

export default async function ImportPage({ params }: { params: { id: string } }) {
  const company = await getCompany(params.id).catch(() => null);
  if (!company) return <p style={{ color: 'hsl(var(--muted-foreground))' }}>Не вдалось завантажити компанію.</p>;

  return (
    <div>
      <CompanyHeader company={company} />
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '4px 0 4px' }}>Імпорт даних</h2>
      <p style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))', marginBottom: 16 }}>
        Масовий залив відділів, посад і людей із файлу — без бота. Наявні записи не дублюються (пошук за назвою / поштою).
      </p>
      <ImportForm companyId={company.id} />
    </div>
  );
}
