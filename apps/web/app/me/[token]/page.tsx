import { getMe } from '@/lib/api';

export const dynamic = 'force-dynamic';

const card = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: 16 } as const;
const muted = { color: 'hsl(var(--muted-foreground))' } as const;

export default async function MePage({ params }: { params: { token: string } }) {
  const me = await getMe(params.token);
  if (!me) {
    return (
      <div style={{ maxWidth: 560, margin: '80px auto', padding: 24, textAlign: 'center', ...muted }}>
        Посилання недійсне або застаріле. Зверніться до керівника за новим.
      </div>
    );
  }

  const myPosts = new Set(me.posts.map((p) => p.name));
  const fullName = [me.member.firstName, me.member.lastName].filter(Boolean).join(' ');

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '28px 20px 60px' }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13, ...muted }}>{me.company?.name} · Моя робота</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>👋 {fullName}</h1>
      </div>

      {/* Мої посади + ЦКП */}
      <section style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>Мої посади</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {me.posts.length === 0 && <div style={{ ...card, ...muted, fontSize: 13 }}>Посаду ще не призначено.</div>}
          {me.posts.map((p) => (
            <div key={p.id} style={card}>
              {p.path.length > 0 && <div style={{ fontSize: 11.5, ...muted }}>{p.path.join(' › ')}</div>}
              <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{p.name}</div>
              {p.ckp ? (
                <div style={{ fontSize: 13, marginTop: 6 }}><span style={muted}>ЦКП (мій цінний кінцевий продукт): </span>{p.ckp}</div>
              ) : (
                <div style={{ fontSize: 12.5, ...muted, marginTop: 6 }}>ЦКП ще не описано.</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Мої статистики */}
      {me.statistics.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>Мої показники</h2>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {me.statistics.map((s) => {
              const pts = [...(s.points ?? [])].sort((a, b) => a.date.localeCompare(b.date));
              const n = pts.length;
              const delta = n >= 2 ? pts[n - 1].value - pts[n - 2].value : 0;
              const goodColor = delta === 0 ? 'hsl(var(--muted-foreground))' : (delta > 0) === s.higherIsBetter ? '#4caf82' : '#e07a7a';
              const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
              return (
                <div key={s.id} style={card}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{s.name}{s.unit ? `, ${s.unit}` : ''}</div>
                  {n ? (
                    <div style={{ fontSize: 20, fontWeight: 700, color: goodColor, marginTop: 4 }}>{arrow} {pts[n - 1].value}</div>
                  ) : (
                    <div style={{ fontSize: 12, ...muted, marginTop: 4 }}>ще немає даних</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Мої процеси */}
      <section>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>Мої процеси ({me.processes.length})</h2>
        {me.processes.length === 0 ? (
          <div style={{ ...card, ...muted, fontSize: 13 }}>Ти поки не задіяний(а) в описаних процесах.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {me.processes.map((pr) => (
              <div key={pr.id} style={card}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{pr.name}</div>
                {pr.description && <div style={{ fontSize: 12.5, ...muted, marginTop: 2 }}>{pr.description}</div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
                  {(pr.steps ?? []).map((s, i) => {
                    const mine = myPosts.has(s.postTitle);
                    return (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '20px 180px 1fr', gap: 8, fontSize: 12.5, opacity: mine ? 1 : 0.55, background: mine ? 'hsl(var(--muted))' : 'transparent', borderRadius: 6, padding: mine ? '3px 6px' : '3px 6px' }}>
                        <span style={muted}>{i + 1}</span>
                        <span style={{ fontWeight: mine ? 700 : 500 }}>{mine ? '➤ ' : ''}{s.postTitle}</span>
                        <span>{s.action}{s.result && <span style={muted}> → {s.result}</span>}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div style={{ marginTop: 28, fontSize: 11.5, ...muted, textAlign: 'center' }}>
        🧬 Жива Орг.Платформа · особиста сторінка. Не діліться цим посиланням — воно дає доступ до ваших даних.
      </div>
    </div>
  );
}
