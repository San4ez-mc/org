import { getCompany, getChanges, type Change } from '@/lib/api';
import CompanyHeader from '@/components/CompanyTabs';

export const dynamic = 'force-dynamic';

export default async function JournalPage({ params }: { params: { id: string } }) {
  const company = await getCompany(params.id).catch(() => null);
  const changes = await getChanges(params.id).catch(() => [] as Change[]);
  if (!company) return <p style={{ color: 'hsl(var(--muted-foreground))' }}>Не вдалось завантажити журнал.</p>;

  const th = { textAlign: 'left', fontSize: 12, fontWeight: 500, color: 'hsl(var(--muted-foreground))', padding: '8px 12px', borderBottom: '1px solid hsl(var(--border))' } as const;
  const td = { fontSize: 13, padding: '10px 12px', borderBottom: '1px solid hsl(var(--border))', verticalAlign: 'top' } as const;
  const cell = (c: Change, entity: string) => (c.entity === entity ? c.summary : '');

  return (
    <div>
      <CompanyHeader company={company} />
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '4px 0 12px' }}>Журнал змін</h2>
      <p style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))', marginBottom: 14 }}>
        Кожна зміна торкається трьох сутностей — структури, процесів та інструкцій.
      </p>

      <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead>
            <tr>
              <th style={th}>Дата</th>
              <th style={th}>Орг.структура</th>
              <th style={th}>Процеси</th>
              <th style={th}>Інструкції</th>
              <th style={th}>Автор</th>
              <th style={th}>Затверджено</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((c) => (
              <tr key={c.id}>
                <td style={{ ...td, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap' }}>{new Date(c.createdAt).toLocaleString('uk-UA')}</td>
                <td style={td}>{cell(c, 'structure')}</td>
                <td style={td}>{cell(c, 'process')}</td>
                <td style={td}>{cell(c, 'instruction')}</td>
                <td style={{ ...td, color: 'hsl(var(--muted-foreground))' }}>{c.author ?? '—'}</td>
                <td style={td}>
                  <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, background: c.approved ? '#1f5a2633' : 'hsl(var(--muted))', color: c.approved ? '#6bbf72' : 'hsl(var(--muted-foreground))' }}>
                    {c.approved ? 'так' : 'очікує'}
                  </span>
                </td>
              </tr>
            ))}
            {changes.length === 0 ? (
              <tr><td style={{ ...td, color: 'hsl(var(--muted-foreground))' }} colSpan={6}>Змін ще немає.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
