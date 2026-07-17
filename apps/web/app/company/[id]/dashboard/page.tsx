import { getCompany, getOwnerDashboard } from '@/lib/api';
import CompanyHeader from '@/components/CompanyTabs';

export const dynamic = 'force-dynamic';

const entityLabel: Record<string, string> = {
  structure: 'Оргструктура',
  process: 'Процес',
  instruction: 'Інструкція',
};

export default async function DashboardPage({ params }: { params: { id: string } }) {
  const company = await getCompany(params.id).catch(() => null);
  const dash = await getOwnerDashboard(params.id).catch(() => null);
  if (!company) return <p style={{ color: 'hsl(var(--muted-foreground))' }}>Не вдалось завантажити дашборд.</p>;
  if (!dash) return (
    <div>
      <CompanyHeader company={company} />
      <p style={{ color: 'hsl(var(--muted-foreground))' }}>Не вдалось порахувати показники компанії.</p>
    </div>
  );

  const card = {
    background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
    borderRadius: 'var(--radius)', padding: '14px 16px',
  } as const;
  const bigNum = { fontSize: 28, fontWeight: 700, lineHeight: 1.1 } as const;
  const label = { fontSize: 12.5, color: 'hsl(var(--muted-foreground))', marginTop: 4 } as const;
  const sub = { fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 2 } as const;

  const okColor = (good: boolean) => (good ? '#6bbf72' : '#e0a34e');

  return (
    <div>
      <CompanyHeader company={company} />
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '4px 0 4px' }}>Дашборд власника</h2>
      <p style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))', marginBottom: 16 }}>
        Здоровʼя компанії одним поглядом: укомплектованість, опис процесів, активність змін і що чекає на рішення.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 18 }}>
        <div style={card}>
          <div style={{ ...bigNum, color: okColor(dash.staffing.vacant === 0) }}>
            {dash.staffing.filled}/{dash.staffing.postsTotal}
          </div>
          <div style={label}>посад заповнено ({dash.staffing.filledPct}%)</div>
          <div style={sub}>вакантних: {dash.staffing.vacant}</div>
        </div>

        <div style={card}>
          <div style={{ ...bigNum, color: okColor(dash.processes.describedPct === 100) }}>{dash.processes.describedPct}%</div>
          <div style={label}>процесів описано</div>
          <div style={sub}>{dash.processes.described} з {dash.processes.total}</div>
        </div>

        <div style={card}>
          <div style={bigNum}>{dash.changes.last7d}</div>
          <div style={label}>змін за 7 днів</div>
          <div style={sub}>за 30 днів: {dash.changes.last30d}</div>
        </div>

        <div style={card}>
          <div style={{ ...bigNum, color: okColor(dash.pendingApprovals === 0) }}>{dash.pendingApprovals}</div>
          <div style={label}>чекають затвердження</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) minmax(280px, 1.4fr)', gap: 12 }}>
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 10px' }}>Вузькі місця</h3>
          {dash.bottlenecks.length === 0 ? (
            <p style={{ fontSize: 13, color: '#6bbf72' }}>Критичних прогалин не виявлено 👍</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {dash.bottlenecks.map((b) => (
                <li key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ minWidth: 28, textAlign: 'center', fontWeight: 700, color: '#e0a34e', background: '#e0a34e22', borderRadius: 6, padding: '1px 6px' }}>{b.count}</span>
                  <span>{b.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 10px' }}>Останні зміни</h3>
          {dash.recentChanges.length === 0 ? (
            <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>Змін ще немає.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dash.recentChanges.map((c) => (
                <li key={c.id} style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap' }}>
                    {new Date(c.createdAt).toLocaleDateString('uk-UA')}
                  </span>
                  <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap' }}>
                    {entityLabel[c.entity] ?? c.entity}
                  </span>
                  <span style={{ flex: 1 }}>{c.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
