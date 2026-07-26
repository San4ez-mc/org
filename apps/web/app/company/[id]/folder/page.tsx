import { getCompany } from '@/lib/api';
import CompanyHeader from '@/components/CompanyTabs';
import DriveConnectPanel from '@/components/DriveConnectPanel';

export const dynamic = 'force-dynamic';

export default async function CompanyFolder({ params }: { params: { id: string } }) {
  let company;
  try {
    company = await getCompany(params.id);
  } catch {
    return <p style={{ color: 'hsl(var(--muted-foreground))' }}>Компанію не знайдено або API недоступний.</p>;
  }

  return (
    <div>
      <CompanyHeader company={company} />
      <a href={`/company/${company.id}`} style={{ display: 'inline-block', margin: '4px 0 12px', fontSize: 13, color: 'hsl(var(--primary))', textDecoration: 'none' }}>
        ← Повернутись до плану
      </a>
      <DriveConnectPanel companyId={company.id} driveRootFolderId={company.driveRootFolderId} />
    </div>
  );
}
