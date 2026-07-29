'use client';
import { useState } from 'react';
import { detectFacts, type DetectedFacts } from '@/app/company/[id]/actions';

const card: React.CSSProperties = {
  background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
  borderRadius: 'var(--radius)', padding: 16, margin: '16px 0',
};
const muted: React.CSSProperties = { color: 'hsl(var(--muted-foreground))', fontSize: 12.5 };
const btn: React.CSSProperties = {
  background: 'hsl(var(--foreground) / 0.10)', color: 'hsl(var(--foreground))',
  border: '1px solid hsl(var(--border))', borderRadius: 9, padding: '9px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
};
const chip: React.CSSProperties = {
  fontSize: 12.5, padding: '4px 10px', borderRadius: 999, background: 'hsl(var(--muted))', color: 'hsl(var(--foreground))',
};

function Group({ title, children, count }: { title: string; children: React.ReactNode; count: number }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{title} <span style={muted}>({count})</span></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{children}</div>
    </div>
  );
}

export default function DriveDetectPanel({ companyId }: { companyId: string }) {
  const [data, setData] = useState<DetectedFacts | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function run() {
    setLoading(true); setErr('');
    try { setData(await detectFacts(companyId)); }
    catch (e) { setErr('Не вдалось: ' + (e as Error).message); }
    finally { setLoading(false); }
  }

  return (
    <div style={card}>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🧠 Що система зрозуміла про компанію</div>
      <p style={{ ...muted, margin: '0 0 12px', lineHeight: 1.5 }}>
        ШІ проходить по проіндексованих документах і витягує відділи, посади, наявні інструкції та факти про компанію.
        Це <b>чернетка</b> — далі підтвердиш і на її основі будуватимемо орг-структуру.
      </p>
      <button style={btn} onClick={run} disabled={loading}>{loading ? 'Аналізую документи…' : (data ? '🔄 Проаналізувати ще раз' : '🧠 Визначити з документів')}</button>
      {err && <p style={{ color: 'hsl(0 70% 62%)', fontSize: 12.5, marginTop: 8 }}>{err}</p>}

      {data && (
        <div style={{ marginTop: 8 }}>
          {(data.companyFacts?.sphere || data.companyFacts?.mission) && (
            <Group title="🏢 Про компанію" count={[data.companyFacts.sphere, data.companyFacts.mission].filter(Boolean).length}>
              {data.companyFacts.sphere && <span style={chip}>Сфера: {data.companyFacts.sphere}</span>}
              {data.companyFacts.mission && <span style={chip}>Мета: {data.companyFacts.mission}</span>}
            </Group>
          )}
          <Group title="🗂️ Відділи" count={data.departments.length}>
            {data.departments.map((d, i) => <span key={i} style={chip}>{d}</span>)}
            {!data.departments.length && <span style={muted}>не знайдено</span>}
          </Group>
          <Group title="👤 Посади" count={data.positions.length}>
            {data.positions.map((p, i) => <span key={i} style={chip}>{p.title}{p.holder ? ` — ${p.holder}` : ''}{p.department ? ` · ${p.department}` : ''}</span>)}
            {!data.positions.length && <span style={muted}>не знайдено</span>}
          </Group>
          <Group title="📄 Наявні інструкції/регламенти" count={data.instructions.length}>
            {data.instructions.map((x, i) => <span key={i} style={chip}>{x.title}</span>)}
            {!data.instructions.length && <span style={muted}>не знайдено</span>}
          </Group>
          <p style={{ ...muted, marginTop: 10 }}>Переглянуто фрагментів: {data.sourcesScanned ?? 0}. Далі — крок 4 (агент побудує структуру на основі цього + інтерв'ю).</p>
        </div>
      )}
    </div>
  );
}
