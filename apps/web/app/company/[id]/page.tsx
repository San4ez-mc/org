import { getCompany, type OrgUnit } from '@/lib/api';

export const dynamic = 'force-dynamic';

// PAEI-колір відділення за boardNo (дублює DIVISION_PAEI платформи)
const DIVISION_PAEI: Record<number, 'P' | 'A' | 'E' | 'I'> = { 7: 'E', 1: 'I', 2: 'E', 3: 'A', 4: 'P', 5: 'A', 6: 'I' };

export default async function CompanyPage({ params }: { params: { id: string } }) {
  let company;
  try {
    company = await getCompany(params.id);
  } catch {
    return <p style={{ color: 'hsl(var(--muted-foreground))' }}>Компанію не знайдено або API недоступний.</p>;
  }

  const divisions = company.orgUnits.filter((u) => u.type === 'DIVISION').sort((a, b) => (a.boardNo ?? 0) - (b.boardNo ?? 0));
  const postsByDiv = (divId: string) => company.orgUnits.filter((u) => u.type === 'POST' && u.parentId === divId);

  return (
    <div>
      <a href="/" style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', textDecoration: 'none' }}>← Компанії</a>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '8px 0 4px' }}>{company.name}</h1>
      {company.driveRootFolderId && (
        <a
          href={`https://drive.google.com/drive/folders/${company.driveRootFolderId}`}
          target="_blank"
          style={{ fontSize: 13, color: 'hsl(var(--primary))' }}
        >
          📂 Відкрити папку на Google Drive
        </a>
      )}

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '24px 0 12px' }}>Оргсхема (7 відділень)</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {divisions.map((d) => {
          const role = d.boardNo ? DIVISION_PAEI[d.boardNo] : undefined;
          const posts = postsByDiv(d.id);
          return (
            <div key={d.id} style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>
                  {d.boardNo}. {d.name}
                </span>
                {role && <span className={`paei-${role}`} style={{ fontSize: 11, padding: '1px 6px', borderRadius: 6 }}>{role}</span>}
              </div>
              {d.ckp && <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 8 }}>ЦКП: {d.ckp}</div>}
              {posts.length ? (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {posts.map((p: OrgUnit) => (
                    <li key={p.id} style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                      <span>{p.name}</span>
                      <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 12 }}>{p.isVacant ? 'вакансія' : p.holderName}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>—</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
