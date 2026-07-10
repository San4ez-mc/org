import { getCompany, type OrgUnit } from '@/lib/api';
import CompanyTabs from '@/components/CompanyTabs';

export const dynamic = 'force-dynamic';

const th = { textAlign: 'left', fontSize: 12, fontWeight: 500, color: 'hsl(var(--muted-foreground))', padding: '8px 12px', borderBottom: '1px solid hsl(var(--border))' } as const;
const td = { fontSize: 13, padding: '10px 12px', borderBottom: '1px solid hsl(var(--border))' } as const;

export default async function CompanyOverview({ params }: { params: { id: string } }) {
  let company;
  try {
    company = await getCompany(params.id);
  } catch {
    return <p style={{ color: 'hsl(var(--muted-foreground))' }}>Компанію не знайдено або API недоступний.</p>;
  }

  const divisions = company.orgUnits.filter((u) => u.type === 'DIVISION');
  const divName = (id: string | null) => divisions.find((d) => d.id === id)?.name ?? '—';
  const posts = company.orgUnits.filter((u) => u.type === 'POST');
  const filled = posts.filter((p) => !p.isVacant && p.holderName);

  return (
    <div>
      <CompanyTabs company={company} active="" />

      {company.driveRootFolderId && (
        <a href={`https://drive.google.com/drive/folders/${company.driveRootFolderId}`} target="_blank" style={{ fontSize: 13, color: 'hsl(var(--primary))' }}>
          📂 Папка компанії на Google Drive
        </a>
      )}

      <div style={{ display: 'flex', gap: 12, margin: '16px 0 24px' }}>
        <Stat label="Відділень" value={divisions.length} />
        <Stat label="Посад" value={posts.length} />
        <Stat label="Працівників" value={filled.length} />
        <Stat label="Процесів" value={company.processes?.length ?? 0} />
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Працівники та посади</h2>
      <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Посада</th>
              <th style={th}>Відділення</th>
              <th style={th}>Працівник</th>
              <th style={th}>Статус</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p: OrgUnit) => (
              <tr key={p.id}>
                <td style={{ ...td, fontWeight: 500 }}>{p.name}</td>
                <td style={{ ...td, color: 'hsl(var(--muted-foreground))' }}>{divName(p.parentId)}</td>
                <td style={td}>{p.isVacant || !p.holderName ? '—' : p.holderName}</td>
                <td style={td}>
                  <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, background: p.isVacant || !p.holderName ? 'hsl(var(--muted))' : '#1f5a2633', color: p.isVacant || !p.holderName ? 'hsl(var(--muted-foreground))' : '#6bbf72' }}>
                    {p.isVacant || !p.holderName ? 'вакансія' : 'зайнято'}
                  </span>
                </td>
              </tr>
            ))}
            {!posts.length && (
              <tr><td style={{ ...td, color: 'hsl(var(--muted-foreground))' }} colSpan={4}>Посад ще немає.</td></tr>
            )}
          </tbody>
        </table>
      </div>
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
