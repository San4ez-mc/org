import { getCompany, type OrgUnit } from '@/lib/api';
import CompanyTabs from '@/components/CompanyTabs';

export const dynamic = 'force-dynamic';

const card = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' } as const;
const muted = { color: 'hsl(var(--muted-foreground))' } as const;

export default async function ProcessesPage({ params }: { params: { id: string } }) {
  let company;
  try {
    company = await getCompany(params.id);
  } catch {
    return <p style={muted}>Компанію не знайдено або API недоступний.</p>;
  }

  const holderOf = (title: string): string => {
    const post = company.orgUnits.find((u: OrgUnit) => u.type === 'POST' && u.name.trim().toLowerCase() === title.trim().toLowerCase());
    return !post || post.isVacant || !post.holderName ? '' : post.holderName;
  };

  const processes = company.processes ?? [];

  return (
    <div>
      <CompanyTabs company={company} active="/processes" />

      {processes.length === 0 ? (
        <p style={muted}>Бізнес-процесів ще немає. Вони створюються під час онбордингу компанії ботом.</p>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {processes.map((pr) => {
            const steps = pr.steps ?? [];
            const owner = steps.length ? steps[steps.length - 1].postTitle : '';
            return (
              <div key={pr.id} style={{ ...card, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{pr.name}</div>
                  {owner && <div style={{ fontSize: 12, ...muted }}>відповідальний за результат: <b>{owner}</b>{holderOf(owner) ? ` (${holderOf(owner)})` : ''}</div>}
                </div>
                {pr.description && <div style={{ fontSize: 12.5, ...muted, margin: '6px 0 14px' }}>{pr.description}</div>}

                {/* Swimlane: рядок на крок */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {steps.map((s, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 200px 1fr', gap: 12, alignItems: 'start', padding: '10px 0', borderTop: i ? '1px dashed hsl(var(--border))' : 'none' }}>
                      <span style={{ ...muted, fontSize: 13, fontWeight: 600 }}>{i + 1}</span>
                      <span style={{ fontSize: 13 }}>
                        <b>{s.postTitle}</b>
                        {holderOf(s.postTitle) && <span style={muted}> · {holderOf(s.postTitle)}</span>}
                      </span>
                      <span style={{ fontSize: 13 }}>
                        {s.action}
                        {s.result && <div style={{ ...muted, fontSize: 12, marginTop: 2 }}>→ {s.result}</div>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
