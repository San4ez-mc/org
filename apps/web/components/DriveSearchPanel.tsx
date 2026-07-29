'use client';
import { useState } from 'react';
import { ragSearch, type RagSource } from '@/app/company/[id]/actions';

const card: React.CSSProperties = {
  background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
  borderRadius: 'var(--radius)', padding: 16, margin: '16px 0',
};
const muted: React.CSSProperties = { color: 'hsl(var(--muted-foreground))', fontSize: 12.5 };
const input: React.CSSProperties = {
  flex: 1, minWidth: 0, padding: '9px 12px', borderRadius: 9, border: '1px solid hsl(var(--border))',
  background: 'hsl(var(--background))', color: 'inherit', fontSize: 13.5,
};
const btn: React.CSSProperties = {
  background: 'hsl(var(--foreground) / 0.10)', color: 'hsl(var(--foreground))',
  border: '1px solid hsl(var(--border))', borderRadius: 9, padding: '9px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
};

export default function DriveSearchPanel({ companyId }: { companyId: string }) {
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<RagSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [asked, setAsked] = useState(false);

  async function search() {
    if (!q.trim() || loading) return;
    setLoading(true); setAsked(true); setAnswer(''); setSources([]);
    try {
      const r = await ragSearch(companyId, q.trim());
      setAnswer(r.answer || ''); setSources(r.sources || []);
    } catch (e) { setAnswer('Помилка пошуку: ' + (e as Error).message); }
    finally { setLoading(false); }
  }

  return (
    <div style={card}>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🔎 Пошук по базі знань</div>
      <p style={{ ...muted, margin: '0 0 12px', lineHeight: 1.5 }}>
        Папку проіндексовано — питай природною мовою. Відповідь генерує ШІ (Vertex, EU) на основі <b>твоїх файлів</b>, знизу — джерела.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="Напр.: хто відповідає за маркетинг? які є посадові інструкції?" style={input} />
        <button style={btn} onClick={search} disabled={loading || !q.trim()}>{loading ? 'Шукаю…' : 'Спитати'}</button>
      </div>

      {asked && (
        <div style={{ marginTop: 12 }}>
          {loading ? (
            <p style={muted}>⏳ Шукаю по базі й генерую відповідь…</p>
          ) : (
            <>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.6, background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 10, padding: 12 }}>{answer}</div>
              {sources.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ ...muted, marginBottom: 4 }}>Джерела ({sources.length}):</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {sources.map((s, i) => (
                      <a key={i} href={s.driveFileId ? `https://drive.google.com/file/d/${s.driveFileId}/view` : '#'} target="_blank"
                        style={{ fontSize: 12.5, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, color: 'hsl(210 15% 72%)' }}>
                        <span style={muted}>📄</span>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.source || '—'}</span>
                        {s.score != null && <span style={muted}>· {Math.round((s.score || 0) * 100)}%</span>}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
