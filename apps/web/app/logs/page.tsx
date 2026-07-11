import { getLogs } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function LogsPage() {
  const logs = await getLogs().catch(() => null);
  if (!logs) return <p style={{ color: 'hsl(var(--muted-foreground))' }}>Не вдалось завантажити логи.</p>;

  const th = { textAlign: 'left', fontSize: 12, fontWeight: 500, color: 'hsl(var(--muted-foreground))', padding: '8px 12px', borderBottom: '1px solid hsl(var(--border))' } as const;
  const td = { fontSize: 13, padding: '9px 12px', borderBottom: '1px solid hsl(var(--border))' } as const;
  const levelColor: { [k: string]: string } = { error: '#e07a7a', warn: '#d6b84f', info: 'hsl(var(--muted-foreground))' };

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Технічні логи</h1>
      <p style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))', marginBottom: 16 }}>Помилки, запуски та події ботів і платформи.</p>
      <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
          <thead>
            <tr><th style={th}>Час</th><th style={th}>Рівень</th><th style={th}>Джерело</th><th style={th}>Повідомлення</th></tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td style={{ ...td, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap' }}>{new Date(l.createdAt).toLocaleString('uk-UA')}</td>
                <td style={{ ...td, color: levelColor[l.level] ?? 'inherit', fontWeight: 600 }}>{l.level}</td>
                <td style={{ ...td, color: 'hsl(var(--muted-foreground))' }}>{l.source}</td>
                <td style={td}>{l.message}</td>
              </tr>
            ))}
            {logs.length === 0 ? (
              <tr><td style={{ ...td, color: 'hsl(var(--muted-foreground))' }} colSpan={4}>Логів ще немає.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
