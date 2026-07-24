import { getCompany, type OrgUnit } from '@/lib/api';
import CompanyHeader from '@/components/CompanyTabs';
import PeoplePanel from '@/components/PeoplePanel';
import DriveConnectPanel from '@/components/DriveConnectPanel';

export const dynamic = 'force-dynamic';

export default async function CompanyOverview({ params }: { params: { id: string } }) {
  let company;
  try {
    company = await getCompany(params.id);
  } catch {
    return <p style={{ color: 'hsl(var(--muted-foreground))' }}>Компанію не знайдено або API недоступний.</p>;
  }

  const units = company.orgUnits;
  const divisions = units.filter((u) => u.type === 'DIVISION');
  const nameOf = (id: string | null) => units.find((u) => u.id === id)?.name ?? '';
  const divisionFor = (u: OrgUnit): string => {
    let cur: OrgUnit | undefined = u;
    // піднімаємось до відділення
    while (cur && cur.type !== 'DIVISION') cur = units.find((x) => x.id === cur!.parentId);
    return cur?.name ?? '';
  };

  // Посади для призначення (без керівницьких заглушок дублюємо як опції)
  const postOptions = units
    .filter((u) => u.type === 'POST')
    .map((p) => ({ id: p.id, name: p.name, division: divisionFor(p) }));

  const posts = units.filter((u) => u.type === 'POST');

  return (
    <div>
      <CompanyHeader company={company} />

      <DriveConnectPanel companyId={company.id} driveRootFolderId={company.driveRootFolderId} />

      <div style={{ display: 'flex', gap: 12, margin: '16px 0 24px', flexWrap: 'wrap' }}>
        <Stat label="Відділень" value={divisions.length} />
        <Stat label="Посад" value={posts.length} />
        <Stat label="Працівників" value={company.members.length} />
        <Stat label="Процесів" value={company.processes?.length ?? 0} />
      </div>

      <PeoplePanel companyId={company.id} members={company.members} posts={postOptions} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: '12px 18px', minWidth: 92 }}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{label}</div>
    </div>
  );
}
