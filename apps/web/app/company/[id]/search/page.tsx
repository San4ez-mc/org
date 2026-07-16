import { getCompany, search, type SearchResults } from '@/lib/api';
import CompanyHeader from '@/components/CompanyTabs';
import SearchBox from '@/components/SearchBox';

export const dynamic = 'force-dynamic';

const unitTypeLabel: Record<string, string> = {
  DIVISION: 'Відділення',
  DEPARTMENT: 'Відділ',
  SECTION: 'Секція',
  POST: 'Посада',
};

const card = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: 14 } as const;
const muted = { color: 'hsl(var(--muted-foreground))' } as const;
const row = { display: 'flex', flexDirection: 'column' as const, gap: 2, padding: '8px 4px', borderBottom: '1px solid hsl(var(--border))', fontSize: 13.5 };

export default async function SearchPage({ params, searchParams }: { params: { id: string }; searchParams: { q?: string } }) {
  const company = await getCompany(params.id).catch(() => null);
  if (!company) return <p style={muted}>Компанію не знайдено.</p>;

  const q = (searchParams.q ?? '').trim();
  let results: SearchResults | null = null;
  if (q.length >= 2) results = await search(params.id, q).catch(() => null);

  const total = results ? results.members.length + results.orgUnits.length + results.processes.length + results.instructions.length : 0;

  return (
    <div>
      <CompanyHeader company={company} />
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '4px 0 12px' }}>Глобальний пошук</h2>

      <div style={{ marginBottom: 18 }}>
        <SearchBox companyId={params.id} initialQuery={q} />
      </div>

      {q.length < 2 ? (
        <p style={{ ...muted, fontSize: 13 }}>Введіть щонайменше 2 символи — шукаємо серед людей, посад/відділів, процесів і посадових інструкцій.</p>
      ) : !results ? (
        <p style={{ ...muted, fontSize: 13 }}>Не вдалось виконати пошук.</p>
      ) : total === 0 ? (
        <p style={{ ...muted, fontSize: 13 }}>Нічого не знайдено за запитом «{q}».</p>
      ) : (
        <div style={{ display: 'grid', gap: 14, maxWidth: 760 }}>
          {results.members.length > 0 && (
            <section style={card}>
              <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 6px' }}>👤 Люди ({results.members.length})</h3>
              {results.members.map((m) => (
                <a key={m.id} href={`/company/${params.id}`} style={{ ...row, textDecoration: 'none', color: 'inherit' }}>
                  <span>{m.firstName} {m.lastName ?? ''}</span>
                  <span style={{ ...muted, fontSize: 12 }}>
                    {[m.telegramUsername ? `@${m.telegramUsername}` : null, m.email].filter(Boolean).join(' · ') || '—'}
                  </span>
                </a>
              ))}
            </section>
          )}

          {results.orgUnits.length > 0 && (
            <section style={card}>
              <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 6px' }}>🗂️ Посади й відділи ({results.orgUnits.length})</h3>
              {results.orgUnits.map((u) => (
                <a key={u.id} href={`/company/${params.id}/structure`} style={{ ...row, textDecoration: 'none', color: 'inherit' }}>
                  <span>{u.name}</span>
                  <span style={{ ...muted, fontSize: 12 }}>
                    {unitTypeLabel[u.type] ?? u.type}{u.holderName ? ` · ${u.holderName}` : ''}{u.ckp ? ` · ЦКП: ${u.ckp}` : ''}
                  </span>
                </a>
              ))}
            </section>
          )}

          {results.processes.length > 0 && (
            <section style={card}>
              <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 6px' }}>⚙️ Процеси ({results.processes.length})</h3>
              {results.processes.map((p) => (
                <a key={p.id} href={`/company/${params.id}/processes/${p.id}`} style={{ ...row, textDecoration: 'none', color: 'inherit' }}>
                  <span>{p.name}</span>
                  {p.description ? <span style={{ ...muted, fontSize: 12 }}>{p.description}</span> : null}
                </a>
              ))}
            </section>
          )}

          {results.instructions.length > 0 && (
            <section style={card}>
              <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 6px' }}>📄 Інструкції ({results.instructions.length})</h3>
              {results.instructions.map((n) => (
                <a
                  key={n.id}
                  href={n.webViewLink ?? `https://drive.google.com/file/d/${n.id}/view`}
                  target="_blank"
                  style={{ ...row, textDecoration: 'none', color: 'inherit' }}
                >
                  <span>{n.isFolder ? '📁' : '📄'} {n.name}</span>
                  {n.path.length > 0 ? <span style={{ ...muted, fontSize: 12 }}>{n.path.join(' / ')}</span> : null}
                </a>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
