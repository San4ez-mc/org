import { getCompany, getCompanyHealth, type OrgHealth, type OrgHealthRef } from '@/lib/api';
import CompanyHeader from '@/components/CompanyTabs';

export const dynamic = 'force-dynamic';

export default async function HealthPage({ params }: { params: { id: string } }) {
  const company = await getCompany(params.id).catch(() => null);
  const health = await getCompanyHealth(params.id).catch(() => null);
  if (!company) return <p style={{ color: 'hsl(var(--muted-foreground))' }}>Не вдалось завантажити діагностику.</p>;
  if (!health) return (
    <div>
      <CompanyHeader company={company} />
      <p style={{ color: 'hsl(var(--muted-foreground))' }}>Не вдалось порахувати показники здоровʼя компанії.</p>
    </div>
  );

  const card = {
    background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
    borderRadius: 'var(--radius)', padding: '14px 16px',
  } as const;
  const bigNum = { fontSize: 30, fontWeight: 700, lineHeight: 1.1 } as const;
  const label = { fontSize: 12.5, color: 'hsl(var(--muted-foreground))', marginTop: 4 } as const;

  // Погано, якщо є прогалини; для % процесів — навпаки, більше краще.
  const warnColor = (bad: boolean) => (bad ? '#e0a34e' : '#6bbf72');

  const metrics: { value: string; caption: string; bad: boolean }[] = [
    { value: String(health.postsWithoutCkpCount), caption: `посад без ЦКП (з ${health.postsTotal})`, bad: health.postsWithoutCkpCount > 0 },
    { value: `${health.processesDescribedPct}%`, caption: `процесів описано (${health.processesDescribed} з ${health.processesTotal})`, bad: health.processesDescribedPct < 100 },
    { value: String(health.vacantPostsCount), caption: `вакансій (посад без працівника)`, bad: health.vacantPostsCount > 0 },
    { value: String(health.membersWithoutPostCount), caption: `людей без посади`, bad: health.membersWithoutPostCount > 0 },
  ];

  const structureHref = `/company/${company.id}/structure`;

  const refList = (title: string, refs: OrgHealthRef[], emptyText: string, href: string) => (
    <div style={card}>
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 10px' }}>{title}</h3>
      {refs.length === 0 ? (
        <p style={{ fontSize: 13, color: '#6bbf72' }}>{emptyText}</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {refs.map((r) => (
            <li key={r.id} style={{ fontSize: 13 }}>
              <a href={href} style={{ color: 'hsl(var(--foreground))', textDecoration: 'none' }}>{r.name || '—'}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div>
      <CompanyHeader company={company} />
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '4px 0 4px' }}>Діагностика «як є»</h2>
      <p style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))', marginBottom: 16 }}>
        Швидкий зріз здоровʼя оргструктури: де немає ЦКП, наскільки описані процеси, які посади вакантні та хто без посади.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
        {metrics.map((mtr) => (
          <div key={mtr.caption} style={card}>
            <div style={{ ...bigNum, color: warnColor(mtr.bad) }}>{mtr.value}</div>
            <div style={label}>{mtr.caption}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {refList('Посади без ЦКП', health.postsWithoutCkp, 'Усі посади мають ЦКП 👍', structureHref)}
        {refList('Вакансії', health.vacantPosts, 'Немає вакантних посад 👍', structureHref)}
        {refList('Люди без посади', health.membersWithoutPost, 'Усі працівники призначені на посади 👍', structureHref)}
      </div>
    </div>
  );
}
