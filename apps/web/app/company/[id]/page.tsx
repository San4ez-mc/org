import { getCompany, type OrgUnit } from '@/lib/api';

export const dynamic = 'force-dynamic';

// PAEI-колір відділення за boardNo (дублює DIVISION_PAEI платформи)
const DIVISION_PAEI: Record<number, 'P' | 'A' | 'E' | 'I'> = { 7: 'E', 1: 'I', 2: 'E', 3: 'A', 4: 'P', 5: 'A', 6: 'I' };
// Порядок орг-борду Хаббарда (зліва-направо)
const BOARD_ORDER = [7, 1, 2, 3, 4, 5, 6];
const PAEI_NAME: Record<string, string> = { P: 'Виробник', A: 'Адміністратор', E: 'Підприємець', I: 'Інтегратор' };

const card = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' } as const;
const muted = { color: 'hsl(var(--muted-foreground))' } as const;

export default async function CompanyPage({ params }: { params: { id: string } }) {
  let company;
  try {
    company = await getCompany(params.id);
  } catch {
    return <p style={muted}>Компанію не знайдено або API недоступний.</p>;
  }

  const units = company.orgUnits;
  const divisions = units.filter((u) => u.type === 'DIVISION');
  const byBoard = (n: number) => divisions.find((d) => d.boardNo === n);
  const childrenOf = (id: string, type: OrgUnit['type']) => units.filter((u) => u.parentId === id && u.type === type);
  const holderOf = (title: string): string => {
    const post = units.find((u) => u.type === 'POST' && u.name.trim().toLowerCase() === title.trim().toLowerCase());
    if (!post) return '';
    return post.isVacant || !post.holderName ? 'вакансія' : post.holderName;
  };

  // Керівництво — посади адміністративного відділення (7)
  const admin = byBoard(7);
  const leadership = admin ? childrenOf(admin.id, 'POST') : [];

  return (
    <div>
      <a href="/" style={{ fontSize: 13, ...muted, textDecoration: 'none' }}>← Компанії</a>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '8px 0 4px' }}>{company.name}</h1>
      {company.driveRootFolderId && (
        <a href={`https://drive.google.com/drive/folders/${company.driveRootFolderId}`} target="_blank" style={{ fontSize: 13, color: 'hsl(var(--primary))' }}>
          📂 Відкрити папку на Google Drive
        </a>
      )}

      {/* Керівництво */}
      {leadership.length > 0 && (
        <div style={{ ...card, padding: 14, margin: '20px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 12, ...muted, marginBottom: 6 }}>Керівництво</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {leadership.map((p) => (
              <span key={p.id} style={{ fontWeight: 600, fontSize: 14 }}>
                {p.name}
                <span style={{ ...muted, fontWeight: 400, fontSize: 12 }}> — {p.isVacant || !p.holderName ? 'вакансія' : p.holderName}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '24px 0 12px' }}>Орг.структура — 7 відділень</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {BOARD_ORDER.map((n) => {
          const d = byBoard(n);
          if (!d) return null;
          const role = DIVISION_PAEI[n];
          const depts = childrenOf(d.id, 'DEPARTMENT');
          const posts = childrenOf(d.id, 'POST');
          return (
            <div key={d.id} style={{ ...card, padding: 14, borderTop: '3px solid', borderTopColor: paeiColor(role) }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{n}. {d.name}</span>
                <span className={`paei-${role}`} style={{ fontSize: 11, padding: '1px 7px', borderRadius: 6 }} title={PAEI_NAME[role]}>{role}</span>
              </div>
              {d.ckp && <div style={{ fontSize: 11, ...muted, marginBottom: 10 }}>ЦКП: {d.ckp}</div>}

              {/* Відділи */}
              {depts.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: posts.length ? 12 : 0 }}>
                  {depts.map((dep) => (
                    <div key={dep.id} style={{ borderLeft: '2px solid hsl(var(--border))', paddingLeft: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{dep.name}</div>
                      {dep.ckp && <div style={{ fontSize: 10.5, ...muted }}>ЦКП: {dep.ckp}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Посади */}
              {posts.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, ...muted, marginBottom: 4 }}>Посади:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {posts.map((p) => (
                      <span key={p.id} style={{ fontSize: 12, background: 'hsl(var(--muted))', padding: '4px 8px', borderRadius: 6 }}>
                        {p.name}
                        <span style={{ ...muted }}> · {p.isVacant || !p.holderName ? 'вакансія' : p.holderName}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Бізнес-процеси */}
      {company.processes?.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: '32px 0 12px' }}>Бізнес-процеси</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {company.processes.map((pr) => {
              const steps = pr.steps ?? [];
              const owner = steps.length ? steps[steps.length - 1].postTitle : '';
              return (
                <div key={pr.id} style={{ ...card, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 600 }}>{pr.name}</div>
                    {owner && <div style={{ fontSize: 12, ...muted }}>відповідальний за результат: <b>{owner}</b>{holderOf(owner) ? ` (${holderOf(owner)})` : ''}</div>}
                  </div>
                  {pr.description && <div style={{ fontSize: 12, ...muted, margin: '4px 0 12px' }}>{pr.description}</div>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {steps.map((s, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '22px 180px 1fr', gap: 10, alignItems: 'start' }}>
                        <span style={{ ...muted, fontSize: 12 }}>{i + 1}.</span>
                        <span style={{ fontSize: 13 }}>
                          <b>{s.postTitle}</b>
                          {holderOf(s.postTitle) && <span style={{ ...muted }}> · {holderOf(s.postTitle)}</span>}
                        </span>
                        <span style={{ fontSize: 13 }}>
                          {s.action}
                          {s.result && <span style={{ ...muted }}> → {s.result}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function paeiColor(role: string): string {
  return { P: '#e07a7a', A: '#7a93d6', E: '#6bbf72', I: '#d6b84f' }[role] ?? 'hsl(var(--border))';
}
