import { getCompany, getChanges } from '@/lib/api';
import CompanyHeader from '@/components/CompanyTabs';

export const dynamic = 'force-dynamic';

const th = { textAlign: 'left', fontSize: 12, fontWeight: 500, color: 'hsl(var(--muted-foreground))', padding: '8px 12px', borderBottom: '1px solid hsl(var(--border))' } as const;
const td = { fontSize: 13, padding: '10px 12px', borderBottom: '1px solid hsl(var(--border))', verticalAlign: 'top' } as const;

export default async function JournalPage({ params }: { params: { id: string } }) {
  let company, changes;
  try {
    [company, changes] = await Promise.all([getCompany(params.id), getChanges(params.id)]);
  } catch {
    return <p style={{ color: 'hsl(var(--muted-foreground))' }}>Не вдалось завантажити журнал.</p>;
  }

  const cell = (c: (typeof changes)[number], entity: string) => (c.entity === entity ? c.summary : '');

  return (
    <div>
      <CompanyHeader company={company} />
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '4px 0 12px' }}>Журнал змін</h2>
      <p style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))', marginBottom: 14 }}>
        Кожна зміна торкається трьох сутностей — структури, процесів та інструкцій. Тут — усі зміни з автором і статусом затвердження.
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
                <td style={{ ...td, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap' }}>{new Date(c.createdAt).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })}</td>
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
            {!changes.length && <tr><td style={{ ...td, color: 'hsl(var(--muted-foreground))' }} colSpan={6}>Змін ще немає.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
